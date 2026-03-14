"""Clip generation endpoint — generates a single image or video via Kling 3.0 or Gemini fallback."""
import logging
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import httpx

from app.services.kling import generate_image, generate_video, download_media
from app.services.gemini_image import generate_image_gemini
from app.services.media import create_thumbnail
from app.services.prompt_builder import build_video_prompt, build_image_prompt, build_negative_prompt
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/render", tags=["generate"])


class CharacterInfo(BaseModel):
    name: str
    description: Optional[str] = None
    appearance: Optional[str] = None
    image_url: Optional[str] = None
    age: Optional[str] = None


class GenerateRequest(BaseModel):
    clip_id: str
    prompt: str
    type: str = "image"
    aspect_ratio: str = "16:9"
    duration_ms: int = 3000
    clip_order: int = 0
    # Scene context for better generation
    scene_image_url: Optional[str] = None      # existing still to use as start frame
    characters: Optional[list[CharacterInfo]] = None
    mood: Optional[str] = None
    genre: Optional[str] = None
    shot_type: str = "cut"                     # "continuous" or "cut"
    is_continuous: bool = False
    negative_prompt: str = ""
    callback_url: Optional[str] = None


class GenerateResponse(BaseModel):
    clip_id: str
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: str = "pending"
    message: str = ""


async def _notify_progress(clip_id: str, status: str, media_url: str = "", thumbnail_url: str = "", error: str = ""):
    settings = get_settings()
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.api_service_url}/api/v1/internal/clip-status",
                json={
                    "clip_id": clip_id,
                    "status": status,
                    "media_url": media_url,
                    "thumbnail_url": thumbnail_url,
                    "error": error,
                },
                timeout=10,
            )
    except Exception as e:
        logger.warning("Failed to notify API service: %s", e)


async def _generate_and_callback(data: GenerateRequest):
    """Background task: build rich prompt, generate, notify."""
    try:
        await _notify_progress(data.clip_id, "generating")

        chars = [c.model_dump() for c in (data.characters or [])]
        neg = data.negative_prompt or build_negative_prompt()

        if data.type == "video":
            prompt = build_video_prompt(
                data.prompt,
                clip_order=data.clip_order,
                characters=chars,
                mood=data.mood,
                genre=data.genre,
                is_continuous=data.is_continuous,
            )
            result = await generate_video(
                prompt=prompt,
                duration_sec=data.duration_ms / 1000,
                aspect_ratio=data.aspect_ratio,
                negative_prompt=neg,
                start_frame_url=data.scene_image_url,
                reference_image_urls=[
                    c["image_url"] for c in chars if c.get("image_url")
                ] or None,
            )
        else:
            prompt = build_image_prompt(
                data.prompt,
                characters=chars,
                mood=data.mood,
            )
            result = await generate_image(
                prompt=prompt,
                aspect_ratio=data.aspect_ratio,
                negative_prompt=neg,
            )
            # Kling failed (e.g. insufficient balance) — fall back to Gemini
            if result.get("status") != "done":
                logger.warning("Kling image failed (%s), falling back to Gemini", result.get("message"))
                result = await generate_image_gemini(prompt, data.aspect_ratio)

        if result.get("status") == "done":
            media_url = result.get("url", "")
            thumbnail_url = media_url
            try:
                if media_url and not media_url.startswith("data:"):
                    media_bytes = await download_media(media_url)
                    if data.type == "image" and media_bytes:
                        await create_thumbnail(media_bytes)
            except Exception as e:
                logger.warning("Thumbnail creation failed: %s", e)

            await _notify_progress(data.clip_id, "done", media_url, thumbnail_url)
        else:
            await _notify_progress(data.clip_id, "error", error=result.get("message", "Generation failed"))

    except Exception as e:
        logger.error("Generation background task failed: %s", e)
        await _notify_progress(data.clip_id, "error", error=str(e))


@router.post("/generate", response_model=GenerateResponse)
async def generate(data: GenerateRequest, background_tasks: BackgroundTasks):
    """Generate media for a single clip.

    Builds an enhanced AMV/manga-style prompt with character context and scene frame.
    Uses Kling image-to-video when a scene image is available, otherwise text-to-video.
    Falls back to Gemini image generation when Kling is not configured.
    """
    settings = get_settings()
    chars = [c.model_dump() for c in (data.characters or [])]

    # Images: always use Gemini (synchronous, returns URL immediately)
    if data.type != "video":
        prompt = build_image_prompt(data.prompt, characters=chars, mood=data.mood)
        result = await generate_image_gemini(prompt, data.aspect_ratio)
        return GenerateResponse(
            clip_id=data.clip_id,
            media_url=result.get("url"),
            thumbnail_url=result.get("thumbnail_url") or result.get("url"),
            status=result.get("status", "error"),
            message=result.get("message") or "",
        )

    # Videos: use Kling async (runs in background, notifies via WebSocket)
    background_tasks.add_task(_generate_and_callback, data)
    return GenerateResponse(
        clip_id=data.clip_id,
        status="generating",
        message="Generation started in background",
    )
