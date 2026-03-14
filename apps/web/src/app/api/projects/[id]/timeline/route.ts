import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const DEFAULT_TIMELINE = { clips: [], music_track: null, total_duration_ms: 0, settings: { resolution: '1080p', aspect_ratio: '16:9', fps: 24 } };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await supabase.from('timelines').select('*').eq('project_id', id).single();
  return NextResponse.json(data ?? { ...DEFAULT_TIMELINE, project_id: id });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const payload = { project_id: id, clips: body.clips ?? [], music_track: body.music_track ?? null, total_duration_ms: body.total_duration_ms ?? 0, settings: body.settings ?? DEFAULT_TIMELINE.settings };
  const { data, error } = await supabase.from('timelines').upsert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
