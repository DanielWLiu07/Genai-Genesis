"""Internal endpoints called by render service for progress callbacks.

These are NOT exposed to the frontend — only other backend services call them.
They update the DB and broadcast updates via WebSocket.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.routers.ws import manager
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])


class ClipStatusUpdate(BaseModel):
    clip_id: str
    status: str  # "generating" | "done" | "error"
    media_url: str = ""
    thumbnail_url: str = ""
    error: str = ""
    actual_type: Optional[str] = None  # set when Kling video falls back to image


class RenderProgressUpdate(BaseModel):
    job_id: str
    project_id: str
    progress: int = 0
    status: str = "composing"  # "queued" | "generating_media" | "composing" | "done" | "error"
    message: str = ""
    output_url: str = ""


@router.post("/clip-status")
async def update_clip_status(data: ClipStatusUpdate):
    """Called by render service when clip generation status changes."""
    logger.info("Clip %s status: %s", data.clip_id, data.status)

    # Update clip in DB if possible
    from app.db import get_supabase
    db = get_supabase()
    if db:
        try:
            # Find which project this clip belongs to and update the clip in the timeline JSONB
            result = db.rpc("update_clip_status", {
                "p_clip_id": data.clip_id,
                "p_status": data.status,
                "p_media_url": data.media_url,
                "p_error": data.error,
            }).execute()
        except Exception as e:
            logger.warning("DB update failed for clip status: %s", e)

    # Broadcast to all connected WebSocket clients
    # We don't know the project_id from clip_id alone, so broadcast to all
    # In a real app, we'd look up the project_id from the clip_id
    ws_message = {
        "type": "clip_updated",
        "clip_id": data.clip_id,
        "gen_status": data.status,
        "generated_media_url": data.media_url,
        "thumbnail_url": data.thumbnail_url,
        "gen_error": data.error,
    }
    if data.actual_type:
        ws_message["actual_type"] = data.actual_type
    # Broadcast to all projects (since we don't know which project owns this clip)
    for project_id in list(manager.connections.keys()):
        await manager.broadcast(project_id, ws_message)

    return {"ok": True}


@router.post("/render-progress")
async def update_render_progress(data: RenderProgressUpdate):
    """Called by render service to report composition progress."""
    logger.info("Render job %s progress: %d%% - %s", data.job_id, data.progress, data.message)

    # Update render_jobs table
    from app.db import get_supabase
    db = get_supabase()
    if db:
        try:
            update_data = {
                "status": data.status,
                "progress": data.progress,
            }
            if data.output_url:
                update_data["output_url"] = data.output_url
            if data.status == "error":
                update_data["error"] = data.message

            db.table("render_jobs").update(update_data).eq("id", data.job_id).execute()
        except Exception as e:
            logger.warning("DB update failed for render progress: %s", e)

    # Broadcast via WebSocket
    await manager.broadcast(data.project_id, {
        "type": "render_progress",
        "job_id": data.job_id,
        "progress": data.progress,
        "status": data.status,
        "message": data.message,
        "output_url": data.output_url,
    })

    return {"ok": True}
