import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const DEFAULT_SETTINGS = { resolution: '1080p', aspect_ratio: '16:9', fps: 24 };
const DEFAULT_TIMELINE = { clips: [], music_track: null, total_duration_ms: 0, effects: [], beat_map: null, settings: DEFAULT_SETTINGS };

const STRIP_CLIP_IDS = new Set(['title_card', 'end_card']);
const TITLE_CARD_TERMS = [
  'title card', 'title screen', 'title slide', 'title page', 'title treatment',
  'title reveal', 'title sequence', 'opening title', 'title shot',
  'book title', 'movie title', 'film title', 'outro card', 'intro card',
  'end card', 'coming soon', 'the end', 'credits',
  'glowing text', 'floating text', 'text appears', 'text reads',
  'logo reveal', 'brand reveal',
];
function isTitleCard(c: any): boolean {
  const prompt = (c.prompt || '').toLowerCase();
  return TITLE_CARD_TERMS.some((t) => prompt.includes(t));
}
function stripBadClips(clips: any[]): any[] {
  return (clips || []).filter((c: any) => !STRIP_CLIP_IDS.has(c.id) && c.type !== 'text_overlay' && !isTitleCard(c));
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await supabase.from('timelines').select('*').eq('project_id', id).single();
  if (!data) return NextResponse.json({ ...DEFAULT_TIMELINE, project_id: id });
  return NextResponse.json({ ...data, clips: stripBadClips(data.clips) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const payload = {
    project_id: id,
    clips: stripBadClips(body.clips ?? []),
    music_track: body.music_track ?? null,
    total_duration_ms: body.total_duration_ms ?? 0,
    settings: body.settings ?? DEFAULT_SETTINGS,
    effects: body.effects ?? [],
    beat_map: body.beat_map ?? null,
  };
  const { data, error } = await supabase.from('timelines').upsert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
