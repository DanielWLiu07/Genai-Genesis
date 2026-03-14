from pydantic import BaseModel
from typing import Optional, List, Any

class GenerateClipRequest(BaseModel):
    clip_id: str
    prompt: str = ""
    type: str = "image"
    clip_order: Optional[int] = None
    clip_total: Optional[int] = None
    scene_image_url: Optional[str] = None
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

class RenderRequest(BaseModel):
    effects: Optional[List[Any]] = None
    beat_map: Optional[Any] = None

class RenderJobResponse(BaseModel):
    id: str
    project_id: str
    status: str
    progress: int = 0
    output_url: Optional[str] = None
    error: Optional[str] = None
