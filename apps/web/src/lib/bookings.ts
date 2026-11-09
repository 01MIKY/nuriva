import type { Locale } from '@nuriva/i18n';
import type { BadgeTone } from '@nuriva/ui';

export interface Window { weekday: number; start: string; end: string }
export interface BookingView {
  id: number; status: 'requested' | 'accepted' | 'declined' | 'cancelled' | 'in_progress' | 'completed';
  division: 'kids' | 'pets'; service: string; startAt: string; endAt: string; createdAt: string;
  price: { hourlyRateCents: number; subtotalCents: number; clientFeeCents: number; totalCents: number; estimate: boolean };
  caregiver: { displayName: string; publicId: string | null };
  client: { firstName: string };
  dependents: Array<{ kind: 'child' | 'pet'; name?: string; details: Record<string, string | number> }>;
  address: string | null; notes: string | null; detailsRevealed: boolean; viewerRole: 'client' | 'caregiver';
}

/** Half-hour options for time pickers. */
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export function formatRange(locale: Locale, startIso: string, endIso: string) {
  const tz = 'America/New_York';
  const lc = locale === 'es' ? 'es-US' : 'en-US';
  const day = new Intl.DateTimeFormat(lc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date(startIso));
  const time = new Intl.DateTimeFormat(lc, { hour: 'numeric', minute: '2-digit', timeZone: tz });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time.format(new Date(startIso))} – ${time.format(new Date(endIso))}`;
}

export const statusTone: Record<BookingView['status'], BadgeTone> = {
  requested: 'pending', accepted: 'ok', in_progress: 'ok', completed: 'neutral', declined: 'danger', cancelled: 'neutral',
};
