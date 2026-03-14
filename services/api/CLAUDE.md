# Person B - Backend API Developer

## Your Scope
You own `services/api/` - the FastAPI backend that serves as the API gateway.

## Key Files
- `app/main.py` - FastAPI app with CORS and router mounting
- `app/config.py` - Settings from env vars
- `app/db.py` - Supabase client initialization
- `app/routers/projects.py` - Project CRUD
- `app/routers/timeline.py` - Timeline CRUD
- `app/routers/upload.py` - File upload to Supabase Storage
- `app/routers/ai.py` - Proxy to AI service (port 8001)
- `app/routers/render.py` - Proxy to render service (port 8002)
- `app/routers/ws.py` - WebSocket for real-time updates
- `app/models/` - Pydantic request/response models

## Your Tasks (Priority Order)
1. Set up Supabase project and run `supabase/schema.sql`
2. Make project CRUD work with real Supabase (currently has mock fallback)
3. Make timeline CRUD work with real Supabase
4. Implement file upload → Supabase Storage → trigger analysis flow
5. Wire up AI proxy to actually forward book text to AI service for analysis
6. Implement async clip generation: frontend triggers → proxy to render → push progress via WebSocket
7. Implement full render job tracking (status, progress, output URL)
8. Add chat history persistence in Supabase
9. Add input validation and error handling

## Architecture Rules
- This service is the ONLY service the frontend talks to
- Proxy all AI requests to `AI_SERVICE_URL` (port 8001)
- Proxy all render requests to `RENDER_SERVICE_URL` (port 8002)
- Use WebSocket to push real-time progress updates
- Timeline JSON is stored as JSONB in Supabase
- Use `httpx.AsyncClient` for inter-service HTTP calls

## Database Schema
See `supabase/schema.sql` for the full schema. Key tables:
- `projects` - Project metadata + analysis (JSONB)
- `timelines` - One per project, stores clips as JSONB array
- `render_jobs` - Render job tracking
- `chat_history` - Chat message persistence

## Running
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
