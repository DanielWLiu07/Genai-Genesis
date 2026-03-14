# Architecture

## System Diagram
```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend API   │────▶│  AI Service  │
│  Next.js     │     │   FastAPI:8000  │     │  FastAPI:8001│
│  :3000       │◀────│                 │◀────│  Gemini LLM  │
└──────────────┘     │                 │     └──────────────┘
       │             │   Supabase DB   │     ┌──────────────┐
       │             │   + Storage     │────▶│Render Service│
       ▼             │                 │◀────│  FastAPI:8002│
  React Flow         └─────────────────┘     │ Kling + FFmpeg│
  + Zustand                                  └──────────────┘
  + Chat Panel
```

## Data Flow
1. User uploads story text → Backend stores in Supabase Storage
2. Backend forwards text to AI Service → Gemini analyzes narrative
3. Analysis stored in project → User triggers trailer planning
4. AI generates timeline JSON → Stored in Supabase, sent to frontend
5. Frontend renders timeline as React Flow nodes
6. User edits via drag-and-drop OR chatbot
7. Chatbot sends message to AI → Gemini returns tool_calls
8. Frontend applies tool_calls to Zustand store → React Flow re-renders
9. User triggers clip generation → Backend proxies to Render Service
10. Kling generates visuals → Stored in Supabase Storage
11. User triggers final render → FFmpeg composes video → Export

## Timeline State Model
```json
{
  "clips": [
    {
      "id": "uuid",
      "order": 0,
      "type": "image|video|text_overlay|transition",
      "duration_ms": 3000,
      "prompt": "cinematic visual description",
      "generated_media_url": "https://...",
      "thumbnail_url": "https://...",
      "text": "optional overlay",
      "transition_type": "fade|dissolve|wipe|cut",
      "gen_status": "pending|generating|done|error",
      "position": { "x": 0, "y": 100 }
    }
  ],
  "music_track": { "url": "...", "name": "...", "volume": 0.8 },
  "settings": { "resolution": "1080p", "aspect_ratio": "16:9", "fps": 24 }
}
```

## Tool Calling Flow
```
User types in chat → POST /api/v1/projects/{id}/chat
  → Backend proxies to AI Service POST /ai/chat
    → Gemini processes with tool definitions
    → Returns: { content: "I'll slow down the intro", tool_calls: [{tool_name: "update_scene_duration", arguments: {scene_id: "...", duration_sec: 5}}] }
  → Backend returns response to frontend
→ Frontend displays text in chat
→ Frontend applies each tool_call to timeline store
→ React Flow re-renders with updated state
→ Timeline syncs back to backend
```
