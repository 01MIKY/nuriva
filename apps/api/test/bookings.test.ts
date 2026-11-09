import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

/** A local Miami date N days from now (YYYY-MM-DD), so tests never depend on today's date. */
const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));
const D = dayPlus(5);
const allWeek = (start: string, end: string) => Array.from({ length: 7 }, (_, weekday) => ({ weekday, start, end }));

describe('availability and booking requests', () => {
  let root: Awaited<ReturnType<typeof h.admin>>;
  let carer: Awaited<ReturnType<typeof h.register>>;
  let ana: Awaited<ReturnType<typeof h.register>>;
  let luis: Awaited<ReturnType<typeof h.register>>;
  let publicId = '';
  let sofia = 0, mateo = 0, luna = 0;
  let bookingId = 0;

  const put = (cookie: string, url: string, payload: unknown) => h.app.inject({ method: 'PUT', url, headers: { cookie }, payload: payload as object });
  const request = (over: object = {}) => ana.c.post('/v1/bookings', {
    caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: D, start: '18:00', end: '22:00',
    address: '1200 Brickell Bay Dr, Apt 14B, Miami FL 33131', notes: 'Cena a las 7. Alergia al maní.', ...over,
  });

  beforeAll(async () => {
    root = await h.admin('root.book@nuriva.test', ['superadmin']);
    carer = await h.register('caregiver', 'carer.book@example.com', { name: 'Valentina Ríos' });
    ana = await h.register('client', 'ana.book@example.com', { name: 'Ana López' });
    luis = await h.register('client', 'luis.book@example.com');
    expect((await put(carer.c.cookie(), '/v1/caregiver/profile', {
      divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2600, yearsExperience: 6, languages: ['es'], services: ['occasional', 'overnight'], zip: '33131' })).statusCode).toBe(200);
    for (const step of VETTING_STEPS) {
      expect((await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` })).status).toBe(200);
    }
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-1' });
    const found = await h.client().get('/v1/caregivers/search?division=kids');
    publicId = found.body.results[0].id;
    sofia = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: 'Maní', medications: '', notes: '' } })).body.dependent.id;
    mateo = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Mateo', details: { ageYears: 7, allergies: '', medications: '', notes: '' } })).body.dependent.id;
    luna = (await ana.c.post('/v1/household/dependents', { kind: 'pet', name: 'Luna', details: { species: 'dog', breed: '', ageYears: 3, medications: '', notes: '' } })).body.dependent.id;
  });

  it('saves weekly availability and validates it', async () => {
    expect((await put(carer.c.cookie(), '/v1/caregiver/availability', { windows: [{ weekday: 1, start: '09:15', end: '12:00' }] })).statusCode).toBe(400);
    const r = await put(carer.c.cookie(), '/v1/caregiver/availability', { windows: allWeek('17:00', '24:00') });
    expect(r.statusCode).toBe(200);
    expect(r.json().windows).toHaveLength(7);
    expect((await carer.c.get('/v1/caregiver/availability')).body.windows[0]).toEqual({ weekday: 0, start: '17:00', end: '24:00' });
  });

  it('rejects requests outside availability, too soon, for inactive services or with wrong dependents', async () => {
    expect((await request({ start: '10:00', end: '14:00' })).body.error).toBe('outside_availability');
    expect((await request({ date: dayPlus(0), start: '17:00', end: '17:30' })).status).toBe(400);
    expect((await request({ service: 'overnight', start: '21:00', end: '07:00' })).body.error).toBe('not_bookable'); // overnight not activated
    expect((await request({ dependentIds: [luna] })).body.error).toBe('invalid_dependents'); // a pet for a Kids booking
    const other = (await luis.c.post('/v1/household/dependents', { kind: 'child', name: 'Pepe', details: { ageYears: 5, allergies: '', medications: '', notes: '' } })).body.dependent.id;
    expect((await request({ dependentIds: [other] })).body.error).toBe('invalid_dependents'); // someone else's child
    expect((await request({ start: '25:00' })).status).toBe(400);
  });

  it('creates a request with a price estimate and a midnight end', async () => {
    const r = await request({ dependentIds: [sofia, mateo], start: '20:00', end: '24:00' });
    expect(r.status).toBe(201);
    expect(r.body.booking).toMatchObject({ status: 'requested', service: 'occasional', viewerRole: 'client',
      price: { hourlyRateCents: 2600, subtotalCents: 10400, clientFeeCents: 1040, totalCents: 11440, estimate: true } });
    expect(new Date(r.body.booking.endAt).getTime() - new Date(r.body.booking.startAt).getTime()).toBe(4 * 3600_000);
    bookingId = r.body.booking.id;
  });

  it('prevents double booking the same slot', async () => {
    expect((await request({ start: '21:00', end: '23:00' })).body.error).toBe('slot_taken');
    expect((await request({ start: '18:00', end: '20:00' })).status).toBe(201); // adjacent slot is fine
  });

  it('stores address, notes and the children snapshot encrypted', async () => {
    const raw = JSON.stringify((await h.db.execute(sql`select address_enc, notes_enc, dependents_enc from bookings`)).rows);
    for (const s of ['Brickell', 'maní', 'Sofía', 'Mateo']) expect(raw).not.toContain(s);
  });

  it('shows the caregiver only ages before accepting, everything after', async () => {
    const before = (await carer.c.get(`/v1/bookings/${bookingId}`)).body.booking;
    expect(before).toMatchObject({ viewerRole: 'caregiver', address: null, notes: null, detailsRevealed: false, client: { firstName: 'Ana' } });
    expect(JSON.stringify(before.dependents)).not.toContain('Sofía');
    expect(before.dependents.map((d: { details: { ageYears: number } }) => d.details.ageYears).sort()).toEqual([4, 7]);
    const acc = await carer.c.post(`/v1/bookings/${bookingId}/accept`);
    expect(acc.status).toBe(200);
    const after = acc.body.booking;
    expect(after).toMatchObject({ status: 'accepted', detailsRevealed: true, address: '1200 Brickell Bay Dr, Apt 14B, Miami FL 33131' });
    expect(JSON.stringify(after.dependents)).toContain('Maní');
  });

  it('enforces who can do what', async () => {
    expect((await ana.c.post(`/v1/bookings/${bookingId}/accept`)).status).toBe(403); // clients cannot accept
    expect((await luis.c.get(`/v1/bookings/${bookingId}`)).status).toBe(404); // not a party
    expect((await carer.c.post(`/v1/bookings/${bookingId}/decline`)).body.error).toBe('invalid_transition'); // already accepted
    expect((await carer.c.post('/v1/bookings', {})).status).toBe(403); // caregivers cannot request
  });

  it('refuses acceptance once an approval is revoked', async () => {
    const second = (await ana.c.get('/v1/bookings')).body.bookings.find((b: { status: string }) => b.status === 'requested');
    await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step: 'training', status: 'pending', reference: 'Recertification due' });
    expect((await carer.c.post(`/v1/bookings/${second.id}/accept`)).body.error).toBe('not_bookable');
    await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step: 'training', status: 'passed', reference: 'Recertified' });
    await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step: 'final_approval', status: 'passed', reference: 'Re-approved' });
    const cancel = await ana.c.post(`/v1/bookings/${second.id}/cancel`, {});
    expect(cancel.body.booking.status).toBe('cancelled');
  });

  it('lists each side only their own bookings', async () => {
    expect((await ana.c.get('/v1/bookings')).body.bookings).toHaveLength(2);
    expect((await carer.c.get('/v1/bookings')).body.bookings).toHaveLength(2);
    expect((await luis.c.get('/v1/bookings')).body.bookings).toHaveLength(0);
  });

  it('audits the lifecycle without personal data', async () => {
    const rows = (await h.db.execute(sql`select action, meta from audit_log where action like 'booking.%'`)).rows;
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['booking.request', 'booking.accepted', 'booking.cancelled']));
    expect(JSON.stringify(rows)).not.toContain('Brickell');
  });
});

describe('bookings are closed in staging/production until payments are connected', async () => {
  const { loadConfig } = await import('../src/config.js');
  it('defaults to off in strict environments and on locally', () => {
    const base = { DATABASE_URL: 'postgres://u:p@db.example.com/x', NURIVA_DATA_KEYS: 'k:x', STRIPE_SECRET_KEY: 'sk_test_placeholder' };
    expect(loadConfig({ ...base, NURIVA_ENV: 'production' }).bookingsEnabled).toBe(false);
    expect(loadConfig({ ...base, NURIVA_ENV: 'staging' }).bookingsEnabled).toBe(false);
    expect(loadConfig({ ...base, NURIVA_ENV: 'development' }).bookingsEnabled).toBe(true);
    expect(loadConfig({ ...base, NURIVA_ENV: 'staging', BOOKINGS_ENABLED: 'true' }).bookingsEnabled).toBe(true);
  });
});

describe('payments configuration safeguards', async () => {
  const { loadConfig } = await import('../src/config.js');
  const base = { DATABASE_URL: 'postgres://u:p@db.example.com/x', NURIVA_DATA_KEYS: 'k:x' };
  it('refuses the fake provider in staging and production', () => {
    expect(() => loadConfig({ ...base, NURIVA_ENV: 'production', PAYMENTS_PROVIDER: 'fake' })).toThrow(/not allowed/);
    expect(() => loadConfig({ ...base, NURIVA_ENV: 'staging', PAYMENTS_PROVIDER: 'fake' })).toThrow(/not allowed/);
  });
  it('requires a Stripe key, and refuses live keys outside production', () => {
    expect(() => loadConfig({ ...base, NURIVA_ENV: 'development' })).toThrow(/STRIPE_SECRET_KEY is required/);
    expect(() => loadConfig({ ...base, NURIVA_ENV: 'staging', STRIPE_SECRET_KEY: 'sk_live_abc' })).toThrow(/Live Stripe keys/);
    expect(loadConfig({ ...base, NURIVA_ENV: 'production', STRIPE_SECRET_KEY: 'sk_live_abc' }).paymentsEnabled).toBe(false);
  });
  it('uses the fake provider by default only in tests', () => {
    expect(loadConfig({ ...base, NURIVA_ENV: 'test' }).paymentsProvider).toBe('fake');
  });
});

