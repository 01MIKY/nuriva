import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, buttonClass } from '@nuriva/ui';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import type { PublicProfile } from '@/lib/search';
import type { Household } from '@/lib/household';
import type { Window } from '@/lib/bookings';
import { BookingForm } from '@/components/BookingForm';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { robots: { index: false } };

export default async function BookPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
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
      />
    </div>
  );
}
