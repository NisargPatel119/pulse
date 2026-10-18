import { NextResponse, type NextRequest } from 'next/server';
import { payload } from '@/lib/pulse';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    return NextResponse.json(await payload({ refresh: q.get('refresh') === '1', demo: q.get('demo') === '1' }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
