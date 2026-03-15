"""Trailer composition endpoint — composes clips into final video via FFmpeg."""
import os
import logging
import tempfile
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import uuid
import httpx

from app.services.ffmpeg import compose_trailer, generate_preview
from app.services.music import suggest_music
from app.services.kling import download_media
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/render", tags=["compose"])

# In-memory job tracking (replace with DB in production)
_render_jobs: dict[str, dict] = {}


class ComposeRequest(BaseModel):
    project_id: str
    timeline: Optional[dict] = None
    title: str = ""
    author: str = ""
    effects: Optional[list] = None
    beat_map: Optional[dict] = None


class ComposeResponse(BaseModel):
    job_id: str
    status: str = "queued"
    progress: int = 0
    output_url: Optional[str] = None
    message: str = ""


class MusicSuggestRequest(BaseModel):
    mood: str = ""
    genre: str = ""
    duration_ms: int = 0


async def _report_progress(job_id: str, project_id: str, progress: int, message: str,
                           output_url: str = "", preview_url: str = ""):
    """Update job status and notify API service."""
    if job_id in _render_jobs:
        _render_jobs[job_id]["progress"] = progress
        _render_jobs[job_id]["message"] = message
        if progress >= 100:
            _render_jobs[job_id]["status"] = "done"

    settings = get_settings()
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.api_service_url}/api/v1/internal/render-progress",
                json={
                    "job_id": job_id,
                    "project_id": project_id,
                    "progress": progress,
                    "status": "composing" if progress < 100 else "done",
                    "message": message,
                    "output_url": output_url,
                    "preview_url": preview_url,
                },
                timeout=10,
            )
    except Exception as e:
        logger.warning("Failed to report progress: %s", e)


async def _download_clip_media(clips: list[dict], tmpdir: str) -> list[dict]:
    """Download remote media for all clips to local temp files."""
    import base64 as _b64
    updated_clips = []
    for i, clip in enumerate(clips):
        media_url = clip.get("generated_media_url") or ""
        if not media_url:
            updated_clips.append(clip)
            continue
        try:
            if media_url.startswith("data:"):
                header, b64data = media_url.split(",", 1)
                mime = header.split(";")[0].split(":")[1] if ":" in header else "image/png"
                ext = ".jpg" if ("jpeg" in mime or "jpg" in mime) else ".png"
                local_path = os.path.join(tmpdir, f"media_{i:03d}{ext}")
                with open(local_path, "wb") as f:
                    f.write(_b64.b64decode(b64data))
                clip = {**clip, "local_media_path": local_path}
            elif media_url.startswith("http"):
                media_bytes = await download_media(media_url)
                url_lower = media_url.split("?")[0].lower()
                ext = ".mp4" if (clip.get("type") == "video" or url_lower.endswith(".mp4") or "fal_" in url_lower) else ".png"
                local_path = os.path.join(tmpdir, f"media_{i:03d}{ext}")
                with open(local_path, "wb") as f:
                    f.write(media_bytes)
                clip = {**clip, "local_media_path": local_path}
        except Exception as e:
            logger.warning("Failed to download media for clip %d: %s", i, e)
        updated_clips.append(clip)
    return updated_clips


