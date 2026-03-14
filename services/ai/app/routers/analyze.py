from fastapi import APIRouter
from pydantic import BaseModel
from app.services.story_analyzer import analyze_story

router = APIRouter(prefix="/ai", tags=["analyze"])

class AnalyzeRequest(BaseModel):
    project_id: str
    book_text: str = ""

@router.post("/analyze")
async def analyze(data: AnalyzeRequest):
    if not data.book_text:
        return {"error": "No book text provided"}
    result = await analyze_story(data.book_text)
    return result
