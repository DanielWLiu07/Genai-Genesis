from pydantic import BaseModel
from typing import Optional, List, Any

class GenerateClipRequest(BaseModel):
    clip_id: str
    prompt: str = ""
    type: str = "image"
    clip_order: Optional[int] = None
    clip_total: Optional[int] = None
    scene_image_url: Optional[str] = None
    start_frame_url: Optional[str] = None      # alias for scene_image_url (used by ChatPanel)
    reference_image_url: Optional[str] = None  # previous panel for visual continuity
    characters: Optional[List[Any]] = None
    mood: Optional[str] = None
    genre: Optional[str] = None
    themes: Optional[List[str]] = None
    shot_type: Optional[str] = None
    is_continuous: Optional[bool] = None
    style_seed: Optional[str] = None
    text: Optional[str] = None
    prev_scene_prompt: Optional[str] = None
    next_scene_prompt: Optional[str] = None
    feedback: Optional[str] = None
    music_timestamp_ms: Optional[int] = None
    music_energy: Optional[float] = None

class RenderRequest(BaseModel):
    effects: Optional[List[Any]] = None
    beat_map: Optional[Any] = None
    timeline: Optional[Any] = None  # if provided, skip DB fetch and use this directly

class RenderJobResponse(BaseModel):
    id: str
    project_id: str
    status: str
    progress: int = 0
    output_url: Optional[str] = None
    error: Optional[str] = None
