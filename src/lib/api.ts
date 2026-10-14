import { NextResponse } from 'next/server';

export const ok = (data: Record<string, unknown> = {}) => NextResponse.json({ success: true, ...data });

export const fail = (error: unknown, status = 400) => {
  const message = error instanceof Error ? error.message : String(error);
  if (status >= 500) console.error('[mAI Spot]', message);
  return NextResponse.json({ success: false, error: message }, { status });
};

/** Files currently being uploaded; the library sync leaves them alone until they're registered. */
const g = globalThis as unknown as { __maispotPending?: Set<string> };
g.__maispotPending ||= new Set();
export const pendingFiles = g.__maispotPending;
