import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const compiled_video_url = body.compiled_video_url || null;

  const update: Record<string, any> = { published: true, updated_at: new Date().toISOString() };
  if (compiled_video_url) update.compiled_video_url = compiled_video_url;

  const { data, error } = await supabase.from('projects').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
