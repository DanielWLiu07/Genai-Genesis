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
    project_id: str = ""
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
    preview_url: str = ""


@router.post("/clip-status")
async def update_clip_status(data: ClipStatusUpdate):
    """Called by render service when clip generation status changes."""
    logger.info("Clip %s status: %s", data.clip_id, data.status)

    from app.db import get_supabase
    db = get_supabase()
    if db and data.project_id:
        try:
            tl_row = db.table("timelines").select("clips").eq("project_id", data.project_id).execute()
            if tl_row.data:
                clips = tl_row.data[0].get("clips", [])
                for clip in clips:
                    if clip.get("id") == data.clip_id:
                        clip["gen_status"] = data.status
                        if data.media_url:
                            clip["generated_media_url"] = data.media_url
                            clip["thumbnail_url"] = data.thumbnail_url or data.media_url
                        if data.actual_type:
                            clip["type"] = data.actual_type
                        if data.error:
                            clip["gen_error"] = data.error
                        break
                db.table("timelines").update({"clips": clips}).eq("project_id", data.project_id).execute()
        except Exception as e:
            logger.warning("DB update failed for clip status: %s", e)

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
    # Broadcast to the specific project if known, otherwise all connected projects
    if data.project_id:
        await manager.broadcast(data.project_id, ws_message)
    else:
        for project_id in list(manager.connections.keys()):
            await manager.broadcast(project_id, ws_message)

    return {"ok": True}


@router.post("/render-progress")
async def update_render_progress(data: RenderProgressUpdate):
    """Called by render service to report composition progress."""
    logger.info("Render job %s progress: %d%% - %s", data.job_id, data.progress, data.message)

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
            if data.preview_url:
                update_data["preview_url"] = data.preview_url
            if data.status == "error":
                update_data["error"] = data.message

            db.table("render_jobs").update(update_data).eq("id", data.job_id).execute()
        except Exception as e:
            logger.warning("DB update failed for render progress: %s", e)

    await manager.broadcast(data.project_id, {
        "type": "render_progress",
        "job_id": data.job_id,
        "progress": data.progress,
        "status": data.status,
        "message": data.message,
        "output_url": data.output_url,
        "preview_url": data.preview_url,
    })

    return {"ok": True}
