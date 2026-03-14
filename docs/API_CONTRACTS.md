# API Contracts

## Backend API (port 8000) → Frontend calls these

### Projects
```
POST   /api/v1/projects                     Create project
GET    /api/v1/projects                     List projects
GET    /api/v1/projects/{id}                Get project
PATCH  /api/v1/projects/{id}                Update project
DELETE /api/v1/projects/{id}                Delete project
```

### Upload
```
POST   /api/v1/projects/{id}/upload         Upload book file (multipart)
```

### Timeline
```
GET    /api/v1/projects/{id}/timeline       Get timeline
PUT    /api/v1/projects/{id}/timeline       Replace timeline
POST   /api/v1/projects/{id}/clips          Add clip
DELETE /api/v1/projects/{id}/clips/{clipId} Remove clip
POST   /api/v1/projects/{id}/clips/reorder  Reorder clips
```

### AI (proxied to port 8001)
```
POST   /api/v1/projects/{id}/analyze        Analyze book text
POST   /api/v1/projects/{id}/plan-trailer   Generate trailer plan
POST   /api/v1/projects/{id}/chat           Chat with copilot
  Body: { message, timeline, history }
  Response: { role, content, tool_calls: [{tool_name, arguments}] }
```

### Render (proxied to port 8002)
```
POST   /api/v1/projects/{id}/generate-clip  Generate media for clip
POST   /api/v1/projects/{id}/render         Start render job
```

### WebSocket
```
WS     /api/v1/ws/{project_id}              Real-time updates
  Server messages: clip_updated, generation_progress, render_progress, timeline_updated
```

## Internal: Backend → AI Service (port 8001)
```
POST   /ai/analyze        { project_id, book_text }
POST   /ai/plan-trailer   { project_id, analysis, settings }
POST   /ai/chat            { project_id, message, timeline, history }
```

## Internal: Backend → Render Service (port 8002)
```
POST   /render/generate      { clip_id, prompt, type, aspect_ratio, duration_ms }
POST   /render/compose       { project_id, timeline }
POST   /render/music/suggest { mood, genre, duration_ms }
```
