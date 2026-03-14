from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.services.story_analyzer import analyze_story
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["analyze"])


class CharacterInput(BaseModel):
    name: str
    description: str = ""
    reference_image_url: Optional[str] = None


class AnalyzeRequest(BaseModel):
    project_id: str
    book_text: str = ""
    characters: Optional[List[CharacterInput]] = None
    uploaded_images: Optional[List[str]] = None


@router.post("/analyze")
async def analyze(data: AnalyzeRequest):
    if not data.book_text or len(data.book_text.strip()) < 1:
        raise HTTPException(
            status_code=400,
            detail="No story text provided.",
        )

    logger.info(f"Analyzing story for project {data.project_id} ({len(data.book_text)} chars)")

    characters = None
    if data.characters:
        characters = [c.model_dump() for c in data.characters]

    result = await analyze_story(
        data.book_text,
        characters=characters,
        uploaded_image_urls=data.uploaded_images,
    )

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    logger.info(
        f"Analysis complete: {len(result.get('key_scenes', []))} scenes, "
        f"{len(result.get('characters', []))} characters"
    )
    return result
