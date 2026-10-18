import { NextResponse, type NextRequest } from 'next/server';
import { api } from '@/lib/health';

// Debug helper: /api/raw?p=/users/me/dataTypes/sleep/dataPoints?pageSize=1 (signed-in only)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get('p');
  if (!p?.startsWith('/users/me/')) return NextResponse.json({ error: 'p must start with /users/me/' }, { status: 400 });
  try {
    return NextResponse.json(await api(p));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
