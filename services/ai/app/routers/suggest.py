from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.suggestions import get_suggestions

router = APIRouter(prefix="/ai", tags=["suggestions"])


class SuggestRequest(BaseModel):
    project_id: str
    timeline: dict
    analysis: Optional[dict] = None


@router.post("/suggest")
async def suggest(data: SuggestRequest):
    """Analyze the current timeline and return improvement suggestions."""
    result = await get_suggestions(data.timeline, data.analysis)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
