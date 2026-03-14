import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { supabase } from '@/lib/supabase';

const SYSTEM = `You are MangaMate's AI copilot — a cinematic trailer editor and AMV specialist.
You help users edit their manga/book trailer through natural language. Think like a professional
AMV editor who understands both cinematic storytelling AND fast-paced anime music video editing.

ALWAYS use tools to apply changes — never just describe what to do.
Be concise: 1-2 sentences max explaining what you did.
Call multiple tools per response for complex edits.

SCENE PACING: Hook 2-3s cut | Establishing 3-4s dissolve | Action 1.5-2.5s cut | Emotional 4-5s dissolve
AMV: flash_white/black on strong beats 100-200ms intensity 0.8-1.0 | zoom_burst every 4th beat 200-300ms
     chromatic for tension 200-400ms | glitch digital/sci-fi 150-300ms | strobe climax 50-100ms
SHOT TYPE: continuous = same scene flowing | cut = new scene
PROMPTS: always include camera angle, lighting, mood, color palette, atmosphere, anime/manga style.`;

const TOOLS = [
  { name: 'add_clip', description: 'Add a new scene/clip to the trailer timeline.', parameters: { type: SchemaType.OBJECT, properties: { prompt: { type: SchemaType.STRING }, duration_ms: { type: SchemaType.INTEGER }, type: { type: SchemaType.STRING }, text: { type: SchemaType.STRING }, order: { type: SchemaType.INTEGER }, transition_type: { type: SchemaType.STRING } }, required: ['prompt'] } },
  { name: 'remove_clip', description: 'Remove a clip from the timeline by its UUID.', parameters: { type: SchemaType.OBJECT, properties: { clip_id: { type: SchemaType.STRING } }, required: ['clip_id'] } },
  { name: 'update_clip', description: 'Update properties of an existing clip.', parameters: { type: SchemaType.OBJECT, properties: { clip_id: { type: SchemaType.STRING }, prompt: { type: SchemaType.STRING }, duration_ms: { type: SchemaType.INTEGER }, text: { type: SchemaType.STRING }, transition_type: { type: SchemaType.STRING } }, required: ['clip_id'] } },
  { name: 'reorder_clips', description: 'Reorder clips — provide the full ordered list of clip UUIDs.', parameters: { type: SchemaType.OBJECT, properties: { clip_ids: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } } }, required: ['clip_ids'] } },
  { name: 'set_transition', description: 'Set the transition after a clip (fade/dissolve/wipe/cut).', parameters: { type: SchemaType.OBJECT, properties: { clip_id: { type: SchemaType.STRING }, transition_type: { type: SchemaType.STRING } }, required: ['clip_id', 'transition_type'] } },
  { name: 'regenerate_clip', description: 'Mark a clip for visual regeneration, optionally with a new prompt.', parameters: { type: SchemaType.OBJECT, properties: { clip_id: { type: SchemaType.STRING }, new_prompt: { type: SchemaType.STRING } }, required: ['clip_id'] } },
  { name: 'set_music', description: 'Set the background music track for the trailer.', parameters: { type: SchemaType.OBJECT, properties: { name: { type: SchemaType.STRING }, url: { type: SchemaType.STRING }, duration_ms: { type: SchemaType.INTEGER }, volume: { type: SchemaType.NUMBER } }, required: ['name'] } },
  { name: 'update_settings', description: 'Update render settings (resolution, aspect ratio, FPS).', parameters: { type: SchemaType.OBJECT, properties: { resolution: { type: SchemaType.STRING }, aspect_ratio: { type: SchemaType.STRING }, fps: { type: SchemaType.INTEGER } }, required: [] } },
  { name: 'update_scene_duration', description: 'Change the duration of a specific scene in seconds.', parameters: { type: SchemaType.OBJECT, properties: { scene_id: { type: SchemaType.STRING }, duration_sec: { type: SchemaType.NUMBER } }, required: ['scene_id', 'duration_sec'] } },
  { name: 'set_shot_type', description: 'Set whether a clip is continuous (same scene) or a cut (new scene).', parameters: { type: SchemaType.OBJECT, properties: { clip_id: { type: SchemaType.STRING }, shot_type: { type: SchemaType.STRING } }, required: ['clip_id', 'shot_type'] } },
  { name: 'add_amv_effect', description: 'Add a beat-synced AMV visual effect at a specific timestamp.', parameters: { type: SchemaType.OBJECT, properties: { type: { type: SchemaType.STRING }, timestamp_ms: { type: SchemaType.INTEGER }, duration_ms: { type: SchemaType.INTEGER }, intensity: { type: SchemaType.NUMBER } }, required: ['type', 'timestamp_ms'] } },
  { name: 'remove_amv_effect', description: 'Remove a specific AMV effect by its UUID.', parameters: { type: SchemaType.OBJECT, properties: { effect_id: { type: SchemaType.STRING } }, required: ['effect_id'] } },
  { name: 'set_bpm', description: 'Set the BPM for beat-synced effects and generate the beat map grid.', parameters: { type: SchemaType.OBJECT, properties: { bpm: { type: SchemaType.INTEGER } }, required: ['bpm'] } },
  { name: 'auto_amv', description: 'Auto-fill the effects timeline with beat-synced AMV effects across the whole trailer.', parameters: { type: SchemaType.OBJECT, properties: { bpm: { type: SchemaType.INTEGER }, style: { type: SchemaType.STRING } }, required: [] } },
  { name: 'trigger_generate_clip', description: 'Trigger image generation for a specific clip via the AI pipeline.', parameters: { type: SchemaType.OBJECT, properties: { clip_id: { type: SchemaType.STRING }, new_prompt: { type: SchemaType.STRING } }, required: ['clip_id'] } },
  { name: 'bulk_update_clips', description: 'Batch-update multiple clips at once.', parameters: { type: SchemaType.OBJECT, properties: { updates: { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT, properties: {} } } }, required: ['updates'] } },
];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { message, timeline, history = [] } = await req.json();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ role: 'assistant', content: 'Gemini API key not configured.', tool_calls: [] });

  // Build context prompt
  const clipSummary = (timeline?.clips || []).map((c: any, i: number) =>
    `[${i}] id=${c.id} type=${c.type} duration=${c.duration_ms}ms prompt="${(c.prompt || '').slice(0, 80)}"`
  ).join('\n');
  const contextPrompt = `Current timeline (${timeline?.clips?.length || 0} clips):\n${clipSummary}\n\nUser: ${message}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: SYSTEM,
      tools: [{ functionDeclarations: TOOLS as any }],
    });

    // Convert history to Gemini format
    const geminiHistory = history.flatMap((m: any) => {
      if (m.role === 'user') return [{ role: 'user', parts: [{ text: m.content }] }];
      if (m.role === 'assistant') return [{ role: 'model', parts: [{ text: m.content }] }];
      return [];
    });

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(contextPrompt);
    const response = result.response;

    const toolCalls: any[] = [];
    let replyText = '';

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.functionCall) {
        toolCalls.push({ tool_name: part.functionCall.name, arguments: part.functionCall.args || {} });
      }
      if (part.text) replyText += part.text;
    }

    // Persist chat history
    try {
      const newMessages = [
        ...history,
        { role: 'user', content: message },
        { role: 'assistant', content: replyText, tool_calls: toolCalls },
      ];
      await supabase.from('chat_history').upsert({ project_id: id, messages: newMessages, updated_at: new Date().toISOString() });
    } catch { /* non-fatal */ }

    return NextResponse.json({ role: 'assistant', content: replyText, tool_calls: toolCalls });
  } catch (err: any) {
    return NextResponse.json({ role: 'assistant', content: `AI error: ${err.message}`, tool_calls: [] });
  }
}
