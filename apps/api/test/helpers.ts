import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { createDb, createFieldCipher, parseKeyring, users, staffRoleAssignments } from '@nuriva/db';
import { createFakePaymentsProvider } from '@nuriva/integrations';
import { runMigrations } from '@nuriva/db/migrate';
import type { StaffRole } from '@nuriva/domain';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://nuriva_dev:nuriva_dev_local_only@localhost:5432/nuriva_test';

/** `paymentsEnabled` defaults to false so suites that are not about payments do not need Stripe onboarding. */
export const TEST_WEBHOOK_SECRET = 'whsec_test_nuriva_secret';

export async function setup(opts: { paymentsEnabled?: boolean } = {}) {
  try {
    await runMigrations(TEST_DB);
  } catch (e) {
    const msg = String((e as Error & { cause?: Error }).cause?.message ?? (e as Error).message);
    if (/ECONNREFUSED/.test(msg)) throw new Error(`PostgreSQL is not reachable at ${TEST_DB}. Start it (e.g. "service postgresql start") — see README.`);
    throw e;
  }
  const config = loadConfig({
    NURIVA_ENV: 'test',
    DATABASE_URL: TEST_DB,
    NURIVA_DATA_KEYS: `t1:${randomBytes(32).toString('base64')}`,
    AUTH_RATE_LIMIT: '1000',
    PAYMENTS_ENABLED: opts.paymentsEnabled ? 'true' : 'false',
    STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
  });
  const { db, pool } = createDb(TEST_DB);
  // TRUNCATE bypasses the append-only row triggers; acceptable only in the test database.
  await db.execute(sql`TRUNCATE users, sessions, staff_role_assignments, caregiver_profiles, vetting_records,
    vetting_events, service_activations, dependents, audit_log, stripe_events RESTART IDENTITY CASCADE`);
  const cipher = createFieldCipher(parseKeyring(config.NURIVA_DATA_KEYS));
  const fakePayments = createFakePaymentsProvider();
  const app = await buildApp({ config, db, cipher, payments: fakePayments.provider });

  /** Makes a cookie-carrying client for one user. */
  function client(cookie = '') {
    const call = async (method: 'GET' | 'POST', url: string, payload?: unknown, headers: Record<string, string> = {}) => {
      const res = await app.inject({ method, url, payload: payload as object, headers: { cookie, ...headers } });
      const set = res.headers['set-cookie'];
      const first = Array.isArray(set) ? set[0] : set;
      if (first) cookie = first.split(';')[0]!;
      return { status: res.statusCode, body: res.body ? res.json() : null, headers: res.headers };
    };
    return { get: (u: string, h?: Record<string, string>) => call('GET', u, undefined, h), post: (u: string, p?: unknown, h?: Record<string, string>) => call('POST', u, p ?? {}, h), cookie: () => cookie };
  }

  async function register(role: 'client' | 'caregiver', email: string, extra: object = {}) {
    const c = client();
    const r = await c.post('/v1/auth/register', {
      role, email, password: 'correct-horse-battery-1', name: 'Test Person', acceptTerms: true,
      ...(role === 'caregiver' ? { divisions: ['kids'] } : {}), ...extra,
    });
    if (r.status !== 201) throw new Error(`register failed ${r.status} ${JSON.stringify(r.body)}`);
    return { c, id: r.body.user.id as number };
  }

  /** Admins are never self-registered; they are provisioned by a superadmin (CLI in production). */
  async function admin(email: string, roles: StaffRole[]) {
    const [u] = await db.insert(users).values({
      email, passwordHash: await hash('admin-password-123'), role: 'admin', name: 'Staff', termsAcceptedAt: new Date(), termsVersion: 't',
    }).returning();
    await db.insert(staffRoleAssignments).values(roles.map((role) => ({ userId: u!.id, role })));
    const c = client();
    const r = await c.post('/v1/auth/login', { email, password: 'admin-password-123' });
    if (r.status !== 200) throw new Error('admin login failed');
    return { c, id: u!.id };
  }

  return { app, db, pool, cipher, fakePayments, client, register, admin, close: async () => { await app.close(); await pool.end(); } };
}
