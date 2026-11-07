import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { hash, verify } from '@node-rs/argon2';
import { users, sessions, caregiverProfiles, vettingRecords } from '@nuriva/db';
import { DomainError, VETTING_STEPS, SERVICES } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { createSession, clearSessionCookie, requireRole } from '../plugins/session.js';
import { createLoginChallenge } from './mfa.js';

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations).
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const Password = z.string().min(12).max(200);
const Register = z.object({
  role: z.enum(['client', 'caregiver']),
  email: z.string().trim().toLowerCase().email().max(254),
  password: Password,
  name: z.string().trim().min(2).max(80),
  locale: z.enum(['en', 'es']).default('en'),
  acceptTerms: z.literal(true),
  divisions: z.array(z.enum(['kids', 'pets'])).min(1).max(2).optional(),
}).strict().refine((b) => b.role !== 'caregiver' || b.divisions, { path: ['divisions'], message: 'required' });

const Login = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(200) }).strict();

export async function authRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps;
  // A real hash so unknown emails take as long as wrong passwords (prevents account enumeration by timing).
  const dummyHash = await hash('timing-equaliser-password', ARGON);
  const limit = { config: { rateLimit: { max: deps.config.AUTH_RATE_LIMIT, timeWindow: '15 minutes' } } };

  app.post('/auth/register', limit, async (req, reply) => {
    const b = Register.parse(req.body);
    const existing = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${b.email}`).limit(1);
    if (existing.length) throw new DomainError('email_taken', 'Email taken', 409);
    const passwordHash = await hash(b.password, ARGON);

    const user = await db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({
        email: b.email, passwordHash, role: b.role, name: b.name, locale: b.locale,
        termsAcceptedAt: new Date(), termsVersion: deps.config.TERMS_VERSION,
      }).returning({ id: users.id, email: users.email, role: users.role, name: users.name, locale: users.locale });
      if (!u) throw new Error('insert failed');
      if (b.role === 'caregiver') {
        const divisions = [...new Set(b.divisions!)];
        await tx.insert(caregiverProfiles).values({
          userId: u.id, divisions, hourlyRateCents: 2500, services: [...SERVICES[divisions[0]!].slice(0, 1)],
        });
        // Every caregiver starts with all vetting steps "not_started". Only staff can change them.
        await tx.insert(vettingRecords).values(VETTING_STEPS.map((step) => ({ caregiverId: u.id, step })));
      }
      await audit(tx, req, 'user.register', `user:${u.id}`, { role: b.role, termsVersion: deps.config.TERMS_VERSION }, u.id);
      return u;
    });
    await createSession(deps, reply, req, user.id);
    return reply.status(201).send({ user });
  });

  app.post('/auth/login', limit, async (req, reply) => {
    const b = Login.parse(req.body);
    const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${b.email}`).limit(1);
    const ok = await verify(u?.passwordHash ?? dummyHash, b.password);
    if (!u || !ok) {
      await audit(db, req, 'auth.login_failed', u ? `user:${u.id}` : null, {}, null);
      throw new DomainError('invalid_credentials', 'Invalid credentials', 401);
    }
    if (u.status !== 'active') throw new DomainError('suspended', 'Suspended', 403);
    if (u.mfaEnabled) {
      // Password is correct but no session yet: the second step happens at /auth/mfa/verify.
      const challenge = await createLoginChallenge(deps, u.id);
      await audit(db, req, 'auth.mfa_challenge', `user:${u.id}`, {}, u.id);
      return { mfaRequired: true, challenge };
    }
    await createSession(deps, reply, req, u.id);
    await audit(db, req, 'auth.login', `user:${u.id}`, {}, u.id);
    return { user: { id: u.id, email: u.email, role: u.role, name: u.name, locale: u.locale } };
  });

  app.post('/auth/logout', async (req, reply) => {
    if (req.user) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, req.user.sessionId));
      await audit(db, req, 'auth.logout', `user:${req.user.id}`);
    }
    clearSessionCookie(deps, reply);
    return { ok: true };
  });

  /** Signs out every device — e.g. after a suspected compromise. */
  app.post('/auth/logout-all', { preHandler: requireRole() }, async (req, reply) => {
    await db.update(sessions).set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, req.user!.id), sql`${sessions.revokedAt} IS NULL`));
    await audit(db, req, 'auth.logout_all', `user:${req.user!.id}`);
    clearSessionCookie(deps, reply);
    return { ok: true };
  });

  app.get('/auth/me', async (req) => {
    if (!req.user) return { user: null };
    const { sessionId: _s, ...user } = req.user;
    return { user, mfaSetupRequired: req.mfaMissing };
  });
}
