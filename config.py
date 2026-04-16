"""Minimal app settings from environment."""
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "replace-this-with-a-secure-secret-key"
    google_client_id: Optional[str] = None
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    algorithm: str = "HS256"
    database_url: str = "sqlite:///./eziterms.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
