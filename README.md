# MangaMate — AI Book Trailer Generator

Upload a story. AI builds a cinematic trailer. You edit with a visual copilot.

> Built with [Railtracks](https://github.com/RailtownAI/railtracks) — a lightweight agentic framework for composing modular AI agents.

---

## What it does

1. **Upload** your manga or novel text (`.txt`)
2. **Analyze** — Gemini extracts key scenes, characters, themes, mood, and genre
3. **Plan** — AI generates a cinematic clip sequence with prompts and pacing
4. **Generate** — Kling 3.0 renders each scene as video (Gemini image as fallback)
5. **Edit** — Visual React Flow editor + AI copilot chat for fine-tuning
6. **Compose** — FFmpeg assembles the final trailer with music, transitions, and AMV effects

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  apps/web  (Next.js 15, port 3000)                      │
│  Dashboard · Editor · Timeline · Upload · Community     │
└───────────────────┬─────────────────────────────────────┘
                    │ REST + WebSocket
┌───────────────────▼─────────────────────────────────────┐
│  services/api  (FastAPI, port 8000)                     │
│  Projects · Timeline · Upload · WebSocket · Proxy       │
└──────────┬────────────────────────┬─────────────────────┘
           │ HTTP                   │ HTTP
┌──────────▼──────────┐  ┌──────────▼──────────────────────┐
│  services/ai        │  │  services/render                 │
│  (FastAPI, 8001)    │  │  (FastAPI, 8002)                 │
│  Gemini + Railtracks│  │  Kling 3.0 · Gemini · FFmpeg    │
│  analyze · plan     │  │  generate · compose · music     │
│  chat · suggest     │  │                                  │
└─────────────────────┘  └──────────────────────────────────┘
           │                         │
    ┌──────▼─────────────────────────▼──────┐
    │         Supabase (PostgreSQL)          │
    │  projects · timelines · render_jobs   │
    │  chat_history · storage buckets       │
    └────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| UI / Animations | React Flow, GSAP, Radix UI, Lucide React |
| State | Zustand |
| Backend | FastAPI, Pydantic, Python 3.11+ |
| AI (text) | Google Gemini 2.5-Flash |
| AI (agents) | Railtracks agentic framework |
| AI (images) | Google Gemini Image Generation |
| Video generation | Kling 3.0 (image-to-video) |
| Composition | FFmpeg |
| Audio analysis | librosa |
| Database | Supabase (PostgreSQL + Storage) |
| Real-time | WebSocket (FastAPI) |

---

## Getting Started

### Prerequisites

- Node.js 20+ and pnpm
- Python 3.11+
- FFmpeg installed and on `$PATH`
- Supabase project

### 1. Clone and install

```bash
git clone https://github.com/DanielWLiu07/Genai-Genesis.git
cd Genai-Genesis

# Frontend
pnpm install

# Backend services
cd services/api    && pip install -r requirements.txt
cd ../ai           && pip install -r requirements.txt
cd ../render       && pip install -r requirements.txt
```

### 2. Configure environment

Root `.env` (used by backend services):

```env
# Supabase
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-role-key>

# AI
GEMINI_API_KEY=<your-gemini-key>

# Kling 3.0 video generation
KLING_API_KEY=<your-kling-key>
KLING_API_SECRET=<your-kling-secret>

# Service URLs
AI_SERVICE_URL=http://localhost:8001
RENDER_SERVICE_URL=http://localhost:8002
API_SERVICE_URL=http://localhost:8000

# Next.js public
NEXT_PUBLIC_API_URL=http://localhost:8000
```

`apps/web/.env.local` (Next.js only reads env from its own directory):

```env
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-role-key>
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Apply database schema

```bash
supabase db push
```

Or run the SQL in `supabase/` manually against your project.

### 4. Start all services

```bash
# Terminal 1 — API gateway
cd services/api && uvicorn app.main:app --reload --port 8000

# Terminal 2 — AI service
cd services/ai  && uvicorn app.main:app --reload --port 8001

# Terminal 3 — Render service
cd services/render && uvicorn app.main:app --reload --port 8002

# Terminal 4 — Frontend
cd apps/web && pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
Genai-Genesis/
├── apps/
│   └── web/                        # Next.js frontend
│       ├── src/
│       │   ├── app/                # Pages: dashboard, editor, timeline, upload, community
│       │   ├── components/
│       │   │   ├── editor/         # FlowEditor, SceneNode, TimelineStrip, ClipDetailPanel
│       │   │   └── chat/           # ChatPanel (AI copilot)
│       │   ├── stores/             # Zustand: project-store, timeline-store
│       │   └── lib/                # api.ts, supabase.ts
│       └── public/                 # Assets, fonts, background images
│
├── services/
│   ├── api/                        # Main gateway (port 8000)
│   │   └── app/routers/            # projects, timeline, render, upload, ai, ws, internal
│   │
│   ├── ai/                         # AI service (port 8001)
│   │   └── app/
│   │       ├── agents/             # CopilotAgent, TrailerPipelineAgent (Railtracks)
│   │       ├── routers/            # analyze, plan, chat, suggest, presets
│   │       └── services/           # story_analyzer, trailer_planner, tools (16), suggestions
│   │
│   └── render/                     # Render service (port 8002)
│       └── app/
│           ├── routers/            # generate, compose, music
│           └── services/           # kling, gemini_image, ffmpeg, prompt_builder, media
│
├── supabase/                       # Schema + migrations
├── packages/shared/                # Shared TypeScript types
└── docs/                           # Architecture docs
```

---

## Key Flows

### Story → Trailer Pipeline

```
Upload .txt
    ↓
Analyze (Gemini)
    → extracts themes, characters (with appearance), 8–12 key scenes
    → stored in projects.analysis JSONB
    ↓
Plan Trailer
    → analysis → clip sequence (type, duration_ms, prompt, transition_type)
    → written to timelines table
    ↓
Visual Editor (React Flow)
    → drag-drop reordering, duration editing, transition cycling
    → AI copilot chat for natural language edits ("make it faster", "add a flash effect")
    ↓
Generate All Images (Gemini, sequential)
    → each clip passes prev thumbnail as scene context
    → style seed anchors visual consistency
    ↓
Compile Videos (Kling 3.0, async)
    → image-to-video per clip, WebSocket updates gen_status
    → falls back to Gemini image if Kling fails
    ↓
Edit Timeline (/timeline)
    → place AMV effects on beat grid, cycle transitions, configure BPM
    ↓
Render (FFmpeg)
    → concat clips + title/end cards + music + effects → MP4
```

### AI Copilot Tools (16 total)

| Tool | What it does |
|------|-------------|
| `add_clip` | Insert a new scene |
| `remove_clip` | Delete a scene by ID |
| `update_clip` | Change prompt, duration, type, text |
| `reorder_clips` | Rearrange clip order |
| `update_scene_duration` | Set duration in seconds |
| `set_transition` | cut / fade / dissolve / wipe |
| `regenerate_clip` | Mark clip for regeneration |
| `set_music` | Set background music track |
| `update_settings` | Style, aspect ratio, fps |
| `set_shot_type` | continuous / cut |
| `add_amv_effect` | Place flash / zoom / shake / echo etc. |
| `remove_amv_effect` | Remove an effect by ID |
| `set_bpm` | Set BPM for beat map |
| `auto_amv` | Auto-generate beat-synced effects |
| `trigger_generate_clip` | Kick off generation for a specific clip |
| `bulk_update_clips` | Batch update multiple clips |

---

## AMV Timeline Editor

The timeline editor (`/project/[id]/timeline`) provides:

| Feature | Description |
|---------|-------------|
| Effect palette | 11 types: flash white/black, zoom burst, shake, echo, speed ramp, chromatic aberration, panel split, reverse, glitch, strobe |
| Beat ruler | BPM grid overlay — configurable BPM input |
| Transition track | Per-clip badges; click to cycle cut → fade → dissolve → wipe |
| Auto AMV | One-click beat-synced effect placement across the whole timeline |
| Zoom controls | Variable px/ms timeline scale |
| Copilot | Chat panel available in editor for natural language control |

---

## API Reference

### API Gateway (port 8000)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/projects` | List projects |
| POST | `/api/v1/projects` | Create project |
| GET/PATCH/DELETE | `/api/v1/projects/{id}` | Project CRUD |
| GET/PUT | `/api/v1/projects/{id}/timeline` | Timeline read/write |
| POST | `/api/v1/projects/{id}/upload` | Upload book text |
| POST | `/api/v1/projects/{id}/upload-audio` | Upload + analyze audio |
| POST | `/api/v1/projects/{id}/analyze` | Analyze story |
| POST | `/api/v1/projects/{id}/plan-trailer` | Plan trailer |
| POST | `/api/v1/projects/{id}/chat` | Chat with copilot |
| POST | `/api/v1/projects/{id}/generate-clip` | Generate a clip |
| POST | `/api/v1/projects/{id}/render` | Compose final trailer |
| GET | `/api/v1/projects/{id}/render/{job_id}` | Poll render job |
| WS | `/api/v1/ws/{project_id}` | Real-time updates |

### AI Service (port 8001)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai/analyze` | Narrative analysis |
| POST | `/ai/plan-trailer` | Generate clip plan |
| POST | `/ai/pipeline` | Full multi-agent pipeline (analyze → plan → quality) |
| POST | `/ai/chat` | Copilot tool calling |
| POST | `/ai/suggest` | Timeline improvement suggestions |
| GET | `/ai/presets` | Style presets (cinematic, manga, noir, horror, romance, fantasy, sci-fi, comic) |

### Render Service (port 8002)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/render/generate` | Generate single clip (image or video) |
| POST | `/render/compose` | Compose final trailer |
| GET | `/render/jobs/{job_id}` | Job status |

---

## Testing

```bash
# API service
cd services/api && pytest

# AI service
cd services/ai && pytest

# Frontend stores
cd apps/web && pnpm test
```

---

## Known Limitations

- **No authentication** — Supabase RLS is permissive; all projects are publicly accessible
- **No temp file cleanup** — `/tmp/renders` grows unbounded on the render service
- **In-memory WebSocket manager** — connections lost on API restart
- **Music suggestions** — hardcoded example tracks, no real ML
- **Community gallery** — frontend route exists, no backend implementation

---

## License

MIT
