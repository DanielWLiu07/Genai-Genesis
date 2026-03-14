from fastapi import APIRouter, UploadFile, File
from app.db import get_supabase
from app.state import store_book_text, update_project_mem

router = APIRouter(prefix="/projects/{project_id}", tags=["upload"])


def _extract_text(content: bytes) -> str:
    """Extract plain text from uploaded file bytes (handles UTF-8 / latin-1)."""
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return content.decode("latin-1", errors="ignore")


@router.post("/upload")
async def upload_book(project_id: str, file: UploadFile = File(...)):
    content = await file.read()
    text = _extract_text(content)[:100_000]  # cap at 100 k chars

    # Always cache text in memory so /analyze can use it even without DB
    store_book_text(project_id, text)

    db = get_supabase()
    if db is None:
        update_project_mem(project_id, status="analyzing")
        return {
            "file_name": file.filename,
            "size": len(content),
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

    # Store book_text in analysis JSONB so it survives restarts, set status → analyzing
    db.table("projects").update({
        "book_file_url": file_url,
        "status": "analyzing",
        "analysis": {"book_text": text},
    }).eq("id", project_id).execute()

    return {
        "file_url": file_url,
        "file_name": file.filename,
        "size": len(content),
        "text_preview": text[:500],
        "status": "ready_to_analyze",
    }
