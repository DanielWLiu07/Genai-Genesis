# Person D - Render Pipeline Developer

## Your Scope
You own `services/render/` - Video generation (Kling 3.0), FFmpeg composition, and media processing.

## Key Files
- `app/main.py` - FastAPI app with CORS, logging, health check (ffmpeg detection)
- `app/config.py` - Settings (Kling keys, API service URL, Supabase, output dir)
- `app/services/kling.py` - Kling 3.0 API client (JWT auth, image & video gen, polling, caching)
- `app/services/ffmpeg.py` - FFmpeg video composition pipeline (transitions, text, music)
- `app/services/music.py` - Background music suggestion (curated library)
- `app/services/media.py` - Image processing (thumbnails, resize, title/end cards)
- `app/routers/generate.py` - `/render/generate` endpoint (background tasks, progress callbacks)
- `app/routers/compose.py` - `/render/compose`, `/render/jobs/{id}`, `/render/music/suggest`

## Implemented Features
- [x] Kling 3.0 API: JWT auth, image gen, video gen (5s/10s), async polling, SHA256 prompt caching
- [x] FFmpeg pipeline: clip standardization, xfade transitions (fade/dissolve/wipe/cut), text overlays with animations (fade_in/typewriter/slide_up), background music mixing, H.264/AAC encoding
- [x] Title card generation (Pillow, gradient background, centered text)
- [x] End card generation (FrameFlow branding)
- [x] Preview video generation (lower quality for fast preview)
- [x] Thumbnail extraction from video
- [x] Background task processing with progress callbacks to API service
- [x] In-memory render job status tracking with polling endpoint
- [x] Media download utility for remote URLs

## Remaining Tasks
1. Upload generated media to Supabase Storage (currently local only)
2. Pre-generate demo assets for the hackathon demo
3. Add real music files to the curated library (URLs are empty)
4. Stress test with multiple concurrent render jobs

## API Endpoints
```
POST /render/generate       → Generate single clip (image or video) — runs in background
POST /render/compose        → Compose final trailer from all clips — runs in background
GET  /render/jobs/{job_id}  → Poll render job status
POST /render/music/suggest  → Suggest background music by mood/genre
GET  /health                → Health check (includes ffmpeg availability)
```

## Running
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002
```

FFmpeg must be installed: `brew install ffmpeg`
