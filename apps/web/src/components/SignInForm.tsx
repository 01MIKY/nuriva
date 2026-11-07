'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale } from '@nuriva/i18n';
import { Alert, Button, Field } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

export function SignInForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const email = String(f.get('email') ?? '').trim();
    const password = String(f.get('password') ?? '');
    if (!email || !password) {
      setError(t(locale, 'errors.validation'));
      return;
    }
    setBusy(true);
    const res = await apiPost('/v1/auth/login', { email, password }, locale);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || t(locale, 'errors.internal'));
      return;
    }
    router.push(`/${locale}/account`);
    router.refresh();
  }

  return (
    <form className="n-stack" onSubmit={onSubmit} noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t(locale, 'auth.email')} name="email" type="email" autoComplete="email" inputMode="email" required />
      <Field label={t(locale, 'auth.password')} name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" block disabled={busy}>{busy ? t(locale, 'web.auth.submitting') : t(locale, 'auth.signIn')}</Button>
    </form>
  );
}
