'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale, type MessageKey } from '@nuriva/i18n';
import { Alert, Button, Card } from '@nuriva/ui';
import { offPlatformSignals, type OffPlatformSignal } from '@nuriva/domain';
import { apiPost, apiSend } from '@/lib/client-api';

type Tr = (k: MessageKey, v?: Record<string, string | number>) => string;
const useTr = (locale: Locale): Tr => (k, v) => t(locale, k, v);
const timeFmt = (locale: Locale) => new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'America/New_York' });

interface Update { id: number; kind: 'check_in' | 'update' | 'check_out'; note: string | null; createdAt: string }

/** Care timeline. Caregivers check in, post updates and check out; families see the timeline (refreshes every 30 s). */
export function TimelinePanel({ locale, id, role, status }: { locale: Locale; id: number; role: 'client' | 'caregiver'; status: string }) {
  const tr = useTr(locale);
  const router = useRouter();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await apiSend<{ updates: Update[] }>('GET', `/v1/bookings/${id}/timeline`, null, locale);
    if (r.ok) setUpdates(r.data.updates);
  }, [id, locale]);
  useEffect(() => {
    void load();
    if (status !== 'in_progress') return;
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load, status]);

  async function act(path: 'check-in' | 'check-out') {
    setBusy(true);
    const r = await apiPost(`/v1/bookings/${id}/${path}`, {}, locale);
    setBusy(false);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setError(null);
    router.refresh();
    void load();
  }

  async function post(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const note = String(new FormData(form).get('note') ?? '').trim();
    if (!note) return;
    const r = await apiPost<{ updates: Update[] }>(`/v1/bookings/${id}/updates`, { note }, locale);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setUpdates(r.data.updates);
    form.reset();
  }

  const fmt = timeFmt(locale);
  return (
    <Card>
      <div className="n-stack" style={{ ['--gap' as string]: '12px' }}>
        <div className="approval-top">
          <h2 className="card-title">{tr('web.service.timeline')}</h2>
          {status === 'in_progress' && <button type="button" className="link-btn" onClick={load}>{tr('web.service.refresh')}</button>}
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {updates.length === 0 ? <p className="n-muted">{tr('web.service.noUpdates')}</p> : (
          <ol className="timeline">
            {updates.map((u) => (
              <li key={u.id} className={`tl-${u.kind}`}>
                <strong>{tr(`web.service.kind.${u.kind}`)}</strong>
                {u.note && <span>{u.note}</span>}
                <small className="n-muted">{fmt.format(new Date(u.createdAt))}</small>
              </li>
            ))}
          </ol>
        )}
        {role === 'caregiver' && status === 'accepted' && <Button onClick={() => act('check-in')} disabled={busy}>{tr('web.service.checkIn')}</Button>}
        {role === 'caregiver' && status === 'in_progress' && (
          <>
            <form className="inline-form" onSubmit={post} aria-label={tr('web.service.addUpdate')}>
              <label className="n-label" htmlFor="upd-note">{tr('web.service.addUpdate')}</label>
              <div className="inline-row">
                <input id="upd-note" name="note" className="n-input" maxLength={500} placeholder={tr('web.service.updatePh')} />
                <Button type="submit">{tr('web.service.send')}</Button>
              </div>
            </form>
            <Button variant="secondary" onClick={() => act('check-out')} disabled={busy}>{tr('web.service.checkOut')}</Button>
          </>
        )}
      </div>
    </Card>
  );
}

interface Msg { id: number; mine: boolean; body: string; createdAt: string; signals?: string[] }

