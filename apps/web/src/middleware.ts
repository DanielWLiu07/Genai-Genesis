import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/project'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // Supabase v2 stores the session in a cookie named sb-<ref>-auth-token
  // Fall back to checking the local-auth cookie we set on login
  const hasSbSession = Array.from(request.cookies.getAll()).some(
    (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  );
  const hasLocalAuthCookie = request.cookies.get('sakuga_authed')?.value === '1';

  if (!hasSbSession && !hasLocalAuthCookie) {
    const loginUrl = new URL('/auth', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/project/:path*'],
};
