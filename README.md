# FrameFlow

**AI Book Trailer Generator** - Transform written stories into cinematic book trailers using AI narrative analysis and interactive visual editing.

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd Genai-Genesis

# Frontend
cd apps/web && pnpm install && pnpm dev

# Backend (each in separate terminal)
cd services/api && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
cd services/ai && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8001
cd services/render && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8002
```

Copy `.env.example` to `.env` and add your API keys.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system design.
See [docs/PLAN.md](docs/PLAN.md) for hackathon timeline.
See [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) for API reference.

Each service directory has a `CLAUDE.md` with role-specific context for AI-assisted development.

## Team
| Role | Directory | Port |
|------|-----------|------|
| Frontend | `apps/web/` | 3000 |
| Backend API | `services/api/` | 8000 |
| AI Services | `services/ai/` | 8001 |
| Render Pipeline | `services/render/` | 8002 |
