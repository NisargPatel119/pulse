import { NextResponse, type NextRequest } from 'next/server';
import { setPrefs, isDemoDeployment } from '@/lib/pulse';

export async function POST(req: NextRequest) {
  if (isDemoDeployment() || !process.env.DATABASE_URL) return NextResponse.json({ ok: true });
  const { sleepNeedHours } = await req.json();
  const n = Number(sleepNeedHours);
  if (!(n >= 5 && n <= 11)) return NextResponse.json({ error: 'Invalid sleep need' }, { status: 400 });
  await setPrefs({ sleepNeedHours: n });
  return NextResponse.json({ ok: true });
}
