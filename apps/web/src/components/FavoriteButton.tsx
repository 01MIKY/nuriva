'use client';
import { useState } from 'react';
import { t, type Locale } from '@nuriva/i18n';
import { apiSend } from '@/lib/client-api';

/** Heart toggle on a caregiver profile (families only). Optimistic, reverts if the API refuses. */
export function FavoriteButton({ locale, caregiverId, initial }: { locale: Locale; caregiverId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    const r = await apiSend(next ? 'PUT' : 'DELETE', `/v1/favorites/${caregiverId}`, undefined, locale);
    setBusy(false);
    if (!r.ok) setOn(!next);
  }
  return (
    <button type="button" className="fav-btn" aria-pressed={on} disabled={busy} onClick={toggle}>
      <span aria-hidden="true">{on ? '♥' : '♡'}</span> {on ? t(locale, 'web.favorites.saved') : t(locale, 'web.favorites.save')}
    </button>
  );
}
