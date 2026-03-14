from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import generate, compose

app = FastAPI(title="FrameFlow Render Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate.router)
app.include_router(compose.router)

@app.get("/")
async def root():
    return {"service": "FrameFlow Render", "status": "running", "version": "0.1.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
