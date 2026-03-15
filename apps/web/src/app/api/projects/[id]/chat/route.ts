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
SHOT TYPE: continuous = same scene flowing | cut = new scene
PROMPTS: always include camera angle, lighting, mood, color palette, atmosphere, anime/manga style.

EFFECT TYPES (31 total) — use the exact string names below:
FLASH/LIGHT: flash_white (white hit 100-200ms 0.8-1.0), flash_black (dark cut 150ms), red_flash (violence 200ms 0.9),
             overexpose (blinding climax 150ms), strobe (climax 50-100ms), flicker (unstable reality 100-200ms)
ZOOM/MOVE:   zoom_burst (emphasis 200-300ms), zoom_out (aftermath reveal 300-500ms),
             shake (impact 150-250ms), heavy_shake (explosion 200-400ms),
             speed_ramp (tension build 500-1000ms), reverse (rewind flash 300ms)
COLOR/GRADE: chromatic (RGB aberration H 200-400ms), rgb_shift_v (RGB aberration V 200-400ms),
             neon (violet glow 300-500ms), glitch (digital 150-300ms), invert (surreal 100-200ms),
             black_white (memory/flashback 300-500ms), manga_ink (hyper-contrast B&W 200-400ms),
             sepia (nostalgia 400-600ms), contrast_punch (manga ink style 200-350ms)
TEMPORAL:    echo (ghost repeat 400-600ms), time_echo (speed afterimage 300-500ms),
             freeze (bullet-time 300-500ms)
TEXTURE:     panel_split (manga panels 400ms), cross_cut (X-slash action hit 150-250ms),
             letterbox (cinematic bars 400-600ms), vignette (dread corners 400ms),
             film_grain (cinematic grit 200-400ms), blur_out (memory/dream 400-600ms),
             pixelate (digital world 200-400ms)

COMBOS for sick edits:
- Heavy action hit: heavy_shake + red_flash + chromatic at same timestamp
- Climax moment: zoom_burst + overexpose + manga_ink layered 2 beats apart
- Memory/flashback: blur_out → black_white → sepia sequence
- Supernatural power: neon + rgb_shift_v + freeze for bullet-time
- Pure manga style: manga_ink + cross_cut + panel_split
- Digital/sci-fi: glitch + pixelate + rgb_shift_v

