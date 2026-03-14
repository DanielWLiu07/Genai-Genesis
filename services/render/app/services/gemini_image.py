"""Image generation using Imagen 4 Fast (google-genai SDK)."""
import logging
import os
import hashlib
import asyncio
from app.config import get_settings

logger = logging.getLogger(__name__)

_cache: dict[str, dict] = {}

RENDER_SERVICE_URL = "http://localhost:8002"
STORAGE_BUCKET = "renders"


def _supabase_upload(filename: str, data: bytes) -> str | None:
    """Upload image bytes to Supabase Storage and return the public URL.

    Returns None if Supabase is not configured or the upload fails.
    The bucket is auto-created as public on first use.
    """
    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_service_key):
        return None
    try:
        from supabase import create_client
        client = create_client(settings.supabase_url, settings.supabase_service_key)

        # Ensure bucket exists (idempotent — ignores error if already exists)
        try:
            client.storage.create_bucket(STORAGE_BUCKET, options={"public": True})
        except Exception:
            pass

        # Upload — upsert so re-generated images overwrite the old file
        client.storage.from_(STORAGE_BUCKET).upload(
            filename,
            data,
            file_options={"content-type": "image/png", "upsert": "true"},
        )

        public_url = client.storage.from_(STORAGE_BUCKET).get_public_url(filename)
        logger.info("Uploaded to Supabase Storage: %s", public_url)
        return public_url
    except Exception as e:
        logger.warning("Supabase Storage upload failed, falling back to local URL: %s", e)
        return None


async def generate_image_gemini(prompt: str, aspect_ratio: str = "16:9") -> dict:
    """Generate an image using Imagen 4 Fast.

    Uploads to Supabase Storage for a publicly accessible URL.
    Falls back to a local static HTTP URL if Supabase is unavailable.
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

        filename = f"imagen_{cache_key[:16]}.png"

        # Save locally as backup / for local serving
        output_dir = settings.render_output_dir
        os.makedirs(output_dir, exist_ok=True)
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "wb") as f:
            f.write(raw)

        # Upload to Supabase Storage for a public URL friends can access
        public_url = await asyncio.to_thread(_supabase_upload, filename, raw)
        url = public_url or f"{RENDER_SERVICE_URL}/outputs/{filename}"

        result = {"status": "done", "url": url, "thumbnail_url": url}
        _cache[cache_key] = result
        logger.info("Imagen image ready: %s (%d bytes) -> %s", filename, len(raw), "supabase" if public_url else "local")
        return result

    except Exception as e:
        logger.error("Image generation failed: %s", e)
        return {"status": "error", "message": str(e)}
