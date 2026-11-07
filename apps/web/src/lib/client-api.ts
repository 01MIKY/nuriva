'use client';
import type { Locale } from '@nuriva/i18n';

export interface ApiError {
  error: string;
  message: string;
  fields?: Array<{ path: string; code: string }>;
}

/** Browser → API through the same-origin /api proxy. Messages come back already localized. */
export async function apiPost<T>(path: string, body: unknown, locale: Locale): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(`/api${path}?lang=${locale}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    return { ok: false, error: (json as ApiError) ?? { error: 'internal', message: '' } };
  } catch {
    return { ok: false, error: { error: 'network', message: '' } };
  }
}
