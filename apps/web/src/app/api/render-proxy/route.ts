import { NextResponse } from 'next/server';

/**
 * Proxy compiled video from the render service (port 8002) through Next.js.
 * Avoids CORS / mixed-content / port-accessibility issues in the browser.
 * Usage: /api/render-proxy?url=http://localhost:8002/outputs/...
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 });

  // Only allow proxying from the configured render service
  const renderBase = process.env.RENDER_SERVICE_URL || 'http://localhost:8002';
  if (!url.startsWith(renderBase) && !url.startsWith('http://localhost:8002')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: upstream.status });
    }
    const contentType = upstream.headers.get('content-type') || 'video/mp4';
    const contentLength = upstream.headers.get('content-length');
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
    };
    if (contentLength) headers['Content-Length'] = contentLength;
    return new Response(upstream.body, { headers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
