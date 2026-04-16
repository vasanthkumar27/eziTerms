"""SQLite database: engine, session, and minimal models."""
from datetime import datetime, timezone
from typing import Generator

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.sql import func

from config import get_settings

_engine = None
_session_factory = None


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(254), unique=True, nullable=False)
    password_hash = Column(String(128), nullable=False, default="")
    first_name = Column(String(150), default="")
    last_name = Column(String(150), default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), server_default=func.now())


class StoredToken(Base):
    __tablename__ = "tokens"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ChatHistory(Base):
    __tablename__ = "chat_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    user_message = Column(Text, nullable=False)
    bot_reply = Column(Text, nullable=False)
    context_summary = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AnalysisHistory(Base):
    __tablename__ = "analysis_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    source = Column(String(20), default="paste")
    document_name = Column(String(255), default="")
    document_url = Column(Text, default="")
    risk_score = Column(Float, nullable=True)
    summary_json = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


def _get_engine():
    global _engine
    if _engine is None:
        url = get_settings().database_url
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, connect_args=connect_args)
    return _engine


def _session_local():
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(autocommit=False, autoflush=False, bind=_get_engine())
    return _session_factory


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=_get_engine())


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yield a DB session."""
    db = _session_local()()
    try:
        yield db
    finally:
        db.close()
