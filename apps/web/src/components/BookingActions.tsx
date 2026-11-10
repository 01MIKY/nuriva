'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale, type MessageKey } from '@nuriva/i18n';
import { Alert, Button } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

/** Actions allowed by the booking state machine for the viewer (the API enforces the same rules). */
export function BookingActions({ locale, id, status, role, weekly = false }: { locale: Locale; id: number; status: string; role: 'client' | 'caregiver'; weekly?: boolean }) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const [confirmingSeries, setConfirmingSeries] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: 'accept' | 'decline' | 'cancel' | 'series/accept' | 'series/decline' | 'series/cancel') {
    setBusy(true);
    const r = await apiPost<{ changed?: number }>(`/v1/bookings/${id}/${action}`, {}, locale);
    setBusy(false);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setConfirming(false);
    setConfirmingSeries(false);
    setError(null);
    if (typeof r.data.changed === 'number') setDone(tr('web.bookings.seriesUpdated', { n: r.data.changed }));
    router.refresh();
  }

  const canRespond = role === 'caregiver' && status === 'requested';
  const canCancel = status === 'requested' || status === 'accepted';
  if (!canRespond && !canCancel) return done ? <Alert>{done}</Alert> : null;

  return (
    <div className="n-stack" style={{ ['--gap' as string]: '10px' }}>
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert>{done}</Alert>}
      {canRespond && (
        <div className="n-row">
          <Button onClick={() => act('accept')} disabled={busy}>{tr('web.bookings.accept')}</Button>
          <Button variant="secondary" onClick={() => act('decline')} disabled={busy}>{tr('web.bookings.decline')}</Button>
        </div>
      )}
      {canRespond && weekly && (
        <div className="n-row">
          <Button variant="secondary" onClick={() => act('series/accept')} disabled={busy}>{tr('web.bookings.acceptSeries')}</Button>
          <button type="button" className="link-btn" onClick={() => act('series/decline')} disabled={busy}>{tr('web.bookings.declineSeries')}</button>
        </div>
      )}
      {canCancel && !confirming && !confirmingSeries && (
        <div className="n-row">
          <button type="button" className="link-btn danger" onClick={() => setConfirming(true)}>{tr('web.bookings.cancel')}</button>
          {weekly && <button type="button" className="link-btn danger" onClick={() => setConfirmingSeries(true)}>{tr('web.bookings.cancelSeries')}</button>}
        </div>
      )}
      {confirmingSeries && (
        <div className="confirm" role="alertdialog" aria-label={tr('web.bookings.confirmCancelSeries')}>
          <span>{tr('web.bookings.confirmCancelSeries')}</span>
          <div className="n-row">
            <Button variant="quiet" onClick={() => setConfirmingSeries(false)}>{tr('web.bookings.keep')}</Button>
            <Button className="btn-danger" onClick={() => act('series/cancel')} disabled={busy}>{tr('web.bookings.confirmYes')}</Button>
          </div>
        </div>
      )}
      {confirming && (
        <div className="confirm" role="alertdialog" aria-label={tr('web.bookings.confirmCancel')}>
          <span>{tr('web.bookings.confirmCancel')}</span>
          <div className="n-row">
            <Button variant="quiet" onClick={() => setConfirming(false)}>{tr('web.bookings.keep')}</Button>
            <Button className="btn-danger" onClick={() => act('cancel')} disabled={busy}>{tr('web.bookings.confirmYes')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
