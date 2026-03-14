from fastapi import APIRouter
from app.models.render import GenerateClipRequest, RenderJobResponse
from app.config import get_settings
from app.db import get_supabase
from app.routers.ws import manager
import httpx
import uuid
from datetime import datetime

router = APIRouter(prefix="/projects/{project_id}", tags=["render"])


def _render_unavailable(msg: str = "Render service not running. Start it on port 8002."):
    return {"status": "render_service_unavailable", "message": msg}


@router.post("/generate-clip")
async def generate_clip(project_id: str, data: GenerateClipRequest):
    settings = get_settings()

    # Notify frontend: clip generation starting
    await manager.broadcast(project_id, {
        "type": "clip_updated",
        "clip_id": data.clip_id,
        "gen_status": "generating",
    })

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            resp = await client.post(
                f"{settings.render_service_url}/render/generate",
                json={"clip_id": data.clip_id, "prompt": data.prompt, "type": data.type},
            )
            result = resp.json()
        except httpx.ConnectError:
            await manager.broadcast(project_id, {
                "type": "clip_updated",
                "clip_id": data.clip_id,
                "gen_status": "error",
                "gen_error": "Render service unavailable",
            })
            return _render_unavailable()

    # Persist generated_media_url into timeline clip if DB available
    generated_url = result.get("output_url") or result.get("media_url")
    db = get_supabase()
    if db is not None and generated_url:
        try:
            tl_row = db.table("timelines").select("clips").eq("project_id", project_id).execute()
            if tl_row.data:
                clips = tl_row.data[0].get("clips", [])
                for clip in clips:
                    if clip.get("id") == data.clip_id:
                        clip["gen_status"] = "done"
                        clip["generated_media_url"] = generated_url
                        break
                db.table("timelines").update({"clips": clips}).eq("project_id", project_id).execute()
        except Exception:
            pass

    # Broadcast completion
    await manager.broadcast(project_id, {
        "type": "clip_updated",
        "clip_id": data.clip_id,
        "gen_status": "done",
        "generated_media_url": generated_url,
    })

    return result


@router.post("/render")
async def render_trailer(project_id: str):
    settings = get_settings()

    # Fetch current timeline to pass to render service
    timeline = None
    db = get_supabase()
    if db is not None:
        try:
            tl_row = db.table("timelines").select("*").eq("project_id", project_id).execute()
            if tl_row.data:
                timeline = tl_row.data[0]
        except Exception:
            pass

    # Create a render_job record
    job_id = str(uuid.uuid4())
    if db is not None:
        try:
            db.table("render_jobs").insert({
                "id": job_id,
                "project_id": project_id,
                "status": "queued",
                "progress": 0,
            }).execute()
        except Exception:
            job_id = str(uuid.uuid4())  # continue even if DB insert fails

    await manager.broadcast(project_id, {
        "type": "render_progress",
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
    })

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            resp = await client.post(
                f"{settings.render_service_url}/render/compose",
                json={"project_id": project_id, "timeline": timeline},
            )
            result = resp.json()
        except httpx.ConnectError:
            if db is not None:
                try:
                    db.table("render_jobs").update({"status": "error", "error": "Render service unavailable"}).eq("id", job_id).execute()
                except Exception:
                    pass
            return _render_unavailable()

    output_url = result.get("output_url")
    status = result.get("status", "done")

    # Update render_job record
    if db is not None:
        try:
            db.table("render_jobs").update({
                "status": status,
                "progress": 100,
                "output_url": output_url,
            }).eq("id", job_id).execute()
            db.table("projects").update({"status": "done"}).eq("id", project_id).execute()
        except Exception:
            pass

    await manager.broadcast(project_id, {
        "type": "render_progress",
        "job_id": job_id,
        "status": status,
        "progress": 100,
        "output_url": output_url,
    })

    return {**result, "job_id": job_id}


@router.get("/render-jobs")
async def list_render_jobs(project_id: str):
    db = get_supabase()
    if db is None:
        return []
    try:
        result = db.table("render_jobs").select("*").eq("project_id", project_id).order("created_at", desc=True).execute()
        return result.data
    except Exception:
        return []
