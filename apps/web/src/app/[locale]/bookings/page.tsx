import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Badge } from '@nuriva/ui';
import { formatMoney, type MessageKey } from '@nuriva/i18n';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { formatRange, statusTone, type BookingView } from '@/lib/bookings';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: translator(await resolveLocale(params))('web.bookings.title'), robots: { index: false } };
}

export default async function BookingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const user = me.body?.user;
  if (!user) redirect(`/${locale}/signin`);
  if (user.role === 'admin') redirect(`/${locale}/account`);
  const list = (await apiGet<{ bookings: BookingView[] }>('/v1/bookings', locale)).body?.bookings ?? [];
  const isCg = user.role === 'caregiver';

  return (
    <div className="n-container account">
      <h1>{t(isCg ? 'web.bookings.titleCaregiver' : 'web.bookings.title')}</h1>
      {list.length === 0 ? <p className="n-muted">{t(isCg ? 'web.bookings.emptyCaregiver' : 'web.bookings.empty')}</p> : (
        <ul className="booking-list">
          {list.map((b) => (
            <li key={b.id}>
              <Link href={`/${locale}/bookings/${b.id}`} className={`booking-card ${b.division}`}>
                <span className="booking-top">
                  <strong>{t(`services.${b.service}` as MessageKey)}</strong>
                  <Badge tone={statusTone[b.status]}>{t(`bookingStatus.${b.status}`)}</Badge>
                </span>
                <span>{formatRange(locale, b.startAt, b.endAt)}</span>
                <span className="n-muted">
                  {isCg ? t('web.bookings.from', { name: b.client.firstName }) : t('web.bookings.with', { name: b.caregiver.displayName })}
                  {' · '}{formatMoney(locale, isCg ? b.price.subtotalCents : b.price.totalCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
