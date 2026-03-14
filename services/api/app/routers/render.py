from fastapi import APIRouter
from app.models.render import GenerateClipRequest, RenderJobResponse
from app.config import get_settings
import httpx

router = APIRouter(prefix="/projects/{project_id}", tags=["render"])

@router.post("/generate-clip")
async def generate_clip(project_id: str, data: GenerateClipRequest):
    settings = get_settings()
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            resp = await client.post(
                f"{settings.render_service_url}/render/generate",
                json={"clip_id": data.clip_id, "prompt": data.prompt, "type": data.type},
            )
            return resp.json()
        except httpx.ConnectError:
            return {"status": "render_service_unavailable", "message": "Render service not running. Start it on port 8002."}

@router.post("/render")
async def render_trailer(project_id: str):
    settings = get_settings()
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            resp = await client.post(
                f"{settings.render_service_url}/render/compose",
                json={"project_id": project_id},
            )
            return resp.json()
        except httpx.ConnectError:
            return {"status": "render_service_unavailable", "message": "Render service not running. Start it on port 8002."}
