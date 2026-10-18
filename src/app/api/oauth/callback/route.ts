import { NextResponse, type NextRequest } from 'next/server';
import { handleCallback } from '@/lib/health';
import { sync } from '@/lib/pulse';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    if (q.get('error')) throw new Error(q.get('error')!);
    await handleCallback(Object.fromEntries(q));
    await sync().catch(() => {}); // first pull; the dashboard shows any per-metric errors
    return NextResponse.redirect(new URL('/', req.url));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
