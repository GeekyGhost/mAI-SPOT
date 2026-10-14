import os from 'os';
import { NextRequest } from 'next/server';
import { ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Addresses other devices on your network can use to reach the public /listen page. */
export async function GET(request: NextRequest) {
  const port = new URL(request.url).port || process.env.PORT || '8088';
  const lan: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) lan.push(a.address);
    }
  }
  return ok({
    port,
    lanShare: process.env.MAISPOT_LAN !== '0',
    listenUrls: lan.map(ip => `http://${ip}:${port}/listen`),
    localListenUrl: `http://localhost:${port}/listen`
  });
}
