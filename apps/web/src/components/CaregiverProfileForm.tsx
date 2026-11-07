'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { t, type Locale } from '@nuriva/i18n';
import { LANGUAGES, servicesFor, POLICY, type CaregiverProfileView } from '@nuriva/domain';
import { Alert, Button, Card, Field } from '@nuriva/ui';
import { apiSend } from '@/lib/client-api';

type Division = 'kids' | 'pets';
type Gap = 'headline' | 'bio' | 'services' | 'languages' | 'zip';

export function CaregiverProfileForm({ locale, initial, initialGaps }: { locale: Locale; initial: CaregiverProfileView; initialGaps: Gap[] }) {
  const tr = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(locale, k, v);
  const [divisions, setDivisions] = useState<Division[]>(initial.divisions);
  const [services, setServices] = useState<string[]>(initial.services);
  const [languages, setLanguages] = useState<string[]>(initial.languages);
  const [bioLen, setBioLen] = useState(initial.bio.length);
  const [gaps, setGaps] = useState<Gap[]>(initialGaps);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => servicesFor(divisions), [divisions]);
  const toggle = <T extends string>(list: T[], v: T, set: (x: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    const rate = Number(s('rate'));
    const years = Number(s('years'));
    const chosenServices = services.filter((x) => available.includes(x));
    const e: Record<string, string> = {};
    if (!divisions.length) e.divisions = tr('web.care.chooseOne');
    if (!chosenServices.length) e.services = tr('web.care.chooseOne');
    if (!languages.length) e.languages = tr('web.care.chooseOne');
    if (!Number.isFinite(rate) || rate * 100 < POLICY.minHourlyRateCents || rate * 100 > POLICY.maxHourlyRateCents) e.rate = tr('web.care.invalidRate');
    if (s('years') === '' || !Number.isInteger(years) || years < 0 || years > 60) e.years = tr('web.care.invalidYears');
    if (s('headline').length < 10) e.headline = tr('web.care.headlineShort');
    if (s('bio').length < 50) e.bio = tr('web.care.bioShort');
    if (!/^\d{5}$/.test(s('zip'))) e.zip = tr('web.care.invalidZip');
    setErrors(e);
    if (Object.keys(e).length) { setMsg({ tone: 'error', text: tr('errors.validation') }); return; }

    setBusy(true);
    const r = await apiSend<{ profile: CaregiverProfileView; gaps: Gap[] }>('PUT', '/v1/caregiver/profile', {
      divisions, services: chosenServices, languages, hourlyRateCents: Math.round(rate * 100), yearsExperience: years,
      headline: s('headline'), bio: s('bio'), zip: s('zip'),
    }, locale);
    setBusy(false);
    if (!r.ok) { setMsg({ tone: 'error', text: r.error.message || tr('errors.internal') }); return; }
    setServices(r.data.profile.services);
    setGaps(r.data.gaps);
    setMsg({ tone: 'info', text: tr('web.care.saved') });
  }

  return (
    <div className="n-stack" style={{ ['--gap' as string]: '20px' }}>
      <Card className={gaps.length ? 'gaps-card' : 'complete-card'}>
        {gaps.length ? (
          <div className="n-stack" style={{ ['--gap' as string]: '8px' }}>
            <h2 className="card-title">{tr('web.care.gapsTitle')}</h2>
            <ul className="gap-list">{gaps.map((g) => <li key={g}>{tr(`web.care.gaps.${g}`)}</li>)}</ul>
          </div>
        ) : (
          <div className="n-stack" style={{ ['--gap' as string]: '4px' }}>
            <h2 className="card-title">{tr('web.care.completeTitle')}</h2>
            <p className="n-muted">{tr('web.care.completeBody')}</p>
          </div>
        )}
      </Card>

      <form className="n-stack" onSubmit={submit} noValidate aria-label={tr('web.care.title')} style={{ ['--gap' as string]: '20px' }}>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        <fieldset className="fieldset n-stack" style={{ ['--gap' as string]: '8px' }}>
          <legend className="n-label">{tr('web.care.divisions')}</legend>
          <div className="choice-grid">
            {(['kids', 'pets'] as const).map((d) => (
              <label key={d} className="n-choice">
                <input type="checkbox" checked={divisions.includes(d)} onChange={() => toggle(divisions, d, setDivisions)} />
                <span className="n-choice-title">{tr(`divisions.${d}`)}</span>
              </label>
            ))}
          </div>
          {errors.divisions && <span className="n-error" role="alert">{errors.divisions}</span>}
        </fieldset>

        <fieldset className="fieldset n-stack" style={{ ['--gap' as string]: '8px' }}>
          <legend className="n-label">{tr('web.care.services')}</legend>
          <div className="toggle-chips">
            {available.map((s) => (
              <button key={s} type="button" className="toggle-chip" aria-pressed={services.includes(s)} onClick={() => toggle(services, s, setServices)}>
                {tr(`services.${s}` as Parameters<typeof t>[1])}
              </button>
            ))}
          </div>
          {errors.services && <span className="n-error" role="alert">{errors.services}</span>}
        </fieldset>

        <div className="form-grid">
          <Field label={tr('web.care.rate')} name="rate" type="number" inputMode="decimal" min={15} max={200} step={1}
            defaultValue={String(initial.hourlyRateCents / 100)} hint={tr('web.care.rateHint')} error={errors.rate} />
          <Field label={tr('web.care.years')} name="years" type="number" inputMode="numeric" min={0} max={60}
            defaultValue={String(initial.yearsExperience)} error={errors.years} />
        </div>

        <fieldset className="fieldset n-stack" style={{ ['--gap' as string]: '8px' }}>
          <legend className="n-label">{tr('web.care.languages')}</legend>
          <div className="toggle-chips">
            {LANGUAGES.map((l) => (
              <button key={l} type="button" className="toggle-chip" aria-pressed={languages.includes(l)} onClick={() => toggle(languages, l, setLanguages)}>
                {tr(`web.care.languageNames.${l}`)}
              </button>
            ))}
          </div>
          {errors.languages && <span className="n-error" role="alert">{errors.languages}</span>}
        </fieldset>

        <Field label={tr('web.care.headline')} name="headline" defaultValue={initial.headline} maxLength={120} hint={tr('web.care.headlineHint')} error={errors.headline} />

        <div className="n-field">
          <label className="n-label" htmlFor="cg-bio">{tr('web.care.bio')}</label>
          <textarea id="cg-bio" name="bio" className="n-input n-textarea" defaultValue={initial.bio} maxLength={2000} rows={6}
            aria-invalid={errors.bio ? true : undefined} aria-describedby="cg-bio-hint" onChange={(e) => setBioLen(e.target.value.trim().length)} />
          {errors.bio
            ? <span className="n-error" role="alert">{errors.bio}</span>
            : <span id="cg-bio-hint" className="n-hint">{tr('web.care.bioHint')} · {tr('web.care.counter', { n: bioLen })}</span>}
        </div>

        <Field label={tr('web.care.zip')} name="zip" inputMode="numeric" autoComplete="postal-code" maxLength={5} defaultValue={initial.zip ?? ''}
          hint={tr('web.care.zipHint')} error={errors.zip} />

        <Button type="submit" disabled={busy}>{busy ? tr('web.auth.submitting') : tr('web.care.save')}</Button>
      </form>
    </div>
  );
}
