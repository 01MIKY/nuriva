import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));

describe('Trust & Safety: off-platform activity', () => {
  let ts: Awaited<ReturnType<typeof h.admin>>;
  let ops: Awaited<ReturnType<typeof h.admin>>;
  let carer: Awaited<ReturnType<typeof h.register>>;
  let ana: Awaited<ReturnType<typeof h.register>>;
  let bookingId = 0;

  beforeAll(async () => {
    const root = await h.admin('root.trust@nuriva.test', ['superadmin']);
    ts = await h.admin('ts.trust@nuriva.test', ['trust_safety']);
    ops = await h.admin('ops.trust@nuriva.test', ['operations']);
    carer = await h.register('caregiver', 'carer.trust@example.com', { name: 'Valentina Ríos' });
    ana = await h.register('client', 'ana.trust@example.com', { name: 'Ana López' });
    await h.app.inject({ method: 'PUT', url: '/v1/caregiver/profile', headers: { cookie: carer.c.cookie() }, payload: {
      divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2500, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' } });
    await h.app.inject({ method: 'PUT', url: '/v1/caregiver/availability', headers: { cookie: carer.c.cookie() }, payload: { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) } });
    for (const step of VETTING_STEPS) await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` });
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-TRUST' });
    const publicId = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0].id;
    const kid = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } })).body.dependent.id;
    bookingId = (await ana.c.post('/v1/bookings', { caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [kid], date: dayPlus(5), start: '18:00', end: '20:00', address: '1200 Brickell Bay Dr, Miami FL 33131', notes: '' })).body.booking.id;
    for (const body of ['Mi WhatsApp es 305-555-1234', 'Y me pagas por Zelle', 'Llego a las 18:00']) {
      expect((await carer.c.post(`/v1/bookings/${bookingId}/messages`, { body })).status).toBe(201);
    }
    expect((await ana.c.post(`/v1/bookings/${bookingId}/messages`, { body: 'Perfecto, gracias' })).status).toBe(201);
  });

  it('shows counts per person to Trust & Safety, never the text, and audits the read', async () => {
    const r = await ts.c.get('/v1/admin/off-platform?days=30');
    expect(r.status).toBe(200);
    expect(r.body.people).toEqual([expect.objectContaining({
      userId: carer.id, name: 'Valentina Ríos', role: 'caregiver', phone: 1, email: 0, link: 0, payment: 1, total: 2, bookings: 1,
    })]);
    expect(JSON.stringify(r.body)).not.toMatch(/305-555|Zelle|WhatsApp/);
    const audits = await h.db.execute(sql`select count(*)::int as n from audit_log where action = 'offplatform.read'`);
    expect((audits.rows[0] as { n: number }).n).toBe(1);
  });

  it('is restricted to Trust & Safety and validates the period', async () => {
    expect((await ops.c.get('/v1/admin/off-platform')).status).toBe(403);
    expect((await ana.c.get('/v1/admin/off-platform')).status).toBe(403);
    expect((await ts.c.get('/v1/admin/off-platform?days=7')).status).toBe(400);
  });
});
