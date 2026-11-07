import { notFound } from 'next/navigation';
import { isLocale, t, type Locale, type MessageKey } from '@nuriva/i18n';

export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translator(locale: Locale): T {
  return (key, vars) => t(locale, key, vars);
}

/** Resolves the [locale] route param or 404s for unsupported languages. */
export async function resolveLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

export const otherLocale = (l: Locale): Locale => (l === 'en' ? 'es' : 'en');
