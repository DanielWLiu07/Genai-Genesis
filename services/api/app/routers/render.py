from fastapi import APIRouter, HTTPException
from app.models.render import GenerateClipRequest, RenderRequest, RenderJobResponse
from app.config import get_settings
from app.db import get_supabase
from app.routers.ws import manager
import httpx
import uuid
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

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

    generate_payload: dict = {
        "clip_id": data.clip_id,
        "prompt": data.prompt,
        "type": data.type,
        "aspect_ratio": "16:9",
        "duration_ms": 3000,
    }
    if data.clip_order is not None:
        generate_payload["clip_order"] = data.clip_order
    if data.clip_total is not None:
        generate_payload["clip_total"] = data.clip_total
    if data.scene_image_url:
        generate_payload["scene_image_url"] = data.scene_image_url
    if data.characters:
        generate_payload["characters"] = data.characters
    if data.mood:
        generate_payload["mood"] = data.mood
    if data.genre:
        generate_payload["genre"] = data.genre
    if data.shot_type:
        generate_payload["shot_type"] = data.shot_type
    if data.is_continuous is not None:
        generate_payload["is_continuous"] = data.is_continuous
    if data.style_seed:
        generate_payload["style_seed"] = data.style_seed
    if data.text:
        generate_payload["text"] = data.text

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            resp = await client.post(
                f"{settings.render_service_url}/render/generate",
                json=generate_payload,
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

    # Extract URLs from render result
    generated_url = result.get("output_url") or result.get("media_url")
    thumbnail_url = result.get("thumbnail_url") or result.get("thumbnail")

    db = get_supabase()
    if db is not None:
        # Persist generated_media_url + thumbnail_url into the timeline clip
        try:
            tl_row = db.table("timelines").select("clips").eq("project_id", project_id).execute()
            if tl_row.data:
                clips = tl_row.data[0].get("clips", [])
                for clip in clips:
                    if clip.get("id") == data.clip_id:
                        clip["gen_status"] = "done"
                        if generated_url:
                            clip["generated_media_url"] = generated_url
                        if thumbnail_url:
                            clip["thumbnail_url"] = thumbnail_url
                        break
                db.table("timelines").update({"clips": clips}).eq("project_id", project_id).execute()
        except Exception:
            pass

        # Auto-set project cover_image_url from first generated thumbnail
        if thumbnail_url:
            try:
                proj_row = db.table("projects").select("cover_image_url").eq("id", project_id).execute()
                if proj_row.data and not proj_row.data[0].get("cover_image_url"):
                    db.table("projects").update({"cover_image_url": thumbnail_url}).eq("id", project_id).execute()
            except Exception:
                pass

    # Broadcast completion with thumbnail
    await manager.broadcast(project_id, {
        "type": "clip_updated",
        "clip_id": data.clip_id,
        "gen_status": "done",
        "generated_media_url": generated_url,
        "thumbnail_url": thumbnail_url,
    })

    return result


@router.post("/render")
async def render_trailer(project_id: str, data: RenderRequest = None):
    settings = get_settings()

    # Fetch current timeline and project info
    timeline = None
    title = ""
    author = ""
    db = get_supabase()
    if db is not None:
        try:
            tl_row = db.table("timelines").select("*").eq("project_id", project_id).execute()
            if tl_row.data:
                timeline = tl_row.data[0]
        except Exception:
            pass
        try:
            proj_row = db.table("projects").select("title,author").eq("id", project_id).execute()
            if proj_row.data:
                title = proj_row.data[0].get("title", "")
                author = proj_row.data[0].get("author", "")
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
            job_id = str(uuid.uuid4())

    await manager.broadcast(project_id, {
        "type": "render_progress",
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
    })

    compose_payload = {
        "project_id": project_id,
        "timeline": timeline,
        "title": title,
        "author": author,
    }
    if data and data.effects:
        compose_payload["effects"] = data.effects
    if data and data.beat_map:
        compose_payload["beat_map"] = data.beat_map

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            resp = await client.post(
                f"{settings.render_service_url}/render/compose",
                json=compose_payload,
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


@router.get("/render/{job_id}")
async def get_render_status(project_id: str, job_id: str):
    db = get_supabase()
    if db:
        try:
            result = db.table("render_jobs").select("*").eq("id", job_id).execute()
            if result.data:
                return result.data[0]
        except Exception:
            pass

    # Fall back to polling render service directly
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.render_service_url}/render/jobs/{job_id}")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass

    raise HTTPException(status_code=404, detail="Render job not found")
