import { NextResponse, type NextRequest } from 'next/server';
import { addSub, removeSub, pushConfigured } from '@/lib/push';
import { isDemoDeployment } from '@/lib/pulse';

export async function POST(req: NextRequest) {
  if (isDemoDeployment() || !process.env.DATABASE_URL || !pushConfigured()) return NextResponse.json({ error: 'Push is not available here' }, { status: 400 });
  const { subscription } = await req.json().catch(() => ({}));
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  await addSub({ endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { endpoint } = await req.json().catch(() => ({}));
  if (endpoint) await removeSub(endpoint);
  return NextResponse.json({ ok: true });
}
