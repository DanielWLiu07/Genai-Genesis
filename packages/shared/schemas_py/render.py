from pydantic import BaseModel
from typing import Optional

class RenderJob(BaseModel):
    id: str
    project_id: str
    status: str = "queued"
    progress: int = 0
    output_url: Optional[str] = None
    error: Optional[str] = None
