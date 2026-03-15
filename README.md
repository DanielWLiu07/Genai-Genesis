# Lotus — AI Book Trailer Generator

> Built with [Railtracks](https://github.com/RailtownAI/railtracks) — a Canadian agentic AI framework.

Turn any book, novel, or manga into a cinematic, beat-synced video trailer in minutes using multi-agent AI, generative video, and an AMV timeline editor.

---

## What it does

1. **Upload** a book/manga PDF or paste text
2. **AI Pipeline** (Railtracks) analyzes the story and auto-generates a cinematic clip plan — genre, mood, pacing, character extraction, and a beat-synced AMV effect map
3. **Generate** still frames (Gemini Imagen) or animated clips (Kling 3.0) for each scene
4. **Edit** the timeline with natural language via the AI Copilot (20 tools, one message)
5. **Render** a compiled H.264 trailer with music, transitions, and 40+ visual effects
6. **Share** to the community Reels feed or copy a direct link

---

## Track Pitches

**Railtracks:** Two Railtracks agents — one pipelines a full cinematic plan from raw text, one gives the LLM 20 tools to edit the timeline in real time. The framework handles orchestration, retries, and tool dispatch so the product logic stays clean.

**Community Impact:** Indie authors and manga creators get Hollywood-quality trailers in minutes, then share them in a creator community — no budget, no video editing skills required.

**Education:** Upload any story and watch an AI surface its narrative structure as a visual plan you can collaboratively shape — story analysis becomes story creation.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), Radix UI, Tailwind, React Flow, Zustand, GSAP |
| API | FastAPI (port 8000) |
| AI Agents | FastAPI + Railtracks + Gemini 2.5 Flash (port 8001) |
| Render | FastAPI + Kling 3.0 + FFmpeg (port 8002) |
| Database | Supabase (Postgres + Storage) |

### Railtracks Usage

- **TrailerPipelineAgent** — 4-stage orchestration: analyze → plan → quality review → AMV suggest. Runs fully autonomously from a single user upload.
- **CopilotAgent** — 20 registered `@rt.function_node` tools. The LLM autonomously picks which tools to call per message: add/remove/reorder clips, place beat-synced effects by instrument (hihats, kicks, snares), trigger video generation, set BPM, bulk update.

```python
CopilotAgent = rt.agent_node(
    name="Lotus Copilot",
    tool_nodes={ add_clip, remove_clip, add_amv_effect, add_amv_effects_on_beats, auto_amv, ... },
    llm=GeminiLLM("gemini-2.5-flash"),
    system_message=SystemMessage(SYSTEM),
    max_tool_calls=20,
)
```

---

## Prerequisites

- Python 3.11+
- Node.js 18+ and [pnpm](https://pnpm.io/)
- FFmpeg (`brew install ffmpeg` / `apt install ffmpeg`)

Install Python deps for each service:

```bash
pip install -r services/api/requirements.txt
pip install -r services/ai/requirements.txt   # includes railtracks
pip install -r services/render/requirements.txt
```

Install frontend deps:

```bash
cd apps/web && pnpm install
```

---

## Run

```bash
# Frontend
cd apps/web && pnpm dev

# API service
cd services/api && uvicorn app.main:app --reload --port 8000

# AI service (Railtracks agents)
cd services/ai && uvicorn app.main:app --reload --port 8001

# Render service
cd services/render && uvicorn app.main:app --reload --port 8002
```

### Environment variables

Create a `.env` file at the repo root:

```
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Google AI
GEMINI_API_KEY=

# Kling video generation (render service)
KLING_API_KEY=
KLING_API_SECRET=

# Fal.ai image generation (render service)
FAL_API_KEY=

# Optional: override render output directory (default: /tmp/renders)
RENDER_OUTPUT_DIR=
```

---

## Features

- **Multi-agent pipeline** — story analysis, clip planning, quality review, AMV auto-generation in one shot
- **AI Copilot** — natural language timeline editing with 20 tools powered by Railtracks + Gemini
- **Beat-synced effects** — 40+ AMV effects (flash, shake, glitch, manga ink, etc.) keyed to hihats, kicks, snares, crashes, and energy peaks from audio analysis
- **Kling 3.0 video generation** — animated scene clips with cinematic prompts
- **Community feed** — TikTok-style Reels for discovering and sharing trailers
- **Publish control** — explicit publish to community, shareable link after render
