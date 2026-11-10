import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

/** A Miami date N days from now that falls on the given weekday (0 = Sunday), so tests never depend on today. */
const nextWeekday = (weekday: number, minDays = 3) => {
  for (let n = minDays; n < minDays + 7; n++) {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === weekday) return d;
  }
  throw new Error('unreachable');
};
const plusDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

describe('weekly bookings', () => {
  let root: Awaited<ReturnType<typeof h.admin>>;
  let carer: Awaited<ReturnType<typeof h.register>>;
  let ana: Awaited<ReturnType<typeof h.register>>;
  let luis: Awaited<ReturnType<typeof h.register>>;
  let publicId = '';
  let sofia = 0;
  let luisKid = 0;
  const TUE = nextWeekday(2);

  const put = (cookie: string, url: string, payload: unknown) => h.app.inject({ method: 'PUT', url, headers: { cookie }, payload: payload as object });
  const weekly = (c: typeof ana.c, kid: number, over: object = {}) => c.post('/v1/bookings', {
    caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [kid], date: TUE, start: '17:00', end: '20:00',
    address: '1200 Brickell Bay Dr, Apt 14B, Miami FL 33131', notes: '', repeatWeeks: 4, ...over,
  });

  beforeAll(async () => {
    root = await h.admin('root.series@nuriva.test', ['superadmin']);
    carer = await h.register('caregiver', 'carer.series@example.com', { name: 'Valentina Ríos' });
    ana = await h.register('client', 'ana.series@example.com', { name: 'Ana López' });
    luis = await h.register('client', 'luis.series@example.com', { name: 'Luis Gil' });
    expect((await put(carer.c.cookie(), '/v1/caregiver/profile', {
      divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2500, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' })).statusCode).toBe(200);
    // Tuesdays and Thursdays only.
    await put(carer.c.cookie(), '/v1/caregiver/availability', { windows: [{ weekday: 2, start: '08:00', end: '22:00' }, { weekday: 4, start: '08:00', end: '22:00' }] });
    for (const step of VETTING_STEPS) await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` });
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-SERIES' });
    publicId = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0].id;
    sofia = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } })).body.dependent.id;
    luisKid = (await luis.c.post('/v1/household/dependents', { kind: 'child', name: 'Leo', details: { ageYears: 6, allergies: '', medications: '', notes: '' } })).body.dependent.id;
  });

  it('validates the number of weeks', async () => {
    expect((await weekly(ana.c, sofia, { repeatWeeks: 1 })).status).toBe(400);
    expect((await weekly(ana.c, sofia, { repeatWeeks: 13 })).status).toBe(400);
  });

  it('creates nothing if any week is taken, and says which dates', async () => {
    // Luis already holds the third Tuesday.
    const third = plusDays(TUE, 14);
    expect((await luis.c.post('/v1/bookings', {
      caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [luisKid], date: third, start: '18:00', end: '19:00',
      address: '500 Brickell Ave, Miami FL 33131', notes: '' })).status).toBe(201);
    const r = await weekly(ana.c, sofia);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: 'series_conflict', details: { dates: [third] } });
    expect((await ana.c.get('/v1/bookings')).body.bookings).toHaveLength(0);
    // Free the slot again for the next tests.
    const luisBooking = (await luis.c.get('/v1/bookings')).body.bookings[0].id;
    expect((await luis.c.post(`/v1/bookings/${luisBooking}/cancel`, {})).status).toBe(200);
  });

  it('creates one booking per week with the same local time and price, grouped as a series', async () => {
    const r = await weekly(ana.c, sofia);
    expect(r.status).toBe(201);
    expect(r.body.visits).toBe(4);
    expect(r.body.booking.series).toMatchObject({ index: 1, count: 4 });
    const list = (await ana.c.get('/v1/bookings')).body.bookings as Array<{ startAt: string; series: { index: number; count: number }; price: { totalCents: number } }>;
    expect(list).toHaveLength(4);
    const local = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
    expect(new Set(list.map((b) => local(b.startAt)))).toEqual(new Set(['Tue 17:00']));
    expect(new Set(list.map((b) => b.price.totalCents)).size).toBe(1);
    expect(list.map((b) => b.series.index).sort()).toEqual([1, 2, 3, 4]);
    const audits = await h.db.execute(sql`select count(*)::int as n from audit_log where action = 'booking.request' and (meta->>'seriesId') is not null`);
    expect((audits.rows[0] as { n: number }).n).toBe(4);
  });

  it('a day outside the caregiver availability is rejected as a whole', async () => {
    const wed = plusDays(TUE, 1);
    const r = await weekly(ana.c, sofia, { date: wed });
    expect(r.body.error).toBe('outside_availability');
  });

  it('the caregiver accepts every pending visit at once; the family then cancels from the third visit on', async () => {
    const list = (await carer.c.get('/v1/bookings')).body.bookings as Array<{ id: number; startAt: string; status: string; series: { index: number } | null }>;
    const first = list.find((b) => b.series?.index === 1)!;
    expect((await ana.c.post(`/v1/bookings/${first.id}/series/accept`, {})).status).toBe(403);
    const acc = await carer.c.post(`/v1/bookings/${first.id}/series/accept`, {});
    expect(acc.status).toBe(200);
    expect(acc.body.changed).toBe(4);
    const third = list.find((b) => b.series?.index === 3)!;
    const can = await ana.c.post(`/v1/bookings/${third.id}/series/cancel`, {});
    expect(can.status).toBe(200);
    expect(can.body.changed).toBe(2);
    const after = (await ana.c.get('/v1/bookings')).body.bookings as Array<{ status: string; series: { index: number } }>;
    const byIndex = Object.fromEntries(after.map((b) => [b.series.index, b.status]));
    expect(byIndex).toEqual({ 1: 'accepted', 2: 'accepted', 3: 'cancelled', 4: 'cancelled' });
  });

  it('series actions are refused on single bookings and for people outside the booking', async () => {
    const thu = plusDays(TUE, 2);
    const single = await ana.c.post('/v1/bookings', {
      caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: thu, start: '17:00', end: '18:00',
      address: '1200 Brickell Bay Dr, Apt 14B, Miami FL 33131', notes: '' });
    expect(single.status).toBe(201);
    expect(single.body.booking.series).toBeNull();
    expect((await carer.c.post(`/v1/bookings/${single.body.booking.id}/series/accept`, {})).body.error).toBe('not_series');
    const anaFirst = (await ana.c.get('/v1/bookings')).body.bookings.find((b: { series: { index: number } | null }) => b.series?.index === 1);
    expect((await luis.c.post(`/v1/bookings/${anaFirst.id}/series/cancel`, {})).status).toBe(404);
  });
});
