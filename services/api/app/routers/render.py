from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.models.render import GenerateClipRequest, RenderRequest, RenderJobResponse
from app.config import get_settings
from app.db import get_supabase
from app.routers.ws import manager
import asyncio
import httpx
import uuid
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}", tags=["render"])

# In-memory mapping: our job_id → render service job_id (for status fallback)
_render_id_map: dict[str, str] = {}


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
        "project_id": project_id,
        "prompt": data.prompt,
        "type": data.type,
        "aspect_ratio": "16:9",
        "duration_ms": 3000,
    }
    if data.clip_order is not None:
        generate_payload["clip_order"] = data.clip_order
    if data.clip_total is not None:
        generate_payload["clip_total"] = data.clip_total
    # scene_image_url / start_frame_url are aliases — use whichever is set
    scene_url = data.scene_image_url or data.start_frame_url
    if scene_url:
        generate_payload["scene_image_url"] = scene_url
    if data.reference_image_url:
        generate_payload["reference_image_url"] = data.reference_image_url
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
    if data.themes:
        generate_payload["themes"] = data.themes
    if data.prev_scene_prompt:
        generate_payload["prev_scene_prompt"] = data.prev_scene_prompt
    if data.next_scene_prompt:
        generate_payload["next_scene_prompt"] = data.next_scene_prompt
    if data.feedback:
        generate_payload["feedback"] = data.feedback
    if data.music_timestamp_ms is not None:
        generate_payload["music_timestamp_ms"] = data.music_timestamp_ms
    if data.music_energy is not None:
        generate_payload["music_energy"] = data.music_energy

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

    # For async video generation the render service returns {status:"generating"} immediately.
    # Veo runs in a background task and calls /internal/clip-status when done.
    # We must NOT mark the clip as done here — that will arrive via WebSocket callback.
    is_async = result.get("status") == "generating"
    if is_async:
        return result

    # Synchronous generation (images) — persist result now
    gen_ok = result.get("status") == "done"
    generated_url = result.get("output_url") or result.get("media_url")
    thumbnail_url = result.get("thumbnail_url") or result.get("thumbnail")
    gen_status = "done" if gen_ok else "error"
    gen_error = result.get("message", "") if not gen_ok else ""

    db = get_supabase()
    if db is not None:
        try:
            tl_row = db.table("timelines").select("clips").eq("project_id", project_id).execute()
            if tl_row.data:
                clips = tl_row.data[0].get("clips", [])
                for clip in clips:
                    if clip.get("id") == data.clip_id:
                        clip["gen_status"] = gen_status
                        if generated_url:
                            clip["generated_media_url"] = generated_url
                        if thumbnail_url:
                            clip["thumbnail_url"] = thumbnail_url
                        if gen_error:
                            clip["gen_error"] = gen_error
                        break
                clips = _strip_title_cards(clips)
                db.table("timelines").update({"clips": clips}).eq("project_id", project_id).execute()
        except Exception:
            pass

        if thumbnail_url:
            try:
                proj_row = db.table("projects").select("cover_image_url").eq("id", project_id).execute()
                if proj_row.data and not proj_row.data[0].get("cover_image_url"):
                    db.table("projects").update({"cover_image_url": thumbnail_url}).eq("id", project_id).execute()
            except Exception:
                pass

    await manager.broadcast(project_id, {
        "type": "clip_updated",
        "clip_id": data.clip_id,
        "gen_status": gen_status,
        "generated_media_url": generated_url,
        "thumbnail_url": thumbnail_url,
        "gen_error": gen_error,
    })

    # Return normalized fields so all frontends (project page + ChatPanel) work consistently
    return {
        **result,
        "media_url": generated_url,
        "generated_media_url": generated_url,
        "thumbnail_url": thumbnail_url,
        "gen_status": gen_status,
    }


