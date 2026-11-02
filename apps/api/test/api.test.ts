import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const ref = { reference: 'Checkr sandbox report rpt_test_123' };

describe('health and hardening', () => {
  it('reports health with a live database', async () => {
    const r = await h.client().get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, env: 'test' });
  });
  it('sends security headers', async () => {
    const r = await h.client().get('/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
  });
  it('rejects non-JSON bodies (CSRF via simple form posts)', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/v1/auth/login', payload: 'email=a&password=b', headers: { 'content-type': 'text/plain' } });
    expect(res.statusCode).toBe(415);
  });
});

describe('registration and sessions', () => {
  it('registers a client with an httpOnly session cookie', async () => {
    const c = h.client();
    const r = await c.post('/v1/auth/register', { role: 'client', email: 'Ana@Example.com', password: 'correct-horse-battery-1', name: 'Ana López', acceptTerms: true, locale: 'es' });
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ email: 'ana@example.com', role: 'client', locale: 'es' });
    expect(String(r.headers['set-cookie'])).toMatch(/HttpOnly/);
    expect(String(r.headers['set-cookie'])).toMatch(/SameSite=Lax/);
    const me = await c.get('/v1/auth/me');
    expect(me.body.user.email).toBe('ana@example.com');
  });

  it('stores Argon2id hashes, never plaintext', async () => {
    const rows = await h.db.execute(sql`select password_hash from users where email = 'ana@example.com'`);
    expect(String(rows.rows[0]!.password_hash)).toMatch(/^\$argon2id\$/);
  });

  it('rejects duplicate emails case-insensitively, with a Spanish message for Spanish users', async () => {
    const r = await h.client().post('/v1/auth/register',
      { role: 'client', email: 'ANA@example.com', password: 'correct-horse-battery-1', name: 'Ana', acceptTerms: true },
      { 'accept-language': 'es-US' });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'email_taken', message: 'Ya existe una cuenta con este correo.' });
  });

  it('validates input strictly', async () => {
    const r = await h.client().post('/v1/auth/register', { role: 'admin', email: 'x', password: 'short', name: 'A', acceptTerms: false, extra: 1 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation');
    const paths = r.body.fields.map((f: { path: string }) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['role', 'email', 'password', 'name', 'acceptTerms']));
  });

  it('cannot self-register as admin', async () => {
    const r = await h.client().post('/v1/auth/register', { role: 'admin', email: 'evil@example.com', password: 'correct-horse-battery-1', name: 'Evil', acceptTerms: true });
    expect(r.status).toBe(400);
  });

  it('gives the same error for unknown email and wrong password', async () => {
    const a = await h.client().post('/v1/auth/login', { email: 'nobody@example.com', password: 'whatever-123456' });
    const b = await h.client().post('/v1/auth/login', { email: 'ana@example.com', password: 'wrong-password-123' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('revokes the session on logout', async () => {
    const c = h.client();
    await c.post('/v1/auth/login', { email: 'ana@example.com', password: 'correct-horse-battery-1' });
    const stolen = c.cookie();
    await c.post('/v1/auth/logout');
    const reuse = await h.client(stolen).get('/v1/auth/me');
    expect(reuse.body.user).toBeNull();
  });

  it('audits registrations, logins and failures', async () => {
    const rows = await h.db.execute(sql`select action from audit_log`);
    const actions = rows.rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['user.register', 'auth.login', 'auth.login_failed', 'auth.logout']));
  });
});

describe('caregiver vetting (NURIVA controls approval)', () => {
  let cg: Awaited<ReturnType<typeof h.register>>;
  let ops: Awaited<ReturnType<typeof h.admin>>;
  let ts: Awaited<ReturnType<typeof h.admin>>;
  let support: Awaited<ReturnType<typeof h.admin>>;

  beforeAll(async () => {
    cg = await h.register('caregiver', 'maria@example.com');
    ops = await h.admin('ops@nuriva.test', ['operations']);
    ts = await h.admin('ts@nuriva.test', ['trust_safety']);
    support = await h.admin('support@nuriva.test', ['support']);
  });

  it('starts every caregiver with no approvals and blocks bookings', async () => {
    const r = await cg.c.get('/v1/caregiver/vetting');
    expect(r.status).toBe(200);
    expect(r.body.canAcceptBookings).toBe(false);
    expect(r.body.steps.every((s: { status: string }) => s.status === 'not_started')).toBe(true);
  });

  it('does not let caregivers or clients reach admin endpoints', async () => {
    expect((await cg.c.post(`/v1/admin/caregivers/${cg.id}/vetting`, { step: 'identity', status: 'passed', ...ref })).status).toBe(403);
    const client = await h.register('client', 'luis@example.com');
    expect((await client.c.get(`/v1/admin/caregivers/${cg.id}/vetting`)).status).toBe(403);
    expect((await h.client().get(`/v1/admin/caregivers/${cg.id}/vetting`)).status).toBe(401);
  });

  it('requires an evidence reference for every status change', async () => {
    const r = await ops.c.post(`/v1/admin/caregivers/${cg.id}/vetting`, { step: 'identity', status: 'passed' });
    expect(r.status).toBe(400);
  });

  it('restricts background decisions to Trust & Safety', async () => {
    const r = await ops.c.post(`/v1/admin/caregivers/${cg.id}/vetting`, { step: 'background', status: 'passed', ...ref });
    expect(r.status).toBe(403);
    const ok = await ts.c.post(`/v1/admin/caregivers/${cg.id}/vetting`, { step: 'background', status: 'passed', ...ref });
    expect(ok.status).toBe(200);
  });

  it('refuses final approval until every other step has passed', async () => {
    const early = await ops.c.post(`/v1/admin/caregivers/${cg.id}/vetting`, { step: 'final_approval', status: 'passed', ...ref });
    expect(early.status).toBe(409);
    for (const step of ['identity', 'interview', 'training', 'agreement']) {
      const r = await ops.c.post(`/v1/admin/caregivers/${cg.id}/vetting`, { step, status: 'passed', reference: `${step} record #1` });
      expect(r.status).toBe(200);
    }
    const final = await ops.c.post(`/v1/admin/caregivers/${cg.id}/vetting`, { step: 'final_approval', status: 'passed', ...ref });
    expect(final.status).toBe(200);
    expect((await cg.c.get('/v1/caregiver/vetting')).body.canAcceptBookings).toBe(true);
  });

  it('revokes final approval when an earlier step is revoked', async () => {
    await ts.c.post(`/v1/admin/caregivers/${cg.id}/vetting`, { step: 'background', status: 'failed', reference: 'Adverse finding — case 77' });
    const r = await cg.c.get('/v1/caregiver/vetting');
    expect(r.body.canAcceptBookings).toBe(false);
    expect(r.body.steps.find((s: { step: string }) => s.step === 'final_approval').status).toBe('pending');
  });

  it('encrypts screening references and only shows them to permitted staff, with an audit entry', async () => {
    const raw = await h.db.execute(sql`select reference_enc from vetting_events limit 1`);
    expect(String(raw.rows[0]!.reference_enc)).toMatch(/^v1\.t1\./);
    expect(String(raw.rows[0]!.reference_enc)).not.toContain('Checkr');

    expect((await support.c.get(`/v1/admin/caregivers/${cg.id}/screening`)).status).toBe(403);
    expect((await ops.c.get(`/v1/admin/caregivers/${cg.id}/screening`)).status).toBe(403);
    const r = await ts.c.get(`/v1/admin/caregivers/${cg.id}/screening`);
    expect(r.status).toBe(200);
    expect(r.body.events.map((e: { reference: string }) => e.reference)).toContain('Checkr sandbox report rpt_test_123');
    const audits = await h.db.execute(sql`select count(*)::int as n from audit_log where action = 'screening.read'`);
    expect(audits.rows[0]!.n).toBe(1);
  });

  it('never exposes screening references to the caregiver', async () => {
    const r = await cg.c.get('/v1/caregiver/vetting');
    expect(JSON.stringify(r.body)).not.toContain('Checkr');
  });
});

describe('compliance gate for services', () => {
  it('only superadmins can activate services, and a reference is required', async () => {
    const ops = await h.admin('ops2@nuriva.test', ['operations']);
    const sa = await h.admin('root@nuriva.test', ['superadmin']);
    const body = { division: 'kids', service: 'occasional', active: true, complianceRef: 'Counsel memo 2026-11-15 (pending)' };
    expect((await ops.c.post('/v1/admin/compliance/services', body)).status).toBe(403);
    expect((await sa.c.post('/v1/admin/compliance/services', { ...body, complianceRef: '' })).status).toBe(400);
    expect((await sa.c.post('/v1/admin/compliance/services', { ...body, service: 'dog_walking' })).status).toBe(400);
    const ok = await sa.c.post('/v1/admin/compliance/services', body);
    expect(ok.status).toBe(201);
    expect(ok.body.activation).toMatchObject({ division: 'kids', service: 'occasional', active: true });
  });
});

describe('audit log integrity', () => {
  it('cannot be modified or deleted', async () => {
    const cause = (p: Promise<unknown>) => p.then(() => 'no error', (e: Error & { cause?: Error }) => e.cause?.message ?? e.message);
    expect(await cause(h.db.execute(sql`delete from audit_log`))).toMatch(/append-only/);
    expect(await cause(h.db.execute(sql`update audit_log set action = 'x'`))).toMatch(/append-only/);
  });
});
