import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  const { prompt, aspect_ratio = '16:9' } = await req.json();
  if (!prompt) return NextResponse.json({ error: 'missing prompt' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ status: 'error', message: 'GEMINI_API_KEY not configured' }, { status: 500 });

  const enhanced = `${prompt}. Manga illustration style, bold ink lines, dramatic chiaroscuro shading, cinematic composition, professional quality, high detail.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp-image-generation' } as any);

    const result = await (model as any).generateContent({
      contents: [{ role: 'user', parts: [{ text: enhanced }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } as any,
    });

    const parts = result.response.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imgPart?.inlineData?.data) {
      return NextResponse.json({ status: 'error', message: 'No image returned from Gemini' }, { status: 500 });
    }

    const imageBytes = Buffer.from(imgPart.inlineData.data, 'base64');
    const mimeType: string = imgPart.inlineData.mimeType || 'image/png';
    const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
    const filename = `imagen_${Date.now()}.${ext}`;

    // Upload to Supabase Storage for a persistent public URL
    let publicUrl: string | null = null;
    try {
      // Ensure bucket exists
      await supabase.storage.createBucket('renders', { public: true }).catch(() => {});
      const { error: uploadError } = await supabase.storage
        .from('renders')
        .upload(filename, imageBytes, { contentType: mimeType, upsert: true });
      if (!uploadError) {
        const { data } = supabase.storage.from('renders').getPublicUrl(filename);
        publicUrl = data?.publicUrl || null;
      }
    } catch { /* fall back to data URL */ }

    // Fall back to data URL if Supabase upload failed
    const url = publicUrl || `data:${mimeType};base64,${imgPart.inlineData.data}`;

    return NextResponse.json({ status: 'done', url, thumbnail_url: url, media_url: url });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
