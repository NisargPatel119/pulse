import { NextResponse, type NextRequest } from 'next/server';
import { isConnected, payload } from '@/lib/pulse';
import { getKv, setKv } from '@/lib/db';
import { sendToAll } from '@/lib/push';
import { eveningMessage } from '@/lib/notify';

export const maxDuration = 60;

// Evening cron (see vercel.json): bedtime reminder. Vercel Hobby crons run once a day at a fixed time,
// so move the schedule in vercel.json to match when you want to wind down.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await isConnected())) return NextResponse.json({ ok: true, skipped: 'not connected' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const sentLog: any = (await getKv('push_last')) ?? {};
    if (sentLog.evening === today) return NextResponse.json({ ok: true, skipped: 'already sent' });
    const r = await sendToAll(eveningMessage(await payload()));
    await setKv('push_last', { ...sentLog, evening: today });
    return NextResponse.json({ ok: true, push: r });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
