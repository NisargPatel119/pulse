import { NextResponse, type NextRequest } from 'next/server';
import { isConnected, isDemoDeployment } from '@/lib/pulse';

export async function GET(req: NextRequest) {
  return NextResponse.json({
    connected: await isConnected(),
    demoDeployment: isDemoDeployment(),
    configured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.DATABASE_URL,
    redirectUri: `${origin(req)}/api/oauth/callback`,
  });
}

function origin(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
