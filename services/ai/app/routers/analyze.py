from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.story_analyzer import analyze_story
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["analyze"])


class AnalyzeRequest(BaseModel):
    project_id: str
    book_text: str = ""


@router.post("/analyze")
async def analyze(data: AnalyzeRequest):
    if not data.book_text or len(data.book_text.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Book text is too short. Provide at least 50 characters of story content.",
        )

    logger.info(f"Analyzing story for project {data.project_id} ({len(data.book_text)} chars)")
    result = await analyze_story(data.book_text)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    logger.info(
        f"Analysis complete: {len(result.get('key_scenes', []))} scenes, "
        f"{len(result.get('characters', []))} characters"
    )
    return result
