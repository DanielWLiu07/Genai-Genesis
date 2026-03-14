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

## Implementation Status

### Person A (Frontend) — ~90% complete
- [x] Dashboard with hero, features, project list
- [x] Project creation form with file upload
- [x] React Flow editor with custom SceneNode
- [x] Zustand timeline store (clip CRUD, reorder, music, settings)
- [x] API client for all backend endpoints (incl. chat JSON, render status polling)
- [x] Chat panel with full tool call handler (add/remove/update/reorder/transition/regenerate)
- [x] Export button with render job polling and progress display
- [x] Timeline loading from backend
- [ ] Visual polish, DnD, keyboard shortcuts (nice-to-have)

### Person B (Backend API) — ~95% complete
- [x] FastAPI app with CORS, router mounting
- [x] Project CRUD (with mock fallback)
- [x] Timeline CRUD endpoints
- [x] File upload with Supabase Storage + book_text extraction
- [x] AI service proxy (analyze, plan-trailer, chat)
- [x] Render service proxy (generate-clip, render, job status polling with fallback)
- [x] WebSocket connection manager
- [x] Pydantic models for all entities
- [x] Internal callback endpoints (clip-status, render-progress) → WebSocket broadcast
- [x] Chat history persistence (save/load from Supabase)
- [x] Book text retrieval from DB for re-analysis
- [ ] Wire real Supabase connection (works when configured)

### Person C (AI Services) — ~95% complete
- [x] Gemini client wrapper (JSON + text generation, retry logic)
- [x] Story analyzer (extracts narrative structure, scenes, characters)
- [x] Trailer planner (generates 8-12 clips with pacing)
- [x] Tool definitions (add/remove/update clip, reorder, transitions)
- [x] Chat endpoint with tool calling support
- [ ] Uncomment tool calling in chat (ready, needs Gemini key)
- [ ] Style presets, error recovery

### Person D (Render Pipeline) — ~90% complete
- [x] Kling 3.0 API client with JWT auth, polling, caching
- [x] Image generation (prompt → Kling API → download → return)
- [x] Video generation (text2video with 5s/10s duration)
- [x] FFmpeg composition pipeline:
  - [x] Clip standardization (resize, duration, fps normalization)
  - [x] Transitions (xfade: fade, dissolve, wipe, cut)
  - [x] Text overlays with animations (fade_in, typewriter, slide_up)
  - [x] Background music mixing with volume control
  - [x] H.264/AAC encoding
- [x] Title card generation (Pillow, gradient backgrounds)
- [x] End card generation
- [x] Thumbnail generation from media
- [x] Background task processing with progress callbacks
- [x] Render job status tracking (GET /render/jobs/{job_id})
- [x] Preview video generation (lower quality)
- [x] Music suggestion endpoint
- [ ] Supabase Storage upload for generated media
- [ ] Demo assets / pre-generated content

## Integration Points (Cross-Service)
- Frontend → API: All HTTP calls go through API service (port 8000)
- API → AI: Proxied via `/api/v1/projects/{id}/analyze`, `/plan-trailer`, `/chat`
- API → Render: Proxied via `/api/v1/projects/{id}/generate-clip`, `/render`
- API → Render: Now passes project title/author for title cards
- Render → API: Progress callbacks to `/api/v1/internal/clip-status` and `/render-progress`
- API → Frontend: WebSocket at `/api/v1/ws/{project_id}` for real-time updates
- Render service polls Kling API and notifies API service on completion

## Core User Flow
1. Create project → 2. Upload story text → 3. AI analyzes story → 4. AI generates trailer plan → 5. Timeline appears in React Flow editor → 6. User edits via drag-and-drop OR chatbot → 7. Generate clip visuals → 8. Render final trailer → 9. Export video

## Minimum Viable Demo
Upload book → AI analyzes → Trailer plan generated → Clips visible in editor → Chat with copilot to modify → Generate 1-2 scenes → Show rendered output

## Prize Track Pitches
- **Google Community Impact**: Democratizes professional book trailers for indie authors
- **Bitdeer Production-Ready**: Full AI pipeline with editing, generation, and rendering
- **Education**: Teaches narrative structure, pacing, and visual storytelling
- **Moorcheh Efficient Memory**: Timeline state as single source of truth, efficient state management
