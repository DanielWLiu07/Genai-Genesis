from fastapi import APIRouter
from app.config import get_settings
from app.db import get_supabase
from app.state import get_book_text, update_project_mem, get_project_mem
from pydantic import BaseModel
from typing import Optional
import httpx
from datetime import datetime

router = APIRouter(prefix="/projects/{project_id}", tags=["ai"])


class ChatRequest(BaseModel):
    message: str
    timeline: Optional[dict] = None
    history: list = []


def _get_project_analysis(project_id: str) -> tuple[str, dict | None]:
    """Return (book_text, analysis) from memory + DB."""
    book_text = get_book_text(project_id)
    analysis: dict | None = None

    db = get_supabase()
    if db is not None:
        try:
            row = db.table("projects").select("analysis").eq("id", project_id).execute()
            if row.data:
                stored = row.data[0].get("analysis") or {}
                if not book_text:
                    book_text = stored.get("book_text", "")
                if stored and any(k != "book_text" for k in stored):
                    analysis = {k: v for k, v in stored.items() if k != "book_text"}
        except Exception:
            pass
    else:
        # In-memory fallback: check if analysis was stored there
        mem_proj = get_project_mem(project_id)
        if mem_proj and mem_proj.get("analysis"):
            stored = mem_proj["analysis"] or {}
            if not book_text:
                book_text = stored.get("book_text", "")
            if stored and any(k != "book_text" for k in stored):
                analysis = {k: v for k, v in stored.items() if k != "book_text"}

    return book_text, analysis


def _ai_unavailable(msg: str = "AI service not running. Start it on port 8001."):
    return {"status": "ai_service_unavailable", "message": msg}


@router.post("/analyze")
async def analyze_story(project_id: str):
    book_text, _ = _get_project_analysis(project_id)
    if not book_text:
        return {"error": "No book text found. Upload a book file first."}

    settings = get_settings()
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(
                f"{settings.ai_service_url}/ai/analyze",
                json={"project_id": project_id, "book_text": book_text},
            )
            result = resp.json()
        except httpx.ConnectError:
            return _ai_unavailable()

    # Persist the full analysis result
    db = get_supabase()
    if isinstance(result, dict) and "error" not in result:
        merged = {"book_text": book_text, **result}
        if db is not None:
            try:
                db.table("projects").update({"analysis": merged, "status": "planning"}).eq("id", project_id).execute()
            except Exception:
                pass
        else:
            update_project_mem(project_id, analysis=merged, status="planning")

    return result


@router.post("/plan-trailer")
async def plan_trailer(project_id: str):
    _, analysis = _get_project_analysis(project_id)
    if not analysis:
        return {"error": "No analysis found. Run /analyze first."}

    settings = get_settings()
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(
                f"{settings.ai_service_url}/ai/plan-trailer",
                json={"project_id": project_id, "analysis": analysis},
            )
            result = resp.json()
        except httpx.ConnectError:
            return _ai_unavailable()

    # Update project status to editing once plan is ready
    db = get_supabase()
    if isinstance(result, dict) and "clips" in result:
        if db is not None:
            try:
                db.table("projects").update({"status": "editing"}).eq("id", project_id).execute()
            except Exception:
                pass
        else:
            update_project_mem(project_id, status="editing")

    return result


@router.post("/chat")
async def chat(project_id: str, data: ChatRequest):
    # Load persisted history from DB if caller didn't supply it
    history = list(data.history)
    db = get_supabase()
    if db is not None and not history:
        try:
            row = db.table("chat_history").select("messages").eq("project_id", project_id).execute()
            if row.data:
                history = row.data[0].get("messages", [])
        except Exception:
            pass

    settings = get_settings()
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(
                f"{settings.ai_service_url}/ai/chat",
                json={
                    "project_id": project_id,
                    "message": data.message,
                    "timeline": data.timeline,
                    "history": history,
                },
            )
            result = resp.json()
        except httpx.ConnectError:
            return {"role": "assistant", "content": "AI service not available. Start it on port 8001.", "tool_calls": []}

    # Append user + assistant messages and persist
    new_history = history + [
        {"role": "user", "content": data.message},
        {"role": result.get("role", "assistant"), "content": result.get("content", "")},
    ]
    if db is not None:
        try:
            db.table("chat_history").upsert({
                "project_id": project_id,
                "messages": new_history[-50:],  # keep last 50
                "updated_at": datetime.now().isoformat(),
            }).execute()
        except Exception:
            pass

    return result
