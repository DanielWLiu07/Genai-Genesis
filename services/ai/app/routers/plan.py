from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.trailer_planner import plan_trailer
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["plan"])


class PlanRequest(BaseModel):
    project_id: str
    analysis: Optional[dict] = None
    settings: Optional[dict] = None
    style: Optional[str] = None  # horror, romance, thriller, fantasy, manga, etc.
    pacing: str = "balanced"  # fast, balanced, slow


@router.post("/plan-trailer")
async def plan(data: PlanRequest):
    if not data.analysis:
        raise HTTPException(
            status_code=400,
            detail="No analysis provided. Run /ai/analyze first.",
        )

    logger.info(f"Planning trailer for project {data.project_id}, style={data.style}, pacing={data.pacing}")
    result = await plan_trailer(data.analysis, style=data.style, pacing=data.pacing)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    clip_count = len(result.get("clips", []))
    total_s = result.get("total_duration_ms", 0) / 1000
    logger.info(f"Trailer plan complete: {clip_count} clips, {total_s:.1f}s total")
    return result
