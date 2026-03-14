from fastapi import APIRouter, HTTPException
from app.config import get_settings
from app.db import get_supabase
from app.state import get_book_text, update_project_mem, get_project_mem
from pydantic import BaseModel
from typing import Optional, List
import httpx
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}", tags=["ai"])


class ChatRequest(BaseModel):
    message: str
    timeline: Optional[dict] = None
    history: list = []


class SuggestRequest(BaseModel):
    timeline: dict
    analysis: Optional[dict] = None


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
async def analyze_story(project_id: str, body: Optional[dict] = None):
    """Trigger story analysis. Accepts optional {book_text} in body."""
    # Try body first, then in-memory/DB
    book_text = ""
    if body and "book_text" in body:
        book_text = body["book_text"]

    if not book_text:
        book_text, _ = _get_project_analysis(project_id)

    if not book_text:
        raise HTTPException(status_code=400, detail="No book text found. Upload a book file first.")

    settings = get_settings()

    payload: dict = {"project_id": project_id, "book_text": book_text}
    if body:
        if "characters" in body:
            payload["characters"] = body["characters"]
        if "uploaded_images" in body:
            payload["uploaded_images"] = body["uploaded_images"]

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(
                f"{settings.ai_service_url}/ai/analyze",
                json=payload,
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
async def plan_trailer(project_id: str, body: Optional[dict] = None):
    """Generate trailer plan. Accepts optional {analysis, style, pacing} in body."""
    analysis = None
    if body and "analysis" in body:
        analysis = body["analysis"]

    if not analysis:
        _, analysis = _get_project_analysis(project_id)

    if not analysis:
        raise HTTPException(status_code=400, detail="No analysis found. Run /analyze first.")

    settings = get_settings()

    payload: dict = {"project_id": project_id, "analysis": analysis}
    if body:
        if "style" in body:
            payload["style"] = body["style"]
        if "pacing" in body:
            payload["pacing"] = body["pacing"]

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(
                f"{settings.ai_service_url}/ai/plan-trailer",
                json=payload,
            )
            result = resp.json()
        except httpx.ConnectError:
            return _ai_unavailable()

    # Update project status
    db = get_supabase()
    if isinstance(result, dict) and "clips" in result:
        if db is not None:
            try:
                db.table("projects").update({"status": "editing"}).eq("id", project_id).execute()
                db.table("timelines").upsert({
                    "project_id": project_id,
                    "clips": result.get("clips", []),
                    "total_duration_ms": result.get("total_duration_ms", 0),
                    "settings": {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24},
                }).execute()
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

    payload = {
        "project_id": project_id,
        "message": data.message,
        "timeline": data.timeline,
        "history": history,
    }

    # Attach analysis for context
    if db is not None:
        try:
            result = db.table("projects").select("analysis").eq("id", project_id).execute()
            if result.data and result.data[0].get("analysis"):
                payload["analysis"] = result.data[0]["analysis"]
        except Exception:
            pass

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(
                f"{settings.ai_service_url}/ai/chat",
                json=payload,
            )
            result = resp.json()
        except httpx.ConnectError:
            return {"role": "assistant", "content": "AI service not available. Start it on port 8001.", "tool_calls": []}

    # Persist chat history
    new_history = history + [
        {"role": "user", "content": data.message},
        {"role": result.get("role", "assistant"), "content": result.get("content", "")},
    ]
    if db is not None:
        try:
            db.table("chat_history").upsert({
                "project_id": project_id,
                "messages": new_history[-50:],
                "updated_at": datetime.now().isoformat(),
            }).execute()
        except Exception:
            pass

    return result


@router.get("/chat/history")
async def get_chat_history(project_id: str):
    """Get persisted chat history for a project."""
    db = get_supabase()
    if db:
        try:
            result = db.table("chat_history").select("messages").eq("project_id", project_id).execute()
            if result.data:
                return {"messages": result.data[0].get("messages", [])}
        except Exception:
            pass
    return {"messages": []}


@router.post("/suggest")
async def suggest(project_id: str, data: SuggestRequest):
    """Get AI suggestions for improving the trailer timeline."""
    settings = get_settings()

    payload = {
        "project_id": project_id,
        "timeline": data.timeline,
        "analysis": data.analysis,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(f"{settings.ai_service_url}/ai/suggest", json=payload)
            return resp.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="AI service not running.")


# --- Presets routes ---
presets_router = APIRouter(prefix="/presets", tags=["presets"])


@presets_router.get("")
async def list_presets():
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{settings.ai_service_url}/ai/presets")
            return resp.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="AI service not running.")


@presets_router.get("/{style}")
async def get_preset(style: str):
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{settings.ai_service_url}/ai/presets/{style}")
            return resp.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="AI service not running.")
