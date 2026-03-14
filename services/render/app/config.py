from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    kling_api_key: str = ""
    kling_api_secret: str = ""
    api_service_url: str = "http://localhost:8000"
    supabase_url: str = ""
    supabase_service_key: str = ""
    render_output_dir: str = os.environ.get("RENDER_OUTPUT_DIR", "/tmp/renders")

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings():
    return Settings()
