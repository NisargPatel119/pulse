import { NextResponse, type NextRequest } from 'next/server';
import { isConnected, sync, payload } from '@/lib/pulse';
import { getKv, setKv } from '@/lib/db';
import { sendToAll } from '@/lib/push';
import { morningMessage, weeklyMessage } from '@/lib/notify';

export const maxDuration = 60;

// Runs daily via Vercel Cron (see vercel.json): syncs, then sends the morning notification
// (and the weekly review notification on Mondays). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await isConnected())) return NextResponse.json({ ok: true, skipped: 'not connected' });
  try {
    const meta = await sync();
    const p = await payload();
    const today = new Date().toISOString().slice(0, 10);
    const sentLog: any = (await getKv('push_last')) ?? {};
    const out: any = {};
    if (sentLog.morning !== today) { out.morning = await sendToAll(morningMessage(p)); sentLog.morning = today; }
    if (new Date().getUTCDay() === 1 && sentLog.weekly !== today && p.weekly) { out.weekly = await sendToAll(weeklyMessage(p.weekly)); sentLog.weekly = today; }
    await setKv('push_last', sentLog);
    return NextResponse.json({ ok: true, status: meta.status, push: out });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
