import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('projects')
    .select('id,title,author,description,status,cover_image_url,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Strip base64 data URLs — too large for list view
  const rows = (data || []).map((row: any) =>
    (row.cover_image_url || '').startsWith('data:') ? { ...row, cover_image_url: null } : row
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { data, error } = await supabase
    .from('projects')
    .insert({ title: body.title, description: body.description, author: body.author })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
