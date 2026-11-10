'use client';
import { useState, type FormEvent } from 'react';
import { t, type Locale } from '@nuriva/i18n';
import { Alert, Badge, Button } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

export interface AdminReview { id: number; bookingId: number; rating: number; comment: string; hidden: boolean; createdAt: string; author: string }

export function ReviewRow({ locale, review }: { locale: Locale; review: AdminReview }) {
  const tr = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(locale, k, v);
  const [hidden, setHidden] = useState(review.hidden);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const action = hidden ? tr('admin.reviews.show') : tr('admin.reviews.hide');

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const reason = String(new FormData(ev.currentTarget).get('reason') ?? '').trim();
    if (reason.length < 3) return setError(tr('errors.validation'));
    const r = await apiPost<{ review: { hidden: boolean } }>(`/v1/admin/reviews/${review.id}/visibility`, { hidden: !hidden, reason }, locale);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setHidden(r.data.review.hidden);
    setOpen(false);
    setError(null);
    setDone(true);
  }

  return (
    <li className="comp-row">
      <div className="comp-head">
        <span className="comp-name">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)} <small className="n-muted">{tr('admin.reviews.by', { name: review.author, id: review.bookingId })}</small></span>
        <Badge tone={hidden ? 'danger' : 'ok'}>{hidden ? tr('admin.reviews.hidden') : tr('admin.reviews.visible')}</Badge>
        {!open && <button type="button" className="link-btn" onClick={() => { setOpen(true); setDone(false); }} aria-label={`${action}: #${review.id}`}>{action}</button>}
      </div>
      {review.comment && <p className="bio">{review.comment}</p>}
      {done && <p role="status" className="n-muted">{tr('admin.reviews.saved')}</p>}
      {open && (
        <form className="vet-form" noValidate onSubmit={submit} aria-label={`${action}: #${review.id}`}>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="n-field">
            <label className="n-label" htmlFor={`rv-reason-${review.id}`}>{tr('admin.reviews.reason')}</label>
            <input id={`rv-reason-${review.id}`} name="reason" className="n-input" maxLength={500} />
          </div>
          <div className="n-row">
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>{tr('admin.detail.cancel')}</Button>
            <Button type="submit">{tr('admin.reviews.confirm')}</Button>
          </div>
        </form>
      )}
    </li>
  );
}
