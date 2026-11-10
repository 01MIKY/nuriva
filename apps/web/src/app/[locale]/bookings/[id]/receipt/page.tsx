import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Logo } from '@nuriva/ui';
import { formatMoney, type MessageKey } from '@nuriva/i18n';
import { resolveLocale, translator } from '@/lib/i18n';
import { apiGet, type Me } from '@/lib/server-api';
import { formatRange } from '@/lib/bookings';
import { PrintButton } from '@/components/PrintButton';

interface Base {
  number: string; issuedAt: string; viewerRole: 'client' | 'caregiver'; status: string; service: string; division: 'kids' | 'pets';
  startAt: string; endAt: string; minutes: number; hourlyRateCents: number; subtotalCents: number; caregiver: string; family: string;
}
type Receipt =
  | (Base & { viewerRole: 'client'; clientFeeCents: number; totalCents: number; payment: { status: string; paidCents: number; refundedCents: number; netPaidCents: number; paidAt: string | null } })
  | (Base & { viewerRole: 'caregiver'; commissionRate: number; commissionCents: number; netCents: number; paid: boolean });

export const metadata: Metadata = { robots: { index: false } };

/** Printable receipt (the browser's "Save as PDF" makes the PDF). Not a tax invoice — the page says so. */
export default async function ReceiptPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const locale = await resolveLocale(params);
  const t = translator(locale);
  const me = await apiGet<Me>('/v1/auth/me', locale);
  if (!me.body?.user) redirect(`/${locale}/signin`);
  if (!/^\d+$/.test(id)) notFound();
  const r = (await apiGet<{ receipt: Receipt }>(`/v1/bookings/${id}/receipt`, locale)).body?.receipt;
  if (!r) notFound();
  const money = (c: number) => formatMoney(locale, c);
  const day = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'long', timeZone: 'America/New_York' });
  const hours = (r.minutes / 60).toLocaleString(locale);
  const isClient = r.viewerRole === 'client';
  const paid = isClient ? r.payment.paidCents > 0 : r.paid;
  const title = !isClient ? t('web.receipt.titleEarnings') : paid ? t('web.receipt.titlePaid') : t('web.receipt.titleService');

  return (
    <div className="n-container receipt-page">
      <Link href={`/${locale}/bookings/${id}`} className="back-link no-print">← {t('web.receipt.back')}</Link>
      <article className="receipt" aria-labelledby="receipt-h">
        <header className="receipt-head">
          <Logo size={28} />
          <div className="receipt-id">
            <h1 id="receipt-h">{title}</h1>
            <p>{t('web.receipt.number', { n: r.number })} · {t('web.receipt.issued', { date: day.format(new Date(r.issuedAt)) })}</p>
          </div>
        </header>
        <dl className="kv">
          <dt>{t('web.receipt.service')}</dt><dd>{t(`services.${r.service}` as MessageKey)} · {t(`divisions.${r.division}`)}</dd>
          <dt>{t('web.receipt.when')}</dt><dd>{formatRange(locale, r.startAt, r.endAt)}</dd>
          <dt>{t('web.receipt.caregiver')}</dt><dd>{r.caregiver}</dd>
          <dt>{t('web.receipt.family')}</dt><dd>{r.family}</dd>
        </dl>
        <dl className="sum">
          <div><dt>{t('web.book.subtotal', { hours, rate: money(r.hourlyRateCents) })}</dt><dd>{money(r.subtotalCents)}</dd></div>
          {isClient ? (
            <>
              <div><dt>{t('web.receipt.fee')}</dt><dd>{money(r.clientFeeCents)}</dd></div>
              <div className="sum-total"><dt>{t('web.book.total')}</dt><dd>{money(r.totalCents)}</dd></div>
              {paid && (
                <>
                  <div><dt>{r.payment.paidAt ? t('web.receipt.paidOn', { date: day.format(new Date(r.payment.paidAt)) }) : t('web.receipt.paid')}</dt><dd>{money(r.payment.paidCents)}</dd></div>
                  {r.payment.refundedCents > 0 && <div><dt>{t('web.receipt.refunded')}</dt><dd>− {money(r.payment.refundedCents)}</dd></div>}
                  <div className="sum-total"><dt>{t('web.receipt.netPaid')}</dt><dd>{money(r.payment.netPaidCents)}</dd></div>
                </>
              )}
            </>
          ) : (
            <>
              <div><dt>{t('web.receipt.commission', { rate: Math.round(r.commissionRate * 100) })}</dt><dd>− {money(r.commissionCents)}</dd></div>
              <div className="sum-total"><dt>{t('web.receipt.net')}</dt><dd>{money(r.netCents)}</dd></div>
            </>
          )}
        </dl>
        <footer className="receipt-notes">
          <p>{paid ? t('web.receipt.paidNote') : t('web.receipt.notPaid')}</p>
          {!isClient && paid && <p>{t('web.receipt.caregiverNote')}</p>}
          <p>{t('web.receipt.taxNote')}</p>
        </footer>
      </article>
      <PrintButton label={t('web.receipt.print')} />
    </div>
  );
}
