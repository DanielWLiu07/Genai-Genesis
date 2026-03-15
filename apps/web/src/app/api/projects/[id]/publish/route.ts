import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const compiled_video_url = body.compiled_video_url || null;

  // Try with compiled_video_url first; fall back without it if column doesn't exist yet
  const fullUpdate: Record<string, any> = { published: true, updated_at: new Date().toISOString() };
  if (compiled_video_url) fullUpdate.compiled_video_url = compiled_video_url;

  let { data, error } = await supabase.from('projects').update(fullUpdate).eq('id', id).select().single();

  if (error && compiled_video_url) {
    // Column may not exist yet — retry without it
    const { data: d2, error: e2 } = await supabase
      .from('projects')
      .update({ published: true, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    data = d2; error = e2;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
