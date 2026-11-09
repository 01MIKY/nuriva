'use client';
import { useState, type FormEvent } from 'react';
import { t, type Locale } from '@nuriva/i18n';
import { STEP_STATUSES, type StepStatus, type VettingStep } from '@nuriva/domain';
import { Alert, Badge, Button, Card, type BadgeTone } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

const tone: Record<StepStatus, BadgeTone> = { not_started: 'neutral', pending: 'pending', passed: 'ok', failed: 'danger' };

export function VettingPanel({ locale, caregiverId, initialSteps, canWrite, canBackground, identityCheck }: {
  locale: Locale; caregiverId: number; initialSteps: Array<{ step: VettingStep; status: StepStatus }>; canWrite: boolean; canBackground: boolean;
  identityCheck: { status: string; sessionId: string | null } | null;
}) {
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k);
  const [steps, setSteps] = useState(initialSteps);
  const [open, setOpen] = useState<VettingStep | null>(null);
  const [prefill, setPrefill] = useState('');
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent<HTMLFormElement>, step: VettingStep) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const reference = String(f.get('reference') ?? '').trim();
    if (reference.length < 3) { setMsg({ tone: 'error', text: tr('errors.validation') }); return; }
    setBusy(true);
    const r = await apiPost<{ steps: typeof steps }>(`/v1/admin/caregivers/${caregiverId}/vetting`, { step, status: String(f.get('status')), reference }, locale);
    setBusy(false);
    if (!r.ok) { setMsg({ tone: 'error', text: r.error.message || tr('errors.internal') }); return; }
    setSteps(r.data.steps);
    setOpen(null);
    setMsg({ tone: 'info', text: tr('admin.detail.saved') });
  }

  return (
    <Card>
      <div className="n-stack">
        <h2 className="admin-h2">{tr('admin.detail.vetting')}</h2>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <ol className="vet-list">
          {steps.map(({ step, status }) => {
            const restricted = step === 'background' && !canBackground;
            return (
              <li key={step} className="vet-row">
                <div className="vet-head">
                  <span className="vet-name">{tr(`vetting.steps.${step}`)}</span>
                  <Badge tone={tone[status]}>{tr(`vetting.status.${status}`)}</Badge>
                  {step === 'identity' && identityCheck && identityCheck.status !== 'none' && (
                    <Badge tone={identityCheck.status === 'verified' ? 'ok' : 'pending'}>{tr('web.identity.adminTitle')}: {tr(`web.identity.status${identityCheck.status.charAt(0).toUpperCase()}${identityCheck.status.slice(1)}` as Parameters<typeof t>[1])}</Badge>
                  )}
                  {step === 'identity' && canWrite && open !== step && identityCheck?.status === 'verified' && identityCheck.sessionId && (
                    <button type="button" className="link-btn" onClick={() => { setPrefill(t(locale, 'web.identity.evidence', { id: identityCheck.sessionId! })); setOpen('identity'); setMsg(null); }}>
                      {tr('web.identity.useAsEvidence')}
                    </button>
                  )}
                  {canWrite && !restricted && open !== step && (
                    <button type="button" className="link-btn" onClick={() => { setPrefill(''); setOpen(step); setMsg(null); }} aria-label={`${tr('admin.detail.update')}: ${tr(`vetting.steps.${step}`)}`}>
                      {tr('admin.detail.update')}
                    </button>
                  )}
                </div>
                {restricted && canWrite && <small className="n-muted">{tr('admin.detail.backgroundRestricted')}</small>}
                {open === step && (
                  <form className="vet-form" noValidate onSubmit={(e) => submit(e, step)} aria-label={`${tr('admin.detail.update')}: ${tr(`vetting.steps.${step}`)}`}>
                    <div className="n-field">
                      <label className="n-label" htmlFor={`st-${step}`}>{tr('admin.detail.status')}</label>
                      <select id={`st-${step}`} name="status" className="n-input" defaultValue={prefill ? 'passed' : status === 'not_started' ? 'pending' : status}>
                        {STEP_STATUSES.map((s) => <option key={s} value={s}>{tr(`vetting.status.${s}`)}</option>)}
                      </select>
                    </div>
                    <div className="n-field">
                      <label className="n-label" htmlFor={`ref-${step}`}>{tr('admin.detail.reference')}</label>
                      <textarea id={`ref-${step}`} name="reference" className="n-input" rows={2} maxLength={500} required minLength={3} aria-describedby={`refh-${step}`} defaultValue={prefill} />
                      <span id={`refh-${step}`} className="n-hint">{tr('admin.detail.referenceHint')}</span>
                    </div>
                    <div className="n-row">
                      <Button type="button" variant="quiet" onClick={() => setOpen(null)}>{tr('admin.detail.cancel')}</Button>
                      <Button type="submit" disabled={busy}>{busy ? tr('web.auth.submitting') : tr('admin.detail.save')}</Button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
