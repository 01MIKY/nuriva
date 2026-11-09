import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const profile = (over: object = {}) => ({
  divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
  hourlyRateCents: 2600, yearsExperience: 6, languages: ['es', 'en'], services: ['occasional', 'date_night'], zip: '33131', ...over,
});

describe('public caregiver search', () => {
  let root: Awaited<ReturnType<typeof h.admin>>;
  let approved: Awaited<ReturnType<typeof h.register>>;
  let pending: Awaited<ReturnType<typeof h.register>>;
  let walker: Awaited<ReturnType<typeof h.register>>;

  async function approve(id: number) {
    for (const step of VETTING_STEPS) {
      const r = await root.c.post(`/v1/admin/caregivers/${id}/vetting`, { step, status: 'passed', reference: `${step} evidence` });
      expect(r.status).toBe(200);
    }
  }
  const setProfile = (cookie: string, body: object) => h.app.inject({ method: 'PUT', url: '/v1/caregiver/profile', headers: { cookie }, payload: body });
  const activate = (division: string, service: string, active = true) =>
    root.c.post('/v1/admin/compliance/services', { division, service, active, complianceRef: `MEMO-${service}` });
  const search = (qs: string) => h.client().get(`/v1/caregivers/search?${qs}`);

  beforeAll(async () => {
    root = await h.admin('root.search@nuriva.test', ['superadmin']);
    approved = await h.register('caregiver', 'valentina.search@example.com', { name: 'Valentina Ríos Gómez' });
    pending = await h.register('caregiver', 'pending.search@example.com');
    walker = await h.register('caregiver', 'andres.search@example.com', { name: 'Andrés Pérez', divisions: ['pets'] });
    expect((await setProfile(approved.c.cookie(), profile())).statusCode).toBe(200);
    expect((await setProfile(pending.c.cookie(), profile())).statusCode).toBe(200);
    expect((await setProfile(walker.c.cookie(), profile({ divisions: ['pets'], services: ['dog_walking'], hourlyRateCents: 2000, yearsExperience: 3, languages: ['es'] }))).statusCode).toBe(200);
    await approve(approved.id);
    await approve(walker.id);
  });

  it('shows nobody while no service is activated in the compliance register', async () => {
    const r = await search('division=kids');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ results: [], availableServices: [] });
  });

  it('shows only fully approved caregivers once a service is active', async () => {
    await activate('kids', 'occasional');
    const r = await search('division=kids');
    expect(r.body.availableServices).toEqual(['occasional']);
    expect(r.body.results).toHaveLength(1);
    expect(r.body.results[0]).toMatchObject({ displayName: 'Valentina R.', initials: 'VR', services: ['occasional'], verified: true });
  });

  it('never returns private data or internal ids', async () => {
    const dump = JSON.stringify((await search('division=kids')).body);
    for (const secret of ['valentina.search@example.com', '33131', 'Ríos Gómez', '"userId"', '"email"', 'evidence']) expect(dump).not.toContain(secret);
    expect((await search('division=kids')).body.results[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lists only services that are active (date_night is offered but not activated)', async () => {
    expect((await search('division=kids&service=date_night')).body.results).toEqual([]);
    await activate('kids', 'date_night');
    expect((await search('division=kids&service=date_night')).body.results).toHaveLength(1);
  });

  it('separates divisions and filters by language and rate', async () => {
    await activate('pets', 'dog_walking');
    const pets = (await search('division=pets')).body.results;
    expect(pets.map((r: { displayName: string }) => r.displayName)).toEqual(['Andrés P.']);
    expect((await search('division=pets&language=en')).body.results).toEqual([]);
    expect((await search('division=kids&maxRate=25')).body.results).toEqual([]);
    expect((await search('division=kids&maxRate=26')).body.results).toHaveLength(1);
  });

  it('validates the query strictly', async () => {
    expect((await search('division=cats')).status).toBe(400);
    expect((await search('')).status).toBe(400);
    expect((await search('division=kids&email=x')).status).toBe(400);
  });

  it('hides caregivers again when a step is revoked or the service is deactivated', async () => {
    await root.c.post(`/v1/admin/caregivers/${walker.id}/vetting`, { step: 'background', status: 'failed', reference: 'Adverse finding' });
    expect((await search('division=pets')).body.results).toEqual([]);
    await activate('kids', 'occasional', false);
    await activate('kids', 'date_night', false);
    expect((await search('division=kids')).body.results).toEqual([]);
    await activate('kids', 'occasional', true);
  });

  it('serves a public profile by public id, and 404 for anyone not listed', async () => {
    const id = (await search('division=kids')).body.results[0].id;
    const p = await h.client().get(`/v1/caregivers/${id}`);
    expect(p.status).toBe(200);
    expect(p.body.caregiver).toMatchObject({ displayName: 'Valentina R.', divisions: [{ division: 'kids', services: ['occasional'] }], verifiedSteps: VETTING_STEPS });
    expect(JSON.stringify(p.body)).not.toContain('valentina.search@example.com');
    const pendingProfile = await h.client().get('/v1/caregivers/00000000-0000-4000-8000-000000000000');
    expect(pendingProfile.status).toBe(404);
    expect((await h.client().get('/v1/caregivers/123')).status).toBe(400);
  });
});
