import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb, createFieldCipher, parseKeyring } from '@nuriva/db';
import { createFakePaymentsProvider } from '@nuriva/integrations';
import { setup, TEST_DB } from './helpers.js';
import { base32Decode, totp, timeStep } from '../src/lib/totp.js';
import { buildApp } from '../src/app.js';
import type { Config } from '../src/config.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const codeFor = (secret: string, offset = 0) => totp(base32Decode(secret), timeStep() + offset);

describe('MFA enrolment and two-step sign-in', () => {
  let ana: Awaited<ReturnType<typeof h.register>>;
  let secret = '';
  let recovery: string[] = [];

  beforeAll(async () => { ana = await h.register('client', 'ana.mfa@example.com'); });

  it('starts disabled', async () => {
    expect((await ana.c.get('/v1/auth/mfa/status')).body).toMatchObject({ enabled: false, recoveryCodesLeft: 0 });
  });

  it('sets up with a QR code and a pending secret stored encrypted', async () => {
    const r = await ana.c.post('/v1/auth/mfa/setup');
    expect(r.status).toBe(200);
    expect(r.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(r.body.otpauthUrl).toContain('otpauth://totp/NURIVA');
    expect(r.body.qrSvg).toContain('<svg');
    secret = r.body.secret;
    const raw = await h.db.execute(sql`select mfa_pending_secret_enc from users where email = 'ana.mfa@example.com'`);
    expect(String(raw.rows[0]!.mfa_pending_secret_enc)).toMatch(/^v1\./);
    expect(String(raw.rows[0]!.mfa_pending_secret_enc)).not.toContain(secret);
  });

  it('refuses a wrong code, then enables with a valid one and returns 10 recovery codes once', async () => {
    expect((await ana.c.post('/v1/auth/mfa/enable', { code: '000000' })).body.error).toBe('invalid_code');
    const r = await ana.c.post('/v1/auth/mfa/enable', { code: codeFor(secret) });
    expect(r.status).toBe(200);
    recovery = r.body.recoveryCodes;
    expect(recovery).toHaveLength(10);
    const stored = await h.db.execute(sql`select code_hash from mfa_recovery_codes`);
    expect(JSON.stringify(stored.rows)).not.toContain(recovery[0]!);
    expect((await ana.c.get('/v1/auth/mfa/status')).body).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
    expect((await ana.c.post('/v1/auth/mfa/setup')).body.error).toBe('mfa_already_enabled');
  });

  it('asks for the second step after the password, with no session yet', async () => {
    const c = h.client();
    const r = await c.post('/v1/auth/login', { email: 'ana.mfa@example.com', password: 'correct-horse-battery-1' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ mfaRequired: true, challenge: expect.any(String) });
    expect(r.headers['set-cookie']).toBeUndefined();
    expect((await c.get('/v1/auth/me')).body.user).toBeNull();
  });

  it('rejects a replayed code (already used for enrolment)', async () => {
    const c = h.client();
    const { challenge } = (await c.post('/v1/auth/login', { email: 'ana.mfa@example.com', password: 'correct-horse-battery-1' })).body;
    const r = await c.post('/v1/auth/mfa/verify', { challenge, code: codeFor(secret) });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('invalid_code');
  });

  it('signs in with the next valid code, and the challenge cannot be reused', async () => {
    const c = h.client();
    const { challenge } = (await c.post('/v1/auth/login', { email: 'ana.mfa@example.com', password: 'correct-horse-battery-1' })).body;
    const r = await c.post('/v1/auth/mfa/verify', { challenge, code: codeFor(secret, 1) });
    expect(r.status).toBe(200);
    expect((await c.get('/v1/auth/me')).body.user.email).toBe('ana.mfa@example.com');
    expect((await h.client().post('/v1/auth/mfa/verify', { challenge, code: codeFor(secret, 1) })).body.error).toBe('challenge_expired');
  });

  it('signs in with a recovery code exactly once', async () => {
    const login = async () => (await h.client().post('/v1/auth/login', { email: 'ana.mfa@example.com', password: 'correct-horse-battery-1' })).body.challenge;
    const c = h.client();
    expect((await c.post('/v1/auth/mfa/verify', { challenge: await login(), recoveryCode: recovery[0]!.toUpperCase() })).status).toBe(200);
    expect((await h.client().post('/v1/auth/mfa/verify', { challenge: await login(), recoveryCode: recovery[0] })).status).toBe(401);
    expect((await ana.c.get('/v1/auth/mfa/status')).body.recoveryCodesLeft).toBe(9);
  });

  it('locks a challenge after 5 wrong attempts', async () => {
    const { challenge } = (await h.client().post('/v1/auth/login', { email: 'ana.mfa@example.com', password: 'correct-horse-battery-1' })).body;
    for (let i = 0; i < 5; i++) expect((await h.client().post('/v1/auth/mfa/verify', { challenge, code: '111111' })).body.error).toBe('invalid_code');
    expect((await h.client().post('/v1/auth/mfa/verify', { challenge, code: '111111' })).body.error).toBe('challenge_expired');
  });

  it('disabling needs the correct password and refuses an already-used code (time-independent)', async () => {
    const fresh = codeFor(secret, 1);
    expect((await ana.c.post('/v1/auth/mfa/disable', { password: 'wrong-password', code: fresh })).status).toBe(401);
    // Replay: the exact code of the last accepted time step must never work again.
    const row = await h.db.execute(sql`select mfa_last_step from users where email = 'ana.mfa@example.com'`);
    const lastStep = Number(row.rows[0]!.mfa_last_step);
    const replay = totp(base32Decode(secret), lastStep);
    const r = await ana.c.post('/v1/auth/mfa/disable', { password: 'correct-horse-battery-1', code: replay });
    expect(r.status).toBe(401);
    expect((await ana.c.get('/v1/auth/mfa/status')).body.enabled).toBe(true);
  });

  it('a client can turn MFA off with password + an unused code, and then signs in with the password only', async () => {
    const luis = await h.register('client', 'luis.mfa@example.com');
    const sec = (await luis.c.post('/v1/auth/mfa/setup')).body.secret;
    expect((await luis.c.post('/v1/auth/mfa/enable', { code: codeFor(sec) })).status).toBe(200);
    const off = await luis.c.post('/v1/auth/mfa/disable', { password: 'correct-horse-battery-1', code: codeFor(sec, 1) });
    expect(off.status).toBe(200);
    expect((await luis.c.get('/v1/auth/mfa/status')).body).toMatchObject({ enabled: false, recoveryCodesLeft: 0 });
    const login = await h.client().post('/v1/auth/login', { email: 'luis.mfa@example.com', password: 'correct-horse-battery-1' });
    expect(login.body.user.email).toBe('luis.mfa@example.com');
  });

  it('audits enrolment, challenges, failures and sign-ins without secrets', async () => {
    const rows = await h.db.execute(sql`select action, meta from audit_log where action like 'mfa.%' or action like 'auth.mfa%' or (action = 'auth.login' and meta ? 'mfa')`);
    const actions = rows.rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['mfa.enable', 'auth.mfa_challenge', 'auth.mfa_failed', 'auth.login']));
    expect(JSON.stringify(rows.rows)).not.toContain(secret);
  });
});

