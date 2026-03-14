"""Kling 3.0 API client for video/image generation.

Kling API uses JWT (access_key + secret) for auth.
Flow: submit task → poll for completion → download result.
"""
import time
import asyncio
import hashlib
import jwt
import httpx
import logging
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)

KLING_BASE_URL = "https://api.klingai.com/v1"
POLL_INTERVAL_SEC = 5
MAX_POLL_ATTEMPTS = 120  # 10 minutes max wait


def _create_jwt_token() -> str:
    """Create a JWT token for Kling API authentication."""
    settings = get_settings()
    now = int(time.time())
    payload = {
        "iss": settings.kling_api_key,
        "exp": now + 1800,  # 30 min expiry
        "nbf": now - 5,
        "iat": now,
    }
    return jwt.encode(payload, settings.kling_api_secret, algorithm="HS256")


def _get_headers() -> dict:
    """Get auth headers for Kling API."""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_create_jwt_token()}",
    }


def _cache_key(prompt: str, media_type: str, aspect_ratio: str) -> str:
    """Generate a cache key for deduplication."""
    return hashlib.sha256(f"{prompt}|{media_type}|{aspect_ratio}".encode()).hexdigest()


# Simple in-memory cache: cache_key -> result dict
_generation_cache: dict[str, dict] = {}


async def _poll_task(client: httpx.AsyncClient, task_url: str) -> dict:
    """Poll a Kling task until completion or failure."""
    for attempt in range(MAX_POLL_ATTEMPTS):
        resp = await client.get(task_url, headers=_get_headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json().get("data", {})

        status = data.get("task_status", "")
        if status == "succeed":
            images = data.get("task_result", {}).get("images", [])
            videos = data.get("task_result", {}).get("videos", [])
            result_url = ""
            if videos:
                result_url = videos[0].get("url", "")
            elif images:
                result_url = images[0].get("url", "")
            return {"status": "done", "url": result_url, "raw": data}
        elif status == "failed":
            msg = data.get("task_status_msg", "Generation failed")
            return {"status": "error", "message": msg}

        logger.info("Poll attempt %d/%d - status: %s", attempt + 1, MAX_POLL_ATTEMPTS, status)
        await asyncio.sleep(POLL_INTERVAL_SEC)

    return {"status": "error", "message": "Generation timed out after polling"}


async def generate_image(
    prompt: str,
    aspect_ratio: str = "16:9",
    negative_prompt: str = "",
    callback_url: Optional[str] = None,
) -> dict:
    """Generate an image using Kling 3.0 API.

    Returns: {status, url, thumbnail_url, message}
    """
    settings = get_settings()
    if not settings.kling_api_key:
        return {"status": "error", "message": "Kling API key not configured"}

    # Check cache
    key = _cache_key(prompt, "image", aspect_ratio)
    if key in _generation_cache:
        logger.info("Cache hit for image generation")
        return _generation_cache[key]

    body = {
        "model_name": "kling-v1",
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "n": 1,
    }
    if negative_prompt:
        body["negative_prompt"] = negative_prompt
    if callback_url:
        body["callback_url"] = callback_url

    try:
        async with httpx.AsyncClient() as client:
            # Submit generation task
            resp = await client.post(
                f"{KLING_BASE_URL}/images/generations",
                json=body,
                headers=_get_headers(),
                timeout=30,
            )
            resp.raise_for_status()
            resp_data = resp.json().get("data", {})
            task_id = resp_data.get("task_id", "")

            if not task_id:
                return {"status": "error", "message": "No task_id returned from Kling API"}

            # Poll for completion
            task_url = f"{KLING_BASE_URL}/images/generations/{task_id}"
            result = await _poll_task(client, task_url)

            if result["status"] == "done":
                url = result.get("url", "")
                final = {
                    "status": "done",
                    "url": url,
                    "thumbnail_url": url,
                    "message": "Image generated successfully",
                }
                _generation_cache[key] = final
                return final

            return result

    except httpx.HTTPStatusError as e:
        logger.error("Kling API HTTP error: %s", e.response.text)
        return {"status": "error", "message": f"Kling API error: {e.response.status_code}"}
    except Exception as e:
        logger.error("Kling API error: %s", str(e))
        return {"status": "error", "message": f"Kling API error: {str(e)}"}


async def generate_video(
    prompt: str,
    duration_sec: float = 5.0,
    aspect_ratio: str = "16:9",
    negative_prompt: str = "",
    callback_url: Optional[str] = None,
) -> dict:
    """Generate a video clip using Kling 3.0 API.

    Returns: {status, url, thumbnail_url, message}
    """
    settings = get_settings()
    if not settings.kling_api_key:
        return {"status": "error", "message": "Kling API key not configured"}

    # Check cache
    key = _cache_key(prompt, "video", aspect_ratio)
    if key in _generation_cache:
        logger.info("Cache hit for video generation")
        return _generation_cache[key]

    # Kling supports 5s and 10s durations
    duration = "10" if duration_sec > 5 else "5"

    body = {
        "model_name": "kling-v1",
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "mode": "std",
    }
    if negative_prompt:
        body["negative_prompt"] = negative_prompt
    if callback_url:
        body["callback_url"] = callback_url

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{KLING_BASE_URL}/videos/text2video",
                json=body,
                headers=_get_headers(),
                timeout=30,
            )
            resp.raise_for_status()
            resp_data = resp.json().get("data", {})
            task_id = resp_data.get("task_id", "")

            if not task_id:
                return {"status": "error", "message": "No task_id returned from Kling API"}

            # Poll for completion
            task_url = f"{KLING_BASE_URL}/videos/text2video/{task_id}"
            result = await _poll_task(client, task_url)

            if result["status"] == "done":
                url = result.get("url", "")
                final = {
                    "status": "done",
                    "url": url,
                    "thumbnail_url": url,
                    "message": "Video generated successfully",
                }
                _generation_cache[key] = final
                return final

            return result

    except httpx.HTTPStatusError as e:
        logger.error("Kling API HTTP error: %s", e.response.text)
        return {"status": "error", "message": f"Kling API error: {e.response.status_code}"}
    except Exception as e:
        logger.error("Kling API error: %s", str(e))
        return {"status": "error", "message": f"Kling API error: {str(e)}"}


async def download_media(url: str) -> bytes:
    """Download generated media from URL."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=60, follow_redirects=True)
        resp.raise_for_status()
        return resp.content
