"""Clip generation endpoint — generates a single image or video via Kling 3.0."""
import os
import logging
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import httpx

from app.services.kling import generate_image, generate_video, download_media
from app.services.gemini_image import generate_image_gemini
from app.services.media import create_thumbnail
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/render", tags=["generate"])


class GenerateRequest(BaseModel):
    clip_id: str
    prompt: str
    type: str = "image"
    aspect_ratio: str = "16:9"
    duration_ms: int = 3000
    negative_prompt: str = ""
    callback_url: Optional[str] = None


class GenerateResponse(BaseModel):
    clip_id: str
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: str = "pending"
    message: str = ""


async def _notify_progress(clip_id: str, status: str, media_url: str = "", error: str = ""):
    """Notify the API service about generation progress."""
    settings = get_settings()
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.api_service_url}/api/v1/internal/clip-status",
                json={
                    "clip_id": clip_id,
                    "status": status,
                    "media_url": media_url,
                    "error": error,
                },
                timeout=10,
            )
    except Exception as e:
        logger.warning("Failed to notify API service: %s", e)


async def _generate_and_callback(data: GenerateRequest):
    """Background task: generate media, download, create thumbnail, notify API."""
    try:
        await _notify_progress(data.clip_id, "generating")

        if data.type == "video":
            result = await generate_video(
                data.prompt,
                data.duration_ms / 1000,
                data.aspect_ratio,
                data.negative_prompt,
            )
        else:
            result = await generate_image(
                data.prompt,
                data.aspect_ratio,
                data.negative_prompt,
            )

        if result.get("status") == "done":
            media_url = result.get("url", "")

            # Download and create thumbnail
            thumbnail_url = media_url
            try:
                if media_url:
                    media_bytes = await download_media(media_url)
                    if data.type == "image" and media_bytes:
                        thumb_bytes = await create_thumbnail(media_bytes)
                        # Thumbnail URL will be the same as media for now
                        # In production, upload thumb to Supabase Storage
            except Exception as e:
                logger.warning("Thumbnail creation failed: %s", e)

            await _notify_progress(data.clip_id, "done", media_url)
        else:
            error_msg = result.get("message", "Generation failed")
            await _notify_progress(data.clip_id, "error", error=error_msg)

    except Exception as e:
        logger.error("Generation background task failed: %s", e)
        await _notify_progress(data.clip_id, "error", error=str(e))


@router.post("/generate", response_model=GenerateResponse)
async def generate(data: GenerateRequest, background_tasks: BackgroundTasks):
    """Generate media for a single clip.

    Starts generation in the background and returns immediately.
    Progress is reported via callback to the API service.
    """
    # If no Kling API key, fall back to Gemini image generation
    settings = get_settings()
    if not settings.kling_api_key:
        # Video clips fall back to image (Gemini doesn't do video)
        result = await generate_image_gemini(data.prompt, data.aspect_ratio)
        return GenerateResponse(
            clip_id=data.clip_id,
            media_url=result.get("url"),
            thumbnail_url=result.get("thumbnail_url"),
            status=result.get("status", "error"),
            message=result.get("message"),
        )

    # With API key configured, run generation in background
    background_tasks.add_task(_generate_and_callback, data)

    return GenerateResponse(
        clip_id=data.clip_id,
        status="generating",
        message="Generation started in background",
    )
