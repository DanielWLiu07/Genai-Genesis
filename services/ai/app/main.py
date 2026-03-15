from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import analyze, plan, chat, suggest, presets, manga
import logging

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Lotus AI Service",
    description="Story analysis, trailer planning, and AI copilot for Lotus",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(plan.router)
app.include_router(chat.router)
app.include_router(suggest.router)
app.include_router(presets.router)
app.include_router(manga.router)


@app.get("/")
async def root():
    return {
        "service": "Lotus AI",
        "status": "running",
        "version": "0.1.0",
        "endpoints": [
            "POST /ai/analyze - Analyze story text",
            "POST /ai/plan-trailer - Generate trailer timeline",
            "POST /ai/pipeline - Full Railtracks multi-agent pipeline (analyze+plan+quality)",
            "POST /ai/chat - Chat with Railtracks copilot (tool calling)",
            "POST /ai/suggest - Get timeline improvement suggestions",
            "GET /ai/presets - List available style presets",
        ],
    }


@app.get("/health")
async def health():
    from app.config import get_settings
    settings = get_settings()
    return {
        "status": "healthy",
        "gemini_configured": bool(settings.gemini_api_key),
    }
