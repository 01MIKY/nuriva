import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));

describe('service in progress: messages, check-in/out, updates, reviews, incidents', () => {
  let carer: Awaited<ReturnType<typeof h.register>>;
  let ana: Awaited<ReturnType<typeof h.register>>;
  let luis: Awaited<ReturnType<typeof h.register>>;
  let ts: Awaited<ReturnType<typeof h.admin>>;
  let ops: Awaited<ReturnType<typeof h.admin>>;
  let id = 0;
  let publicId = '';

  /** Moves the booking window around "now" (time travel for tests only). */
  const shift = (startMin: number, endMin: number) =>
    h.db.execute(sql`update bookings set start_at = now() + (${startMin} || ' minutes')::interval, end_at = now() + (${endMin} || ' minutes')::interval where id = ${id}`);

  beforeAll(async () => {
    const root = await h.admin('root.svc@nuriva.test', ['superadmin']);
    ts = await h.admin('ts.svc@nuriva.test', ['trust_safety']);
    ops = await h.admin('ops.svc@nuriva.test', ['operations']);
    carer = await h.register('caregiver', 'carer.svc@example.com', { name: 'Valentina Ríos' });
    ana = await h.register('client', 'ana.svc@example.com', { name: 'Ana López' });
    luis = await h.register('client', 'luis.svc@example.com');
    const put = (url: string, payload: object) => h.app.inject({ method: 'PUT', url, headers: { cookie: carer.c.cookie() }, payload });
    await put('/v1/caregiver/profile', { divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2600, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' });
    await put('/v1/caregiver/availability', { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) });
    for (const step of VETTING_STEPS) await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` });
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-SVC' });
    publicId = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0].id;
    const sofia = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } })).body.dependent.id;
    id = (await ana.c.post('/v1/bookings', { caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: dayPlus(5), start: '18:00', end: '21:00', address: '1200 Brickell Bay Dr, Miami FL', notes: '' })).body.booking.id;
  });

  it('lets the two parties message each other, encrypted, and nobody else', async () => {
    expect((await ana.c.post(`/v1/bookings/${id}/messages`, { body: '¿Puedes llegar 10 minutos antes?' })).status).toBe(201);
    expect((await carer.c.post(`/v1/bookings/${id}/messages`, { body: 'Claro, allí estaré.' })).status).toBe(201);
    const list = (await carer.c.get(`/v1/bookings/${id}/messages`)).body.messages;
    expect(list.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([['¿Puedes llegar 10 minutos antes?', false], ['Claro, allí estaré.', true]]);
    expect(JSON.stringify((await h.db.execute(sql`select body_enc from booking_messages`)).rows)).not.toContain('minutos');
    expect((await luis.c.get(`/v1/bookings/${id}/messages`)).status).toBe(404);
    expect((await ana.c.post(`/v1/bookings/${id}/messages`, { body: '' })).status).toBe(400);
  });

  it('never blocks a message that shares contact or off-app payment, but marks it so both see a reminder', async () => {
    const sent = await carer.c.post(`/v1/bookings/${id}/messages`, { body: 'Si quieres te paso mi WhatsApp: 305-555-1234, y me pagas por Zelle' });
    expect(sent.status).toBe(201);
    expect(sent.body.message.signals).toEqual(['payment', 'phone']);
    const seen = (await ana.c.get(`/v1/bookings/${id}/messages`)).body.messages as Array<{ signals: string[]; mine: boolean }>;
    expect(seen.at(-1)).toMatchObject({ mine: false, signals: ['payment', 'phone'] });
    expect(seen[0]!.signals).toEqual([]);
    // Only the category is stored in clear; the text stays encrypted.
    expect(JSON.stringify((await h.db.execute(sql`select body_enc from booking_messages`)).rows)).not.toContain('Zelle');
  });

  it('only allows check-in once accepted, by the caregiver, and not too early', async () => {
    expect((await carer.c.post(`/v1/bookings/${id}/check-in`)).body.error).toBe('invalid_transition'); // still requested
    await carer.c.post(`/v1/bookings/${id}/accept`);
    expect((await carer.c.post(`/v1/bookings/${id}/check-in`)).body.error).toBe('too_early');
    await shift(-5, 120);
    expect((await ana.c.post(`/v1/bookings/${id}/check-in`)).status).toBe(403);
    const r = await carer.c.post(`/v1/bookings/${id}/check-in`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'in_progress', updates: [{ kind: 'check_in' }] });
  });

  it('sends care updates to the family during the service', async () => {
    expect((await carer.c.post(`/v1/bookings/${id}/updates`, { note: 'Cenó bien y ya está en pijama.' })).status).toBe(201);
    expect((await ana.c.post(`/v1/bookings/${id}/updates`, { note: 'hola' })).status).toBe(403);
    const tl = (await ana.c.get(`/v1/bookings/${id}/timeline`)).body.updates;
    expect(tl.map((u: { kind: string }) => u.kind)).toEqual(['check_in', 'update']);
    expect(tl[1].note).toBe('Cenó bien y ya está en pijama.');
  });

  it('does not allow a review before the service is completed', async () => {
    expect((await ana.c.post(`/v1/bookings/${id}/review`, { rating: 5, comment: 'Genial' })).body.error).toBe('not_completed');
  });

  it('checks out, completes the booking, and the family leaves one review that appears on the profile', async () => {
    const out = await carer.c.post(`/v1/bookings/${id}/check-out`);
    expect(out.body.status).toBe('completed');
    expect((await carer.c.post(`/v1/bookings/${id}/review`, { rating: 5 })).status).toBe(403); // only the family
    expect((await ana.c.post(`/v1/bookings/${id}/review`, { rating: 6 })).status).toBe(400);
    expect((await ana.c.post(`/v1/bookings/${id}/review`, { rating: 5, comment: 'Puntual y muy cariñosa con Sofía.' })).status).toBe(201);
    expect((await ana.c.post(`/v1/bookings/${id}/review`, { rating: 1 })).body.error).toBe('already_reviewed');
    const prof = (await h.client().get(`/v1/caregivers/${publicId}`)).body.caregiver;
    expect(prof.rating).toEqual({ avg: 5, count: 1 });
    expect(prof.reviews[0]).toMatchObject({ rating: 5, comment: 'Puntual y muy cariñosa con Sofía.', author: 'Ana' });
    const search = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0];
    expect(search.rating).toEqual({ avg: 5, count: 1 });
  });

  it('closes the conversation when a booking is cancelled', async () => {
    const sofia = (await ana.c.get('/v1/household')).body.dependents[0].id;
    const other = (await ana.c.post('/v1/bookings', { caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: dayPlus(9), start: '10:00', end: '12:00', address: '1200 Brickell Bay Dr, Miami FL', notes: '' })).body.booking.id;
    await ana.c.post(`/v1/bookings/${other}/cancel`, {});
    expect((await ana.c.post(`/v1/bookings/${other}/messages`, { body: 'hola' })).body.error).toBe('conversation_closed');
  });

  it('reports incidents with emergency guidance; only Trust & Safety can read and handle them', async () => {
    const r = await ana.c.post(`/v1/bookings/${id}/incidents`, { severity: 'emergency', description: 'Mi hija se cayó y se golpeó la cabeza durante el servicio.' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ incident: { severity: 'emergency', status: 'open' }, emergencyGuidance: true });
    expect((await luis.c.post(`/v1/bookings/${id}/incidents`, { severity: 'low', description: 'No soy parte de esta reserva.' })).status).toBe(404);
    expect(JSON.stringify((await h.db.execute(sql`select description_enc from incidents`)).rows)).not.toContain('cabeza');

    expect((await ops.c.get('/v1/admin/incidents')).status).toBe(403);
    const list = (await ts.c.get('/v1/admin/incidents')).body.incidents;
    expect(list[0]).toMatchObject({ severity: 'emergency', status: 'open', reporterRole: 'client' });
    const detail = (await ts.c.get(`/v1/admin/incidents/${list[0].id}`)).body.incident;
    expect(detail.description).toContain('cabeza');
    const upd = await ts.c.post(`/v1/admin/incidents/${list[0].id}/status`, { status: 'investigating', note: 'Llamamos a la familia; la niña está bien. Revisamos con la cuidadora.' });
    expect(upd.body.incident.status).toBe('investigating');
    const audits = (await h.db.execute(sql`select action from audit_log where action like 'incident.%'`)).rows.map((x) => x.action);
    expect(audits).toEqual(expect.arrayContaining(['incident.create', 'incident.read', 'incident.status']));
  });
});

describe('review moderation', () => {
  it('lets Trust & Safety hide and restore a review with a reason, and the profile follows', async () => {
    const ts = h.client();
    await ts.post('/v1/auth/login', { email: 'ts.svc@nuriva.test', password: 'admin-password-123' });
    const finance = await h.admin('fin.svc@nuriva.test', ['finance']);
    expect((await finance.c.get('/v1/admin/reviews')).status).toBe(403);
    const list = (await ts.get('/v1/admin/reviews')).body.reviews;
    expect(list[0]).toMatchObject({ rating: 5, author: 'Ana', hidden: false });
    const rid = list[0].id;
    expect((await ts.post(`/v1/admin/reviews/${rid}/visibility`, { hidden: true })).status).toBe(400); // reason required
    expect((await ts.post(`/v1/admin/reviews/${rid}/visibility`, { hidden: true, reason: 'Contiene datos personales' })).body.review.hidden).toBe(true);
    const pid = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0].id;
    const prof = (await h.client().get(`/v1/caregivers/${pid}`)).body.caregiver;
    expect(prof.reviews).toEqual([]);
    expect(prof.rating).toBeNull();
    expect((await ts.get('/v1/admin/reviews?filter=hidden')).body.reviews).toHaveLength(1);
    await ts.post(`/v1/admin/reviews/${rid}/visibility`, { hidden: false, reason: 'Revisado: se vuelve a mostrar' });
    expect((await h.client().get(`/v1/caregivers/${pid}`)).body.caregiver.rating).toEqual({ avg: 5, count: 1 });
    const audits = (await h.db.execute(sql`select action, meta from audit_log where action in ('review.hide','review.unhide')`)).rows;
    expect(audits.map((a) => a.action)).toEqual(['review.hide', 'review.unhide']);
    expect(JSON.stringify(audits[0]!.meta)).toContain('Contiene datos personales');
  });
});
