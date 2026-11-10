import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, buttonClass } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import type { PublicProfile } from '@/lib/search';
import type { Household } from '@/lib/household';
import { HALF_HOURS, type BookingView, type Window } from '@/lib/bookings';
import { BookingForm, type BookingDraft } from '@/components/BookingForm';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { robots: { index: false } };

export default async function BookPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ again?: string; sameTime?: string }> }) {
  const { id } = await params;
  const { again, sameTime } = await searchParams;
  const locale = await resolveLocale(params);
  const t = translator(locale);
  if (!UUID.test(id)) notFound();
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const user = me.body?.user;
  if (!user) redirect(`/${locale}/signin`);
  const prof = (await apiGet<{ caregiver: PublicProfile; bookingsEnabled: boolean; paymentsEnabled?: boolean }>(`/v1/caregivers/${id}`, locale)).body;
  if (!prof) notFound();
  const c = prof.caregiver;

  if (user.role !== 'client' || !prof.bookingsEnabled) {
    return (
      <div className="n-container account">
        <Alert>{user.role !== 'client' ? t('web.book.onlyFamilies') : t('errors.bookings_unavailable')}</Alert>
        <Link className={buttonClass('quiet')} href={`/${locale}/caregivers/${id}`}>{t('web.search.viewProfile')}</Link>
      </div>
    );
  }

  const [household, availability] = await Promise.all([
    apiGet<Household>('/v1/household', locale),
    apiGet<{ windows: Window[] }>(`/v1/caregivers/${id}/availability`, locale),
  ]);
  const initial = again && /^\d+$/.test(again) ? await draftFrom(again, id, household.body?.dependents ?? [], locale, sameTime === '1') : undefined;
  // Earliest selectable date: tomorrow in Miami (same-day requests still need ≥1 h lead time, checked by the API).
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + 86400_000));

  return (
    <div className="n-container book-page">
      <Link href={`/${locale}/caregivers/${id}`} className="back-link">← {c.displayName}</Link>
      <h1>{t('web.book.title', { name: c.displayName })}</h1>
      <BookingForm
        locale={locale}
        caregiver={{ id: c.id, displayName: c.displayName, hourlyRateCents: c.hourlyRateCents, divisions: c.divisions }}
        household={household.body?.dependents ?? []}
        windows={availability.body?.windows ?? []}
        minDate={tomorrow}
        paymentsEnabled={prof.paymentsEnabled === true}
        initial={initial}
      />
    </div>
  );
}

/** Miami wall-clock "HH:MM" of an instant. */
const localTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/**
 * "Book again": copies service, people, times, address and notes from one of the family's own bookings with
 * this caregiver. The API only returns the booking to its own parties, and anything that no longer applies
 * (a child removed from the household, a time that is not a half hour) is simply left out.
 * Backup guarantee (`backup`): the original caregiver declined or cancelled, so the details AND the date are
 * copied into a request to another caregiver.
 */
async function draftFrom(bookingId: string, caregiverId: string, household: Array<{ id: number; kind: 'child' | 'pet'; name: string }>, locale: 'en' | 'es', backup = false): Promise<BookingDraft | undefined> {
  const b = (await apiGet<{ booking: BookingView }>(`/v1/bookings/${bookingId}`, locale)).body?.booking;
  if (!b || b.viewerRole !== 'client') return undefined;
  const caregiverCouldNotGo = b.status === 'declined' || (b.status === 'cancelled' && b.cancelledBy === 'caregiver');
  if (backup ? !caregiverCouldNotGo : b.caregiver.publicId !== caregiverId) return undefined;
  const ids = b.dependents.flatMap((d) => {
    const match = household.find((h) => h.kind === d.kind && (d.id ? h.id === d.id : h.name === d.name));
    return match ? [match.id] : [];
  });
  const start = localTime(b.startAt);
  const endRaw = localTime(b.endAt);
  const end = endRaw === '00:00' ? '24:00' : endRaw;
  const valid = (x: string) => x === '24:00' || HALF_HOURS.includes(x);
  return {
    division: b.division, service: b.service, dependentIds: [...new Set(ids)],
    start: valid(start) ? start : '18:00', end: valid(end) ? end : '22:00',
    address: b.address ?? '', notes: b.notes ?? '',
    ...(backup ? { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(b.startAt)) } : {}),
  };
}
