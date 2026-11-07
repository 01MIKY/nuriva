'use client';
import { useState } from 'react';
import { t, type Locale } from '@nuriva/i18n';
import type { StepStatus, VettingStep } from '@nuriva/domain';
import { Alert, Button, Card } from '@nuriva/ui';
import { apiSend } from '@/lib/client-api';

interface Event { step: VettingStep; from: StepStatus; to: StepStatus; actorId: number; createdAt: string; reference: string }

/** Restricted data: loaded only on explicit request, and the API audits every read. */
export function ScreeningHistory({ locale, caregiverId }: { locale: Locale; caregiverId: number }) {
  const tr = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(locale, k, v);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const date = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });

  async function load() {
    const r = await apiSend<{ events: Event[] }>('GET', `/v1/admin/caregivers/${caregiverId}/screening`, null, locale);
    if (!r.ok) return setError(r.error.message || tr('errors.internal'));
    setEvents(r.data.events);
  }

  return (
    <Card className="restricted-card">
      <div className="n-stack">
        <h2 className="admin-h2">{tr('admin.detail.screening')}</h2>
        <p className="n-muted">{tr('admin.detail.screeningNote')}</p>
        {error && <Alert tone="error">{error}</Alert>}
        {events === null
          ? <Button variant="secondary" onClick={load}>{tr('admin.detail.showScreening')}</Button>
          : events.length === 0 ? <p>{tr('admin.detail.noEvents')}</p> : (
            <ul className="event-list">
              {events.map((e, i) => (
                <li key={i}>
                  <strong>{tr(`vetting.steps.${e.step}`)}: {tr(`vetting.status.${e.from}`)} → {tr(`vetting.status.${e.to}`)}</strong>
                  <span className="ref">{e.reference}</span>
                  <small className="n-muted">{date.format(new Date(e.createdAt))} · {tr('admin.detail.by', { id: e.actorId })}</small>
                </li>
              ))}
            </ul>
          )}
      </div>
    </Card>
  );
}
