"""Video generation using Google Veo 2 / Veo 3 (google-genai SDK).

Uses the same GEMINI_API_KEY already configured for Imagen — no extra setup needed.
Supports both text-to-video and image-to-video (start frame).
Uploads result to Supabase Storage for a publicly accessible URL.
"""
import asyncio
import hashlib
import logging
import os
import httpx
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)

STORAGE_BUCKET = "renders"
# Use Veo 2 (stable) by default; swap to veo-3.0-generate-001 once quota allows
VEO_MODEL = "veo-3.0-generate-001"

_cache: dict[str, dict] = {}


def _supabase_upload_video(filename: str, data: bytes) -> str | None:
    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_service_key):
        return None
    try:
        from supabase import create_client
        client = create_client(settings.supabase_url, settings.supabase_service_key)
        try:
            client.storage.create_bucket(STORAGE_BUCKET, options={"public": True})
        except Exception:
            pass
        client.storage.from_(STORAGE_BUCKET).upload(
            filename,
            data,
            file_options={"content-type": "video/mp4", "upsert": "true"},
        )
        return client.storage.from_(STORAGE_BUCKET).get_public_url(filename)
    except Exception as e:
        logger.warning("Supabase video upload failed: %s", e)
        return None


async def generate_video_veo(
    prompt: str,
    aspect_ratio: str = "16:9",
    duration_sec: float = 5.0,
    negative_prompt: str = "",
    start_frame_url: Optional[str] = None,
) -> dict:
    """Generate a video using Veo 2.

    When start_frame_url is provided, uses image-to-video for frame consistency.
    Returns: {status, url, thumbnail_url, message}
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        return {"status": "error", "message": "No GEMINI_API_KEY configured"}

    cache_key = hashlib.sha256(f"{prompt}|{aspect_ratio}|{start_frame_url or ''}".encode()).hexdigest()
    if cache_key in _cache:
        logger.info("Veo cache hit")
        return _cache[cache_key]

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)

        ar_map = {"16:9": "16:9", "9:16": "9:16", "1:1": "1:1"}
        ar = ar_map.get(aspect_ratio, "16:9")
        duration_s = 8 if duration_sec > 5 else 5

        config = types.GenerateVideosConfig(
            aspect_ratio=ar,
            duration_seconds=duration_s,
            negative_prompt=negative_prompt or None,
            number_of_videos=1,
        )

        if start_frame_url and not start_frame_url.startswith("data:"):
            logger.info("Veo image-to-video with start frame")
            async with httpx.AsyncClient(timeout=30) as http:
                img_resp = await http.get(start_frame_url)
                img_bytes = img_resp.content
                img_mime = img_resp.headers.get("content-type", "image/jpeg").split(";")[0]

            image_ref = types.Image(image_bytes=img_bytes, mime_type=img_mime)
            operation = await asyncio.to_thread(
                client.models.generate_videos,
                model=VEO_MODEL,
                prompt=prompt,
                image=image_ref,
                config=config,
            )
        else:
            logger.info("Veo text-to-video")
            operation = await asyncio.to_thread(
                client.models.generate_videos,
                model=VEO_MODEL,
                prompt=prompt,
                config=config,
            )

        logger.info("Veo operation started: %s", getattr(operation, "name", "unknown"))

        # Poll until done (typically 1–3 minutes)
        max_polls = 60  # 10 minutes max (10s intervals)
        for attempt in range(max_polls):
            await asyncio.sleep(10)
            operation = await asyncio.to_thread(client.operations.get, operation)
            logger.info("Veo poll %d/%d: done=%s", attempt + 1, max_polls, operation.done)
            if operation.done:
                break

        if not operation.done:
            return {"status": "error", "message": "Veo generation timed out after 10 minutes"}

        if not operation.response or not operation.response.generated_videos:
            err = str(getattr(operation, "error", "No video returned"))
            logger.error("Veo generation failed: %s", err)
            return {"status": "error", "message": err}

        video = operation.response.generated_videos[0]
        video_bytes = video.video.video_bytes
        if not video_bytes:
            return {"status": "error", "message": "Veo returned empty video bytes"}

        filename = f"veo_{cache_key[:16]}.mp4"

        output_dir = settings.render_output_dir
        os.makedirs(output_dir, exist_ok=True)
        with open(os.path.join(output_dir, filename), "wb") as f:
            f.write(video_bytes)

        public_url = await asyncio.to_thread(_supabase_upload_video, filename, video_bytes)
        url = public_url or f"http://localhost:8002/outputs/{filename}"

        result = {"status": "done", "url": url, "thumbnail_url": url, "message": ""}
        _cache[cache_key] = result
        logger.info("Veo video ready: %s (%d bytes) -> %s", filename, len(video_bytes), "supabase" if public_url else "local")
        return result

    except Exception as e:
        logger.error("Veo generation error: %s", e)
        return {"status": "error", "message": str(e)}
