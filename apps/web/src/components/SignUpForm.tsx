'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale } from '@nuriva/i18n';
import { Alert, Button, Field } from '@nuriva/ui';
import { apiPost } from '@/lib/client-api';

type Role = 'client' | 'caregiver';
type Errors = Partial<Record<'name' | 'email' | 'password' | 'acceptTerms' | 'divisions' | 'form', string>>;

export function SignUpForm({ locale, initialRole }: { locale: Locale; initialRole: Role }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(initialRole);
  const [divisions, setDivisions] = useState<Array<'kids' | 'pets'>>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function validate(f: FormData): Errors {
    const e: Errors = {};
    const name = String(f.get('name') ?? '').trim();
    const email = String(f.get('email') ?? '').trim();
    const password = String(f.get('password') ?? '');
    if (name.length < 2) e.name = t(locale, 'web.auth.fieldRequired');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = t(locale, 'web.auth.invalidEmail');
    if (password.length < 12) e.password = t(locale, 'web.auth.passwordTooShort');
    if (!f.get('acceptTerms')) e.acceptTerms = t(locale, 'web.auth.termsRequired');
    if (role === 'caregiver' && divisions.length === 0) e.divisions = t(locale, 'web.auth.chooseDivision');
    return e;
  }

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const e = validate(f);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const res = await apiPost('/v1/auth/register', {
      role,
      name: String(f.get('name')).trim(),
      email: String(f.get('email')).trim(),
      password: String(f.get('password')),
      locale,
      acceptTerms: true,
      ...(role === 'caregiver' ? { divisions } : {}),
    }, locale);
    setBusy(false);
    if (!res.ok) {
      setErrors({ form: res.error.message || t(locale, 'errors.internal') });
      return;
    }
    router.push(`/${locale}/account`);
    router.refresh();
  }

  const toggleDivision = (d: 'kids' | 'pets') =>
    setDivisions((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <form className="n-stack" onSubmit={onSubmit} noValidate>
      {errors.form && <Alert tone="error">{errors.form}</Alert>}

      <fieldset className="n-stack fieldset" style={{ ['--gap' as string]: '8px' }}>
        <legend className="n-label">{t(locale, 'web.auth.iAm')}</legend>
        <div className="choice-grid">
          {(['client', 'caregiver'] as const).map((r) => (
            <label key={r} className="n-choice">
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
              <span className="n-choice-title">{t(locale, r === 'client' ? 'web.auth.roleClient' : 'web.auth.roleCaregiver')}</span>
              <span className="n-choice-hint">{t(locale, r === 'client' ? 'web.auth.roleClientHint' : 'web.auth.roleCaregiverHint')}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {role === 'caregiver' && (
        <fieldset className="n-stack fieldset" style={{ ['--gap' as string]: '8px' }} aria-describedby={errors.divisions ? 'div-err' : undefined}>
          <legend className="n-label">{t(locale, 'web.auth.divisionsLabel')}</legend>
          <div className="choice-grid">
            {(['kids', 'pets'] as const).map((d) => (
              <label key={d} className="n-choice">
                <input type="checkbox" checked={divisions.includes(d)} onChange={() => toggleDivision(d)} />
                <span className="n-choice-title">{t(locale, `divisions.${d}`)}</span>
              </label>
            ))}
          </div>
          {errors.divisions && <span id="div-err" className="n-error" role="alert">{errors.divisions}</span>}
        </fieldset>
      )}

      <Field label={t(locale, 'auth.name')} name="name" autoComplete="name" error={errors.name} required />
      <Field label={t(locale, 'auth.email')} name="email" type="email" autoComplete="email" inputMode="email" error={errors.email} required />
      <Field label={t(locale, 'auth.password')} name="password" type="password" autoComplete="new-password" hint={t(locale, 'auth.passwordHint')} error={errors.password} required minLength={12} />

      <div className="n-field">
        <label className="n-check">
          <input type="checkbox" name="acceptTerms" aria-invalid={errors.acceptTerms ? true : undefined} />
          <span>{t(locale, 'auth.acceptTerms')}</span>
        </label>
        {errors.acceptTerms && <span className="n-error" role="alert">{errors.acceptTerms}</span>}
      </div>

      <Button type="submit" block disabled={busy}>{busy ? t(locale, 'web.auth.submitting') : t(locale, 'auth.createAccount')}</Button>
    </form>
  );
}
