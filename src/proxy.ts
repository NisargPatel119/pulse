import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Demo deployment: only made-up data, nothing to protect
  if (process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1') {
    return pathname === '/login' ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  }
  // Vercel Cron can't sign in; the cron route checks CRON_SECRET itself
  if (pathname.startsWith('/api/cron/')) return NextResponse.next();

  const isLoggedIn = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === '/login') return isLoggedIn ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  if (isLoggedIn) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}

// Everything except Next internals and the icons/manifest the phone fetches before login
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
