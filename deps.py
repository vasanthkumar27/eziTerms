"""FastAPI dependencies: get current user from JWT."""
import logging
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from auth import decode_token, get_valid_token
from database import get_db

logger = logging.getLogger("eziterms")


def get_current_user_id(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not get_valid_token(db, token):
        raise HTTPException(status_code=401, detail="Token expired or revoked")
    return sub
