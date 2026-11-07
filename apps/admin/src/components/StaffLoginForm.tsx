'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale } from '@nuriva/i18n';
import { Alert, Button, Field } from '@nuriva/ui';
import { MfaChallenge } from '@nuriva/ui/mfa';
import { apiPost, makeSend } from '@/lib/client-api';

export function StaffLoginForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const done = () => { router.push(`/${locale}/caregivers`); router.refresh(); };
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setBusy(true);
    const r = await apiPost<{ mfaRequired?: boolean; challenge?: string }>('/v1/auth/login', { email: String(f.get('email') ?? '').trim(), password: String(f.get('password') ?? '') }, locale);
    setBusy(false);
    if (!r.ok) return setError(r.error.message || t(locale, 'errors.internal'));
    if (r.data.mfaRequired && r.data.challenge) return setChallenge(r.data.challenge);
    done();
  }
  if (challenge) return <MfaChallenge locale={locale} challenge={challenge} send={makeSend(locale)} onSuccess={done} />;
  return (
    <form className="n-stack" onSubmit={submit} noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t(locale, 'auth.email')} name="email" type="email" autoComplete="username" required />
      <Field label={t(locale, 'auth.password')} name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" block disabled={busy}>{busy ? t(locale, 'web.auth.submitting') : t(locale, 'auth.signIn')}</Button>
    </form>
  );
}
