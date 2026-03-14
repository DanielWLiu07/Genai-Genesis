# Person C - AI Services Developer

## Your Scope
You own `services/ai/` - Gemini-powered AI services for story analysis, trailer planning, and chatbot copilot.

## Key Files
- `app/main.py` - FastAPI app
- `app/services/gemini.py` - Gemini API client wrapper
- `app/services/story_analyzer.py` - Extract narrative structure from text
- `app/services/trailer_planner.py` - Generate trailer timeline from analysis
- `app/services/tools.py` - Tool definitions for chatbot copilot
- `app/routers/analyze.py` - `/ai/analyze` endpoint
- `app/routers/plan.py` - `/ai/plan-trailer` endpoint
- `app/routers/chat.py` - `/ai/chat` endpoint with tool calling
- `app/prompts/` - System prompt templates

## Your Tasks (Priority Order)
1. Get Gemini API key working and test basic generation
2. Refine story analysis prompt - must return valid JSON with characters, scenes, moods
3. Refine trailer planner prompt - must output 8-12 clips with cinematic prompts
4. Implement full chatbot with Gemini function calling (tool use)
5. Test tool calls: add_clip, remove_clip, update_clip, reorder_clips, set_transition
6. Add "smart suggestions" endpoint - analyze timeline and suggest improvements
7. Add style presets (horror, romance, thriller, fantasy trailer styles)
8. Prompt iteration with real books - test with 3-4 different genres
9. Error handling: malformed JSON from Gemini, retry logic, fallbacks

## Tool Calling Architecture
The chatbot uses Gemini's function calling feature. Tools are defined in `app/services/tools.py`.
- Frontend sends: { message, timeline_state, history }
- Gemini receives: system prompt + timeline context + user message + tool definitions
- Gemini returns: text response + function_call(s)
- Response sent back as: { role, content, tool_calls: [{tool_name, arguments}] }
- Frontend applies tool_calls to Zustand timeline store

## Available Tools
- `add_clip` - Add new clip (prompt, duration_ms, type, text, order)
- `remove_clip` - Remove by clip_id
- `update_clip` - Modify clip properties
- `update_scene_duration` - Change duration
- `reorder_clips` - Reorder by clip_ids array
- `set_transition` - Set transition type between clips
- `regenerate_clip` - Re-generate visual with new/same prompt

## Prompt Engineering Tips
- Scene prompts should be CINEMATIC: describe camera angle, lighting, depth of field, color grading
- Example: "Wide establishing shot of a misty Victorian London street at dusk, gas lamps glowing amber, cobblestones wet with rain, cinematographic style, dramatic lighting, 4K"
- Trailer pacing: hook (2-3s) → build (3-4 clips) → climax (1-2 clips) → end hook (1 clip)
- Support both books AND manga/comics in analysis

## Running
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```
