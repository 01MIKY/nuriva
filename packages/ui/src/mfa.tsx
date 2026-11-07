'use client';
/**
 * Two-step verification UI shared by the client/caregiver app and the admin panel.
 * Network calls are injected (`send`) so each app keeps its own same-origin API proxy.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { t, type Locale } from '@nuriva/i18n';
import { Alert, Badge, Button, Card, Field } from './index.js';

export type Send = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<{ ok: true; data: T } | { ok: false; error: { error: string; message: string } }>;

const tr = (l: Locale, k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(l, k, v);

/** Second step of sign-in: TOTP code, or a one-time recovery code. */
export function MfaChallenge({ locale, challenge, send, onSuccess }: { locale: Locale; challenge: string; send: Send; onSuccess: () => void }) {
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const value = String(new FormData(ev.currentTarget).get('code') ?? '').trim();
    if (!recovery && !/^\d{6}$/.test(value)) return setError(tr(locale, 'mfa.codeInvalid'));
    if (recovery && value.length < 8) return setError(tr(locale, 'errors.validation'));
    setBusy(true);
    const r = await send('POST', '/v1/auth/mfa/verify', recovery ? { challenge, recoveryCode: value } : { challenge, code: value });
    setBusy(false);
    if (!r.ok) return setError(r.error.message || tr(locale, 'errors.internal'));
    onSuccess();
  }

  return (
    <form className="n-stack" onSubmit={submit} noValidate aria-label={tr(locale, 'mfa.challengeTitle')}>
      <h2 className="n-mfa-title">{tr(locale, 'mfa.challengeTitle')}</h2>
      <p className="n-muted">{tr(locale, 'mfa.challengeBody')}</p>
      {error && <Alert tone="error">{error}</Alert>}
      {recovery
        ? <Field key="rc" label={tr(locale, 'mfa.recoveryLabel')} name="code" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} />
        : <Field key="totp" label={tr(locale, 'mfa.codeLabel')} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" />}
      <Button type="submit" block disabled={busy}>{busy ? tr(locale, 'web.auth.submitting') : tr(locale, 'mfa.verify')}</Button>
      <button type="button" className="n-linkbtn" onClick={() => { setRecovery(!recovery); setError(null); }}>
        {tr(locale, recovery ? 'mfa.useCode' : 'mfa.useRecovery')}
      </button>
    </form>
  );
}

interface Status { enabled: boolean; required: boolean; recoveryCodesLeft: number }
interface Setup { secret: string; otpauthUrl: string; qrSvg: string }

/** Security settings: status, enrolment (QR + confirm + recovery codes) and, where allowed, turning it off. */
export function MfaSettings({ locale, send, allowDisable, onEnabled }: { locale: Locale; send: Send; allowDisable: boolean; onEnabled?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => { const r = await send<Status>('GET', '/v1/auth/mfa/status'); if (r.ok) setStatus(r.data); };
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setMsg(null);
    const r = await send<Setup>('POST', '/v1/auth/mfa/setup', {});
    if (!r.ok) return setMsg({ tone: 'error', text: r.error.message });
    setSetup(r.data);
  }

  async function confirm(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const code = String(new FormData(ev.currentTarget).get('code') ?? '').trim();
    if (!/^\d{6}$/.test(code)) return setMsg({ tone: 'error', text: tr(locale, 'mfa.codeInvalid') });
    setBusy(true);
    const r = await send<{ recoveryCodes: string[] }>('POST', '/v1/auth/mfa/enable', { code });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'error', text: r.error.message });
    setSetup(null);
    setMsg(null);
    setCodes(r.data.recoveryCodes);
  }

  async function disable(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setBusy(true);
    const r = await send('POST', '/v1/auth/mfa/disable', { password: String(f.get('password') ?? ''), code: String(f.get('code') ?? '').trim() });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'error', text: r.error.message });
    setDisabling(false);
    setMsg({ tone: 'info', text: tr(locale, 'mfa.disabledMsg') });
    void refresh();
  }

  return (
    <Card>
      <div className="n-stack">
        <div className="n-mfa-head">
          <h2 className="n-mfa-title">{tr(locale, 'mfa.title')}</h2>
          {status && <Badge tone={status.enabled ? 'ok' : 'neutral'}>{tr(locale, status.enabled ? 'mfa.statusOn' : 'mfa.statusOff')}</Badge>}
        </div>
        <p className="n-muted">{tr(locale, 'mfa.intro')}</p>
        <p className="n-hint">{tr(locale, 'mfa.requiredNote')}</p>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        {codes && (
          <div className="n-stack n-mfa-codes" role="region" aria-label={tr(locale, 'mfa.recoveryTitle')}>
            <h3 className="n-mfa-sub">{tr(locale, 'mfa.recoveryTitle')}</h3>
            <p>{tr(locale, 'mfa.recoveryBody')}</p>
            <ol className="n-mfa-codelist">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
            <Button onClick={() => { setCodes(null); setMsg({ tone: 'info', text: tr(locale, 'mfa.enabledMsg') }); void refresh(); onEnabled?.(); }}>
              {tr(locale, 'mfa.recoverySaved')}
            </Button>
          </div>
        )}

        {!codes && status && !status.enabled && !setup && <Button onClick={start}>{tr(locale, 'mfa.start')}</Button>}

        {setup && (
          <div className="n-stack">
            <p>{tr(locale, 'mfa.scan')}</p>
            {/* SVG generated by our own API from the otpauth URL. */}
            <div className="n-mfa-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
            <p className="n-hint">{tr(locale, 'mfa.manual')}</p>
            <code className="n-mfa-secret">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
            <form className="n-stack" onSubmit={confirm} noValidate aria-label={tr(locale, 'mfa.confirm')}>
              <Field label={tr(locale, 'mfa.codeLabel')} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
              <div className="n-row">
                <Button type="button" variant="quiet" onClick={() => setSetup(null)}>{tr(locale, 'mfa.cancel')}</Button>
                <Button type="submit" disabled={busy}>{tr(locale, 'mfa.confirm')}</Button>
              </div>
            </form>
          </div>
        )}

        {!codes && status?.enabled && (
          <p className="n-hint">{tr(locale, 'mfa.recoveryLeft', { n: status.recoveryCodesLeft })}</p>
        )}

        {status?.enabled && allowDisable && !status.required && !disabling && (
          <Button variant="secondary" onClick={() => { setDisabling(true); setMsg(null); }}>{tr(locale, 'mfa.disable')}</Button>
        )}
        {disabling && (
          <form className="n-stack" onSubmit={disable} noValidate aria-label={tr(locale, 'mfa.disableTitle')}>
            <h3 className="n-mfa-sub">{tr(locale, 'mfa.disableTitle')}</h3>
            <Field label={tr(locale, 'auth.password')} name="password" type="password" autoComplete="current-password" />
            <Field label={tr(locale, 'mfa.codeLabel')} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            <div className="n-row">
              <Button type="button" variant="quiet" onClick={() => setDisabling(false)}>{tr(locale, 'mfa.cancel')}</Button>
              <Button type="submit" disabled={busy}>{tr(locale, 'mfa.disable')}</Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
