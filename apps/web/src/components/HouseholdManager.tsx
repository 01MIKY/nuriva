'use client';
import { useState, type FormEvent } from 'react';
import { t, type Locale } from '@nuriva/i18n';
import { PET_SPECIES, type EmergencyContact } from '@nuriva/domain';
import { Alert, Badge, Button, Card, Field, Icon } from '@nuriva/ui';
import { apiSend } from '@/lib/client-api';
import type { Dependent, Household } from '@/lib/household';

type Kind = 'child' | 'pet';
type Editing = { mode: 'new'; kind: Kind } | { mode: 'edit'; dep: Dependent } | null;

export function HouseholdManager({ locale, initial }: { locale: Locale; initial: Household }) {
  const tr = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(locale, k, v);
  const [deps, setDeps] = useState<Dependent[]>(initial.dependents);
  const [ec, setEc] = useState<EmergencyContact | null>(initial.emergencyContact);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flash = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(null), 2500); };

  async function remove(d: Dependent) {
    const r = await apiSend('DELETE', `/v1/household/dependents/${d.id}`, null, locale);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setDeps((cur) => cur.filter((x) => x.id !== d.id));
    setConfirming(null);
    flash(tr('web.household.removed'));
  }

  const children = deps.filter((d) => d.kind === 'child');
  const pets = deps.filter((d) => d.kind === 'pet');

  return (
    <div className="n-stack" style={{ ['--gap' as string]: '22px' }}>
      <div role="status" aria-live="polite" className="sr-status">{status && <Alert>{status}</Alert>}</div>
      {error && <Alert tone="error">{error}</Alert>}

      {editing
        ? <DependentForm locale={locale} editing={editing} onCancel={() => setEditing(null)} onSaved={(d) => {
            setDeps((cur) => (editing.mode === 'edit' ? cur.map((x) => (x.id === d.id ? d : x)) : [...cur, d]));
            setEditing(null);
            setError(null);
            flash(tr('web.household.saved'));
          }} />
        : (
          <div className="n-row">
            <Button variant="sand" onClick={() => setEditing({ mode: 'new', kind: 'child' })}><Icon name="heart" size={18} />{tr('web.household.addChild')}</Button>
            <Button variant="quiet" onClick={() => setEditing({ mode: 'new', kind: 'pet' })}><Icon name="heart" size={18} />{tr('web.household.addPet')}</Button>
          </div>
        )}

      {deps.length === 0 && !editing && (
        <Card className="empty-card">
          <span className="household-icon" aria-hidden="true"><Icon name="home" /></span>
          <div className="n-stack" style={{ ['--gap' as string]: '4px' }}>
            <strong>{tr('web.household.empty')}</strong>
            <span className="n-muted">{tr('web.household.emptyBody')}</span>
          </div>
        </Card>
      )}

      {[{ list: children, title: tr('web.household.children') }, { list: pets, title: tr('web.household.pets') }].map(({ list, title }) => list.length > 0 && (
        <section key={title} className="n-stack" style={{ ['--gap' as string]: '10px' }} aria-label={title}>
          <h2 className="card-title">{title}</h2>
          <ul className="dep-list">
            {list.map((d) => (
              <li key={d.id} className={`dep-card dep-${d.kind}`}>
                <span className="dep-face" aria-hidden="true">{d.name.slice(0, 1).toUpperCase()}</span>
                <div className="dep-body">
                  <strong className="dep-name">{d.name}</strong>
                  <span className="n-muted dep-sub">
                    {d.kind === 'pet' ? `${tr(`web.household.speciesOptions.${d.details.species}`)}${d.details.breed ? ` · ${d.details.breed}` : ''} · ` : ''}
                    {tr('web.household.yearsOld', { n: d.details.ageYears })}
                  </span>
                  <span className="n-row" style={{ ['--gap' as string]: '6px' }}>
                    {d.kind === 'child' && d.details.allergies && <Badge tone="danger">{tr('web.household.allergyTag', { text: d.details.allergies })}</Badge>}
                    {d.details.medications && <Badge tone="pending">{tr('web.household.medsTag')}</Badge>}
                  </span>
                  {confirming === d.id && (
                    <div className="confirm" role="alertdialog" aria-label={tr('web.household.confirmRemove', { name: d.name })}>
                      <span>{tr('web.household.confirmRemove', { name: d.name })}</span>
                      <div className="n-row">
                        <Button variant="quiet" onClick={() => setConfirming(null)}>{tr('web.household.cancel')}</Button>
                        <Button className="btn-danger" onClick={() => remove(d)}>{tr('web.household.confirmYes')}</Button>
                      </div>
                    </div>
                  )}
                </div>
                {confirming !== d.id && (
                  <div className="dep-actions">
                    <button type="button" className="link-btn" onClick={() => { setEditing({ mode: 'edit', dep: d }); setConfirming(null); }}
                      aria-label={`${tr('web.household.edit')} ${d.name}`}>{tr('web.household.edit')}</button>
                    <button type="button" className="link-btn danger" onClick={() => setConfirming(d.id)}
                      aria-label={`${tr('web.household.remove')} ${d.name}`}>{tr('web.household.remove')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <EmergencyContactCard locale={locale} value={ec} onSaved={(v) => { setEc(v); flash(tr('web.household.saved')); }} />
    </div>
  );
}

function DependentForm({ locale, editing, onCancel, onSaved }: {
  locale: Locale; editing: NonNullable<Editing>; onCancel: () => void; onSaved: (d: Dependent) => void;
}) {
  const tr = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(locale, k, v);
  const kind: Kind = editing.mode === 'new' ? editing.kind : editing.dep.kind;
  const dep = editing.mode === 'edit' ? editing.dep : null;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    const e: Record<string, string> = {};
    const name = s('name');
    const age = Number(s('ageYears'));
    if (!name) e.name = tr('web.auth.fieldRequired');
    const maxAge = kind === 'child' ? 17 : 40;
    if (s('ageYears') === '' || !Number.isInteger(age) || age < 0 || age > maxAge) {
      e.ageYears = tr(kind === 'child' ? 'web.household.ageRangeChild' : 'web.household.ageRangePet');
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    const details = kind === 'child'
      ? { ageYears: age, allergies: s('allergies'), medications: s('medications'), notes: s('notes') }
      : { species: s('species'), breed: s('breed'), ageYears: age, medications: s('medications'), notes: s('notes') };
    setBusy(true);
    const r = dep
      ? await apiSend<{ dependent: Dependent }>('PUT', `/v1/household/dependents/${dep.id}`, { kind, name, details }, locale)
      : await apiSend<{ dependent: Dependent }>('POST', '/v1/household/dependents', { kind, name, details }, locale);
    setBusy(false);
    if (!r.ok) return setFormError(r.error.message || tr('errors.internal'));
    onSaved(r.data.dependent);
  }

  const title = dep ? tr('web.household.editTitle', { name: dep.name }) : tr(kind === 'child' ? 'web.household.newChild' : 'web.household.newPet');
  const d = dep?.details as Record<string, string | number> | undefined;

  return (
    <Card className={`dep-form dep-form-${kind}`}>
      <form className="n-stack" onSubmit={submit} noValidate aria-label={title}>
        <h2 className="card-title">{title}</h2>
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="form-grid">
          <Field label={tr('web.household.name')} name="name" defaultValue={dep?.name ?? ''} error={errors.name} autoComplete="off" maxLength={40} />
          <Field label={tr('web.household.age')} name="ageYears" type="number" inputMode="numeric" min={0} max={kind === 'child' ? 17 : 40}
            defaultValue={d?.ageYears !== undefined ? String(d.ageYears) : ''} error={errors.ageYears} />
        </div>
        {kind === 'pet' && (
          <div className="form-grid">
            <div className="n-field">
              <label className="n-label" htmlFor="dep-species">{tr('web.household.species')}</label>
              <select id="dep-species" name="species" className="n-input" defaultValue={String(d?.species ?? 'dog')}>
                {PET_SPECIES.map((sp) => <option key={sp} value={sp}>{tr(`web.household.speciesOptions.${sp}`)}</option>)}
              </select>
            </div>
            <Field label={tr('web.household.breed')} name="breed" defaultValue={String(d?.breed ?? '')} maxLength={80} />
          </div>
        )}
        {kind === 'child' && <Field label={tr('web.household.allergies')} name="allergies" defaultValue={String(d?.allergies ?? '')} maxLength={500} />}
        <Field label={tr('web.household.medications')} name="medications" defaultValue={String(d?.medications ?? '')} maxLength={500} />
        <div className="n-field">
          <label className="n-label" htmlFor="dep-notes">{tr('web.household.notes')}</label>
          <textarea id="dep-notes" name="notes" className="n-input n-textarea" defaultValue={String(d?.notes ?? '')} maxLength={1000} aria-describedby="dep-notes-hint" />
          <span id="dep-notes-hint" className="n-hint">{tr('web.household.notesHint')}</span>
        </div>
        <div className="n-row">
          <Button type="button" variant="quiet" onClick={onCancel}>{tr('web.household.cancel')}</Button>
          <Button type="submit" disabled={busy}>{busy ? tr('web.auth.submitting') : tr('web.household.save')}</Button>
        </div>
      </form>
    </Card>
  );
}

function EmergencyContactCard({ locale, value, onSaved }: { locale: Locale; value: EmergencyContact | null; onSaved: (v: EmergencyContact) => void }) {
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k);
  const [open, setOpen] = useState(!value);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const v = { name: String(f.get('name') ?? '').trim(), phone: String(f.get('phone') ?? '').trim(), relationship: String(f.get('relationship') ?? '').trim() };
    const e: Record<string, string> = {};
    if (v.name.length < 2) e.name = tr('web.auth.fieldRequired');
    if (!/^[+()\d\s.-]{7,25}$/.test(v.phone)) e.phone = tr('web.household.invalidPhone');
    if (v.relationship.length < 2) e.relationship = tr('web.auth.fieldRequired');
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const r = await apiSend<{ emergencyContact: EmergencyContact }>('PUT', '/v1/household/emergency-contact', v, locale);
    setBusy(false);
    if (!r.ok) return setFormError(r.error.message || t(locale, 'errors.internal'));
    onSaved(r.data.emergencyContact);
    setOpen(false);
  }

  return (
    <Card>
      <div className="n-stack">
        <div className="approval-top">
          <h2 className="card-title">{tr('web.household.emergencyTitle')}</h2>
          {value && !open && <button type="button" className="link-btn" onClick={() => setOpen(true)}>{tr('web.household.edit')}</button>}
        </div>
        <p className="n-muted">{tr('web.household.emergencyIntro')}</p>
        {!open && value && (
          <div className="ec-view">
            <strong>{value.name}</strong>
            <span>{value.relationship} · {value.phone}</span>
          </div>
        )}
        {open && (
          <form className="n-stack" onSubmit={submit} noValidate aria-label={tr('web.household.emergencyTitle')}>
            {formError && <Alert tone="error">{formError}</Alert>}
            <Field label={tr('web.household.ecName')} name="name" autoComplete="off" defaultValue={value?.name ?? ''} error={errors.name} />
            <div className="form-grid">
              <Field label={tr('web.household.ecPhone')} name="phone" type="tel" inputMode="tel" defaultValue={value?.phone ?? ''} error={errors.phone} />
              <Field label={tr('web.household.ecRelationship')} name="relationship" placeholder={tr('web.household.ecRelationshipPh')} defaultValue={value?.relationship ?? ''} error={errors.relationship} />
            </div>
            <div className="n-row">
              {value && <Button type="button" variant="quiet" onClick={() => setOpen(false)}>{tr('web.household.cancel')}</Button>}
              <Button type="submit" disabled={busy}>{busy ? tr('web.auth.submitting') : tr('web.household.save')}</Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
