# FrameFlow - Hackathon Plan

## Team Roles
| Person | Role | Directory | Port |
|--------|------|-----------|------|
| A | Frontend (Next.js + React Flow) | `apps/web/` | 3000 |
| B | Backend API (FastAPI + Supabase) | `services/api/` | 8000 |
| C | AI Services (Gemini) | `services/ai/` | 8001 |
| D | Render Pipeline (Kling + FFmpeg) | `services/render/` | 8002 |

## Phase Timeline (36 hours)

### Phase 0: Setup (Hours 0-2) - ALL
- Everyone: Clone repo, install deps, set up env vars
- Person B: Create Supabase project, run schema.sql
- Everyone: Verify their service starts and health endpoint works

### Phase 1: Core Plumbing (Hours 2-10)
**Person A**: Dashboard, upload page, React Flow editor shell, Zustand stores, API client
**Person B**: Project CRUD, timeline CRUD, file upload, WebSocket, proxy routes
**Person C**: Gemini client, story analysis endpoint, trailer planner endpoint
**Person D**: Kling client, single clip generation, FFmpeg service skeleton

### Phase 2: Integration (Hours 10-20)
**Person A**: Chat panel with streaming, tool-call handling, clip detail panel, progress indicators
**Person B**: Wire real AI/render proxying, async generation flow, render job tracking
**Person C**: Chatbot with full tool calling, prompt iteration, smart suggestions
**Person D**: Robust Kling integration, full FFmpeg composition, music mixing

### Phase 3: Polish (Hours 20-30)
**Person A**: Visual polish, drag-and-drop, keyboard shortcuts, landing page
**Person B**: Performance, caching, deploy prep, end-to-end testing
**Person C**: Final prompt tuning, style presets, error recovery
**Person D**: Transitions, title/end cards, aspect ratio support, demo assets

### Phase 4: Demo Prep (Hours 30-36)
- Full rehearsal with demo book
- Prepare demo script and slides
- Pre-generate backup assets
- Final bug fixes

## Core User Flow
1. Create project → 2. Upload story text → 3. AI analyzes story → 4. AI generates trailer plan → 5. Timeline appears in React Flow editor → 6. User edits via drag-and-drop OR chatbot → 7. Generate clip visuals → 8. Render final trailer → 9. Export video

## Minimum Viable Demo
Upload book → AI analyzes → Trailer plan generated → Clips visible in editor → Chat with copilot to modify → Generate 1-2 scenes → Show rendered output

## Prize Track Pitches
- **Google Community Impact**: Democratizes professional book trailers for indie authors
- **Bitdeer Production-Ready**: Full AI pipeline with editing, generation, and rendering
- **Education**: Teaches narrative structure, pacing, and visual storytelling
- **Moorcheh Efficient Memory**: Timeline state as single source of truth, efficient state management
