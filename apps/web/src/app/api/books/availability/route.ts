import { NextRequest, NextResponse } from 'next/server';

// ─── In-memory cache (per process, ~5 min TTL) ──────────────────────────────

const cache = new Map<string, { data: BookAvailability; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BookAvailability {
  found: boolean;
  openLibrary: {
    url: string;
    canBorrow: boolean;
    coverUrl: string | null;
    isbn: string | null;
  } | null;
  googleBooks: {
    previewUrl: string | null;
    infoUrl: string;
    previewAvailable: boolean;
  } | null;
  worldcatUrl: string;
  gutenberg: {
    readUrl: string;
  } | null;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchOpenLibrary(title: string, author: string): Promise<BookAvailability['openLibrary']> {
  try {
    const q = [
      `title=${encodeURIComponent(title)}`,
      author ? `author=${encodeURIComponent(author)}` : '',
      'fields=key,title,author_name,isbn,cover_i,lending_edition_s',
      'limit=1',
    ].filter(Boolean).join('&');

    const res = await fetch(`https://openlibrary.org/search.json?${q}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Lotus-BookTrailer/1.0' },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const doc = json?.docs?.[0];
    if (!doc) return null;

    const workKey = doc.key; // e.g. "/works/OL45804W"
    const isbn = doc.isbn?.[0] ?? null;
    const coverUrl = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : null;
    const canBorrow = !!doc.lending_edition_s;

    return {
      url: `https://openlibrary.org${workKey}`,
      canBorrow,
      coverUrl,
      isbn,
    };
  } catch {
    return null;
  }
}

async function fetchGoogleBooks(title: string, author: string): Promise<BookAvailability['googleBooks']> {
  try {
    const q = [
      `intitle:${encodeURIComponent(title)}`,
      author ? `inauthor:${encodeURIComponent(author)}` : '',
    ].filter(Boolean).join('+');

    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&fields=items(id,volumeInfo(infoLink,previewLink,accessInfo))`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;

    const json = await res.json();
    const item = json?.items?.[0];
    if (!item) return null;

    const access = item.volumeInfo?.accessInfo;
    const previewAvailable = access?.viewability === 'PARTIAL' || access?.viewability === 'ALL_PAGES';
    const previewUrl = previewAvailable ? (item.volumeInfo?.previewLink ?? null) : null;
    const infoUrl = item.volumeInfo?.infoLink ?? `https://books.google.com/books?q=${q}`;

    return { previewUrl, infoUrl, previewAvailable };
  } catch {
    return null;
  }
}

async function fetchGutenberg(title: string): Promise<BookAvailability['gutenberg']> {
  try {
    const res = await fetch(
      `https://gutendex.com/books/?search=${encodeURIComponent(title)}&mime_type=text%2Fhtml`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;

    const json = await res.json();
    const book = json?.results?.[0];
    if (!book) return null;

    const htmlFormat = book.formats?.['text/html'] ?? book.formats?.['text/html; charset=utf-8'];
    const readUrl = htmlFormat ?? `https://www.gutenberg.org/ebooks/${book.id}`;

    return { readUrl };
  } catch {
    return null;
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get('title') || '').trim();
  const author = (searchParams.get('author') || '').trim();

  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }

  const cacheKey = `${title.toLowerCase()}::${author.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { 'X-Cache': 'HIT' },
    });
  }

  // WorldCat URL is always generated (no API needed)
  const worldcatQuery = [title, author].filter(Boolean).join(' ');
  const worldcatUrl = `https://www.worldcat.org/search?q=${encodeURIComponent(worldcatQuery)}`;

  const [openLibrary, googleBooks, gutenberg] = await Promise.all([
    fetchOpenLibrary(title, author),
    fetchGoogleBooks(title, author),
    fetchGutenberg(title),
  ]);

  const result: BookAvailability = {
    found: !!(openLibrary || googleBooks || gutenberg),
    openLibrary,
    googleBooks,
    worldcatUrl,
    gutenberg,
  };

  cache.set(cacheKey, { data: result, ts: Date.now() });

  return NextResponse.json(result);
}
