import { en } from './en.js';
import { es } from './es.js';
import type { Catalog, MessageKey } from './types.js';

export type { Catalog, MessageKey };
export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const catalogs: Record<Locale, Catalog> = { en, es };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/** Picks a supported locale from an Accept-Language header. */
export function negotiateLocale(header: string | undefined): Locale {
  for (const part of (header ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().slice(0, 2);
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}

/** Translate a dotted key, interpolating {placeholders}. Throws on unknown keys so gaps surface in tests. */
export function t(locale: Locale, key: MessageKey, vars: Record<string, string | number> = {}): string {
  let node: unknown = catalogs[locale];
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== 'string') throw new Error(`Missing translation "${key}" for ${locale}`);
  return node.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export const formatMoney = (locale: Locale, cents: number): string =>
  new Intl.NumberFormat(locale === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export const formatDateTime = (locale: Locale, d: Date, timeZone = 'America/New_York'): string =>
  new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(d);
