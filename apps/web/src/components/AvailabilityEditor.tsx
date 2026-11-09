'use client';
import { useState } from 'react';
import { t, type Locale } from '@nuriva/i18n';
import { Alert, Button, Card } from '@nuriva/ui';
import { apiSend } from '@/lib/client-api';
import { HALF_HOURS, type Window } from '@/lib/bookings';

type Day = { on: boolean; start: string; end: string };
const END_OPTIONS = [...HALF_HOURS.slice(1), '24:00'];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

export function AvailabilityEditor({ locale, initial }: { locale: Locale; initial: Window[] }) {
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k);
  const [days, setDays] = useState<Day[]>(() => Array.from({ length: 7 }, (_, d) => {
    const w = initial.find((x) => x.weekday === d);
    return w ? { on: true, start: w.start, end: w.end } : { on: false, start: '09:00', end: '17:00' };
  }));
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (d: number, patch: Partial<Day>) => setDays((cur) => cur.map((x, i) => (i === d ? { ...x, ...patch } : x)));

  async function save() {
    const bad = days.some((d) => d.on && d.end !== '24:00' && d.end <= d.start);
    if (bad) return setMsg({ tone: 'error', text: tr('web.availability.invalidRange') });
    setBusy(true);
    const windows = days.flatMap((d, weekday) => (d.on ? [{ weekday, start: d.start, end: d.end }] : []));
    const r = await apiSend('PUT', '/v1/caregiver/availability', { windows }, locale);
    setBusy(false);
    setMsg(r.ok ? { tone: 'info', text: tr('web.availability.saved') } : { tone: 'error', text: r.error.message || tr('errors.internal') });
  }

  return (
    <Card>
      <div className="n-stack">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <ul className="avail-list">
          {ORDER.map((d) => {
            const day = days[d]!;
            const name = tr(`web.availability.days.d${d}` as Parameters<typeof t>[1]);
            return (
              <li key={d} className={`avail-row${day.on ? ' on' : ''}`}>
                <label className="n-check avail-day">
                  <input type="checkbox" checked={day.on} onChange={(e) => update(d, { on: e.target.checked })} aria-label={`${tr('web.availability.available')}: ${name}`} />
                  <span>{name}</span>
                </label>
                {day.on && (
                  <div className="avail-times">
                    <label className="mini-field" htmlFor={`av-s-${d}`}><span>{tr('web.availability.from')}</span>
                      <select id={`av-s-${d}`} className="n-input" value={day.start} onChange={(e) => update(d, { start: e.target.value })} aria-label={`${tr('web.availability.from')} (${name})`}>
                        {HALF_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                    <label className="mini-field" htmlFor={`av-e-${d}`}><span>{tr('web.availability.to')}</span>
                      <select id={`av-e-${d}`} className="n-input" value={day.end} onChange={(e) => update(d, { end: e.target.value })} aria-label={`${tr('web.availability.to')} (${name})`}>
                        {END_OPTIONS.map((h) => <option key={h} value={h}>{h === '24:00' ? tr('web.availability.midnight') : h}</option>)}
                      </select>
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <Button onClick={save} disabled={busy}>{busy ? tr('web.auth.submitting') : tr('web.availability.save')}</Button>
      </div>
    </Card>
  );
}
