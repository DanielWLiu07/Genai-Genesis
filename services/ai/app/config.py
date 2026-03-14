from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    gemini_api_key: str = ""
    api_service_url: str = "http://localhost:8000"

    class Config:
        env_file = "../../.env"

@lru_cache()
def get_settings():
    return Settings()
