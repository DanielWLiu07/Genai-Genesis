from fastapi import APIRouter, HTTPException
from app.models.timeline import TimelineUpdate, Clip, ClipUpdate
from app.db import get_supabase
from app.state import get_timeline_mem, upsert_timeline_mem
import uuid

router = APIRouter(prefix="/projects/{project_id}", tags=["timeline"])

_DEFAULT_SETTINGS = {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24}
_DEFAULT_TIMELINE = {"clips": [], "music_track": None, "total_duration_ms": 0, "settings": _DEFAULT_SETTINGS}


@router.get("/timeline")
async def get_timeline(project_id: str):
    db = get_supabase()
    if db is None:
        return get_timeline_mem(project_id)
    result = db.table("timelines").select("*").eq("project_id", project_id).execute()
    if not result.data:
        return {**_DEFAULT_TIMELINE, "project_id": project_id}
    return result.data[0]


@router.put("/timeline")
async def update_timeline(project_id: str, data: TimelineUpdate):
    db = get_supabase()
    payload = {
        "project_id": project_id,
        "clips": [c.model_dump() for c in data.clips],
        "music_track": data.music_track,
        "total_duration_ms": data.total_duration_ms,
        "settings": data.settings,
    }
    if db is None:
        mem_payload = {k: v for k, v in payload.items() if k != "project_id"}
        return upsert_timeline_mem(project_id, **mem_payload)
    result = db.table("timelines").upsert(payload).execute()
    return result.data[0] if result.data else payload


@router.post("/clips")
async def add_clip(project_id: str, clip: Clip):
    db = get_supabase()
    tl = await get_timeline(project_id)
    clips = tl.get("clips", [])
    clips.append(clip.model_dump())
    if db is None:
        return upsert_timeline_mem(project_id, clips=clips)
    db.table("timelines").upsert({"project_id": project_id, "clips": clips}).execute()
    return clip.model_dump()


@router.patch("/clips/{clip_id}")
async def update_clip(project_id: str, clip_id: str, data: ClipUpdate):
    db = get_supabase()
    tl = await get_timeline(project_id)
    clips = tl.get("clips", [])
    updates = data.model_dump(exclude_none=True)
    updated_clip = None
    for clip in clips:
        if clip.get("id") == clip_id:
            clip.update(updates)
            updated_clip = clip
            break
    if db is None:
        upsert_timeline_mem(project_id, clips=clips)
        return updated_clip or {"id": clip_id}
    db.table("timelines").update({"clips": clips}).eq("project_id", project_id).execute()
    return updated_clip or {"id": clip_id}


@router.delete("/clips/{clip_id}")
async def delete_clip(project_id: str, clip_id: str):
    db = get_supabase()
    tl = await get_timeline(project_id)
    clips = [c for c in tl.get("clips", []) if c.get("id") != clip_id]
    if db is None:
        upsert_timeline_mem(project_id, clips=clips)
        return {"deleted": True}
    db.table("timelines").update({"clips": clips}).eq("project_id", project_id).execute()
    return {"deleted": True}


@router.post("/clips/reorder")
async def reorder_clips(project_id: str, clip_ids: list[str]):
    db = get_supabase()
    tl = await get_timeline(project_id)
    clip_map = {c["id"]: c for c in tl.get("clips", [])}
    reordered = []
    for i, cid in enumerate(clip_ids):
        if cid in clip_map:
            clip = clip_map[cid]
            clip["order"] = i
            clip["position"] = {"x": i * 280, "y": 100}
            reordered.append(clip)
    if db is None:
        upsert_timeline_mem(project_id, clips=reordered)
        return {"reordered": True}
    db.table("timelines").update({"clips": reordered}).eq("project_id", project_id).execute()
    return {"reordered": True}
