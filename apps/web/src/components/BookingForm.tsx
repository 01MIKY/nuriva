'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { t, formatMoney, type Locale, type MessageKey } from '@nuriva/i18n';
import { quote, MULTI_DAY_SERVICES, type Service } from '@nuriva/domain';
import { Alert, Button, Card, Field } from '@nuriva/ui';
import { apiSend } from '@/lib/client-api';
import { HALF_HOURS, type BookingView, type Window } from '@/lib/bookings';
import type { Dependent } from '@/lib/household';

interface Props {
  locale: Locale;
  caregiver: { id: string; displayName: string; hourlyRateCents: number; divisions: Array<{ division: 'kids' | 'pets'; services: string[] }> };
  household: Dependent[];
  windows: Window[];
  minDate: string;
  paymentsEnabled: boolean;
  /** "Book again": details copied from a previous booking with this caregiver (the date is always chosen anew). */
  initial?: BookingDraft;
}

export interface BookingDraft {
  division: 'kids' | 'pets'; service: string; dependentIds: number[]; start: string; end: string; address: string; notes: string;
}

const minutesOf = (hhmm: string) => (hhmm === '24:00' ? 1440 : Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));

export function BookingForm({ locale, caregiver, household, windows, minDate, paymentsEnabled, initial }: Props) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const router = useRouter();
  const [division, setDivision] = useState(initial?.division ?? caregiver.divisions[0]!.division);
  const services = caregiver.divisions.find((d) => d.division === division)?.services ?? [];
  const [service, setService] = useState(initial && services.includes(initial.service) ? initial.service : services[0] ?? '');
  const [selected, setSelected] = useState<number[]>(initial?.dependentIds ?? []);
  const [start, setStart] = useState(initial?.start ?? '18:00');
  const [end, setEnd] = useState(initial?.end ?? '22:00');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (formError) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [formError]);

  const kind = division === 'kids' ? 'child' : 'pet';
  const options = household.filter((d) => d.kind === kind);
  const minutes = useMemo(() => {
    let m = minutesOf(end) - minutesOf(start);
    if (m <= 0) m += 1440;
    return m;
  }, [start, end]);
  const q = minutes > 0 ? quote(caregiver.hourlyRateCents, minutes) : null;
  const money = (c: number) => formatMoney(locale, c);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const date = String(f.get('date') ?? '');
    const address = String(f.get('address') ?? '').trim();
    const e: Record<string, string> = {};
    if (!selected.length) e.who = tr('web.book.chooseOne');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) e.date = tr('web.book.chooseDate');
    if (address.length < 10) e.address = tr('web.book.invalidAddress');
    // Same check the API makes, done early so the family sees it next to the date (single-day services).
    if (!e.date && !MULTI_DAY_SERVICES.has(service as Service)) {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const s0 = minutesOf(start);
      const e0 = minutesOf(end) <= s0 ? null : minutesOf(end);
      const fits = e0 !== null && windows.some((w) => w.weekday === weekday && s0 >= minutesOf(w.start) && e0 <= minutesOf(w.end));
      if (!fits) e.date = tr('errors.outside_availability');
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const r = await apiSend<{ booking: BookingView }>('POST', '/v1/bookings', {
      caregiverId: caregiver.id, division, service, dependentIds: selected, date, start, end, address, notes: String(f.get('notes') ?? '').trim(),
    }, locale);
    setBusy(false);
    if (!r.ok) return setFormError(r.error.message || tr('errors.internal'));
    router.push(`/${locale}/bookings/${r.data.booking.id}?sent=1`);
    router.refresh();
  }

  const dayName = (d: number) => tr(`web.availability.days.d${d}` as MessageKey);

  return (
    <div className="book-grid">
      <form className="n-stack" onSubmit={submit} noValidate aria-label={tr('web.book.title', { name: caregiver.displayName })} style={{ ['--gap' as string]: '18px' }}>
        {initial && <Alert>{tr('web.book.prefilled')}</Alert>}
        <div ref={errorRef}>{formError && <Alert tone="error">{formError}</Alert>}</div>

        {caregiver.divisions.length > 1 && (
          <div className="n-field">
            <label className="n-label" htmlFor="bk-div">{tr('web.book.division')}</label>
            <select id="bk-div" className="n-input" value={division} onChange={(e) => { const d = e.target.value as 'kids' | 'pets'; setDivision(d); setSelected([]); setService(caregiver.divisions.find((x) => x.division === d)?.services[0] ?? ''); }}>
              {caregiver.divisions.map((d) => <option key={d.division} value={d.division}>{tr(`divisions.${d.division}`)}</option>)}
            </select>
          </div>
        )}
        <div className="n-field">
          <label className="n-label" htmlFor="bk-svc">{tr('web.book.service')}</label>
          <select id="bk-svc" className="n-input" value={service} onChange={(e) => setService(e.target.value)}>
            {services.map((s) => <option key={s} value={s}>{tr(`services.${s}` as MessageKey)}</option>)}
          </select>
        </div>

        <fieldset className="fieldset n-stack" style={{ ['--gap' as string]: '8px' }}>
          <legend className="n-label">{tr('web.book.who')}</legend>
          {options.length === 0
            ? <Alert>{tr('web.book.noDependents')} <a href={`/${locale}/household`}>{tr('web.book.addInHousehold')}</a></Alert>
            : <div className="toggle-chips">
                {options.map((d) => (
                  <button key={d.id} type="button" className="toggle-chip" aria-pressed={selected.includes(d.id)}
                    onClick={() => setSelected((cur) => (cur.includes(d.id) ? cur.filter((x) => x !== d.id) : [...cur, d.id]))}>
                    {d.name}
                  </button>
                ))}
              </div>}
          {errors.who && <span className="n-error" role="alert">{errors.who}</span>}
        </fieldset>

        <div className="form-grid">
          <Field label={tr('web.book.date')} name="date" type="date" min={minDate} error={errors.date} />
          <div className="n-field">
            <label className="n-label" htmlFor="bk-start">{tr('web.book.start')}</label>
            <select id="bk-start" className="n-input" value={start} onChange={(e) => setStart(e.target.value)}>
              {HALF_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="n-field">
            <label className="n-label" htmlFor="bk-end">{tr('web.book.end')}</label>
            <select id="bk-end" className="n-input" value={end} onChange={(e) => setEnd(e.target.value)}>
              {[...HALF_HOURS.slice(1), '24:00'].map((h) => <option key={h} value={h}>{h === '24:00' ? tr('web.availability.midnight') : h}</option>)}
            </select>
          </div>
        </div>

        <Field label={tr('web.book.address')} name="address" autoComplete="street-address" hint={tr('web.book.addressHint')} error={errors.address} maxLength={200} defaultValue={initial?.address} />
        <div className="n-field">
          <label className="n-label" htmlFor="bk-notes">{tr('web.book.notes')}</label>
          <textarea id="bk-notes" name="notes" className="n-input n-textarea" maxLength={1000} defaultValue={initial?.notes} />
        </div>
        <Button type="submit" disabled={busy || options.length === 0}>{busy ? tr('web.auth.submitting') : tr('web.book.send')}</Button>
      </form>

      <aside className="n-stack" style={{ ['--gap' as string]: '14px' }}>
        <Card>
          <div className="n-stack" style={{ ['--gap' as string]: '10px' }}>
            <h2 className="card-title">{tr('web.book.estimate')}</h2>
            {q && (
              <dl className="sum">
                <div><dt>{tr('web.book.subtotal', { hours: (minutes / 60).toLocaleString(locale), rate: money(caregiver.hourlyRateCents) })}</dt><dd>{money(q.subtotalCents)}</dd></div>
                <div><dt>{tr('web.book.fee')}</dt><dd>{money(q.clientFeeCents)}</dd></div>
                <div className="sum-total"><dt>{tr('web.book.total')}</dt><dd>{money(q.totalCents)}</dd></div>
              </dl>
            )}
            <p className="n-hint">{tr(paymentsEnabled ? 'web.pay.chargeAfterAccept' : 'web.book.noCharge')}</p>
          </div>
        </Card>
        <Card>
          <div className="n-stack" style={{ ['--gap' as string]: '6px' }}>
            <h2 className="card-title">{tr('web.book.caregiverHours')}</h2>
            {windows.length === 0 ? <p className="n-muted">{tr('web.availability.none')}</p> : (
              <ul className="hours-list">
                {[1, 2, 3, 4, 5, 6, 0].flatMap((d) => windows.filter((w) => w.weekday === d).map((w) => (
                  <li key={`${d}-${w.start}`}><span>{dayName(d)}</span><span>{w.start} – {w.end === '24:00' ? tr('web.availability.midnight') : w.end}</span></li>
                )))}
              </ul>
            )}
          </div>
        </Card>
      </aside>
    </div>
  );
}
