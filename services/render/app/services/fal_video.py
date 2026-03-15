"""Video generation using fal.ai.

Primary:  Wan 2.1 (anime/manga optimised) via direct REST API (SDK has URL bug for this model)
Fallback: LTX-Video (fast, reliable) via SDK subscribe

Wan 2.1 models:
  fal-ai/wan/v2.1/image-to-video  — start frame → great for visual consistency
  fal-ai/wan/v2.1/text-to-video   — text only

LTX-Video fallback:
  fal-ai/ltx-video/image-to-video
  fal-ai/ltx-video
"""
import asyncio
import hashlib
import logging
import os
import time
from typing import Optional

import httpx

from app.config import get_settings
from app.services.veo import _supabase_upload_video

logger = logging.getLogger(__name__)

_FAL_QUEUE_BASE = "https://queue.fal.run"


# Models
_KLING_I2V = "fal-ai/kling-video/v1.6/standard/image-to-video"
_KLING_T2V = "fal-ai/kling-video/v1.6/standard/text-to-video"
_WAN_I2V = "fal-ai/wan/v2.1/image-to-video"
_WAN_T2V = "fal-ai/wan/v2.1/text-to-video"
_LTX_I2V = "fal-ai/ltx-video/image-to-video"
_LTX_T2V = "fal-ai/ltx-video"


# ---------------------------------------------------------------------------
# Wan via direct REST API (bypasses fal SDK URL construction bug)
# ---------------------------------------------------------------------------

def _wan_run_sync(model: str, arguments: dict, api_key: str) -> dict:
    """Submit Wan job, poll via status_url/response_url returned by the API."""
    headers = {"Authorization": f"Key {api_key}"}

    with httpx.Client(timeout=30) as client:
        resp = client.post(f"{_FAL_QUEUE_BASE}/{model}", json=arguments, headers=headers)
        resp.raise_for_status()
        submit = resp.json()

    request_id = submit["request_id"]
    status_url = submit["status_url"]    # use exact URL the API gave us
    response_url = submit["response_url"]
    logger.info("Wan submitted %s request_id=%s", model, request_id)

    max_polls = 120  # 10 minutes at 5s intervals
    with httpx.Client(timeout=15) as client:
        for i in range(max_polls):
            time.sleep(5)
            r = client.get(status_url, headers=headers)
            r.raise_for_status()
            status = r.json().get("status")
            logger.info("Wan poll %d/%d: %s", i + 1, max_polls, status)
            if status == "COMPLETED":
                result = client.get(response_url, headers=headers)
                result.raise_for_status()
                data = result.json()
                if "detail" in data and "video" not in data:
                    raise RuntimeError(f"Wan result error: {data['detail']}")
                return data
            if status in ("FAILED", "CANCELLED"):
                raise RuntimeError(f"Wan job {status}: {r.json()}")

    raise RuntimeError("Wan generation timed out after 10 minutes")


async def _generate_wan(model: str, arguments: dict) -> dict:
    settings = get_settings()
    return await asyncio.to_thread(_wan_run_sync, model, arguments, settings.fal_api_key)


# ---------------------------------------------------------------------------
# LTX-Video via SDK subscribe (fallback)
# ---------------------------------------------------------------------------

def _ltx_subscribe_sync(model: str, arguments: dict) -> dict:
    """Run LTX-Video via fal SDK subscribe (called via asyncio.to_thread)."""
    import fal_client
    settings = get_settings()
    os.environ["FAL_KEY"] = settings.fal_api_key

    result = fal_client.subscribe(model, arguments=arguments, with_logs=False)
    if hasattr(result, "model_dump"):
        return result.model_dump()
    if hasattr(result, "__dict__"):
        return vars(result)
    return dict(result)


async def _generate_ltx(model: str, arguments: dict) -> dict:
    return await asyncio.to_thread(_ltx_subscribe_sync, model, arguments)


# ---------------------------------------------------------------------------
# URL extraction helper
# ---------------------------------------------------------------------------

def _extract_video_url(raw: dict) -> Optional[str]:
    video = raw.get("video") or {}
    if isinstance(video, dict):
        url = video.get("url")
    elif hasattr(video, "url"):
        url = video.url
    else:
        url = None
    return url or raw.get("url") or raw.get("video_url")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_video_fal(
    prompt: str,
    aspect_ratio: str = "16:9",
    duration_sec: float = 5.0,
    start_frame_url: Optional[str] = None,
) -> dict:
    """Generate a video via fal.ai.

    Tries Wan 2.1 first (best anime/manga quality).
    Falls back to LTX-Video if Wan fails.

    Returns: {status, url, thumbnail_url, message}
    """
    settings = get_settings()
    if not settings.fal_api_key:
        return {"status": "error", "message": "No FAL_KEY configured"}

    use_i2v = bool(start_frame_url and not start_frame_url.startswith("data:"))
    duration = "5" if duration_sec <= 5 else "10"

    # --- Kling v1.6 (primary — best quality for manga/anime) ---
    try:
        if use_i2v:
            logger.info("Kling v1.6 image-to-video")
            kling_args = {
                "image_url": start_frame_url,
                "prompt": prompt,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
            }
            kling_model = _KLING_I2V
        else:
            logger.info("Kling v1.6 text-to-video")
            kling_args = {
                "prompt": prompt,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
            }
            kling_model = _KLING_T2V

        raw = await _generate_ltx(kling_model, kling_args)  # Kling uses same SDK subscribe path
        logger.info("Kling raw result keys: %s", list(raw.keys()) if isinstance(raw, dict) else type(raw))
        video_url = _extract_video_url(raw)

        if video_url:
            return await _finalise(video_url, prompt, start_frame_url, settings)

        logger.warning("Kling returned no video URL, falling back to Wan 2.1")

    except Exception as e:
        logger.warning("Kling v1.6 failed (%s), falling back to Wan 2.1", e)

    # --- Wan 2.1 (fallback — anime-trained, cheaper) ---
    try:
        if use_i2v:
            logger.info("Wan 2.1 image-to-video (fallback)")
            wan_args = {
                "image_url": start_frame_url,
                "prompt": prompt,
                "duration": duration,
                "resolution": "480p",
                "aspect_ratio": aspect_ratio,
            }
            wan_model = _WAN_I2V
        else:
            logger.info("Wan 2.1 text-to-video (fallback)")
            wan_args = {
                "prompt": prompt,
                "duration": duration,
                "resolution": "480p",
                "aspect_ratio": aspect_ratio,
            }
            wan_model = _WAN_T2V

        raw = await _generate_wan(wan_model, wan_args)
        logger.info("Wan raw result keys: %s", list(raw.keys()) if isinstance(raw, dict) else type(raw))
        video_url = _extract_video_url(raw)

        if video_url:
            return await _finalise(video_url, prompt, start_frame_url, settings)

        logger.error("Wan 2.1 returned no video URL: %s", raw)
        return {"status": "error", "message": "fal returned no video URL"}

    except Exception as e:
        logger.error("Wan 2.1 fallback also failed: %s", e)
        return {"status": "error", "message": str(e)}


async def _finalise(video_url: str, prompt: str, start_frame_url: Optional[str], settings) -> dict:
    """Download video, save locally, upload to Supabase."""
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
    url = public_url or video_url

    logger.info("fal video ready: %s (%d bytes)", filename, len(video_bytes))
    return {"status": "done", "url": url, "thumbnail_url": url, "message": ""}
