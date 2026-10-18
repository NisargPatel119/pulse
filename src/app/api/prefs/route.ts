import { NextResponse, type NextRequest } from 'next/server';
import { setPrefs, isDemoDeployment } from '@/lib/pulse';

// Accepts any of: sleepNeedHours (5-11), age (16-100), sex ('male' | 'female')
export async function POST(req: NextRequest) {
  if (isDemoDeployment() || !process.env.DATABASE_URL) return NextResponse.json({ ok: true });
  const b = await req.json().catch(() => ({}));
  const next: Record<string, unknown> = {};
  if (b.sleepNeedHours !== undefined) {
    const n = Number(b.sleepNeedHours);
    if (!(n >= 5 && n <= 11)) return NextResponse.json({ error: 'Invalid sleep need' }, { status: 400 });
    next.sleepNeedHours = n;
  }
  if (b.age !== undefined) {
    const n = Number(b.age);
    if (!(n >= 16 && n <= 100)) return NextResponse.json({ error: 'Age must be 16-100' }, { status: 400 });
    next.age = n;
  }
  if (b.sex !== undefined) {
    if (b.sex !== 'male' && b.sex !== 'female') return NextResponse.json({ error: 'Invalid sex' }, { status: 400 });
    next.sex = b.sex;
  }
  await setPrefs(next);
  return NextResponse.json({ ok: true });
}
