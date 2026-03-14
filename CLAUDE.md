# FrameFlow - AI Book Trailer Generator

## Project Overview
FrameFlow transforms written stories into cinematic book trailers using AI narrative analysis and interactive visual editing. Think "Cursor + Premiere" for book trailers.

## Tech Stack
- **Frontend**: Next.js 14 (App Router) + Radix UI + Tailwind CSS + React Flow + Zustand
- **Backend API**: FastAPI (Python) on port 8000
- **AI Service**: FastAPI + Gemini on port 8001
- **Render Service**: FastAPI + Kling 3.0 + FFmpeg on port 8002
- **Database**: Supabase (Postgres + Storage)

## Repo Structure
```
apps/web/          → Frontend (Person A)
services/api/      → Backend API gateway (Person B)
services/ai/       → AI services - analysis, planning, chatbot (Person C)
services/render/   → Video generation & composition (Person D)
packages/shared/   → Shared types (TS + Python)
docs/              → Documentation
```

## Running Locally
```bash
# Frontend
cd apps/web && pnpm dev

# Backend (each in separate terminal)
cd services/api && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
cd services/ai && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8001
cd services/render && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8002
```

## Environment Variables
Copy `.env.example` to `.env` and fill in API keys.

## Key Architecture
- Timeline JSON is the single source of truth
- React Flow renders from timeline state (Zustand store)
- Chatbot uses tool-calling to modify timeline (never direct UI mutation)
- Backend API proxies to AI and Render services
- All inter-service communication is HTTP

## Hackathon Tracks
- Google: Community Impact (democratizes storytelling)
- Bitdeer: Production-Ready AI Tool (full pipeline)
- Education: Teaches narrative structure
- Moorcheh: Efficient Memory (timeline state management)
