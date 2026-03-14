from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.config import get_settings
import httpx
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/projects/{project_id}", tags=["ai"])

class ChatRequest(BaseModel):
    message: str
    timeline: Optional[dict] = None
    history: list = []

@router.post("/analyze")
async def analyze_story(project_id: str):
    settings = get_settings()
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(f"{settings.ai_service_url}/ai/analyze", json={"project_id": project_id})
            return resp.json()
        except httpx.ConnectError:
            return {"status": "ai_service_unavailable", "message": "AI service not running. Start it on port 8001."}

@router.post("/plan-trailer")
async def plan_trailer(project_id: str):
    settings = get_settings()
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(f"{settings.ai_service_url}/ai/plan-trailer", json={"project_id": project_id})
            return resp.json()
        except httpx.ConnectError:
            return {"status": "ai_service_unavailable", "message": "AI service not running. Start it on port 8001."}

@router.post("/chat")
async def chat(project_id: str, data: ChatRequest):
    settings = get_settings()
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(
                f"{settings.ai_service_url}/ai/chat",
                json={"project_id": project_id, "message": data.message,
                       "timeline": data.timeline, "history": data.history},
            )
            return resp.json()
        except httpx.ConnectError:
            return {"role": "assistant", "content": "AI service not available. Please start it on port 8001."}
