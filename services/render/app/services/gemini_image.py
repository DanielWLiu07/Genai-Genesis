"""Image generation using Gemini 2.5 Flash Image (text-only) or multimodal (with reference frame)."""
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

        _IMAGE_MODEL = "gemini-2.5-flash-image"

        # ── With reference frame: multimodal image-to-image ────────────────────
        # Grounds the new panel in the previous one — identical style, palette, characters.
        if reference_image_url and not reference_image_url.startswith("data:"):
            logger.info("Gemini image-to-image (reference panel)")
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
                        f"CRITICAL: Generate an ACTION-FOCUSED panel. Describe the PEAK MOMENT of motion — "
                        f"body at full extension, limbs committed at moment of impact or apex of leap. "
                        f"Show movement through: speed lines radiating from impact, motion blur on limbs, "
                        f"shockwave rings, airborne debris, cloth/hair fully mid-whip. "
                        f"The image must convey WHERE the subject came from and WHERE they are going, "
                        f"so a video AI can animate the motion naturally.\n\n"
                        f"Generate the next scene: {prompt}"
                    )
                    resp = client.models.generate_content(
                        model=_IMAGE_MODEL,
                        contents=[types.Content(parts=[ref_part, text_part])],
                        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
                    )
                    if not resp.candidates or not resp.candidates[0].content:
                        return None
                    for part in resp.candidates[0].content.parts:
                        if hasattr(part, "inline_data") and part.inline_data:
                            return part.inline_data.data
                    return None

                raw = await asyncio.wait_for(asyncio.to_thread(_gen_with_ref), timeout=90)
                if raw:
                    return await _save_and_return(raw, cache_key, settings)
                logger.warning("Gemini image-to-image returned no image, falling back")
            except Exception as e:
                logger.warning("Gemini reference gen failed (%s), falling back", e)

        # ── Primary: Gemini 2.5 Flash Image ────────────────────────────────────
        logger.info("Gemini text-to-image (%s)", _IMAGE_MODEL)

        def _gen_text_only() -> bytes | None:
            resp = client.models.generate_content(
                model=_IMAGE_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
            )
            if not resp.candidates or not resp.candidates[0].content:
                logger.warning("Gemini returned no candidates (content filtered?): %s", getattr(resp, 'prompt_feedback', ''))
                return None
            for part in resp.candidates[0].content.parts:
                if hasattr(part, "inline_data") and part.inline_data:
                    return part.inline_data.data
            return None

        raw = await asyncio.wait_for(asyncio.to_thread(_gen_text_only), timeout=90)
        if raw:
            return await _save_and_return(raw, cache_key, settings)

        # Imagen 4 fallback removed — it has a 70 RPD free-tier limit that is easily exhausted.
        # gemini-2.5-flash-image is the only generation path.
        logger.warning("Gemini text-to-image returned no image (content filtered or API issue)")
        return {"status": "error", "message": "Image generation returned no output — try regenerating"}

    except Exception as e:
        logger.error("Image generation failed: %s", e)
        return {"status": "error", "message": str(e)}
