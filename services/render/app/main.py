import logging
import shutil
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import generate, compose

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

app = FastAPI(title="FrameFlow Render Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate.router)
app.include_router(compose.router)

# Serve generated images/videos as static files — avoids storing huge base64 in DB
_output_dir = os.environ.get("RENDER_OUTPUT_DIR", "/tmp/renders")
os.makedirs(_output_dir, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=_output_dir), name="outputs")


@app.get("/")
async def root():
    return {"service": "FrameFlow Render", "status": "running", "version": "0.1.0"}


@app.get("/health")
async def health():
    ffmpeg_available = shutil.which("ffmpeg") is not None
    return {"status": "healthy", "ffmpeg": ffmpeg_available}
