import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, Badge, Card, buttonClass } from '@nuriva/ui';
import { formatMoney, type MessageKey } from '@nuriva/i18n';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { formatRange, statusTone, type BookingView } from '@/lib/bookings';
import { BookingActions } from '@/components/BookingActions';
import { PaymentPanel } from '@/components/PaymentPanel';
import { ChatPanel, IncidentPanel, ReviewPanel, TimelinePanel } from '@/components/ServicePanels';

export const metadata: Metadata = { robots: { index: false } };

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ sent?: string; paid?: string }> }) {
  const { id } = await params;
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  if (!me.body?.user) redirect(`/${locale}/signin`);
  if (!/^\d+$/.test(id)) notFound();
  const b = (await apiGet<{ booking: BookingView }>(`/v1/bookings/${id}`, locale)).body?.booking;
  if (!b) notFound();
  const { sent, paid } = await searchParams;
  const isCg = b.viewerRole === 'caregiver';
  const hidden = <span className="n-muted">{t('web.bookings.hiddenUntilAccept')}</span>;

  return (
    <div className="n-container account">
      <Link href={`/${locale}/bookings`} className="back-link">← {t('web.bookings.back')}</Link>
      {sent && b.status === 'requested' && <Alert>{t('web.book.sent')}</Alert>}
      <div className="booking-head">
        <h1>{t(`services.${b.service}` as MessageKey)}</h1>
        <Badge tone={statusTone[b.status]}>{t(`bookingStatus.${b.status}`)}</Badge>
      </div>
      <p className="n-muted">{isCg ? t('web.bookings.from', { name: b.client.firstName }) : t('web.bookings.with', { name: b.caregiver.displayName })}</p>
      {!isCg && b.caregiver.publicId && (b.status === 'completed' || b.status === 'cancelled') && (
        <Link className={buttonClass('primary')} href={`/${locale}/book/${b.caregiver.publicId}?again=${b.id}`}>{t('web.book.again')}</Link>
      )}
      <Card>
        <dl className="kv">
          <dt>{t('web.bookings.when')}</dt><dd>{formatRange(locale, b.startAt, b.endAt)}</dd>
          <dt>{t('web.bookings.who')}</dt>
          <dd>
            <ul className="who-list">
              {b.dependents.map((d, i) => (
                <li key={i}>
                  <strong>{d.name ?? (d.kind === 'pet' ? t(`web.household.speciesOptions.${String(d.details.species) as 'dog'}`) : t('web.bookings.childLabel'))}</strong>
                  {' · '}{t('web.bookings.ageYears', { n: Number(d.details.ageYears) })}
                  {b.detailsRevealed && d.details.allergies ? <span className="n-error"> · {t('web.bookings.allergy', { text: String(d.details.allergies) })}</span> : null}
                  {b.detailsRevealed && d.details.medications ? <span> · {t('web.bookings.medication', { text: String(d.details.medications) })}</span> : null}
                </li>
              ))}
            </ul>
          </dd>
          <dt>{t('web.bookings.address')}</dt><dd>{b.address ?? hidden}</dd>
          <dt>{t('web.bookings.notes')}</dt><dd>{b.detailsRevealed ? (b.notes || '—') : hidden}</dd>
        </dl>
      </Card>
      <Card>
        <dl className="sum">
          {isCg
            ? <div className="sum-total"><dt>{t('web.book.subtotal', { hours: ((new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 3600000).toLocaleString(locale), rate: formatMoney(locale, b.price.hourlyRateCents) })}</dt><dd>{formatMoney(locale, b.price.subtotalCents)}</dd></div>
            : <>
                <div><dt>{t('web.book.subtotal', { hours: ((new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 3600000).toLocaleString(locale), rate: formatMoney(locale, b.price.hourlyRateCents) })}</dt><dd>{formatMoney(locale, b.price.subtotalCents)}</dd></div>
                <div><dt>{t('web.book.fee')}</dt><dd>{formatMoney(locale, b.price.clientFeeCents)}</dd></div>
                <div className="sum-total"><dt>{t('web.book.total')}</dt><dd>{formatMoney(locale, b.price.totalCents)}</dd></div>
              </>}
        </dl>
        {!b.paymentsEnabled && <p className="n-hint">{t('web.bookings.estimateNote')}</p>}
      </Card>
      {b.paymentsEnabled && ['accepted', 'cancelled', 'completed', 'in_progress'].includes(b.status) && (
        <PaymentPanel locale={locale} id={b.id} role={b.viewerRole} bookingStatus={b.status} payment={b.payment}
          returnedSession={paid && /^cs_[A-Za-z0-9_]+$/.test(paid) ? paid : null} />
      )}
      {['accepted', 'in_progress', 'completed'].includes(b.status) && <TimelinePanel locale={locale} id={b.id} role={b.viewerRole} status={b.status} />}
      {b.status === 'completed' && b.viewerRole === 'client' && <ReviewPanel locale={locale} id={b.id} />}
      <ChatPanel locale={locale} id={b.id} closed={b.status === 'declined' || b.status === 'cancelled'} />
      <BookingActions locale={locale} id={b.id} status={b.status} role={b.viewerRole} />
      <IncidentPanel locale={locale} id={b.id} division={b.division} />
    </div>
  );
}
