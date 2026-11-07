import 'server-only';
import { cookies } from 'next/headers';
import type { Locale } from '@nuriva/i18n';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

/** Server-side call to the API, forwarding the visitor's session cookie. Never cached. */
export async function apiGet<T>(path: string, locale: Locale): Promise<{ status: number; body: T | null }> {
  const jar = await cookies();
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, {
      headers: { cookie: jar.toString(), 'accept-language': locale },
      cache: 'no-store',
    });
    return { status: res.status, body: res.ok ? ((await res.json()) as T) : null };
  } catch {
    // API unreachable: render as signed-out rather than crashing the page.
    return { status: 503, body: null };
  }
}

export interface Me {
  /** Staging/production: staff and caregivers must enrol MFA before anything else. */
  mfaSetupRequired?: boolean;
  user: null | { id: number; email: string; role: 'client' | 'caregiver' | 'admin'; name: string; locale: Locale; mfaEnabled: boolean };
}
