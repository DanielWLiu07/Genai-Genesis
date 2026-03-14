import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Generate an image via Gemini 2.0 Flash image generation (direct REST, v1alpha).
 * Falls back to a data URL if Supabase upload fails.
 */
export async function POST(req: Request) {
  const { prompt, aspect_ratio = '16:9' } = await req.json();
  if (!prompt) return NextResponse.json({ error: 'missing prompt' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ status: 'error', message: 'GEMINI_API_KEY not configured' }, { status: 500 });

  const enhanced = `${prompt}. Manga illustration style, bold ink lines, dramatic chiaroscuro shading, cinematic composition, high detail, professional quality.`;

  // Try models in order until one works
  const models = [
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
  ];

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: enhanced }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        if (res.status === 404) continue; // try next model
        return NextResponse.json({ status: 'error', message: err }, { status: res.status });
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

      if (!imgPart?.inlineData?.data) {
        return NextResponse.json({ status: 'error', message: 'No image in response' }, { status: 500 });
      }

      const imageBytes = Buffer.from(imgPart.inlineData.data, 'base64');
      const mimeType: string = imgPart.inlineData.mimeType || 'image/png';
      const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
      const filename = `imagen_${Date.now()}.${ext}`;

      // Upload to Supabase Storage for a persistent public URL
      let publicUrl: string | null = null;
      try {
        await supabase.storage.createBucket('renders', { public: true }).catch(() => {});
        const { error: uploadError } = await supabase.storage
          .from('renders')
          .upload(filename, imageBytes, { contentType: mimeType, upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('renders').getPublicUrl(filename);
          publicUrl = urlData?.publicUrl || null;
        }
      } catch { /* fall through to data URL */ }

      const url = publicUrl || `data:${mimeType};base64,${imgPart.inlineData.data}`;
      return NextResponse.json({ status: 'done', url, thumbnail_url: url, media_url: url });

    } catch (err: any) {
      return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ status: 'error', message: 'No image generation model available' }, { status: 500 });
}
