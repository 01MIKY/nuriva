import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));

describe('caregiver levels and badges', () => {
  let root: Awaited<ReturnType<typeof h.admin>>;
  let carer: Awaited<ReturnType<typeof h.register>>;
  let ana: Awaited<ReturnType<typeof h.register>>;
  let publicId = '';
  let sofia = 0;
  const reviewIds: number[] = [];

  const put = (cookie: string, url: string, payload: unknown) => h.app.inject({ method: 'PUT', url, headers: { cookie }, payload: payload as object });

  beforeAll(async () => {
    root = await h.admin('root.rep@nuriva.test', ['superadmin']);
    carer = await h.register('caregiver', 'carer.rep@example.com', { name: 'Valentina Ríos' });
    ana = await h.register('client', 'ana.rep@example.com', { name: 'Ana López' });
    expect((await put(carer.c.cookie(), '/v1/caregiver/profile', {
      divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2500, yearsExperience: 6, languages: ['es', 'en'], services: ['occasional'], zip: '33131' })).statusCode).toBe(200);
    await put(carer.c.cookie(), '/v1/caregiver/availability', { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) });
    for (const step of VETTING_STEPS) await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` });
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-REP' });
    publicId = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0].id;
    sofia = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } })).body.dependent.id;
  });

  it('starts at the initial level, shows what is missing, and is only visible to the caregiver', async () => {
    const r = await carer.c.get('/v1/caregiver/reputation');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ level: 'new', next: 'silver', missing: [{ key: 'completed', need: 10 }, { key: 'reviews', need: 3 }] });
    expect((await ana.c.get('/v1/caregiver/reputation')).status).toBe(403);
    const profile = (await h.client().get(`/v1/caregivers/${publicId}`)).body.caregiver;
    expect(profile).toMatchObject({ level: null, completed: 0, badges: [{ key: 'bilingual' }] });
  });

  it('reaches Silver from completed services and visible reviews; hiding a review counts against it', async () => {
    for (let i = 0; i < 10; i++) {
      const b = await ana.c.post('/v1/bookings', {
        caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: dayPlus(3 + i), start: '18:00', end: '20:00',
        address: '1200 Brickell Bay Dr, Apt 14B, Miami FL 33131', notes: '' });
      expect(b.status).toBe(201);
      expect((await carer.c.post(`/v1/bookings/${b.body.booking.id}/accept`)).status).toBe(200);
    }
    // Test only: the ten services took place.
    await h.db.execute(sql`update bookings set status = 'completed' where caregiver_id = ${carer.id}`);
    const done = (await ana.c.get('/v1/bookings')).body.bookings as Array<{ id: number }>;
    for (const b of done.slice(0, 3)) {
      const r = await ana.c.post(`/v1/bookings/${b.id}/review`, { rating: 5, comment: 'Excelente' });
      expect(r.status).toBe(201);
    }
    const listed = (await root.c.get('/v1/admin/reviews')).body.reviews as Array<{ id: number; caregiverId: number }>;
    reviewIds.push(...listed.filter((x) => x.caregiverId === carer.id).map((x) => x.id));
    expect(reviewIds).toHaveLength(3);
    const me = (await carer.c.get('/v1/caregiver/reputation')).body;
    expect(me).toMatchObject({ level: 'silver', next: 'gold', stats: { completed: 10, ratingCount: 3, repeatFamilies: 1, cancellations90d: 0, responses: 10 } });
    expect(me.missing).toEqual([{ key: 'completed', need: 20 }, { key: 'reviews', need: 7 }, { key: 'repeatFamilies', need: 2 }]);

    const card = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0];
    expect(card).toMatchObject({ level: 'silver', completed: 10 });
    expect(card.badges).toEqual([{ key: 'bilingual' }, { key: 'fastResponse' }, { key: 'noCancellations' }]);
    expect(JSON.stringify(card)).not.toMatch(/cancellations90d|medianResponse|repeatFamilies"\s*:\s*1/);

    expect((await root.c.post(`/v1/admin/reviews/${reviewIds[0]}/visibility`, { hidden: true, reason: 'Contiene datos personales' })).status).toBe(200);
    expect((await carer.c.get('/v1/caregiver/reputation')).body).toMatchObject({ level: 'new', missing: [{ key: 'reviews', need: 1 }] });
  });
});
