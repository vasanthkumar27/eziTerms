"""EziTerms Backend — minimal FastAPI app."""
import io
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("eziterms")

from fastapi import FastAPI, Depends, File, Form, HTTPException, Header, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import get_settings
from database import init_db, get_db, User, ChatHistory, AnalysisHistory
from auth import (
    create_access_token, create_refresh_token, decode_token, hash_password, verify_password,
    verify_google_token, get_or_create_user, get_user_by_email, store_tokens, update_tokens,
    invalidate_user_tokens, blacklist_refresh, is_refresh_blacklisted,
)
from deps import get_current_user_id
from services import analyze_terms, chatbot, extract_text_from_bytes, extract_text_from_upload
from services.presidio_mask import mask_pii, MASKING_NOTICE
from services import tc_page_classifier

app = FastAPI(title="EziTerms API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    logger.info("Database initialized (SQLite)")


# ---------- Auth ----------

class SignupBody(BaseModel):
    email: str
    password: str

class LoginBody(BaseModel):
    email: str
    password: str

class GoogleLoginBody(BaseModel):
    token: str

class RefreshBody(BaseModel):
    refresh: str

class LogoutBody(BaseModel):
    refresh: Optional[str] = None


@app.post("/api/signup")
def signup(body: SignupBody, db: Session = Depends(get_db)):
    if get_user_by_email(db, body.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    get_or_create_user(db, email=body.email, password_hash=hash_password(body.password))
    return {"message": "Account created"}


@app.post("/api/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = get_user_by_email(db, body.email)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id))
    store_tokens(db, user.id, access, refresh)
    return {"access": access, "refresh": refresh}


@app.post("/api/google-login")
async def google_login(body: GoogleLoginBody, db: Session = Depends(get_db)):
    if not body.token:
        raise HTTPException(status_code=400, detail="Token required")
    info = await verify_google_token(body.token)
    if not info:
        raise HTTPException(status_code=400, detail="Invalid Google token")
    email = info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email in token")
    user = get_or_create_user(db, email=email, first_name=info.get("given_name", ""), last_name=info.get("family_name", ""))
    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id))
    store_tokens(db, user.id, access, refresh)
    return {"access": access, "refresh": refresh}


@app.post("/api/token/refresh")
def token_refresh(body: RefreshBody, db: Session = Depends(get_db)):
    if is_refresh_blacklisted(body.refresh):
        raise HTTPException(status_code=401, detail="Token revoked")
    payload = decode_token(body.refresh)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    new_access = create_access_token(sub)
    new_refresh = create_refresh_token(sub)
    update_tokens(db, body.refresh, new_access, new_refresh)
    return {"access": new_access, "refresh": new_refresh}


@app.post("/api/logout")
def logout(body: LogoutBody, authorization: Optional[str] = Header(None, alias="Authorization"), db: Session = Depends(get_db)):
    user_id = None
    if body.refresh:
        blacklist_refresh(body.refresh)
        p = decode_token(body.refresh)
        if p and p.get("sub"):
            try:
                user_id = int(p["sub"])
            except (TypeError, ValueError):
                pass
    if user_id is None and authorization and authorization.startswith("Bearer "):
        p = decode_token(authorization.split(" ", 1)[1])
        if p and p.get("sub"):
            try:
                user_id = int(p["sub"])
            except (TypeError, ValueError):
                pass
    if user_id:
        invalidate_user_tokens(db, user_id)
    return {"message": "Logged out"}


@app.get("/api/me")
def me(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.get(User, int(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user.id, "email": user.email, "first_name": user.first_name, "last_name": user.last_name}


# ---------- Terms analysis ----------

def _normalize_risk(value: str) -> str:
    v = (value or "").strip().lower()
    return v if v in ("high", "medium", "low") else "low"


def _normalize_result(result: list[dict]) -> list[dict]:
    return [
        {"risktype": _normalize_risk(str(i.get("risktype", ""))), "lineSummary": str(i.get("lineSummary", "")).strip(), "riskReason": str(i.get("riskReason", "")).strip()}
        for i in (result or []) if isinstance(i, dict)
    ]


def _risk_score(result: list) -> Optional[float]:
    if not result:
        return None
    weights = {"high": 55, "medium": 15, "low": 0}
    total = sum(weights.get(str(e.get("risktype", "")).lower(), 0) for e in result if isinstance(e, dict))
    raw = total / len(result)
    return round(min(100.0, (raw / 55.0) * 100.0) * 100) / 100


class AnalyzeBody(BaseModel):
    terms: str
    document_url: Optional[str] = None

class ChatBody(BaseModel):
    message: str
    terms_text: str = ""
    scan_results: Optional[list[dict]] = None

class ClassifyBody(BaseModel):
    text: str

class MaskBody(BaseModel):
    terms_text: str


@app.post("/api/analyze-terms")
def analyze_terms_route(body: AnalyzeBody, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    if not body.terms or len(body.terms.strip()) < 100:
        raise HTTPException(status_code=400, detail="Please provide at least 100 characters of T&C text.")
    try:
        if not tc_page_classifier.is_tc_page(body.terms):
            raise HTTPException(status_code=400, detail="Content doesn't look like Terms & Conditions.")
    except FileNotFoundError:
        pass  # classifier model not trained yet, allow analysis anyway
    try:
        result = analyze_terms(body.terms)
        result = _normalize_result(result if isinstance(result, list) else [])
        score = _risk_score(result)
        db.add(AnalysisHistory(user_id=int(user_id), source="paste", document_url=body.document_url or "", risk_score=score, summary_json=json.dumps(result)[:5000]))
        db.commit()
        return {"result": result, "risk_score": score}
    except Exception as e:
        logger.exception("analyze-terms error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload-terms")
async def upload_terms_route(
    file: UploadFile = File(...),
    masking_mode: bool = Form(False),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    content = await file.read()
    try:
        terms_text = extract_text_from_bytes(file.filename, content)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not terms_text or len(terms_text.strip()) < 100:
        raise HTTPException(status_code=400, detail="Document doesn't contain enough text.")
    if masking_mode:
        try:
            masked = mask_pii(terms_text)
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))
        return {"result": None, "terms_text": masked["masked_text"], "masking_preview": True, "notice": MASKING_NOTICE}
    try:
        result = analyze_terms(terms_text)
        result = _normalize_result(result if isinstance(result, list) else [])
        score = _risk_score(result)
        db.add(AnalysisHistory(user_id=int(user_id), source="upload", document_name=file.filename, risk_score=score, summary_json=json.dumps(result)[:5000]))
        db.commit()
        return {"result": result, "terms_text": terms_text, "risk_score": score}
    except Exception as e:
        logger.exception("upload-terms error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chatbot")
def chatbot_route(body: ChatBody, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    context = body.terms_text or ""
    if not context and body.scan_results:
        context = json.dumps(body.scan_results)[:9000]
    if not body.message or not context:
        raise HTTPException(status_code=400, detail="Missing message and/or terms context")
    try:
        reply_data = chatbot(body.message, context)
        reply = reply_data.get("response", "") if isinstance(reply_data, dict) else str(reply_data)
        db.add(ChatHistory(user_id=int(user_id), user_message=body.message, bot_reply=reply, context_summary=context[:500]))
        db.commit()
        return {"reply": reply}
    except Exception as e:
        logger.exception("chatbot error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/classify-page")
def classify_page_route(body: ClassifyBody, user_id: str = Depends(get_current_user_id)):
    try:
        is_tc = tc_page_classifier.is_tc_page(body.text)
        prob = tc_page_classifier.tc_page_probability(body.text)
        return {"is_tc_page": is_tc, "probability": round(prob, 4)}
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Classifier model not trained yet.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/masking-preview")
def masking_preview_route(body: MaskBody, user_id: str = Depends(get_current_user_id)):
    if not body.terms_text or len(body.terms_text.strip()) < 100:
        raise HTTPException(status_code=400, detail="Please provide at least 100 characters.")
    try:
        masked = mask_pii(body.terms_text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"masked_text": masked["masked_text"], "entity_types": masked["entity_types"], "entity_count": masked["entity_count"], "notice": MASKING_NOTICE}


@app.get("/api/history")
def history_route(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    from sqlalchemy import select
    rows = db.execute(select(AnalysisHistory).where(AnalysisHistory.user_id == int(user_id)).order_by(AnalysisHistory.created_at.desc()).limit(50)).scalars().all()
    return [{"id": r.id, "source": r.source, "document_name": r.document_name, "risk_score": r.risk_score, "summary": r.summary_json, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@app.get("/")
def root():
    return {"message": "EziTerms API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
