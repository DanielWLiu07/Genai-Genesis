import asyncio
import base64
import logging
from functools import partial
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException
import httpx
from app.config import get_settings
from app.db import get_supabase
from app.state import store_book_text, update_project_mem
from app.services.audio_analyzer import analyze_audio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}", tags=["upload"])

AUDIO_CONTENT_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
    "audio/ogg", "audio/flac", "audio/x-flac", "audio/aac",
    "audio/mp4", "audio/x-m4a", "video/mp4",
}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"}


def _extract_text(content: bytes) -> str:
    """Extract plain text from uploaded file bytes (handles UTF-8 / latin-1)."""
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return content.decode("latin-1", errors="ignore")


@router.post("/upload")
async def upload_book(project_id: str, file: UploadFile = File(...)):
    content = await file.read()
    text = _extract_text(content)[:100_000]  # cap at 100k chars

    # Always cache text in memory so /analyze can use it even without DB
    store_book_text(project_id, text)

    db = get_supabase()
    if db is None:
        update_project_mem(project_id, status="uploaded")
        return {
            "file_name": file.filename,
            "size": len(content),
            "book_text": text,
            "text_preview": text[:500],
            "status": "ready_to_analyze",
        }

    # Upload raw file to Supabase Storage
    path = f"books/{project_id}/{file.filename}"
    try:
        db.storage.from_("books").upload(
            path, content, {"content-type": file.content_type or "application/octet-stream"}
        )
        file_url = db.storage.from_("books").get_public_url(path)
    except Exception:
        file_url = None  # storage may not be configured — continue anyway

    # Store book_text in the dedicated column AND in analysis JSONB as backup
    db.table("projects").update({
        "book_file_url": file_url,
        "book_text": text,
        "status": "uploaded",
        "analysis": {"book_text": text},
    }).eq("id", project_id).execute()

    return {
        "file_url": file_url,
        "file_name": file.filename,
        "size": len(content),
        "book_text": text,
        "text_preview": text[:500],
        "status": "ready_to_analyze",
    }


MANGA_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
MANGA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


@router.post("/upload-manga")
async def upload_manga(
    project_id: str,
    files: List[UploadFile] = File(...),
):
    """Upload manga/comic pages, extract action panels, and create timeline clips.

    Accepts 1-50 image files (pages). Forwards them to the AI service which:
    - Extracts panels using OpenCV
    - Scores each panel for action intensity via Gemini vision
    - Keeps the top action panels
    - Returns clips with panel images embedded as data URLs (gen_status='done')

    The result is persisted to the database immediately so the editor can load it.
    """
    if not files:
        raise HTTPException(status_code=400, detail="At least one image file is required.")
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 pages per upload.")

    # Validate file types
    for f in files:
        ext = ("." + f.filename.rsplit(".", 1)[-1].lower()) if f.filename and "." in f.filename else ""
        ct = (f.content_type or "").lower()
        if ext not in MANGA_EXTENSIONS and ct not in MANGA_IMAGE_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type for '{f.filename}'. Accepted: JPG, PNG, WebP.",
            )

    # Read all pages into memory and base64-encode them
    pages_b64: List[str] = []
    for f in files:
        content = await f.read()
        pages_b64.append(base64.b64encode(content).decode())

    settings = get_settings()

    # Call AI service
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            resp = await client.post(
                f"{settings.ai_service_url}/ai/analyze-manga",
                json={
                    "project_id": project_id,
                    "pages": pages_b64,
                    "max_panels": 12,
                },
            )
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail="AI service not running. Start it on port 8001.",
            )

    if not resp.is_success:
        try:
            detail = resp.json().get("detail", f"AI service error {resp.status_code}")
        except Exception:
            detail = f"AI service error {resp.status_code}: {resp.text[:200]}"
        raise HTTPException(status_code=resp.status_code, detail=detail)

    result = resp.json()
    analysis = result.get("analysis", {})
    clips = result.get("clips", [])
    panel_count = result.get("panel_count", 0)

    # Persist to database
    db = get_supabase()
    if db is not None:
        try:
            # Store analysis and mark project as ready for editing (skip analyze/plan steps)
            db.table("projects").update({
                "analysis": {**analysis, "input_mode": "manga"},
                "status": "editing",
            }).eq("id", project_id).execute()

            # Store timeline with manga panel clips
            total_ms = sum(c.get("duration_ms", 2000) for c in clips)
            db.table("timelines").upsert({
                "project_id": project_id,
                "clips": clips,
                "total_duration_ms": total_ms,
                "settings": {"resolution": "1080p", "aspect_ratio": "9:16", "fps": 24},
            }).execute()
        except Exception as exc:
            # Non-fatal — caller can still use the returned clips
            import logging
            logging.getLogger(__name__).warning(f"DB persist failed: {exc}")
    else:
        update_project_mem(project_id, analysis={**analysis, "input_mode": "manga"}, status="editing")

    return {
        "panel_count": panel_count,
        "page_count": result.get("page_count", len(files)),
        "clips": clips,
        "analysis": analysis,
        "status": "editing",
    }


@router.post("/upload-audio")
async def upload_audio(project_id: str, file: UploadFile = File(...)):
    """Upload an audio clip and run analysis (BPM, beats, energy, sections)."""
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    content_type = (file.content_type or "").lower()

    # Accept application/octet-stream too (some browsers send this for MP3s)
    if ext not in AUDIO_EXTENSIONS and content_type not in AUDIO_CONTENT_TYPES and content_type != "application/octet-stream":
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported audio format. Accepted: {', '.join(sorted(AUDIO_EXTENSIONS))}",
        )

    content = await file.read()

    # Run analysis in thread pool — CPU-bound, would block event loop otherwise
    # Non-fatal: if librosa fails, return a stub analysis so the track still loads
    try:
        loop = asyncio.get_event_loop()
        analysis = await loop.run_in_executor(
            None, partial(analyze_audio, content, file.filename or "audio.mp3")
        )
    except Exception as exc:
        logger.warning(f"Audio analysis failed (non-fatal): {exc}")
        analysis = {"bpm": 120, "beat_timestamps": [], "energy_curve": [], "section_boundaries": [], "duration_s": 0, "sample_rate": 22050}

    db = get_supabase()

    if db is None:
        update_project_mem(project_id, audio_file_url=None, audio_analysis=analysis)
        return {
            "file_name": file.filename,
            "size": len(content),
            "audio_analysis": analysis,
            "status": "analysed",
        }

    # Upload raw file to Supabase Storage
    storage_path = f"audio/{project_id}/{file.filename}"
    audio_url = None
    try:
        db.storage.from_("audio").upload(
            storage_path,
            content,
            {"content-type": content_type or "audio/mpeg"},
        )
        audio_url = db.storage.from_("audio").get_public_url(storage_path)
    except Exception:
        pass  # storage may not be configured — analysis still returned

    # Persist to projects row
    db.table("projects").update({
        "audio_file_url": audio_url,
        "audio_analysis": analysis,
    }).eq("id", project_id).execute()

    return {
        "file_url": audio_url,
        "file_name": file.filename,
        "size": len(content),
        "audio_analysis": analysis,
        "status": "analysed",
    }
