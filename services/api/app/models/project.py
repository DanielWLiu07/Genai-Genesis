from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ProjectCreate(BaseModel):
    title: str
    description: str = ""
    author: str = ""

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    status: Optional[str] = None
    cover_image_url: Optional[str] = None
    book_text: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    title: str
    author: str
    description: str
    book_file_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    status: str = "uploading"
    analysis: Optional[dict] = None
    created_at: str
    updated_at: str
