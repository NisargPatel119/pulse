import { NextResponse, type NextRequest } from 'next/server';
import { getTopic, ntfyServer, pushConfigured, sendToAll } from '@/lib/push';
import { isDemoDeployment } from '@/lib/pulse';

function origin(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// GET: what the Settings screen needs to show the ntfy setup (the topic is private; sign-in is required)
export async function GET() {
  if (isDemoDeployment() || !pushConfigured()) return NextResponse.json({ available: false });
  const server = ntfyServer();
  const topic = await getTopic();
  const host = server.replace(/^https?:\/\//, '');
  return NextResponse.json({ available: true, server, topic, subscribeUrl: `ntfy://${host}/${topic}`, webUrl: `${server}/${topic}` });
}

// POST: send a test notification
export async function POST(req: NextRequest) {
  if (isDemoDeployment() || !pushConfigured()) return NextResponse.json({ error: 'Not available here' }, { status: 400 });
  const r = await sendToAll({ title: 'Pulse notifications are on', body: 'You will get a morning briefing and a bedtime reminder.', url: '/#today', tag: 'white_check_mark' }, origin(req));
  return NextResponse.json(r);
}
