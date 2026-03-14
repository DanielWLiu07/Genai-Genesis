from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_key: str = ""
    ai_service_url: str = "http://localhost:8001"
    render_service_url: str = "http://localhost:8002"

    class Config:
        env_file = ("../../.env", ".env")  # root .env or local .env
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()
