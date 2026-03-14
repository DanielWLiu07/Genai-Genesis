from fastapi import APIRouter
from app.services.style_presets import get_all_presets, get_preset

router = APIRouter(prefix="/ai", tags=["presets"])


@router.get("/presets")
async def list_presets():
    """List all available trailer style presets."""
    return get_all_presets()


@router.get("/presets/{style}")
async def get_style_preset(style: str):
    """Get details of a specific style preset."""
    preset = get_preset(style)
    return preset
