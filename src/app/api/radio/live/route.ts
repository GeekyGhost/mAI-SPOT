import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { computeLive, heartbeat } from '@/lib/radio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public now-playing for the live station. Listeners pass ?listener=<random id> as a heartbeat. */
export async function GET(request: NextRequest) {
  const listener = new URL(request.url).searchParams.get('listener');
  if (listener) heartbeat(listener);
  const live = computeLive(getDatabase(), Date.now());
  return NextResponse.json(live, { headers: { 'Cache-Control': 'no-store' } });
}
