from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import projects, timeline, upload, ai, render, ws

app = FastAPI(title="FrameFlow API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers under /api/v1
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
    return {"status": "healthy"}
