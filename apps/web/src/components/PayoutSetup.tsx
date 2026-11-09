'use client';
import { useState } from 'react';
import { t, type Locale } from '@nuriva/i18n';
import { Alert, Button } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

/** Sends the caregiver to Stripe-hosted onboarding (bank and tax details are collected by Stripe). */
export function PayoutSetup({ locale, label }: { locale: Locale; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="n-stack" style={{ ['--gap' as string]: '8px' }}>
      {error && <Alert tone="error">{error}</Alert>}
      <Button disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await apiPost<{ url: string }>('/v1/caregiver/payouts/onboarding', { locale }, locale);
        if (!r.ok) { setBusy(false); setError(r.error.message || t(locale, 'errors.internal')); return; }
        window.location.assign(r.data.url);
      }}>{busy ? t(locale, 'web.payouts.redirecting') : label}</Button>
    </div>
  );
}
