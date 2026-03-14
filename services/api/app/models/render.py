from pydantic import BaseModel
from typing import Optional, List, Any

class GenerateClipRequest(BaseModel):
    clip_id: str
    prompt: str = ""
    type: str = "image"
    clip_order: Optional[int] = None
    scene_image_url: Optional[str] = None
    characters: Optional[List[Any]] = None
    mood: Optional[str] = None
    genre: Optional[str] = None
    shot_type: Optional[str] = None
    is_continuous: Optional[bool] = None

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
