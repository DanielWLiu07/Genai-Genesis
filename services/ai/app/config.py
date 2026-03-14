from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path

# Walk up from services/ai/app/ to repo root and find .env
_HERE = Path(__file__).resolve().parent          # services/ai/app
_ROOT = _HERE.parents[2]                          # repo root (3 levels up)
_ENV_FILES = [str(_ROOT / ".env"), ".env"]        # try root first, local fallback


class Settings(BaseSettings):
    gemini_api_key: str = ""
    api_service_url: str = "http://localhost:8000"

    class Config:
        env_file = _ENV_FILES
        extra = "ignore"


@lru_cache()
def get_settings():
    return Settings()