async def _compose_background(data: ComposeRequest, job_id: str):
    """Background task: download media, compose trailer."""
    settings = get_settings()
    output_dir = os.path.join(settings.render_output_dir, data.project_id)
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{job_id}.mp4")

    tmpdir = tempfile.mkdtemp(prefix="frameflow_compose_")

    try:
        _render_jobs[job_id]["status"] = "generating_media"
        timeline = data.timeline or {}
        all_clips = sorted(timeline.get("clips", []), key=lambda c: c.get("order", 0))

        # Only include clips with actual AI-generated media; skip text overlays, placeholder clips,
        # and any AI-generated title/outro card images (type=image but purely a title screen)
        _TITLE_CARD_TERMS = {
            'title card', 'title screen', 'title slide', 'title page', 'title treatment',
            'title reveal', 'title sequence', 'opening title', 'title shot',
            'book title', 'movie title', 'film title', 'outro card', 'intro card',
            'end card', 'coming soon', 'the end', 'credits',
            'glowing text', 'floating text', 'text appears', 'text reads',
            'logo reveal', 'brand reveal',
        }
        def _is_title_card(clip: dict) -> bool:
            prompt = (clip.get('prompt') or '').lower()
            return any(term in prompt for term in _TITLE_CARD_TERMS)

        clips = [
            c for c in all_clips
            if c.get("type") != "text_overlay"
            and c.get("generated_media_url")
            and not _is_title_card(c)
        ]
        logger.info("Compose job %s: %d total clips, %d with generated media", job_id, len(all_clips), len(clips))

        timeline_settings = timeline.get("settings", {})
        music_track = timeline.get("music_track")

        async def progress_cb(pct, msg):
            await _report_progress(job_id, data.project_id, pct, msg)

        await progress_cb(5, "Downloading clip media...")
        clips = await _download_clip_media(clips, tmpdir)

        # Download music if URL provided
        if music_track and music_track.get("url", "").startswith("http"):
            try:
                music_bytes = await download_media(music_track["url"])
                music_local = os.path.join(tmpdir, "music.mp3")
                with open(music_local, "wb") as f:
                    f.write(music_bytes)
                music_track = {**music_track, "local_path": music_local}
            except Exception as e:
                logger.warning("Failed to download music: %s", e)
                music_track = None

        # Compose trailer
        _render_jobs[job_id]["status"] = "composing"
        result = await compose_trailer(
            clips=clips,
            output_path=output_path,
            settings=timeline_settings,
            music_track=music_track,
            progress_callback=progress_cb,
            effects=data.effects or [],
            beat_map=data.beat_map,
        )

        if result.get("status") == "done":
            preview_path = os.path.join(output_dir, f"{job_id}_preview.mp4")
            await generate_preview(output_path, preview_path)

            render_base = settings.render_service_url
            output_dir_base = settings.render_output_dir.rstrip("/")
            def to_public_url(path: str) -> str:
                rel = path[len(output_dir_base):].lstrip("/")
                return f"{render_base}/outputs/{rel}"

            _render_jobs[job_id].update({
                "status": "done",
                "progress": 100,
                "output_url": to_public_url(output_path),
                "preview_url": to_public_url(preview_path),
                "duration_ms": result.get("duration_ms", 0),
                "message": result.get("message", ""),
            })
            await _report_progress(job_id, data.project_id, 100, "Render complete!",
                                   output_url=to_public_url(output_path),
                                   preview_url=to_public_url(preview_path))
        else:
            _render_jobs[job_id].update({
                "status": "error",
                "error": result.get("message", "Composition failed"),
            })

    except Exception as e:
        logger.error("Compose background task failed: %s", e)
        _render_jobs[job_id].update({
            "status": "error",
            "error": str(e),
        })
    finally:
        try:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass


@router.post("/compose", response_model=ComposeResponse)
async def compose(data: ComposeRequest, background_tasks: BackgroundTasks):
    """Start composing a trailer from timeline clips."""
    job_id = str(uuid.uuid4())

    _render_jobs[job_id] = {
        "job_id": job_id,
        "project_id": data.project_id,
        "status": "queued",
        "progress": 0,
        "output_url": None,
        "error": None,
        "message": "Queued for rendering",
    }

    background_tasks.add_task(_compose_background, data, job_id)

    return ComposeResponse(
        job_id=job_id,
        status="queued",
        progress=0,
        message="Render job queued",
    )


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get the status of a render job."""
    job = _render_jobs.get(job_id)
    if not job:
        return {"error": "Job not found", "job_id": job_id}
    return job


@router.post("/music/suggest")
async def music_suggest(data: MusicSuggestRequest):
    """Suggest background music tracks based on mood and genre."""
    tracks = await suggest_music(data.mood, data.genre, data.duration_ms)
    return {"tracks": tracks}
