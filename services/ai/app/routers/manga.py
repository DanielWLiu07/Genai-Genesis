"""AI service endpoint for manga/comic analysis."""

import base64
import logging
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.manga_analyzer import analyze_manga_pages

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["manga"])


class MangaAnalyzeRequest(BaseModel):
    project_id: str
    # Each page is a base64-encoded image (PNG or JPEG)
    pages: List[str]
    max_panels: int = 12


@router.post("/analyze-manga")
async def analyze_manga(data: MangaAnalyzeRequest):
    """Extract panels from manga pages, score for action, and return clips + analysis.

    - Panels are extracted with OpenCV (adenzu-style contour detection)
    - Each panel is scored 1-10 for action/fight intensity via Gemini vision
    - Top action panels are kept (≥ 6 score, or top-N)
    - Clips are returned with gen_status="done" and the panel image embedded
      as a base64 data URL — no further image generation is needed
    """
    if not data.pages:
        raise HTTPException(status_code=400, detail="At least one manga page image is required.")
    if len(data.pages) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 pages per request.")

    # Decode base64 pages back to raw bytes
    page_bytes_list: List[bytes] = []
    for i, b64 in enumerate(data.pages):
        try:
            # Handle data URLs like "data:image/jpeg;base64,..."
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            page_bytes_list.append(base64.b64decode(b64))
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Page {i + 1} is not valid base64: {exc}",
            )

    logger.info(
        f"[{data.project_id}] Analyzing {len(page_bytes_list)} manga page(s), "
        f"max_panels={data.max_panels}"
    )

    result = await analyze_manga_pages(page_bytes_list, max_panels=data.max_panels)

    if result.get("error"):
        raise HTTPException(status_code=422, detail=result["error"])

    logger.info(
        f"[{data.project_id}] Manga analysis complete: "
        f"{result.get('panel_count')} panels from {result.get('page_count')} pages"
    )

    return result
