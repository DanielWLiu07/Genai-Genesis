import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  // Only published (done) projects
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id,title,author,description,status,cover_image_url,created_at')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!projects?.length) return NextResponse.json([]);

  const ids = projects.map((p: any) => p.id);

  // Fetch timelines and latest render jobs in parallel
  const [timelinesRes, jobsRes] = await Promise.all([
    supabase.from('timelines').select('project_id,clips,music_track').in('project_id', ids),
    supabase
      .from('render_jobs')
      .select('project_id,output_url,status')
      .in('project_id', ids)
      .eq('status', 'done')
      .order('created_at', { ascending: false }),
  ]);

  const timelines = timelinesRes.data || [];
  const jobs = jobsRes.data || [];

  // Index by project_id (keep first/latest per project)
  const timelineMap: Record<string, any> = {};
  for (const t of timelines) {
    if (!timelineMap[t.project_id]) timelineMap[t.project_id] = t;
  }
  const jobMap: Record<string, string> = {};
  for (const j of jobs) {
    if (!jobMap[j.project_id]) jobMap[j.project_id] = j.output_url;
  }

  const result = projects.map((p: any) => {
    const cover = (p.cover_image_url || '').startsWith('data:') ? null : p.cover_image_url;
    return {
      ...p,
      cover_image_url: cover,
      clips: (timelineMap[p.id]?.clips || []).sort((a: any, b: any) => a.order - b.order),
      music_track: timelineMap[p.id]?.music_track || null,
      compiled_url: jobMap[p.id] || null,
    };
  });

  return NextResponse.json(result);
}
