from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.services.trailer_planner import plan_trailer

router = APIRouter(prefix="/ai", tags=["plan"])

class PlanRequest(BaseModel):
    project_id: str
    analysis: Optional[dict] = None
    settings: Optional[dict] = None

@router.post("/plan-trailer")
async def plan(data: PlanRequest):
    if not data.analysis:
        return {"error": "No analysis provided. Run /analyze first."}
    result = await plan_trailer(data.analysis)
    return result
