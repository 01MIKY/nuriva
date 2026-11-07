import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const child = { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: 'Maní', medications: '', notes: 'Duerme a las 8:30' } };
const pet = { kind: 'pet', name: 'Luna', details: { species: 'dog', breed: 'Golden retriever', ageYears: 3, medications: '', notes: 'Tira de la correa' } };

describe('household', () => {
  let ana: Awaited<ReturnType<typeof h.register>>;
  let luis: Awaited<ReturnType<typeof h.register>>;
  let childId = 0;

  beforeAll(async () => {
    ana = await h.register('client', 'ana.household@example.com');
    luis = await h.register('client', 'luis.household@example.com');
  });

  it('starts empty', async () => {
    const r = await ana.c.get('/v1/household');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ dependents: [], emergencyContact: null });
  });

  it('adds a child and a pet', async () => {
    const a = await ana.c.post('/v1/household/dependents', child);
    expect(a.status).toBe(201);
    expect(a.body.dependent).toMatchObject({ kind: 'child', name: 'Sofía', details: child.details });
    childId = a.body.dependent.id;
    const b = await ana.c.post('/v1/household/dependents', pet);
    expect(b.status).toBe(201);
    const list = await ana.c.get('/v1/household');
    expect(list.body.dependents.map((d: { name: string }) => d.name)).toEqual(['Sofía', 'Luna']);
  });

  it('stores names and details encrypted, never in plaintext', async () => {
    const rows = await h.db.execute(sql`select display_name_enc, details_enc from dependents`);
    const dump = JSON.stringify(rows.rows);
    expect(dump).not.toContain('Sofía');
    expect(dump).not.toContain('Maní');
    expect(dump).not.toContain('Golden');
    expect(String(rows.rows[0]!.display_name_enc)).toMatch(/^v1\./);
  });

  it('validates strictly: child ages, pet species, unknown fields', async () => {
    const bad = [
      { ...child, details: { ...child.details, ageYears: 18 } },
      { ...pet, details: { ...pet.details, species: 'dragon' } },
      { ...child, details: { ...child.details, school: 'Lincoln Elementary' } },
      { ...child, name: '' },
      { kind: 'adult', name: 'X', details: {} },
    ];
    for (const body of bad) expect((await ana.c.post('/v1/household/dependents', body)).status).toBe(400);
  });

  it('hides other households completely (no read, update or delete)', async () => {
    expect((await luis.c.get('/v1/household')).body.dependents).toEqual([]);
    expect((await luis.c.post(`/v1/household/dependents/${childId}`, child)).status).toBe(404); // wrong method → no route
    const put = await h.app.inject({ method: 'PUT', url: `/v1/household/dependents/${childId}`, payload: child, headers: { cookie: luis.c.cookie() } });
    expect(put.statusCode).toBe(404);
    const del = await h.app.inject({ method: 'DELETE', url: `/v1/household/dependents/${childId}`, headers: { cookie: luis.c.cookie() } });
    expect(del.statusCode).toBe(404);
  });

  it('updates and deletes own dependents, and kind cannot change', async () => {
    const put = await h.app.inject({ method: 'PUT', url: `/v1/household/dependents/${childId}`, headers: { cookie: ana.c.cookie() },
      payload: { ...child, details: { ...child.details, ageYears: 5 } } });
    expect(put.statusCode).toBe(200);
    expect(put.json().dependent.details.ageYears).toBe(5);
    const kind = await h.app.inject({ method: 'PUT', url: `/v1/household/dependents/${childId}`, headers: { cookie: ana.c.cookie() }, payload: pet });
    expect(kind.statusCode).toBe(400);
    const del = await h.app.inject({ method: 'DELETE', url: `/v1/household/dependents/${childId}`, headers: { cookie: ana.c.cookie() } });
    expect(del.statusCode).toBe(200);
    expect((await ana.c.get('/v1/household')).body.dependents).toHaveLength(1);
  });

  it('saves the emergency contact encrypted', async () => {
    const ec = { name: 'Carlos López', phone: '(305) 555-0143', relationship: 'Padre' };
    const put = await h.app.inject({ method: 'PUT', url: '/v1/household/emergency-contact', headers: { cookie: ana.c.cookie() }, payload: ec });
    expect(put.statusCode).toBe(200);
    expect((await ana.c.get('/v1/household')).body.emergencyContact).toEqual(ec);
    const raw = await h.db.execute(sql`select emergency_contact_enc from users where emergency_contact_enc is not null`);
    expect(JSON.stringify(raw.rows)).not.toContain('Carlos');
    const bad = await h.app.inject({ method: 'PUT', url: '/v1/household/emergency-contact', headers: { cookie: ana.c.cookie() }, payload: { ...ec, phone: 'call me' } });
    expect(bad.statusCode).toBe(400);
  });

  it('is client-only', async () => {
    const cg = await h.register('caregiver', 'cg.household@example.com');
    expect((await cg.c.get('/v1/household')).status).toBe(403);
    expect((await h.client().get('/v1/household')).status).toBe(401);
  });

  it('caps household size', async () => {
    const many = await h.register('client', 'big.family@example.com');
    for (let i = 0; i < 12; i++) expect((await many.c.post('/v1/household/dependents', { ...pet, name: `Pet ${i}` })).status).toBe(201);
    const over = await many.c.post('/v1/household/dependents', pet);
    expect(over.status).toBe(409);
    expect(over.body.error).toBe('household_full');
  });

  it('audits changes without storing any plaintext', async () => {
    const rows = await h.db.execute(sql`select action, meta from audit_log where action like 'household.%'`);
    const actions = rows.rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['household.dependent_create', 'household.dependent_update', 'household.dependent_delete', 'household.emergency_contact_update']));
    const dump = JSON.stringify(rows.rows);
    for (const secret of ['Sofía', 'Luna', 'Maní', 'Carlos', '555']) expect(dump).not.toContain(secret);
  });
});
