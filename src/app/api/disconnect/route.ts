import { NextResponse, type NextRequest } from 'next/server';
import { wipe } from '@/lib/db';

// POST only, so a stray link can't trigger it
export async function POST(req: NextRequest) {
  await wipe();
  return NextResponse.redirect(new URL('/', req.url), 303);
}
