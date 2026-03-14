"""Image generation using Imagen 4 Fast (text-only) or Gemini 2.0 Flash (with reference frame)."""
import logging
import os
import hashlib
import asyncio
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)

_cache: dict[str, dict] = {}

RENDER_SERVICE_URL = "http://localhost:8002"
STORAGE_BUCKET = "renders"


def _supabase_upload(filename: str, data: bytes) -> str | None:
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
            file_options={"content-type": "image/png", "upsert": "true"},
        )
        public_url = client.storage.from_(STORAGE_BUCKET).get_public_url(filename)
        logger.info("Uploaded to Supabase Storage: %s", public_url)
        return public_url
    except Exception as e:
        logger.warning("Supabase Storage upload failed, falling back to local URL: %s", e)
        return None


async def _save_and_return(raw: bytes, cache_key: str, settings) -> dict:
    """Save image bytes locally + Supabase, return result dict."""
    filename = f"imagen_{cache_key[:16]}.png"
    output_dir = settings.render_output_dir
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, filename), "wb") as f:
        f.write(raw)
    public_url = await asyncio.to_thread(_supabase_upload, filename, raw)
    url = public_url or f"{RENDER_SERVICE_URL}/outputs/{filename}"
    result = {"status": "done", "url": url, "thumbnail_url": url}
    _cache[cache_key] = result
    logger.info("Image ready: %s (%d bytes) -> %s", filename, len(raw), "supabase" if public_url else "local")
    return result


async def generate_image_gemini(
    prompt: str,
    aspect_ratio: str = "16:9",
    reference_image_url: str | None = None,
) -> dict:
    """Generate an image using Imagen 4 Fast (text-only) or Gemini 2.0 Flash (with reference frame).

    When reference_image_url is provided, uses Gemini 2.0 Flash multimodal so the
    generated frame is visually grounded in the previous panel — same art style, palette,
    character designs, and lighting. Creates seamless panel-to-panel continuity.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        return {"status": "error", "message": "No GEMINI_API_KEY configured"}

    cache_key = hashlib.sha256(f"{prompt}|{aspect_ratio}|{reference_image_url or ''}".encode()).hexdigest()
    if cache_key in _cache:
        logger.info("Image cache hit")
        return _cache[cache_key]

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)
        ar_map = {"16:9": "16:9", "9:16": "9:16", "1:1": "1:1", "4:3": "4:3", "3:4": "3:4"}
        ar = ar_map.get(aspect_ratio, "16:9")

        # ── With reference frame: Gemini 2.0 Flash multimodal ──────────────────
        # Grounds the new panel in the previous one — identical style, palette, characters.
        if reference_image_url and not reference_image_url.startswith("data:"):
            logger.info("Gemini 2.0 Flash image-to-image (reference panel)")
            try:
                async with httpx.AsyncClient(timeout=15) as http:
                    ref_resp = await http.get(reference_image_url)
                    ref_bytes = ref_resp.content
                    ref_mime = ref_resp.headers.get("content-type", "image/jpeg").split(";")[0]

                def _gen_with_ref() -> bytes | None:
                    ref_part = types.Part.from_bytes(data=ref_bytes, mime_type=ref_mime)
                    text_part = types.Part.from_text(
                        f"Use the provided image as a strict visual reference — maintain IDENTICAL "
                        f"art style, ink line weight, color palette, character appearances, and lighting. "
                        f"This must look like the next panel in the same manga sequence.\n\n"
                        f"Generate the next scene: {prompt}"
                    )
                    resp = client.models.generate_content(
                        model="gemini-2.0-flash-preview-image-generation",
                        contents=[types.Content(parts=[ref_part, text_part])],
                        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
                    )
                    for part in resp.candidates[0].content.parts:
                        if hasattr(part, "inline_data") and part.inline_data:
                            return part.inline_data.data
                    return None

                raw = await asyncio.to_thread(_gen_with_ref)
                if raw:
                    return await _save_and_return(raw, cache_key, settings)
                logger.warning("Gemini 2.0 Flash returned no image, falling back to Imagen")
            except Exception as e:
                logger.warning("Gemini 2.0 Flash reference gen failed (%s), falling back to Imagen", e)

        # ── Text-only: Imagen 4 Fast ────────────────────────────────────────────
        logger.info("Imagen 4 Fast text-to-image")
        enhanced = (
            f"{prompt}. Cinematic, high quality, detailed, manga illustration style, "
            "bold ink lines, dramatic shading, professional quality."
        )
        response = await asyncio.to_thread(
            client.models.generate_images,
            model="imagen-4.0-fast-generate-001",
            prompt=enhanced,
            config=types.GenerateImagesConfig(number_of_images=1, aspect_ratio=ar),
        )

        raw = response.generated_images[0].image.image_bytes
        if not raw:
            return {"status": "error", "message": "No image bytes returned"}

        return await _save_and_return(raw, cache_key, settings)

    except Exception as e:
        logger.error("Image generation failed: %s", e)
        return {"status": "error", "message": str(e)}
