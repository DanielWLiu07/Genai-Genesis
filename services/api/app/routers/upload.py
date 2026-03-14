from fastapi import APIRouter, UploadFile, File, HTTPException
from app.db import get_supabase

router = APIRouter(prefix="/projects/{project_id}", tags=["upload"])

@router.post("/upload")
async def upload_book(project_id: str, file: UploadFile = File(...)):
    content = await file.read()
    db = get_supabase()

    if db is None:
        # Mock: just extract text
        text = content.decode("utf-8", errors="ignore")[:10000]
        return {"file_name": file.filename, "size": len(content), "text_preview": text[:500]}

    # Upload to Supabase Storage
    path = f"books/{project_id}/{file.filename}"
    db.storage.from_("books").upload(path, content, {"content-type": file.content_type or "application/octet-stream"})
    file_url = db.storage.from_("books").get_public_url(path)

    db.table("projects").update({"book_file_url": file_url, "status": "analyzing"}).eq("id", project_id).execute()

    return {"file_url": file_url, "file_name": file.filename, "size": len(content)}
