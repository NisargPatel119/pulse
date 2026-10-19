import { NextResponse } from 'next/server';
import { pushConfigured } from '@/lib/push';

// The public VAPID key the browser needs to subscribe
export async function GET() {
  return NextResponse.json({ configured: pushConfigured(), key: process.env.VAPID_PUBLIC_KEY ?? null });
}
