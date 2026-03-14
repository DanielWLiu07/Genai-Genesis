from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    kling_api_key: str = ""
    kling_api_secret: str = ""
    api_service_url: str = "http://localhost:8000"

    class Config:
        env_file = "../../.env"

@lru_cache()
def get_settings():
    return Settings()
