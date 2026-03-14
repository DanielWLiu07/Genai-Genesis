"""Clip generation endpoint — generates a single image or video via Kling 3.0 or Gemini fallback."""
import logging
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import httpx

from app.services.kling import generate_image, generate_video as generate_video_kling, download_media
from app.services.veo import generate_video_veo
from app.services.fal_video import generate_video_fal
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
    clip_total: int = 0
    # Scene context for better generation
    scene_image_url: Optional[str] = None      # existing still to use as start frame
    characters: Optional[list[CharacterInfo]] = None
    mood: Optional[str] = None
    genre: Optional[str] = None
    themes: Optional[list[str]] = None         # story themes (hope, sacrifice, etc.)
    shot_type: str = "cut"                     # "continuous" or "cut"
    is_continuous: bool = False
    negative_prompt: str = ""
    style_seed: Optional[str] = None           # consistent visual anchor across all clips
    callback_url: Optional[str] = None
    text: Optional[str] = None                 # overlay text (for text_overlay clips)
    # Narrative context for consistency
    prev_scene_prompt: Optional[str] = None    # previous clip's prompt (continuity)
    next_scene_prompt: Optional[str] = None    # next clip's prompt (exit framing)
    feedback: Optional[str] = None             # user refinement notes


class GenerateResponse(BaseModel):
    clip_id: str
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: str = "pending"
    message: str = ""


async def _notify_progress(clip_id: str, status: str, media_url: str = "", thumbnail_url: str = "", error: str = "", extra: dict = {}):
    settings = get_settings()
    try:
        async with httpx.AsyncClient() as client:
            payload = {
                "clip_id": clip_id,
                "status": status,
                "media_url": media_url,
                "thumbnail_url": thumbnail_url,
                "error": error,
            }
            payload.update(extra)
            await client.post(
                f"{settings.api_service_url}/api/v1/internal/clip-status",
                json=payload,
                timeout=10,
            )
    except Exception as e:
        logger.warning("Failed to notify API service: %s", e)


async def _generate_and_callback(data: GenerateRequest):
    """Background task: build rich prompt, generate, notify."""
    try:
        await _notify_progress(data.clip_id, "generating")

        chars = [c.model_dump() for c in (data.characters or [])]
        neg = data.negative_prompt or build_negative_prompt(genre=data.genre)

        actual_type = data.type
        if data.type == "video":
            prompt = build_video_prompt(
                data.prompt,
                clip_order=data.clip_order,
                clip_total=data.clip_total,
                characters=chars,
                mood=data.mood,
                genre=data.genre,
                themes=data.themes,
                is_continuous=data.is_continuous,
                prev_scene_prompt=data.prev_scene_prompt,
                next_scene_prompt=data.next_scene_prompt,
                feedback=data.feedback,
                style_seed=data.style_seed,
            )
            result = await generate_video_fal(
                prompt=prompt,
                aspect_ratio=data.aspect_ratio,
                duration_sec=data.duration_ms / 1000,
                start_frame_url=data.scene_image_url,
            )
            # fal failed — fall back to Gemini image so clip isn't stranded
            if result.get("status") != "done":
                logger.warning("fal video failed (%s), falling back to Gemini image", result.get("message"))
                img_prompt = build_image_prompt(data.prompt, characters=chars, mood=data.mood)
                result = await generate_image_gemini(img_prompt, data.aspect_ratio)
                actual_type = "image"
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
                    if actual_type == "image" and media_bytes:
                        await create_thumbnail(media_bytes)
            except Exception as e:
                logger.warning("Thumbnail creation failed: %s", e)

            await _notify_progress(data.clip_id, "done", media_url, thumbnail_url,
                                   extra={"actual_type": actual_type})
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
        base_prompt = data.prompt

        # text_overlay: generate a cinematic scene with the text visually integrated
        if data.type == "text_overlay" and data.text:
            overlay_text = data.text.strip()
            base_prompt = (
                f"{base_prompt}. "
                f"The text \"{overlay_text}\" is dramatically composited into the scene as a "
                f"cinematic title card — stylised kanji/manga lettering, glowing ink strokes, "
                f"integrated into the environment (carved in stone, painted on a wall, floating "
                f"in mist, or burning in the air). The text is part of the scene, not a UI overlay."
            )

        prompt = build_image_prompt(
            base_prompt,
            characters=chars,
            mood=data.mood,
            style_seed=data.style_seed,
            clip_order=data.clip_order,
            clip_total=data.clip_total,
            prev_scene_prompt=data.prev_scene_prompt,
        )
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
