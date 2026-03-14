from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import analyze, plan, chat

app = FastAPI(title="FrameFlow AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(plan.router)
app.include_router(chat.router)

@app.get("/")
async def root():
    return {"service": "FrameFlow AI", "status": "running", "version": "0.1.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
