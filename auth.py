"""JWT auth, Google OAuth verification, password hashing."""
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import httpx
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import get_settings
from database import User, StoredToken

_BCRYPT_MAX = 72
_refresh_blacklist: set[str] = set()


def hash_password(password: str) -> str:
    secret = (password or "").encode("utf-8")[:_BCRYPT_MAX]
    return bcrypt.hashpw(secret, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw((plain or "").encode("utf-8")[:_BCRYPT_MAX], hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(subject: str) -> str:
    s = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=s.access_token_expire_minutes)
    return jwt.encode({"sub": subject, "exp": expire, "type": "access"}, s.secret_key, algorithm=s.algorithm)


def create_refresh_token(subject: str) -> str:
    s = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(days=s.refresh_token_expire_days)
    return jwt.encode({"sub": subject, "exp": expire, "type": "refresh"}, s.secret_key, algorithm=s.algorithm)


def decode_token(token: str) -> Optional[dict]:
    s = get_settings()
    try:
        return jwt.decode(token, s.secret_key, algorithms=[s.algorithm])
    except JWTError:
        return None


def blacklist_refresh(token: str):
    _refresh_blacklist.add(token)


def is_refresh_blacklisted(token: str) -> bool:
    return token in _refresh_blacklist


def _looks_like_jwt(token: str) -> bool:
    parts = token.split(".")
    return len(parts) == 3 and all(len(p) > 0 for p in parts)


async def _verify_id_token(id_token: str, cid: str) -> Optional[dict]:
    """Verify a Google ID token (JWT credential from GSI one-tap / button)."""
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": id_token},
                timeout=10,
            )
            r.raise_for_status()
            data = r.json()
        if data.get("aud") != cid:
            return None
        if not data.get("email_verified", "false") in ("true", True):
            return None
        return {
            "email": data.get("email"),
            "given_name": data.get("given_name", ""),
            "family_name": data.get("family_name", ""),
        }
    except Exception:
        return None


async def _verify_access_token(access_token: str, cid: str) -> Optional[dict]:
    """Verify a Google OAuth2 access token."""
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(
                "https://www.googleapis.com/oauth2/v3/tokeninfo",
                params={"access_token": access_token},
                timeout=10,
            )
            r.raise_for_status()
            data = r.json()
        if data.get("error_description") or data.get("aud") != cid:
            return None
        async with httpx.AsyncClient() as c:
            ui = await c.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
            if ui.status_code == 200:
                info = ui.json()
                data["given_name"] = info.get("given_name", "")
                data["family_name"] = info.get("family_name", "")
        return data
    except Exception:
        return None


async def verify_google_token(token: str, client_id: Optional[str] = None) -> Optional[dict]:
    cid = client_id or get_settings().google_client_id
    if not cid:
        return None
    if _looks_like_jwt(token):
        return await _verify_id_token(token, cid)
    return await _verify_access_token(token, cid)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def get_or_create_user(db: Session, email: str, first_name: str = "", last_name: str = "", password_hash: str = "") -> User:
    user = get_user_by_email(db, email)
    if user:
        if first_name and not user.first_name:
            user.first_name = first_name
        if last_name and not user.last_name:
            user.last_name = last_name
        db.commit()
        db.refresh(user)
        return user
    user = User(email=email, password_hash=password_hash or hash_password(""), first_name=first_name, last_name=last_name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def store_tokens(db: Session, user_id: int, access: str, refresh: str):
    db.add(StoredToken(user_id=user_id, access_token=access, refresh_token=refresh))
    db.commit()


def get_valid_token(db: Session, access: str) -> Optional[StoredToken]:
    return db.execute(select(StoredToken).where(StoredToken.access_token == access)).scalar_one_or_none()


def update_tokens(db: Session, old_refresh: str, new_access: str, new_refresh: str):
    row = db.execute(select(StoredToken).where(StoredToken.refresh_token == old_refresh)).scalar_one_or_none()
    if row:
        row.access_token = new_access
        row.refresh_token = new_refresh
        db.commit()


def invalidate_user_tokens(db: Session, user_id: int):
    rows = db.execute(select(StoredToken).where(StoredToken.user_id == user_id)).scalars().all()
    for r in rows:
        db.delete(r)
    db.commit()
