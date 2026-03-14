from pydantic import BaseModel
from typing import Optional

class GenerateClipRequest(BaseModel):
    clip_id: str
    prompt: str
    type: str = "image"

class RenderRequest(BaseModel):
    pass

class RenderJobResponse(BaseModel):
    id: str
    project_id: str
    status: str
    progress: int = 0
    output_url: Optional[str] = None
    error: Optional[str] = None
