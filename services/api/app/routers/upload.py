from fastapi import APIRouter, UploadFile, File, HTTPException
from app.db import get_supabase
from app.state import store_book_text, update_project_mem
from app.services.audio_analyzer import analyze_audio

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


@router.post("/upload-audio")
async def upload_audio(project_id: str, file: UploadFile = File(...)):
    """Upload an audio clip and run analysis (BPM, beats, energy, sections)."""
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    content_type = (file.content_type or "").lower()

    if ext not in AUDIO_EXTENSIONS and content_type not in AUDIO_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported audio format. Accepted: {', '.join(sorted(AUDIO_EXTENSIONS))}",
        )

    content = await file.read()

    # Run analysis (CPU-bound but acceptable at hackathon scale)
    try:
        analysis = analyze_audio(content, file.filename or "audio.mp3")
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

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
