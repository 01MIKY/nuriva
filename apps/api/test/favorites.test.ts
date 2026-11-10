import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));

describe('favorite caregivers and booking again', () => {
  let root: Awaited<ReturnType<typeof h.admin>>;
  let carer: Awaited<ReturnType<typeof h.register>>;
  let ana: Awaited<ReturnType<typeof h.register>>;
  let publicId = '';
  let sofia = 0;

  const inject = (method: 'PUT' | 'DELETE', cookie: string, url: string, payload?: unknown) =>
    h.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload: payload as object } : {}) });

  beforeAll(async () => {
    root = await h.admin('root.fav@nuriva.test', ['superadmin']);
    carer = await h.register('caregiver', 'carer.fav@example.com', { name: 'Valentina Ríos' });
    ana = await h.register('client', 'ana.fav@example.com', { name: 'Ana López' });
    expect((await inject('PUT', carer.c.cookie(), '/v1/caregiver/profile', {
      divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2600, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' })).statusCode).toBe(200);
    await inject('PUT', carer.c.cookie(), '/v1/caregiver/availability', { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) });
    for (const step of VETTING_STEPS) await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` });
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-FAV' });
    publicId = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0].id;
    sofia = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } })).body.dependent.id;
  });

  it('only families can save favorites, and only listed caregivers', async () => {
    expect((await inject('PUT', carer.c.cookie(), `/v1/favorites/${publicId}`)).statusCode).toBe(403);
    expect((await inject('PUT', '', `/v1/favorites/${publicId}`)).statusCode).toBe(401);
    expect((await inject('PUT', ana.c.cookie(), '/v1/favorites/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect((await inject('PUT', ana.c.cookie(), '/v1/favorites/not-a-uuid')).statusCode).toBe(400);
  });

  it('saves idempotently, shows on the profile and in the list, and can be removed', async () => {
    expect((await ana.c.get(`/v1/caregivers/${publicId}`)).body.favorite).toBe(false);
    expect((await inject('PUT', ana.c.cookie(), `/v1/favorites/${publicId}`)).statusCode).toBe(201);
    expect((await inject('PUT', ana.c.cookie(), `/v1/favorites/${publicId}`)).statusCode).toBe(200);
    expect((await ana.c.get(`/v1/caregivers/${publicId}`)).body.favorite).toBe(true);
    expect((await h.client().get(`/v1/caregivers/${publicId}`)).body.favorite).toBeNull();
    const list = await ana.c.get('/v1/favorites');
    expect(list.body.favorites).toEqual([expect.objectContaining({ id: publicId, displayName: 'Valentina R.', available: true, hourlyRateCents: 2600 })]);
    expect(JSON.stringify(list.body)).not.toMatch(/carer\.fav@example\.com|33131|userId/);
    expect((await inject('DELETE', ana.c.cookie(), `/v1/favorites/${publicId}`)).statusCode).toBe(200);
    expect((await ana.c.get('/v1/favorites')).body.favorites).toEqual([]);
  });

  it('keeps a caregiver who stops being listed as "no longer available", without profile details', async () => {
    await inject('PUT', ana.c.cookie(), `/v1/favorites/${publicId}`);
    await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step: 'background', status: 'failed', reference: 'revoked evidence' });
    const [fav] = (await ana.c.get('/v1/favorites')).body.favorites;
    expect(fav).toEqual({ id: publicId, displayName: 'Valentina R.', initials: 'VR', savedAt: expect.any(String), available: false });
    // Cannot be added again while unlisted, but can still be removed.
    expect((await inject('DELETE', ana.c.cookie(), `/v1/favorites/${publicId}`)).statusCode).toBe(200);
    expect((await inject('PUT', ana.c.cookie(), `/v1/favorites/${publicId}`)).statusCode).toBe(404);
    const back = await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step: 'background', status: 'passed', reference: 'background re-check evidence' });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    // A failed step revokes final approval by design; staff must grant it again.
    expect((await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step: 'final_approval', status: 'passed', reference: 'final re-approval evidence' })).status).toBe(200);
  });

  it('booking snapshots keep the household id for the family (to book again) but never show it to the caregiver', async () => {
    const r = await ana.c.post('/v1/bookings', {
      caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: dayPlus(5), start: '18:00', end: '21:00',
      address: '1200 Brickell Bay Dr, Apt 14B, Miami FL 33131', notes: '',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.booking.dependents[0]).toMatchObject({ id: sofia, name: 'Sofía' });
    const id = r.body.booking.id;
    expect((await carer.c.post(`/v1/bookings/${id}/accept`)).status).toBe(200);
    const seen = (await carer.c.get(`/v1/bookings/${id}`)).body.booking.dependents[0];
    expect(seen.name).toBe('Sofía');
    expect(seen).not.toHaveProperty('id');
  });
});
