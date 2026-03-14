from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from app.services.ffmpeg import compose_trailer
from app.services.music import suggest_music
import uuid

router = APIRouter(prefix="/render", tags=["compose"])

class ComposeRequest(BaseModel):
    project_id: str
    timeline: Optional[dict] = None

class MusicSuggestRequest(BaseModel):
    mood: str = ""
    genre: str = ""
    duration_ms: int = 0

@router.post("/compose")
async def compose(data: ComposeRequest):
    job_id = str(uuid.uuid4())
    output_path = f"renders/{data.project_id}/{job_id}.mp4"

    result = await compose_trailer(
        clips=data.timeline.get("clips", []) if data.timeline else [],
        output_path=output_path,
        settings=data.timeline.get("settings") if data.timeline else None,
    )

    return {
        "job_id": job_id,
        "status": result.get("status", "pending"),
        "output_url": None,
        "message": result.get("message", ""),
    }

@router.post("/music/suggest")
async def music_suggest(data: MusicSuggestRequest):
    tracks = await suggest_music(data.mood, data.genre, data.duration_ms)
    return {"tracks": tracks}
