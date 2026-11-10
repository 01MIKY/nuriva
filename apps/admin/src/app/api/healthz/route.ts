import { clientIp } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

/**
 * Liveness check for the hosting platform. It does not call the API, so a slow API never restarts this app.
 * Outside production it also echoes the visitor IP this app derived, to verify the proxy setup after a deploy
 * (the visitor only ever sees their own address).
 */
export function GET(req: Request) {
  const body = process.env.NURIVA_ENV === 'production' ? { ok: true } : { ok: true, ip: clientIp(req.headers) };
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}
