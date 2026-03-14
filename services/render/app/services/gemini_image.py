"""Gemini image generation fallback when Kling is not configured.

Uses gemini-2.0-flash-exp-image-generation to generate images from prompts.
Saves the result to /tmp and returns a file:// URL (or base64 data URL).
"""
import base64
import logging
import os
import hashlib
import asyncio
from app.config import get_settings

logger = logging.getLogger(__name__)

_cache: dict[str, dict] = {}


async def generate_image_gemini(prompt: str, aspect_ratio: str = "16:9") -> dict:
    """Generate an image using Gemini Flash image generation.

    Returns dict with keys: status, url, thumbnail_url, message
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        return {"status": "error", "message": "No GEMINI_API_KEY configured"}

    cache_key = hashlib.sha256(f"{prompt}|{aspect_ratio}".encode()).hexdigest()
    if cache_key in _cache:
        logger.info("Gemini image cache hit")
        return _cache[cache_key]

    try:
        import google.generativeai as genai
        from google.generativeai import types as genai_types

        genai.configure(api_key=settings.gemini_api_key)

        # gemini-2.0-flash-exp-image-generation supports text+image output
        model = genai.GenerativeModel("gemini-2.0-flash-exp-image-generation")

        # Enhance prompt for cinematic quality
        enhanced = (
            f"{prompt}. Cinematic, high quality, detailed, professional photography style."
        )

        response = await asyncio.to_thread(
            model.generate_content,
            enhanced,
            generation_config=genai_types.GenerationConfig(
                response_modalities=["image", "text"],
            ),
        )

        # Extract image bytes from response
        image_data = None
        for part in response.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                image_data = part.inline_data.data
                mime_type = part.inline_data.mime_type or "image/png"
                break

        if not image_data:
            return {"status": "error", "message": "Gemini returned no image data"}

        # Save to /tmp
        output_dir = settings.render_output_dir
        os.makedirs(output_dir, exist_ok=True)
        filename = f"gemini_{cache_key[:16]}.png"
        filepath = os.path.join(output_dir, filename)

        with open(filepath, "wb") as f:
            f.write(image_data if isinstance(image_data, bytes) else base64.b64decode(image_data))

        # Return as data URL so frontend can display without a file server
        b64 = base64.b64encode(
            image_data if isinstance(image_data, bytes) else base64.b64decode(image_data)
        ).decode()
        data_url = f"data:{mime_type};base64,{b64}"

        result = {"status": "done", "url": data_url, "thumbnail_url": data_url}
        _cache[cache_key] = result
        logger.info(f"Gemini image generated: {len(b64)} chars")
        return result

    except Exception as e:
        logger.error(f"Gemini image generation failed: {e}")
        return {"status": "error", "message": str(e)}
