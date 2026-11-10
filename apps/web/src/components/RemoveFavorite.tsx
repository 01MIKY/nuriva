'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@nuriva/i18n';
import { apiSend } from '@/lib/client-api';

export function RemoveFavorite({ locale, caregiverId, label, name }: { locale: Locale; caregiverId: string; label: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="link-btn" disabled={busy} aria-label={`${label}: ${name}`}
      onClick={async () => { setBusy(true); const r = await apiSend('DELETE', `/v1/favorites/${caregiverId}`, undefined, locale); setBusy(false); if (r.ok) router.refresh(); }}>
      {label}
    </button>
  );
}
