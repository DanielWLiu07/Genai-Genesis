from fastapi import APIRouter, HTTPException
from app.models.timeline import TimelineUpdate, Clip, ClipUpdate
from app.db import get_supabase
import uuid

router = APIRouter(prefix="/projects/{project_id}", tags=["timeline"])

@router.get("/timeline")
async def get_timeline(project_id: str):
    db = get_supabase()
    if db is None:
        return {"clips": [], "music_track": None, "total_duration_ms": 0,
                "settings": {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24}}
    result = db.table("timelines").select("*").eq("project_id", project_id).execute()
    if not result.data:
        return {"clips": [], "music_track": None, "total_duration_ms": 0,
                "settings": {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24}}
    return result.data[0]

@router.put("/timeline")
async def update_timeline(project_id: str, data: TimelineUpdate):
    db = get_supabase()
    if db is None:
        return data.model_dump()
    result = db.table("timelines").upsert({
        "project_id": project_id,
        "clips": [c.model_dump() for c in data.clips],
        "music_track": data.music_track,
        "total_duration_ms": data.total_duration_ms,
        "settings": data.settings,
    }).execute()
    return result.data[0] if result.data else data.model_dump()

@router.post("/clips")
async def add_clip(project_id: str, clip: Clip):
    db = get_supabase()
    if db is None:
        return clip.model_dump()
    timeline = await get_timeline(project_id)
    clips = timeline.get("clips", [])
    clips.append(clip.model_dump())
    db.table("timelines").upsert({
        "project_id": project_id, "clips": clips,
    }).execute()
    return clip.model_dump()

@router.delete("/clips/{clip_id}")
async def delete_clip(project_id: str, clip_id: str):
    db = get_supabase()
    if db is None:
        return {"deleted": True}
    timeline = await get_timeline(project_id)
    clips = [c for c in timeline.get("clips", []) if c["id"] != clip_id]
    db.table("timelines").update({"clips": clips}).eq("project_id", project_id).execute()
    return {"deleted": True}

@router.post("/clips/reorder")
async def reorder_clips(project_id: str, clip_ids: list[str]):
    db = get_supabase()
    if db is None:
        return {"reordered": True}
    timeline = await get_timeline(project_id)
    clip_map = {c["id"]: c for c in timeline.get("clips", [])}
    reordered = []
    for i, cid in enumerate(clip_ids):
        if cid in clip_map:
            clip = clip_map[cid]
            clip["order"] = i
            clip["position"] = {"x": i * 280, "y": 100}
            reordered.append(clip)
    db.table("timelines").update({"clips": reordered}).eq("project_id", project_id).execute()
    return {"reordered": True}
