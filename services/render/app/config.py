from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    kling_api_key: str = ""
    kling_api_secret: str = ""
    gemini_api_key: str = ""
    fal_api_key: str = ""
    api_service_url: str = "http://localhost:8000"
    render_service_url: str = "http://localhost:8002"
    supabase_url: str = ""
    supabase_service_key: str = ""
    render_output_dir: str = os.environ.get("RENDER_OUTPUT_DIR", "/tmp/renders")

    class Config:
        env_file = ("../../.env", ".env")
        extra = "ignore"


@lru_cache()
def get_settings():
    return Settings()
