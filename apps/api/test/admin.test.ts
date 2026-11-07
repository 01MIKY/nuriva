import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { setup, TEST_DB } from './helpers.js';
import { createStaff } from '../src/cli/create-staff.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

describe('create-staff CLI', () => {
  it('creates an admin with roles, a strong one-time password and an audit entry', async () => {
    const r = await createStaff(TEST_DB, { email: 'Root@NURIVA.test', name: 'Root Admin', roles: ['superadmin'] });
    expect(r.email).toBe('root@nuriva.test');
    expect(r.password.length).toBeGreaterThanOrEqual(20);
    const c = h.client();
    const login = await c.post('/v1/auth/login', { email: 'root@nuriva.test', password: r.password });
    expect(login.status).toBe(200);
    expect((await c.get('/v1/auth/me')).body.user).toMatchObject({ role: 'admin', staffRoles: ['superadmin'] });
    const a = await h.db.execute(sql`select meta from audit_log where action = 'staff.create'`);
    expect(JSON.stringify(a.rows[0])).not.toContain(r.password);
  });

  it('rejects duplicates and unknown roles', async () => {
    await expect(createStaff(TEST_DB, { email: 'root@nuriva.test', name: 'Dup', roles: ['superadmin'] })).rejects.toThrow(/already exists/);
    await expect(createStaff(TEST_DB, { email: 'x@nuriva.test', name: 'Xavier', roles: ['god' as 'superadmin'] })).rejects.toThrow(/Roles must be/);
  });
});

describe('admin caregiver pipeline', () => {
  let ops: Awaited<ReturnType<typeof h.admin>>;
  let support: Awaited<ReturnType<typeof h.admin>>;
  let finance: Awaited<ReturnType<typeof h.admin>>;
  let cgA: Awaited<ReturnType<typeof h.register>>;
  let cgB: Awaited<ReturnType<typeof h.register>>;

  beforeAll(async () => {
    ops = await h.admin('ops@nuriva.test', ['operations']);
    support = await h.admin('support@nuriva.test', ['support']);
    finance = await h.admin('finance@nuriva.test', ['finance']);
    cgA = await h.register('caregiver', 'a.pipeline@example.com');
    cgB = await h.register('caregiver', 'b.pipeline@example.com');
    await h.app.inject({ method: 'PUT', url: '/v1/caregiver/profile', headers: { cookie: cgA.c.cookie() }, payload: {
      divisions: ['kids'], headline: 'Niñera con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2600, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' } });
  });

  it('lists caregivers with profile completeness and progress', async () => {
    const r = await ops.c.get('/v1/admin/caregivers');
    expect(r.status).toBe(200);
    const a = r.body.caregivers.find((c: { id: number }) => c.id === cgA.id);
    const b = r.body.caregivers.find((c: { id: number }) => c.id === cgB.id);
    expect(a).toMatchObject({ profileComplete: true, passed: 0, total: 6, approved: false });
    expect(b).toMatchObject({ profileComplete: false });
  });

  it('filters approved vs in review', async () => {
    for (const step of ['identity', 'interview', 'training', 'agreement']) {
      await ops.c.post(`/v1/admin/caregivers/${cgA.id}/vetting`, { step, status: 'passed', reference: `${step} ok` });
    }
    const ts = await h.admin('ts@nuriva.test', ['trust_safety']);
    await ts.c.post(`/v1/admin/caregivers/${cgA.id}/vetting`, { step: 'background', status: 'passed', reference: 'Checkr sandbox rpt_1' });
    await ops.c.post(`/v1/admin/caregivers/${cgA.id}/vetting`, { step: 'final_approval', status: 'passed', reference: 'Committee 2026-11-07' });
    const approved = (await ops.c.get('/v1/admin/caregivers?filter=approved')).body.caregivers.map((c: { id: number }) => c.id);
    const review = (await ops.c.get('/v1/admin/caregivers?filter=review')).body.caregivers.map((c: { id: number }) => c.id);
    expect(approved).toEqual([cgA.id]);
    expect(review).toContain(cgB.id);
    expect(review).not.toContain(cgA.id);
    expect((await ops.c.get('/v1/admin/caregivers?filter=bogus')).status).toBe(400);
  });

  it('shows a caregiver detail with profile and steps, but no screening references', async () => {
    const r = await support.c.get(`/v1/admin/caregivers/${cgA.id}`);
    expect(r.status).toBe(200);
    expect(r.body.profile.headline).toBe('Niñera con experiencia');
    expect(r.body.steps).toHaveLength(6);
    expect(JSON.stringify(r.body)).not.toContain('Checkr');
  });

  it('enforces permissions on the pipeline and the audit log', async () => {
    expect((await finance.c.get('/v1/admin/caregivers')).status).toBe(403);
    expect((await cgA.c.get('/v1/admin/caregivers')).status).toBe(403);
    expect((await ops.c.get('/v1/admin/audit')).status).toBe(403);
    expect((await support.c.get('/v1/admin/audit')).status).toBe(403);
  });

  it('lets trust & safety read the audit log, newest first, with actor names', async () => {
    const ts = h.client();
    await ts.post('/v1/auth/login', { email: 'ts@nuriva.test', password: 'admin-password-123' });
    const r = await ts.get('/v1/admin/audit');
    expect(r.status).toBe(200);
    const ids = r.body.entries.map((e: { id: number }) => e.id);
    expect(ids).toEqual([...ids].sort((x: number, y: number) => y - x));
    const vet = r.body.entries.find((e: { action: string }) => e.action === 'vetting.update');
    expect(vet.actor).toMatch(/\(admin\)$/);
    const older = await ts.get(`/v1/admin/audit?before=${ids[ids.length - 1]}`);
    expect(older.status).toBe(200);
  });
});
