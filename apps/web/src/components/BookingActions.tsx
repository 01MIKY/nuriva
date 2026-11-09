'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale, type MessageKey } from '@nuriva/i18n';
import { Alert, Button } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

/** Actions allowed by the booking state machine for the viewer (the API enforces the same rules). */
export function BookingActions({ locale, id, status, role }: { locale: Locale; id: number; status: string; role: 'client' | 'caregiver' }) {
  const tr = (k: MessageKey) => t(locale, k);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: 'accept' | 'decline' | 'cancel') {
    setBusy(true);
    const r = await apiPost(`/v1/bookings/${id}/${action}`, {}, locale);
    setBusy(false);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setConfirming(false);
    router.refresh();
  }

  const canRespond = role === 'caregiver' && status === 'requested';
  const canCancel = status === 'requested' || status === 'accepted';
  if (!canRespond && !canCancel) return null;

  return (
    <div className="n-stack" style={{ ['--gap' as string]: '10px' }}>
      {error && <Alert tone="error">{error}</Alert>}
      {canRespond && (
        <div className="n-row">
          <Button onClick={() => act('accept')} disabled={busy}>{tr('web.bookings.accept')}</Button>
          <Button variant="secondary" onClick={() => act('decline')} disabled={busy}>{tr('web.bookings.decline')}</Button>
        </div>
      )}
      {canCancel && !confirming && <button type="button" className="link-btn danger" onClick={() => setConfirming(true)}>{tr('web.bookings.cancel')}</button>}
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
