# Person D - Render Pipeline Developer

## Your Scope
You own `services/render/` - Video generation (Kling 3.0), FFmpeg composition, and media processing.

## Key Files
- `app/main.py` - FastAPI app
- `app/services/kling.py` - Kling 3.0 API client (image & video generation)
- `app/services/ffmpeg.py` - FFmpeg video composition pipeline
- `app/services/music.py` - Background music suggestion
- `app/services/media.py` - Image processing (thumbnails, resize)
- `app/routers/generate.py` - `/render/generate` endpoint
- `app/routers/compose.py` - `/render/compose` and `/render/music/suggest` endpoints

## Your Tasks (Priority Order)
1. Get Kling 3.0 API working - implement actual API calls in `kling.py`
2. Implement image generation flow: prompt → Kling API → download → store
3. Implement video generation flow (same but for short clips)
4. Build FFmpeg composition pipeline:
   - Concatenate clips with configurable durations
   - Add cross-dissolve/fade transitions
   - Add text overlays with animations (fade_in, typewriter, slide_up)
   - Mix background music with volume control
   - Output encoding (H.264, AAC)
5. Implement thumbnail generation from generated media
6. Add progress reporting (callback to API service via HTTP)
7. Add title card and end card generation
8. Test full render pipeline end-to-end
9. Optimize render speed, add caching for duplicate prompts

## Kling 3.0 Integration
- API docs: Check Kling's developer documentation
- Flow: Submit generation request → poll for completion → download result
- Support both image and video generation
- Handle rate limiting and retry logic
- Cache generated media (same prompt = same output)

## FFmpeg Pipeline
The composition pipeline takes a list of clips and produces a single video:
1. For each clip: resize to target resolution, set duration
2. Apply transitions between clips (crossfade, dissolve, wipe)
3. Add text overlays using drawtext filter
4. Mix background music track
5. Encode to H.264/AAC MP4
6. Generate preview (lower quality) and final (full quality)

## API Endpoints
```
POST /render/generate      → Generate single clip (image or video)
POST /render/compose       → Compose final trailer from all clips
POST /render/music/suggest → Suggest background music by mood/genre
```

## Running
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002
```

FFmpeg must be installed: `brew install ffmpeg`