describe('MFA enforcement in staging/production', () => {
  it('blocks staff and caregivers without MFA from everything except enrolment', async () => {
    const config: Config = {
      ...h.app.initialConfig as never, NURIVA_ENV: 'staging', strict: true, PORT: 0, DATABASE_URL: TEST_DB,
      NURIVA_DATA_KEYS: `s1:${randomBytes(32).toString('base64')}`, APP_ORIGINS: 'https://app.nuriva.test', origins: ['https://app.nuriva.test'],
      TERMS_VERSION: 't', AUTH_RATE_LIMIT: 1000, SESSION_TTL_HOURS: 1,
      bookingsEnabled: false, trustedProxyHops: 2, RATE_LIMIT_PER_MINUTE: 1000,
      paymentsProvider: 'fake', paymentsEnabled: false, STRIPE_API_VERSION_V2: 'x', WEB_ORIGIN: 'https://app.nuriva.test',
    } as Config;
    const { db, pool } = createDb(TEST_DB);
    const app = await buildApp({ config, db, cipher: createFieldCipher(parseKeyring(config.NURIVA_DATA_KEYS)), payments: createFakePaymentsProvider().provider });
    const origin = { origin: 'https://app.nuriva.test' };
    try {
      const reg = await app.inject({ method: 'POST', url: '/v1/auth/register', headers: origin, payload: {
        role: 'caregiver', divisions: ['pets'], email: 'strict.cg@example.com', password: 'correct-horse-battery-1', name: 'Strict Carer', acceptTerms: true } });
      expect(reg.statusCode).toBe(201);
      const cookieHeader = String(reg.headers['set-cookie']);
      expect(cookieHeader).toMatch(/__Host-nuriva_sid=/);
      expect(cookieHeader).toMatch(/Secure/);
      const cookie = cookieHeader.split(';')[0]!;
      const blocked = await app.inject({ method: 'GET', url: '/v1/caregiver/profile', headers: { cookie } });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().error).toBe('mfa_required');
      const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
      expect(me.json().mfaSetupRequired).toBe(true);
      const setupRes = await app.inject({ method: 'POST', url: '/v1/auth/mfa/setup', headers: { cookie, ...origin }, payload: {} });
      expect(setupRes.statusCode).toBe(200);
      const code = codeFor(setupRes.json().secret);
      const en = await app.inject({ method: 'POST', url: '/v1/auth/mfa/enable', headers: { cookie, ...origin }, payload: { code } });
      expect(en.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/v1/caregiver/profile', headers: { cookie } })).statusCode).toBe(200);
      // Cannot turn it off where it is mandatory
      const off = await app.inject({ method: 'POST', url: '/v1/auth/mfa/disable', headers: { cookie, ...origin }, payload: { password: 'correct-horse-battery-1', code: '123456' } });
      expect(off.json().error).toBe('mfa_required_for_role');
      // Requests from other origins are refused in strict environments
      const evil = await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { cookie, origin: 'https://evil.example' }, payload: {} });
      expect(evil.statusCode).toBe(403);
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
