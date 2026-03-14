# Person A - Frontend Developer

## Your Scope
You own `apps/web/` - the Next.js 14 frontend with Radix UI, Tailwind, React Flow, and Zustand.

## Key Files
- `src/stores/timeline-store.ts` - Central timeline state (THE source of truth on frontend)
- `src/stores/project-store.ts` - Project list and current project
- `src/components/editor/FlowEditor.tsx` - React Flow canvas
- `src/components/editor/SceneNode.tsx` - Custom React Flow node
- `src/components/chat/ChatPanel.tsx` - AI copilot chat interface
- `src/lib/api.ts` - Typed API client for backend
- `src/app/page.tsx` - Dashboard
- `src/app/project/new/page.tsx` - New project creation
- `src/app/project/[id]/page.tsx` - Editor page (main workspace)

## Your Tasks (Priority Order)
1. Make dashboard list real projects from API (`GET /api/v1/projects`)
2. Wire up project creation (`POST /api/v1/projects`) and file upload (`POST /api/v1/projects/{id}/upload`)
3. Make the editor page load timeline from API and render in React Flow
4. Implement chat panel with real SSE streaming from `/api/v1/projects/{id}/chat`
5. Handle tool_calls from chat responses - apply mutations to timeline store
6. Add clip detail panel (click node → show properties, edit, regenerate)
7. Add drag-and-drop reordering in React Flow
8. Build export/render page with progress tracking
9. Polish: loading states, animations, error handling, empty states

## Architecture Rules
- Timeline store is source of truth. React Flow DERIVES from it.
- Chat tool calls → timeline store mutations → React Flow re-renders
- Never mutate React Flow state directly from chat
- Use Zustand actions for ALL timeline mutations
- API calls go through `src/lib/api.ts`

## API Endpoints You Call
```
GET    /api/v1/projects              → list projects
POST   /api/v1/projects              → create project
GET    /api/v1/projects/{id}         → get project
GET    /api/v1/projects/{id}/timeline → get timeline
PUT    /api/v1/projects/{id}/timeline → save timeline
POST   /api/v1/projects/{id}/upload   → upload book file
POST   /api/v1/projects/{id}/analyze  → trigger AI analysis
POST   /api/v1/projects/{id}/plan-trailer → generate trailer plan
POST   /api/v1/projects/{id}/chat     → chat with copilot
POST   /api/v1/projects/{id}/generate-clip → generate media for clip
POST   /api/v1/projects/{id}/render   → render final trailer
WS     /api/v1/ws/{project_id}        → real-time updates
```

## Styling
- Use Radix UI components (@radix-ui/themes + primitives)
- Tailwind CSS for layout and custom styling
- Dark theme (zinc-950 bg, violet accent)
- lucide-react for icons