PARAMS — pass as params:{} object to add_amv_effect or update_amv_effect:
- zoom_burst/zoom_out: scale=1.05-3.0 (zoom), center_x/center_y=0-100 (pivot %)
- shake/heavy_shake: radius=px (shake displacement)
- chromatic/rgb_shift_v: shift=px (RGB offset)
- blur_out/speed_ramp: sigma=blur radius
- vignette: angle=2-12 (lower=bigger/darker)
- letterbox: bar_size=2-30 (% height)
- panel_split: count=2-8 panels, thickness=px border
- cross_cut: thickness=px line width
- pixelate: size=px block size
- film_grain/flicker: amount=noise level
- echo/time_echo: frames=count, decay=weight fade
- freeze: frames=freeze length
- neon/glitch: hue_shift=0-360, glow=saturation boost
- flash_white/strobe: brightness=0.3-3.0, saturation=0-1
- overexpose: brightness=0.1-1.0, contrast=0.1-1.0
- red_flash: glow=red boost 1.0-3.5
- black_white: contrast=0.5-3.0
- manga_ink: contrast=1-10, brightness=-0.8-0
- contrast_punch: contrast=1-6, brightness=-0.6-0, saturation=0-1
Example: add zoom_burst at 2000ms with scale=2.0 center_x=30 center_y=70 for top-left subject zoom`;

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
  {
    name: 'add_amv_effect',
    description: 'Add a beat-synced AMV visual effect at a specific timestamp with optional fine-grained params.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        type: { type: SchemaType.STRING, description: 'Effect type name (e.g. zoom_burst, red_flash, manga_ink)' },
        timestamp_ms: { type: SchemaType.INTEGER },
        duration_ms: { type: SchemaType.INTEGER },
        intensity: { type: SchemaType.NUMBER, description: '0.0-1.0 overall intensity' },
        params: {
          type: SchemaType.OBJECT,
          description: 'Effect-specific params. zoom_burst/zoom_out: scale(float), center_x(0-100), center_y(0-100). shake/heavy_shake: radius(px). chromatic/rgb_shift_v: shift(px). blur_out/speed_ramp: sigma. vignette: angle(2-12). letterbox: bar_size(%). panel_split: count(2-8), thickness(px). cross_cut: thickness(px). pixelate: size(px). film_grain/flicker: amount. echo/time_echo: frames, decay. freeze: frames. neon/glitch: hue_shift(0-360), glow(saturation). flash_white/strobe: brightness, saturation. overexpose: brightness, contrast. red_flash: glow(red boost 1-3.5). black_white: contrast. manga_ink: contrast, brightness. contrast_punch: contrast, brightness, saturation.',
          properties: {
            scale: { type: SchemaType.NUMBER }, center_x: { type: SchemaType.NUMBER }, center_y: { type: SchemaType.NUMBER },
            radius: { type: SchemaType.NUMBER }, sigma: { type: SchemaType.NUMBER }, shift: { type: SchemaType.NUMBER },
            brightness: { type: SchemaType.NUMBER }, saturation: { type: SchemaType.NUMBER }, contrast: { type: SchemaType.NUMBER },
            hue_shift: { type: SchemaType.NUMBER }, glow: { type: SchemaType.NUMBER },
            frames: { type: SchemaType.INTEGER }, decay: { type: SchemaType.NUMBER },
            thickness: { type: SchemaType.INTEGER }, count: { type: SchemaType.INTEGER },
            bar_size: { type: SchemaType.NUMBER }, size: { type: SchemaType.INTEGER },
            amount: { type: SchemaType.NUMBER }, angle: { type: SchemaType.NUMBER },
          },
        },
      },
      required: ['type', 'timestamp_ms'],
    },
  },
  { name: 'remove_amv_effect', description: 'Remove a specific AMV effect by its UUID.', parameters: { type: SchemaType.OBJECT, properties: { effect_id: { type: SchemaType.STRING } }, required: ['effect_id'] } },
  {
    name: 'update_amv_effect',
    description: 'Update properties of an existing AMV effect by its ID — change duration, intensity, or specific params.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        effect_id: { type: SchemaType.STRING },
        duration_ms: { type: SchemaType.INTEGER },
        intensity: { type: SchemaType.NUMBER },
        params: {
          type: SchemaType.OBJECT,
          description: 'Effect-specific params to update. Same keys as add_amv_effect params.',
          properties: {
            scale: { type: SchemaType.NUMBER }, center_x: { type: SchemaType.NUMBER }, center_y: { type: SchemaType.NUMBER },
            radius: { type: SchemaType.NUMBER }, sigma: { type: SchemaType.NUMBER }, shift: { type: SchemaType.NUMBER },
            brightness: { type: SchemaType.NUMBER }, saturation: { type: SchemaType.NUMBER }, contrast: { type: SchemaType.NUMBER },
            hue_shift: { type: SchemaType.NUMBER }, glow: { type: SchemaType.NUMBER },
            frames: { type: SchemaType.INTEGER }, decay: { type: SchemaType.NUMBER },
            thickness: { type: SchemaType.INTEGER }, count: { type: SchemaType.INTEGER },
            bar_size: { type: SchemaType.NUMBER }, size: { type: SchemaType.INTEGER },
            amount: { type: SchemaType.NUMBER }, angle: { type: SchemaType.NUMBER },
          },
        },
      },
      required: ['effect_id'],
    },
  },
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
    `[${i}] id=${c.id} type=${c.type} dur=${c.duration_ms}ms prompt="${(c.prompt || '').slice(0, 60)}"`
  ).join('\n');
  const effectSummary = (timeline?.effects || []).length > 0
    ? (timeline.effects as any[]).map((e: any) => `  ${e.type}@${e.timestamp_ms}ms dur=${e.duration_ms}ms int=${e.intensity?.toFixed(2)}`).join('\n')
    : '  (none)';
  const contextPrompt = `Timeline: ${timeline?.clips?.length || 0} clips | BPM: ${timeline?.beat_map?.bpm || 'unset'} | Effects: ${(timeline?.effects || []).length}
Clips:\n${clipSummary}
Current effects:\n${effectSummary}

User: ${message}`;

  // Model fallback chain — newest first, fallback on 429/quota
  const MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

  for (const modelId of MODEL_CHAIN) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelId,
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
    // 429 = rate limit / spending cap — try next model in chain
    if (err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('spending')) {
      continue;
    }
    return NextResponse.json({ role: 'assistant', content: `AI error: ${err.message}`, tool_calls: [] });
  }
  } // end model loop

  return NextResponse.json({ role: 'assistant', content: 'AI quota exceeded on all models. Please try again later or check your Gemini API billing.', tool_calls: [] });
}
