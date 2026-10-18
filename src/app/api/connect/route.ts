import { NextResponse, type NextRequest } from 'next/server';
import { authUrl } from '@/lib/health';

export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  try {
    return NextResponse.redirect(await authUrl(`${proto}://${host}/api/oauth/callback`));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
