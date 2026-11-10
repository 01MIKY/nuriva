import { isIP } from 'node:net';

/**
 * How this app reaches the API. API_ORIGIN may be a full origin ("http://localhost:4000") or a private-network
 * "host:port" as hosting platforms provide it (Render's `hostport`), which is reached over plain HTTP inside
 * the private network.
 */
export function apiOrigin(): string {
  const v = (process.env.API_ORIGIN ?? 'http://localhost:4000').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(v) ? v : `http://${v}`;
}

/**
 * The visitor's IP address, reduced to ONE value before it is sent to the API (the API trusts exactly one hop:
 * this app). A client-supplied X-Forwarded-For chain is never passed through as-is.
 *  - CLIENT_IP_HEADER (e.g. "cf-connecting-ip"): a header the hosting edge overwrites on every request.
 *  - Otherwise X-Forwarded-For, taking the entry EDGE_PROXY_HOPS positions from the right (default 1: the address
 *    the edge in front of this app saw). Entries further left can be forged by the client and are ignored.
 * Which option is right depends on the host and is verified after each new deployment (docs/DEPLOY.md).
 */
export function clientIp(h: Headers): string | null {
  const named = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (named) {
    const v = h.get(named)?.trim();
    if (v && isIP(v)) return v;
  }
  const chain = (h.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const hops = Math.max(1, Number.parseInt(process.env.EDGE_PROXY_HOPS ?? '1', 10) || 1);
  const v = chain[chain.length - hops];
  return v && isIP(v) ? v : null;
}