/** Conversation between the family and the caregiver of this booking (refreshes every 15 s). */
export function ChatPanel({ locale, id, closed }: { locale: Locale; id: number; closed: boolean }) {
  const tr = useTr(locale);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await apiSend<{ messages: Msg[] }>('GET', `/v1/bookings/${id}/messages`, null, locale);
    if (r.ok) setMessages(r.data.messages);
  }, [id, locale]);
  useEffect(() => {
    void load();
    if (closed) return;
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load, closed]);

  const [draft, setDraft] = useState('');
  // Friendly reminder before sending contact details or off-app payment talk. Never blocks (docs/RETENTION.md).
  const [warning, setWarning] = useState<OffPlatformSignal[] | null>(null);

  async function deliver(body: string) {
    const r = await apiPost<{ message: Msg }>(`/v1/bookings/${id}/messages`, { body }, locale);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setError(null);
    setWarning(null);
    setMessages((m) => [...m, r.data.message]);
    setDraft('');
  }

  async function send(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const signals = offPlatformSignals(body);
    if (signals.length && !warning) return setWarning(signals);
    await deliver(body);
  }

  const fmt = timeFmt(locale);
  return (
    <Card>
      <div className="n-stack" style={{ ['--gap' as string]: '12px' }}>
        <h2 className="card-title">{tr('web.service.messages')}</h2>
        {error && <Alert tone="error">{error}</Alert>}
        {messages.length === 0 ? <p className="n-muted">{tr('web.service.noMessages')}</p> : (
          <ul className="chat" aria-live="polite">
            {messages.map((m) => (
              <li key={m.id} className={m.mine ? 'mine' : 'theirs'}>
                <span>{m.body}</span>
                <small>{m.mine ? `${tr('web.service.you')} · ` : ''}{fmt.format(new Date(m.createdAt))}</small>
                {m.signals?.length ? <small className="chat-reminder">ⓘ {tr('web.service.offReminder')}</small> : null}
              </li>
            ))}
          </ul>
        )}
        {!closed && (
          <form className="inline-row" onSubmit={send} aria-label={tr('web.service.messages')}>
            <label htmlFor="chat-body" className="sr-only">{tr('web.service.messagePh')}</label>
            <input id="chat-body" name="body" className="n-input" maxLength={1000} placeholder={tr('web.service.messagePh')} autoComplete="off"
              value={draft} onChange={(e) => { setDraft(e.target.value); setWarning(null); }} />
            <Button type="submit">{tr('web.service.send')}</Button>
          </form>
        )}
        {!closed && warning && (
          <div className="confirm off-warning" role="alertdialog" aria-labelledby="off-title" aria-describedby="off-body">
            <strong id="off-title">{tr('web.service.offTitle')}</strong>
            <span id="off-body">{tr(warning.includes('payment') ? 'web.service.offPayment' : 'web.service.offContact')}</span>
            <div className="n-row">
              <Button variant="quiet" onClick={() => { setWarning(null); document.getElementById('chat-body')?.focus(); }}>{tr('web.service.editMessage')}</Button>
              <Button variant="secondary" onClick={() => void deliver(draft.trim())}>{tr('web.service.sendAnyway')}</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** The family's review of a completed booking (one per booking). */
export function ReviewPanel({ locale, id }: { locale: Locale; id: number }) {
  const tr = useTr(locale);
  const [existing, setExisting] = useState<{ rating: number; comment: string } | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiSend<{ review: { rating: number; comment: string } | null }>('GET', `/v1/bookings/${id}/review`, null, locale)
      .then((r) => setExisting(r.ok ? r.data.review : null));
  }, [id, locale]);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!rating) return setError(tr('errors.validation'));
    const comment = String(new FormData(ev.currentTarget).get('comment') ?? '').trim();
    const r = await apiPost<{ review: { rating: number; comment: string } }>(`/v1/bookings/${id}/review`, { rating, comment }, locale);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setExisting(r.data.review);
  }

  if (existing === undefined) return null;
  return (
    <Card>
      <div className="n-stack" style={{ ['--gap' as string]: '10px' }}>
        <h2 className="card-title">{existing ? tr('web.service.yourReview') : tr('web.service.reviewTitle')}</h2>
        {existing ? (
          <>
            <p className="stars" aria-label={tr('web.service.stars', { n: existing.rating })}>{'★'.repeat(existing.rating)}{'☆'.repeat(5 - existing.rating)}</p>
            {existing.comment && <p>{existing.comment}</p>}
          </>
        ) : (
          <form className="n-stack" onSubmit={submit} noValidate aria-label={tr('web.service.reviewTitle')} style={{ ['--gap' as string]: '10px' }}>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="star-picker" role="radiogroup" aria-label={tr('web.service.reviewTitle')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={tr('web.service.stars', { n })}
                  className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</button>
              ))}
            </div>
            <label className="n-label" htmlFor="rv-comment">{tr('web.service.reviewComment')}</label>
            <textarea id="rv-comment" name="comment" className="n-input n-textarea" maxLength={1000} />
            <Button type="submit">{tr('web.service.submitReview')}</Button>
          </form>
        )}
      </div>
    </Card>
  );
}

/** Report a problem to Trust & Safety. Emergencies show 911 (and, for Kids, the Florida Abuse Hotline). */
export function IncidentPanel({ locale, id, division }: { locale: Locale; id: number; division: 'kids' | 'pets' }) {
  const tr = useTr(locale);
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'emergency'>('medium');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urgent = severity === 'emergency' || severity === 'high';

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const description = String(new FormData(ev.currentTarget).get('description') ?? '').trim();
    if (description.length < 10) return setError(tr('web.service.describeHint'));
    const r = await apiPost(`/v1/bookings/${id}/incidents`, { severity, description }, locale);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setDone(true);
  }

  return (
    <Card className="incident-card">
      <div className="n-stack" style={{ ['--gap' as string]: '10px' }}>
        <p className="n-hint">{tr('web.service.always911')}</p>
        {!open && !done && <button type="button" className="link-btn danger" onClick={() => setOpen(true)}>{tr('web.service.reportOpen')}</button>}
        {(open || done) && urgent && (
          <div className="emergency" role="alert">
            <strong>{tr('web.service.emergencyTitle')}</strong>
            <span>{tr('web.service.emergencyBody')}</span>
            {division === 'kids' && <span>{tr('web.service.abuseHotline')}</span>}
          </div>
        )}
        {done && <Alert>{tr('web.service.reported')}</Alert>}
        {open && !done && (
          <form className="n-stack" onSubmit={submit} noValidate aria-label={tr('web.service.reportTitle')} style={{ ['--gap' as string]: '10px' }}>
            <h2 className="card-title">{tr('web.service.reportTitle')}</h2>
            {error && <Alert tone="error">{error}</Alert>}
            <label className="n-label" htmlFor="inc-sev">{tr('web.service.severity')}</label>
            <select id="inc-sev" className="n-input" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
              {(['low', 'medium', 'high', 'emergency'] as const).map((s) => <option key={s} value={s}>{tr(`web.service.sev.${s}`)}</option>)}
            </select>
            <label className="n-label" htmlFor="inc-desc">{tr('web.service.describe')}</label>
            <textarea id="inc-desc" name="description" className="n-input n-textarea" maxLength={2000} aria-describedby="inc-hint" />
            <span id="inc-hint" className="n-hint">{tr('web.service.describeHint')}</span>
            <Button type="submit" className={urgent ? 'btn-danger' : undefined}>{tr('web.service.submitReport')}</Button>
          </form>
        )}
      </div>
    </Card>
  );
}
