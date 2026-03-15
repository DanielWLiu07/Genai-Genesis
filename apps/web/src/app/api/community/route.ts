import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, author, description, cover_image_url, status, created_at, compiled_video_url')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json([], { status: 500 });

  // Fetch timelines for all projects in parallel
  const ids = (data || []).map((p: any) => p.id);
  const timelineResults = await Promise.all(
    ids.map((id: string) =>
      supabase.from('timelines').select('clips, music_track').eq('project_id', id).single()
    )
  );

  const enriched = (data || []).map((p: any, i: number) => ({
    ...p,
    compiled_url: p.compiled_video_url || null,
    clips: timelineResults[i].data?.clips || [],
    music_track: timelineResults[i].data?.music_track || null,
  }));

  return NextResponse.json(enriched);
}
