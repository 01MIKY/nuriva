'use client';
import { useState, type FormEvent } from 'react';
import { t, type Locale } from '@nuriva/i18n';
import { Alert, Badge, Button } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

export interface Activation { id: number; division: 'kids' | 'pets'; service: string; active: boolean; complianceRef: string; notes: string; createdAt: string }

export function ComplianceRow({ locale, division, service, current, counsel, canChange }: {
  locale: Locale; division: 'kids' | 'pets'; service: string; current: Activation | null; counsel: boolean; canChange: boolean;
}) {
  const tr = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(locale, k, v);
  const [state, setState] = useState(current);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = state?.active ?? false;
  const label = tr(`services.${service as 'occasional'}`);
  const action = active ? tr('admin.compliance.deactivate') : tr('admin.compliance.activate');

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const complianceRef = String(f.get('ref') ?? '').trim();
    if (complianceRef.length < 3) return setError(tr('errors.validation'));
    setBusy(true);
    const r = await apiPost<{ activation: Activation }>('/v1/admin/compliance/services', {
      division, service, active: !active, complianceRef, notes: String(f.get('notes') ?? '').trim(),
    }, locale);
    setBusy(false);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setState(r.data.activation);
    setOpen(false);
    setError(null);
  }

  return (
    <li className="comp-row">
      <div className="comp-head">
        <span className="comp-name">{label}</span>
        <Badge tone={active ? 'ok' : 'neutral'}>{active ? tr('admin.compliance.active') : tr('admin.compliance.inactive')}</Badge>
        {counsel && <Badge tone="pending">{tr('admin.compliance.counsel')}</Badge>}
        {canChange && !open && <button type="button" className="link-btn" onClick={() => setOpen(true)} aria-label={`${action}: ${label}`}>{action}</button>}
      </div>
      {state && <small className="n-muted">{tr('admin.compliance.lastChange', { ref: state.complianceRef })}</small>}
      {open && (
        <form className="vet-form" noValidate onSubmit={submit} aria-label={`${action}: ${label}`}>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="n-field">
            <label className="n-label" htmlFor={`ref-${division}-${service}`}>{tr('admin.compliance.ref')}</label>
            <input id={`ref-${division}-${service}`} name="ref" className="n-input" maxLength={200} aria-describedby={`refh-${division}-${service}`} />
            <span id={`refh-${division}-${service}`} className="n-hint">{tr('admin.compliance.refHint')}</span>
          </div>
          <div className="n-field">
            <label className="n-label" htmlFor={`notes-${division}-${service}`}>{tr('admin.compliance.notes')}</label>
            <input id={`notes-${division}-${service}`} name="notes" className="n-input" maxLength={2000} />
          </div>
          <div className="n-row">
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>{tr('admin.detail.cancel')}</Button>
            <Button type="submit" disabled={busy}>{busy ? tr('web.auth.submitting') : action}</Button>
          </div>
        </form>
      )}
    </li>
  );
}
