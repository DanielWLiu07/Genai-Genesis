from pydantic import BaseModel, Field
from typing import Optional, List

class Clip(BaseModel):
    id: str
    order: int
    type: str = "image"
    duration_ms: int = 3000
    prompt: str = ""
    generated_media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    text: Optional[str] = None
    text_style: Optional[dict] = None
    transition_type: Optional[str] = None
    gen_status: str = "pending"
    gen_error: Optional[str] = None
    position: dict = Field(default_factory=lambda: {"x": 0, "y": 100})

class TimelineUpdate(BaseModel):
    clips: List[Clip] = []
    music_track: Optional[dict] = None
    total_duration_ms: int = 0
    settings: dict = Field(default_factory=lambda: {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24})

class ClipUpdate(BaseModel):
    duration_ms: Optional[int] = None
    prompt: Optional[str] = None
    text: Optional[str] = None
    transition_type: Optional[str] = None
    gen_status: Optional[str] = None
