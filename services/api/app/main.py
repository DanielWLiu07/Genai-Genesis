from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.routers import projects, timeline, upload, ai, render, ws, internal
from app.db import get_supabase
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _recover_stale_render_jobs():
    """On startup: restart poll tasks for jobs left composing/queued after a crash."""
    await asyncio.sleep(3)  # let DB connection settle
    db = get_supabase()
    if not db:
        return
    from app.config import get_settings
    settings = get_settings()
    try:
        result = db.table("render_jobs").select("id, project_id").in_(
            "status", ["queued", "composing", "generating_media"]
        ).execute()
        stale = result.data or []
        if stale:
            logger.info("Recovering %d stale render jobs after restart", len(stale))
        for job in stale[:10]:
            asyncio.create_task(
                render._poll_render_progress(
                    job["project_id"], job["id"], job["id"], settings
                )
            )
    except Exception as e:
        logger.warning("Stale render recovery failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_recover_stale_render_jobs())
    yield

app = FastAPI(title="FrameFlow API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.getLogger(__name__).error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "error": type(exc).__name__},
    )

app.include_router(projects.router, prefix="/api/v1")
app.include_router(timeline.router, prefix="/api/v1")
app.include_router(upload.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
app.include_router(ai.presets_router, prefix="/api/v1")
app.include_router(render.router, prefix="/api/v1")
app.include_router(ws.router, prefix="/api/v1")
app.include_router(internal.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "service": "FrameFlow API",
        "status": "running",
        "version": "0.1.0",
        "docs": "/docs",
    }


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
