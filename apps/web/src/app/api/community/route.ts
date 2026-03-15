import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const BASE = 'https://wcyjvftpeckvyxlahgta.supabase.co/storage/v1/object/public';
const JJK_ID = '828378cf-ab94-4b1f-8f71-5d6c27ce05eb';

// Seed demo project — always shown so the community feed is never empty
const SEED_PROJECTS = [
  {
    id: JJK_ID,
    title: 'Jujutsu Kaisen — Gojo vs Sukuna',
    author: 'MangaMate',
    description: 'The ultimate clash between the Honored One and the King of Curses — an AI-generated book trailer.',
    cover_image_url: `${BASE}/renders/imagen_1773565516412.png`,
    status: 'done',
    created_at: '2026-03-15T09:02:24.843Z',
    compiled_url: null,
    clips: [
      { id: 'jjk-1', order: 0, type: 'video', duration_ms: 5000, prompt: 'Gojo Satoru awakens', generated_media_url: `${BASE}/videos/jjk/${JJK_ID}/clip_01.mp4`, thumbnail_url: `${BASE}/renders/imagen_1773565516412.png` },
      { id: 'jjk-2', order: 1, type: 'video', duration_ms: 5000, prompt: 'Sukuna rises', generated_media_url: `${BASE}/videos/jjk/${JJK_ID}/clip_02.mp4`, thumbnail_url: `${BASE}/renders/imagen_1773565516412.png` },
      { id: 'jjk-3', order: 2, type: 'video', duration_ms: 5000, prompt: 'Clash of cursed energy', generated_media_url: `${BASE}/videos/jjk/${JJK_ID}/clip_03.mp4`, thumbnail_url: `${BASE}/renders/imagen_1773565516412.png` },
      { id: 'jjk-4', order: 3, type: 'video', duration_ms: 5000, prompt: 'Infinite Void unleashed', generated_media_url: `${BASE}/videos/jjk/${JJK_ID}/clip_04.mp4`, thumbnail_url: `${BASE}/renders/imagen_1773565516412.png` },
      { id: 'jjk-5', order: 4, type: 'video', duration_ms: 5000, prompt: 'The final blow', generated_media_url: `${BASE}/videos/jjk/${JJK_ID}/clip_05.mp4`, thumbnail_url: `${BASE}/renders/imagen_1773565516412.png` },
    ],
    music_track: null,
  },
];

export async function GET() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, author, description, cover_image_url, status, created_at, compiled_video_url')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json(SEED_PROJECTS);

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

  // Merge seed projects — seed goes first, skip if a real project with same id was published
  const realIds = new Set(enriched.map((p: any) => p.id));
  const seeds = SEED_PROJECTS.filter(s => !realIds.has(s.id));
  return NextResponse.json([...seeds, ...enriched]);
}
