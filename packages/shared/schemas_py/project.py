from pydantic import BaseModel
from typing import Optional, List

class Character(BaseModel):
    name: str
    description: str
    visual_description: str

class Scene(BaseModel):
    title: str
    description: str
    quote: Optional[str] = None
    mood: str
    visual_description: str
    scene_type: str = "introduction"

class BookAnalysis(BaseModel):
    summary: str
    themes: List[str]
    genre: str
    mood: str
    target_audience: str
    characters: List[Character]
    key_scenes: List[Scene]

class Project(BaseModel):
    id: str
    title: str
    author: str = ""
    description: str = ""
    book_file_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    status: str = "uploading"
    analysis: Optional[BookAnalysis] = None
