import type { NextRequest } from 'next/server';
import { apiOrigin, clientIp } from '@/lib/upstream';

/**
 * Same-origin proxy: browser → /api/v1/... → API. Keeps the session cookie first-party and lets one
 * build run in every environment (API_ORIGIN is read at runtime, unlike next.config rewrites).
 * Only /v1/* is reachable and only an allowlist of headers is forwarded in each direction.
 */
export const dynamic = 'force-dynamic';

// stripe-signature: Stripe webhooks reach the (private) API through this proxy; the body is forwarded unchanged.
const FORWARD_REQUEST_HEADERS = ['cookie', 'content-type', 'accept-language', 'user-agent', 'origin', 'stripe-signature'];
const FORWARD_RESPONSE_HEADERS = ['content-type', 'set-cookie', 'retry-after', 'cache-control'];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path[0] !== 'v1' || path.some((p) => p === '..' || p.includes('/'))) {
    return Response.json({ error: 'not_found', message: 'Not found' }, { status: 404 });
  }
  const target = `${apiOrigin()}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const ip = clientIp(req.headers);
  if (ip) headers.set('x-forwarded-for', ip);

  // Forward a body only when there is one: an empty string would make fetch add a text/plain
  // content type, which the API rejects by design (JSON-only CSRF defence).
  const raw = ['GET', 'HEAD', 'DELETE'].includes(req.method) ? '' : await req.text();
  if (!raw) headers.delete('content-type');

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: raw || undefined,
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return Response.json({ error: 'unavailable', message: '' }, { status: 503 });
  }

  const out = new Headers();
  for (const h of FORWARD_RESPONSE_HEADERS) {
    if (h === 'set-cookie') for (const c of res.headers.getSetCookie()) out.append('set-cookie', c);
    else {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
  }
  return new Response(res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
