import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));
const D = dayPlus(5);

describe('backup guarantee: alternatives when the caregiver cannot go', () => {
  let root: Awaited<ReturnType<typeof h.admin>>;
  let ana: Awaited<ReturnType<typeof h.register>>;
  let luis: Awaited<ReturnType<typeof h.register>>;
  const carers: Record<string, { c: Awaited<ReturnType<typeof h.register>>['c']; id: number; publicId: string }> = {};
  let sofia = 0;
  let leo = 0;

  const put = (cookie: string, url: string, payload: unknown) => h.app.inject({ method: 'PUT', url, headers: { cookie }, payload: payload as object });
  const book = (who: typeof ana, kid: number, publicId: string, over: object = {}) => who.c.post('/v1/bookings', {
    caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [kid], date: D, start: '18:00', end: '21:00',
    address: '1200 Brickell Bay Dr, Apt 14B, Miami FL 33131', notes: '', ...over,
  });

  async function caregiver(key: string, name: string, hours: { start: string; end: string }, years: number) {
    const r = await h.register('caregiver', `${key}.backup@example.com`, { name });
    expect((await put(r.c.cookie(), '/v1/caregiver/profile', {
      divisions: ['kids'], headline: `Niñera ${key}`, bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2500, yearsExperience: years, languages: ['es'], services: ['occasional'], zip: '33131' })).statusCode).toBe(200);
    await put(r.c.cookie(), '/v1/caregiver/availability', { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, ...hours })) });
    for (const step of VETTING_STEPS) await root.c.post(`/v1/admin/caregivers/${r.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` });
    carers[key] = { c: r.c, id: r.id, publicId: '' };
  }

  beforeAll(async () => {
    root = await h.admin('root.backup@nuriva.test', ['superadmin']);
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-BACKUP' });
    await caregiver('vale', 'Valentina Ríos', { start: '08:00', end: '22:00' }, 6); // booked first, then cancels
    await caregiver('carla', 'Carla Méndez', { start: '08:00', end: '22:00' }, 4); // free → suggested
    await caregiver('marta', 'Marta Díaz', { start: '08:00', end: '22:00' }, 9); // already booked then → not suggested
    await caregiver('nora', 'Nora Gil', { start: '08:00', end: '14:00' }, 10); // not available in the evening → not suggested
    const found = (await h.client().get('/v1/caregivers/search?division=kids')).body.results as Array<{ id: string; headline: string }>;
    for (const k of Object.keys(carers)) carers[k]!.publicId = found.find((f) => f.headline === `Niñera ${k}`)!.id;
    ana = await h.register('client', 'ana.backup@example.com', { name: 'Ana López' });
    luis = await h.register('client', 'luis.backup@example.com', { name: 'Luis Gil' });
    sofia = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } })).body.dependent.id;
    leo = (await luis.c.post('/v1/household/dependents', { kind: 'child', name: 'Leo', details: { ageYears: 6, allergies: '', medications: '', notes: '' } })).body.dependent.id;
    expect((await book(luis, leo, carers.marta!.publicId, { start: '19:00', end: '20:00' })).status).toBe(201);
  });

  it('suggests only listed caregivers who are free at the same time, once the caregiver cancels', async () => {
    const b = await book(ana, sofia, carers.vale!.publicId);
    const id = b.body.booking.id;
    expect((await ana.c.get(`/v1/bookings/${id}/alternatives`)).body.alternatives).toEqual([]);
    expect((await carers.vale!.c.post(`/v1/bookings/${id}/accept`)).status).toBe(200);
    expect((await carers.vale!.c.post(`/v1/bookings/${id}/cancel`, {})).status).toBe(200);
    const detail = (await ana.c.get(`/v1/bookings/${id}`)).body.booking;
    expect(detail).toMatchObject({ status: 'cancelled', cancelledBy: 'caregiver' });
    const alt = (await ana.c.get(`/v1/bookings/${id}/alternatives`)).body.alternatives as Array<{ id: string; displayName: string }>;
    expect(alt.map((a) => a.displayName)).toEqual(['Carla M.']);
    expect(JSON.stringify(alt)).not.toMatch(/backup@example\.com|33131|userId/);
    // Only the family of the booking, and only families.
    expect((await luis.c.get(`/v1/bookings/${id}/alternatives`)).status).toBe(404);
    expect((await carers.vale!.c.get(`/v1/bookings/${id}/alternatives`)).status).toBe(403);
  });

  it('also helps when the caregiver declines, but not when the family cancels', async () => {
    const declined = (await book(ana, sofia, carers.vale!.publicId, { date: dayPlus(6) })).body.booking.id;
    expect((await carers.vale!.c.post(`/v1/bookings/${declined}/decline`)).status).toBe(200);
    expect((await ana.c.get(`/v1/bookings/${declined}/alternatives`)).body.alternatives.length).toBeGreaterThan(0);
    const mine = (await book(ana, sofia, carers.vale!.publicId, { date: dayPlus(7) })).body.booking.id;
    expect((await ana.c.post(`/v1/bookings/${mine}/cancel`, {})).status).toBe(200);
    expect((await ana.c.get(`/v1/bookings/${mine}`)).body.booking.cancelledBy).toBe('client');
    expect((await ana.c.get(`/v1/bookings/${mine}/alternatives`)).body.alternatives).toEqual([]);
  });
});
