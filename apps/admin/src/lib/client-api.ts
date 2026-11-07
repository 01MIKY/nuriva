'use client';
import type { Locale } from '@nuriva/i18n';

export interface ApiError {
  error: string;
  message: string;
  fields?: Array<{ path: string; code: string }>;
}
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Browser → API through the same-origin /api proxy. Messages come back already localized. */
export async function apiSend<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, locale: Locale): Promise<ApiResult<T>> {
  try {
    const hasBody = method === 'POST' || method === 'PUT';
    const res = await fetch(`/api${path}?lang=${locale}`, {
      method,
      headers: hasBody ? { 'content-type': 'application/json' } : undefined,
      credentials: 'same-origin',
      body: hasBody ? JSON.stringify(body ?? {}) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    return { ok: false, error: (json as ApiError) ?? { error: 'internal', message: '' } };
  } catch {
    return { ok: false, error: { error: 'network', message: '' } };
  }
}

export const apiPost = <T,>(path: string, body: unknown, locale: Locale) => apiSend<T>('POST', path, body, locale);

/** Adapter for shared UI components (e.g. two-step verification) that take a `send` function. */
export const makeSend = (locale: Locale) => <T,>(method: 'GET' | 'POST', path: string, body?: unknown) => apiSend<T>(method, path, body ?? null, locale);
