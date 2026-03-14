from pydantic import BaseModel, Field
from typing import Optional, List

class TextStyle(BaseModel):
    font_size: int = 32
    color: str = "#ffffff"
    position: str = "bottom"
    animation: Optional[str] = None

class Clip(BaseModel):
    id: str
    order: int
    type: str = "image"
    duration_ms: int = 3000
    prompt: str = ""
    generated_media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    text: Optional[str] = None
    text_style: Optional[TextStyle] = None
    transition_type: Optional[str] = None
    gen_status: str = "pending"
    gen_error: Optional[str] = None
    position: dict = Field(default_factory=lambda: {"x": 0, "y": 100})

class MusicTrack(BaseModel):
    url: str
    name: str
    duration_ms: int
    volume: float = 1.0

class TimelineSettings(BaseModel):
    resolution: str = "1080p"
    aspect_ratio: str = "16:9"
    fps: int = 24

class Timeline(BaseModel):
    project_id: Optional[str] = None
    clips: List[Clip] = []
    music_track: Optional[MusicTrack] = None
    total_duration_ms: int = 0
    settings: TimelineSettings = Field(default_factory=TimelineSettings)
