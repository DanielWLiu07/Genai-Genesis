"""Video generation using fal.ai — Wan 2.1 image-to-video (anime/manga optimised).

Uses fal-client SDK. Set FAL_KEY in .env.
Model: fal-ai/wan/v2.1/image-to-video  (has start frame → great for consistency)
       fal-ai/wan/v2.1/text-to-video   (fallback when no image available)
"""
import asyncio
import logging
import os
from typing import Optional

from app.config import get_settings
from app.services.veo import _supabase_upload_video

logger = logging.getLogger(__name__)

# Wan 2.1 — excellent for anime/manga style, cheap (~$0.02–0.05/clip)
_MODEL_IMAGE_TO_VIDEO = "fal-ai/wan/v2.1/image-to-video"
_MODEL_TEXT_TO_VIDEO  = "fal-ai/wan/v2.1/text-to-video"


def _run_fal_sync(model: str, arguments: dict) -> dict:
    """Run a fal.ai request synchronously via submit+poll (called via asyncio.to_thread)."""
    import fal_client
    import time
    settings = get_settings()
    os.environ["FAL_KEY"] = settings.fal_api_key

    handler = fal_client.submit(model, arguments=arguments)
    logger.info("fal submitted %s request_id=%s", model, handler.request_id)

    # Poll until done (videos typically take 30–120s)
    max_polls = 120  # 10 minutes at 5s intervals
    for i in range(max_polls):
        time.sleep(5)
        status = handler.status()
        status_name = type(status).__name__
        logger.info("fal poll %d/%d: %s", i + 1, max_polls, status_name)
        if status_name == "Completed":
            break
        if status_name == "Failed":
            raise RuntimeError(f"fal generation failed: {status}")
    else:
        raise RuntimeError("fal generation timed out after 10 minutes")

    result = handler.get()
    # fal returns either a dict or a pydantic-like object
    if hasattr(result, "model_dump"):
        return result.model_dump()
    if hasattr(result, "__dict__"):
        return vars(result)
    return dict(result)


async def generate_video_fal(
    prompt: str,
    aspect_ratio: str = "16:9",
    duration_sec: float = 5.0,
    start_frame_url: Optional[str] = None,
) -> dict:
    """Generate a video via fal.ai Wan 2.1.

    Returns: {status, url, thumbnail_url, message}
    """
    settings = get_settings()
    if not settings.fal_api_key:
        return {"status": "error", "message": "No FAL_KEY configured"}

    try:
        # Map duration to nearest supported value (5s default)
        duration = "5" if duration_sec <= 5 else "10"

        if start_frame_url and not start_frame_url.startswith("data:"):
            logger.info("fal Wan 2.1 image-to-video")
            arguments = {
                "image_url": start_frame_url,
                "prompt": prompt,
                "duration": duration,
                "resolution": "480p",
                "aspect_ratio": aspect_ratio,
            }
            model = _MODEL_IMAGE_TO_VIDEO
        else:
            logger.info("fal Wan 2.1 text-to-video")
            arguments = {
                "prompt": prompt,
                "duration": duration,
                "resolution": "480p",
                "aspect_ratio": aspect_ratio,
            }
            model = _MODEL_TEXT_TO_VIDEO

        raw = await asyncio.to_thread(_run_fal_sync, model, arguments)
        logger.info("fal raw result keys: %s", list(raw.keys()) if isinstance(raw, dict) else type(raw))

        # Extract video URL from result
        video_url = None
        if isinstance(raw, dict):
            video = raw.get("video") or {}
            if isinstance(video, dict):
                video_url = video.get("url")
            elif hasattr(video, "url"):
                video_url = video.url
            # Some models return top-level url
            if not video_url:
                video_url = raw.get("url") or raw.get("video_url")

        if not video_url:
            logger.error("fal returned no video URL: %s", raw)
            return {"status": "error", "message": "fal returned no video URL"}

        # Download and upload to Supabase for a permanent public URL
        import httpx, hashlib
        cache_key = hashlib.sha256(f"{prompt}|{start_frame_url or ''}".encode()).hexdigest()
        filename = f"fal_{cache_key[:16]}.mp4"

        async with httpx.AsyncClient(timeout=120) as http:
            resp = await http.get(video_url)
            video_bytes = resp.content

        output_dir = settings.render_output_dir
        os.makedirs(output_dir, exist_ok=True)
        with open(os.path.join(output_dir, filename), "wb") as f:
            f.write(video_bytes)

        public_url = await asyncio.to_thread(_supabase_upload_video, filename, video_bytes)
        url = public_url or video_url  # fall back to fal's temp URL if Supabase fails

        logger.info("fal video ready: %s (%d bytes)", filename, len(video_bytes))
        return {"status": "done", "url": url, "thumbnail_url": url, "message": ""}

    except Exception as e:
        logger.error("fal video generation error: %s", e)
        return {"status": "error", "message": str(e)}
