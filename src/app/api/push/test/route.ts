import { NextResponse } from 'next/server';
import { sendToAll } from '@/lib/push';

export async function POST() {
  const r = await sendToAll({ title: 'Pulse notifications are on', body: 'You will get a morning briefing and a bedtime reminder.', url: '/#today', tag: 'test' });
  return NextResponse.json(r);
}
