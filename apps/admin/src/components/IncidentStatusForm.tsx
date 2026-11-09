'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale } from '@nuriva/i18n';
import { Alert, Button, Card } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

export function IncidentStatusForm({ locale, id, status }: { locale: Locale; id: number; status: 'open' | 'investigating' | 'resolved' }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const note = String(f.get('note') ?? '').trim();
    if (note.length < 3) return setMsg({ tone: 'error', text: t(locale, 'errors.validation') });
    const r = await apiPost(`/v1/admin/incidents/${id}/status`, { status: String(f.get('status')), note }, locale);
    if (!r.ok) return setMsg({ tone: 'error', text: r.error.message || t(locale, 'errors.internal') });
    setMsg({ tone: 'info', text: t(locale, 'admin.incidents.saved') });
    router.refresh();
  }
  return (
    <Card>
      <form className="n-stack" onSubmit={submit} noValidate aria-label={t(locale, 'admin.incidents.update')}>
        <h2 className="admin-h2">{t(locale, 'admin.incidents.update')}</h2>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="n-field">
          <label className="n-label" htmlFor="inc-status">{t(locale, 'admin.detail.status')}</label>
          <select id="inc-status" name="status" className="n-input" defaultValue={status === 'open' ? 'investigating' : status}>
            {(['open', 'investigating', 'resolved'] as const).map((s) => <option key={s} value={s}>{t(locale, `admin.incidents.status.${s}`)}</option>)}
          </select>
        </div>
        <div className="n-field">
          <label className="n-label" htmlFor="inc-note">{t(locale, 'admin.incidents.note')}</label>
          <textarea id="inc-note" name="note" className="n-input" rows={3} maxLength={2000} />
        </div>
        <Button type="submit">{t(locale, 'admin.incidents.save')}</Button>
      </form>
    </Card>
  );
}
