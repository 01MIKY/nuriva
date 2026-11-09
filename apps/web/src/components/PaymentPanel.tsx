'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, formatMoney, type Locale, type MessageKey } from '@nuriva/i18n';
import { Alert, Badge, Button, Card, type BadgeTone } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

type PayStatus = 'none' | 'pending' | 'paid' | 'refunded' | 'partially_refunded';
const LABEL: Record<PayStatus, MessageKey> = {
  none: 'web.pay.pending', pending: 'web.pay.pending', paid: 'web.pay.paid', refunded: 'web.pay.refunded', partially_refunded: 'web.pay.partiallyRefunded',
};
const TONE: Record<PayStatus, BadgeTone> = { none: 'pending', pending: 'pending', paid: 'ok', refunded: 'neutral', partially_refunded: 'neutral' };

interface Props {
  locale: Locale; id: number; role: 'client' | 'caregiver'; bookingStatus: string; returnedSession: string | null;
  payment: { status: PayStatus; paidCents: number; refundedCents: number };
}

/** Payment state of a booking; the family pays on Stripe Checkout and is confirmed on return. */
export function PaymentPanel({ locale, id, role, bookingStatus, returnedSession, payment }: Props) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const confirmed = useRef(false);

  // Coming back from Stripe Checkout: ask the API to verify the session with Stripe.
  useEffect(() => {
    if (!returnedSession || payment.status === 'paid' || confirmed.current) return;
    confirmed.current = true;
    setMsg({ tone: 'info', text: tr('web.pay.confirming') });
    void apiPost(`/v1/bookings/${id}/payment/confirm`, { sessionId: returnedSession }, locale).then((r) => {
      setMsg(r.ok ? { tone: 'info', text: tr('web.pay.confirmed') } : { tone: 'error', text: r.error.message || tr('errors.internal') });
      router.replace(`/${locale}/bookings/${id}`);
      router.refresh();
    });
  }, [returnedSession]); // eslint-disable-line react-hooks/exhaustive-deps

  const canPay = role === 'client' && bookingStatus === 'accepted' && (payment.status === 'none' || payment.status === 'pending');
  const money = (c: number) => formatMoney(locale, c);

  async function pay() {
    setBusy(true);
    const r = await apiPost<{ url: string }>(`/v1/bookings/${id}/checkout`, { locale }, locale);
    if (!r.ok) { setBusy(false); setMsg({ tone: 'error', text: r.error.message || tr('errors.internal') }); return; }
    window.location.assign(r.data.url);
  }

  return (
    <Card>
      <div className="n-stack" style={{ ['--gap' as string]: '10px' }}>
        <div className="approval-top">
          <h2 className="card-title">{tr('web.pay.title')}</h2>
          <Badge tone={TONE[payment.status]}>{tr(LABEL[payment.status])}</Badge>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {canPay && <p>{tr('web.pay.dueAfterAccept')}</p>}
        {role === 'caregiver' && bookingStatus === 'accepted' && payment.status !== 'paid' && <p className="n-muted">{tr('web.pay.awaitingPayment')}</p>}
        {payment.paidCents > 0 && <p>{tr('web.pay.paidAmount', { amount: money(payment.paidCents) })}</p>}
        {payment.refundedCents > 0 && <p>{tr('web.pay.refundedAmount', { amount: money(payment.refundedCents) })}</p>}
        {canPay && <Button onClick={pay} disabled={busy}>{busy ? tr('web.pay.redirecting') : tr('web.pay.payNow')}</Button>}
        <p className="n-hint">{tr('web.pay.securedBy')} {tr('web.pay.cancelPolicy')}</p>
      </div>
    </Card>
  );
}
