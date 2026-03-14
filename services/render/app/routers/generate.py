from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.services.kling import generate_image, generate_video

router = APIRouter(prefix="/render", tags=["generate"])

class GenerateRequest(BaseModel):
    clip_id: str
    prompt: str
    type: str = "image"
    aspect_ratio: str = "16:9"
    duration_ms: int = 3000

@router.post("/generate")
async def generate(data: GenerateRequest):
    if data.type == "video":
        result = await generate_video(data.prompt, data.duration_ms / 1000, data.aspect_ratio)
    else:
        result = await generate_image(data.prompt, data.aspect_ratio)

    return {
        "clip_id": data.clip_id,
        "media_url": result.get("url"),
        "thumbnail_url": result.get("thumbnail_url"),
        "status": result.get("status", "pending"),
        "message": result.get("message", ""),
    }
