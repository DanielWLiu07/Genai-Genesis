"""Image generation using Imagen 4 (google-genai SDK)."""
import base64
import logging
import os
import hashlib
import asyncio
from app.config import get_settings

logger = logging.getLogger(__name__)

_cache: dict[str, dict] = {}


async def generate_image_gemini(prompt: str, aspect_ratio: str = "16:9") -> dict:
    """Generate an image using Imagen 4 Fast.

    Returns dict with keys: status, url, thumbnail_url, message
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        return {"status": "error", "message": "No GEMINI_API_KEY configured"}

    cache_key = hashlib.sha256(f"{prompt}|{aspect_ratio}".encode()).hexdigest()
    if cache_key in _cache:
        logger.info("Image cache hit")
        return _cache[cache_key]

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)

        enhanced = (
            f"{prompt}. Cinematic, high quality, detailed, manga illustration style, "
            "bold ink lines, dramatic shading, professional quality."
        )

        # Map aspect ratio string to Imagen-supported value
        ar_map = {"16:9": "16:9", "9:16": "9:16", "1:1": "1:1", "4:3": "4:3", "3:4": "3:4"}
        ar = ar_map.get(aspect_ratio, "16:9")

        response = await asyncio.to_thread(
            client.models.generate_images,
            model="imagen-4.0-fast-generate-001",
            prompt=enhanced,
            config=types.GenerateImagesConfig(number_of_images=1, aspect_ratio=ar),
        )

        raw = response.generated_images[0].image.image_bytes
        if not raw:
            return {"status": "error", "message": "No image bytes returned"}

        output_dir = settings.render_output_dir
        os.makedirs(output_dir, exist_ok=True)
        filepath = os.path.join(output_dir, f"imagen_{cache_key[:16]}.png")
        with open(filepath, "wb") as f:
            f.write(raw)

        b64 = base64.b64encode(raw).decode()
        data_url = f"data:image/png;base64,{b64}"

        result = {"status": "done", "url": data_url, "thumbnail_url": data_url}
        _cache[cache_key] = result
        logger.info("Imagen image generated: %d bytes", len(raw))
        return result

    except Exception as e:
        logger.error("Image generation failed: %s", e)
        return {"status": "error", "message": str(e)}