@router.post("/render")
async def render_trailer(project_id: str, background_tasks: BackgroundTasks, data: RenderRequest = None):
    """Kick off a render job and return job_id immediately. Frontend polls for status."""
    settings = get_settings()
    db = get_supabase()

    # Use timeline passed from frontend (most up-to-date) or fall back to DB
    timeline = data.timeline if data and data.timeline else None
    title = ""
    author = ""

    _TITLE_CARD_TERMS = {
        'title card', 'title screen', 'title slide', 'title page', 'title treatment',
        'title reveal', 'title sequence', 'opening title', 'title shot',
        'book title', 'movie title', 'film title', 'outro card', 'intro card',
        'end card', 'coming soon', 'the end', 'credits',
        'glowing text', 'floating text', 'text appears', 'text reads',
        'logo reveal', 'brand reveal',
        'title text', 'text on screen', 'text on black', 'text overlay',
        'words appear', 'words on screen', 'text fades', 'text floats',
        'chapter title', 'opening card', 'closing card', 'title card',
        'black screen with', 'fade to black with', 'text displayed',
    }
    _STRIP_IDS = {'title_card', 'end_card'}

    def _strip_title_cards(clips: list) -> list:
        out = []
        for c in (clips or []):
            if c.get('id') in _STRIP_IDS:
                continue
            if c.get('type') == 'text_overlay':
                continue
            prompt = (c.get('prompt') or '').lower()
            if any(term in prompt for term in _TITLE_CARD_TERMS):
                continue
            out.append(c)
        return out

    try:
        if db is not None:
            if timeline is None:
                tl_row = db.table("timelines").select("*").eq("project_id", project_id).execute()
                if tl_row.data:
                    timeline = tl_row.data[0]
            proj_row = db.table("projects").select("title,author").eq("id", project_id).execute()
            if proj_row.data:
                title = proj_row.data[0].get("title", "")
                author = proj_row.data[0].get("author", "")
    except Exception as e:
        logger.warning("DB fetch error: %s", e)

    # Strip title cards from whichever timeline source was used
    if timeline and timeline.get("clips"):
        timeline = {**timeline, "clips": _strip_title_cards(timeline["clips"])}

    clips_count = len((timeline or {}).get("clips", []))
    clips_with_media = sum(1 for c in (timeline or {}).get("clips", []) if c.get("generated_media_url") or c.get("thumbnail_url"))
    logger.info("Render %s: timeline has %d clips, %d with media", project_id, clips_count, clips_with_media)

    job_id = str(uuid.uuid4())

    # Store job in DB
    try:
        if db is not None:
            db.table("render_jobs").insert({
                "id": job_id,
                "project_id": project_id,
                "status": "queued",
                "progress": 0,
            }).execute()
    except Exception as e:
        logger.warning("Could not insert render_job: %s", e)

    compose_payload = {
        "project_id": project_id,
        "timeline": timeline,
        "title": title,
        "author": author,
        "callback_job_id": job_id,  # render service uses this to update the correct DB row
    }
    # Prefer top-level effects/beat_map from the request; fall back to what's embedded in the timeline
    effects = (data and data.effects) or (timeline or {}).get("effects") or []
    beat_map = (data and data.beat_map) or (timeline or {}).get("beat_map")
    if effects:
        compose_payload["effects"] = effects
    if beat_map:
        compose_payload["beat_map"] = beat_map

    # Call render service synchronously (it queues the job and returns fast)
    render_job_id = job_id
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.render_service_url}/render/compose",
                json=compose_payload,
            )
            resp.raise_for_status()
            render_result = resp.json()
            render_job_id = render_result.get("job_id", job_id)
            _render_id_map[job_id] = render_job_id
    except httpx.ConnectError:
        return _render_unavailable()
    except Exception as e:
        logger.error("Failed to start render: %s", e)
        return {"status": "error", "message": f"Failed to start render: {e}", "job_id": job_id}

    # Background task polls render service and broadcasts progress via WS
    background_tasks.add_task(_poll_render_progress, project_id, job_id, render_job_id, settings)

    await manager.broadcast(project_id, {
        "type": "render_progress",
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
    })

    return {"job_id": job_id, "render_job_id": render_job_id, "status": "queued"}


async def _poll_render_progress(project_id: str, job_id: str, render_job_id: str, settings):
    """Background task: poll render service and broadcast progress + update DB."""
    db = get_supabase()
    status = "queued"
    output_url = None
    preview_url = None

    async with httpx.AsyncClient(timeout=15.0) as client:
        for _ in range(150):  # up to 12.5 minutes
            await asyncio.sleep(5)
            try:
                r = await client.get(f"{settings.render_service_url}/render/jobs/{render_job_id}")
                job = r.json()
                status = job.get("status", status)
                output_url = job.get("output_url") or output_url
                preview_url = job.get("preview_url") or preview_url
                progress = job.get("progress", 0)

                await manager.broadcast(project_id, {
                    "type": "render_progress",
                    "job_id": job_id,
                    "status": status,
                    "progress": progress,
                    "output_url": output_url,
                    "preview_url": preview_url,
                })

                # Update DB with current progress
                try:
                    if db is not None:
                        db.table("render_jobs").update({
                            "status": status,
                            "progress": progress,
                            "output_url": output_url,
                            "preview_url": preview_url,
                        }).eq("id", job_id).execute()
                except Exception:
                    pass

                if status in ("done", "error"):
                    break
            except Exception as e:
                logger.warning("Poll error: %s", e)

    # Final DB updates
    try:
        if db is not None and status == "done":
            db.table("projects").update({"status": "done"}).eq("id", project_id).execute()
    except Exception as e:
        logger.warning("DB final update error: %s", e)


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
    settings = get_settings()
    render_job_id = _render_id_map.get(job_id, job_id)
    render_data = None

    # Always try render service first for live status
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.render_service_url}/render/jobs/{render_job_id}")
            if resp.status_code == 200:
                render_data = resp.json()
                render_data["job_id"] = job_id
                # If render service reports done with URLs, return immediately
                if render_data.get("output_url") or render_data.get("preview_url"):
                    return render_data
    except Exception:
        pass

    # Fall back to DB — always has the correct job_id since _report_progress now uses callback_job_id
    db = get_supabase()
    if db:
        try:
            result = db.table("render_jobs").select("*").eq("id", job_id).execute()
            if result.data:
                db_data = result.data[0]
                # If render service had live status/progress (no error), layer it on top
                if render_data and not render_data.get("error"):
                    db_data["status"] = render_data.get("status", db_data.get("status"))
                    db_data["progress"] = render_data.get("progress", db_data.get("progress"))
                    if not db_data.get("output_url") and render_data.get("output_url"):
                        db_data["output_url"] = render_data["output_url"]
                    if not db_data.get("preview_url") and render_data.get("preview_url"):
                        db_data["preview_url"] = render_data["preview_url"]
                # Never report "done" without a URL — the URL arrives slightly after status
                if db_data.get("status") == "done" and not db_data.get("output_url"):
                    db_data["status"] = "composing"
                    db_data["progress"] = 99
                return db_data
        except Exception:
            pass

    # If we have render service data (even without URL), return it
    if render_data and not render_data.get("error"):
        return render_data

    raise HTTPException(status_code=404, detail="Render job not found")
