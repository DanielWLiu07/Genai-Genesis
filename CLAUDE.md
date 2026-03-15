# Lotus - AI Book Trailer Generator

## Stack
- Frontend: Next.js 14 (App Router), Radix UI, Tailwind, React Flow, Zustand, GSAP
- API: FastAPI port 8000
- AI: FastAPI + Gemini port 8001
- Render: FastAPI + Kling 3.0 + FFmpeg port 8002
- DB: Supabase (Postgres + Storage)

## Run
```bash
cd apps/web && pnpm dev
cd services/api && uvicorn app.main:app --reload --port 8000
cd services/ai && uvicorn app.main:app --reload --port 8001
cd services/render && uvicorn app.main:app --reload --port 8002
```

## Theme
Black-and-white manga style. White paper (#fff) bg, black ink (#111) borders, violet (#a855f7) accents only.
