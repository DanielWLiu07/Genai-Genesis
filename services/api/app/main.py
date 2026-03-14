from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import projects, timeline, upload, ai, render, ws
from app.db import get_supabase

app = FastAPI(title="FrameFlow API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/v1")
app.include_router(timeline.router, prefix="/api/v1")
app.include_router(upload.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
app.include_router(render.router, prefix="/api/v1")
app.include_router(ws.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"service": "FrameFlow API", "status": "running", "version": "0.1.0"}


@app.get("/health")
async def health():
    db = get_supabase()
    return {
        "status": "healthy",
        "database": "connected" if db is not None else "offline (in-memory mode)",
        "mode": "supabase" if db is not None else "in-memory",
    }


@app.get("/api/v1/setup-db")
async def setup_db_info():
    """Instructions to set up the database schema."""
    db = get_supabase()
    if db is not None:
        return {"status": "ready", "message": "Database is connected and schema is present."}
    from app.config import get_settings
    s = get_settings()
    if not s.supabase_url:
        return {
            "status": "no_credentials",
            "message": "Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env, then run schema.sql in the Supabase SQL editor.",
        }
    return {
        "status": "schema_missing",
        "message": "Supabase credentials are set but tables are missing. Run supabase/schema.sql in the Supabase SQL editor at https://supabase.com/dashboard.",
        "sql_file": "supabase/schema.sql",
    }
