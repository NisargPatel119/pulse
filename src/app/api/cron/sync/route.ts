import { NextResponse, type NextRequest } from 'next/server';
import { isConnected, sync } from '@/lib/pulse';

export const maxDuration = 60;

// Runs daily via Vercel Cron (see vercel.json) so history builds even on days you skip the app.
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set on the project.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await isConnected())) return NextResponse.json({ ok: true, skipped: 'not connected' });
  try {
    const meta = await sync();
    return NextResponse.json({ ok: true, status: meta.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
