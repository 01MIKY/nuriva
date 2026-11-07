import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const valid = {
  divisions: ['kids'],
  headline: 'Niñera bilingüe con experiencia',
  bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Brickell y Coral Gables.',
  hourlyRateCents: 2600,
  yearsExperience: 6,
  languages: ['es', 'en'],
  services: ['occasional', 'date_night'],
  zip: '33131',
};

const put = (cookie: string, payload: unknown) => h.app.inject({ method: 'PUT', url: '/v1/caregiver/profile', payload: payload as object, headers: { cookie } });

describe('caregiver profile', () => {
  let cg: Awaited<ReturnType<typeof h.register>>;
  beforeAll(async () => { cg = await h.register('caregiver', 'maria.profile@example.com'); });

  it('starts with the registration defaults and lists what is missing', async () => {
    const r = await cg.c.get('/v1/caregiver/profile');
    expect(r.status).toBe(200);
    expect(r.body.profile).toMatchObject({ divisions: ['kids'], hourlyRateCents: 2500 });
    expect(r.body.gaps).toEqual(['headline', 'bio', 'zip']);
  });

  it('saves a complete profile and reports no gaps', async () => {
    const r = await put(cg.c.cookie(), valid);
    expect(r.statusCode).toBe(200);
    expect(r.json().profile).toMatchObject(valid);
    expect(r.json().gaps).toEqual([]);
  });

  it('rejects services outside the chosen divisions, bad ZIPs, rates under the minimum and unknown fields', async () => {
    const bad = [
      { ...valid, services: ['dog_walking'] },
      { ...valid, zip: '3313' },
      { ...valid, hourlyRateCents: 1000 },
      { ...valid, languages: ['klingon'] },
      { ...valid, bio: 'Muy corta' },
      { ...valid, approved: true },
    ];
    for (const body of bad) expect((await put(cg.c.cookie(), body)).statusCode).toBe(400);
  });

  it('allows both divisions with services from each', async () => {
    const r = await put(cg.c.cookie(), { ...valid, divisions: ['kids', 'pets'], services: ['occasional', 'dog_walking'] });
    expect(r.statusCode).toBe(200);
  });

  it('cannot change any vetting status by editing the profile', async () => {
    const r = await cg.c.get('/v1/caregiver/vetting');
    expect(r.body.canAcceptBookings).toBe(false);
    expect(r.body.steps.every((s: { status: string }) => s.status === 'not_started')).toBe(true);
  });

  it('is caregiver-only', async () => {
    const client = await h.register('client', 'client.profile@example.com');
    expect((await client.c.get('/v1/caregiver/profile')).status).toBe(403);
    expect((await put(client.c.cookie(), valid)).statusCode).toBe(403);
    expect((await h.client().get('/v1/caregiver/profile')).status).toBe(401);
  });
});
