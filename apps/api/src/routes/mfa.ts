import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import QRCode from 'qrcode';
import { verify } from '@node-rs/argon2';
import { users, mfaRecoveryCodes, loginChallenges, sessions } from '@nuriva/db';
import { DomainError } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { newSecret, otpauthUrl, verifyTotp, newRecoveryCodes, normalizeRecovery } from '../lib/totp.js';
import { createSession, MFA_REQUIRED_ROLES, sha256 } from '../plugins/session.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function createLoginChallenge(deps: Deps, userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await deps.db.insert(loginChallenges).values({ userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
  return token;
}

const Code = z.string().trim().regex(/^\d{6}$/);
const Verify = z.object({
  challenge: z.string().min(20).max(100),
  code: Code.optional(),
  recoveryCode: z.string().trim().min(8).max(20).optional(),
}).strict().refine((b) => !!b.code !== !!b.recoveryCode, { message: 'code_or_recovery' });

export async function mfaRoutes(app: FastifyInstance, deps: Deps) {
  const { db, cipher } = deps;
  const signedIn = async (req: { user: unknown }) => { if (!req.user) throw new DomainError('unauthenticated', 'Sign in required', 401); };
  const limit = { config: { rateLimit: { max: deps.config.AUTH_RATE_LIMIT, timeWindow: '15 minutes' } } };

  async function load(id: number) {
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) throw new DomainError('unauthenticated', 'Sign in required', 401);
    return u;
  }

  /** Accepts a TOTP code once: rejects codes from a step already used (replay). Returns the step or null. */
  function checkCode(u: typeof users.$inferSelect, code: string): number | null {
    if (!u.mfaSecretEnc) return null;
    const step = verifyTotp(cipher.decrypt(u.mfaSecretEnc), code);
    if (step === null || (u.mfaLastStep !== null && step <= u.mfaLastStep)) return null;
    return step;
  }

  app.get('/auth/mfa/status', { preHandler: signedIn }, async (req) => {
    const u = await load(req.user!.id);
    const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(mfaRecoveryCodes)
      .where(and(eq(mfaRecoveryCodes.userId, u.id), isNull(mfaRecoveryCodes.usedAt)));
    return { enabled: u.mfaEnabled, required: MFA_REQUIRED_ROLES.includes(u.role) && deps.config.strict, recoveryCodesLeft: left?.n ?? 0 };
  });

  /** Step 1 of enrolment: a fresh secret, kept pending until confirmed with a valid code. */
  app.post('/auth/mfa/setup', { preHandler: signedIn }, async (req) => {
    const u = await load(req.user!.id);
    if (u.mfaEnabled) throw new DomainError('mfa_already_enabled', 'Already enabled', 409);
    const secret = newSecret();
    await db.update(users).set({ mfaPendingSecretEnc: cipher.encrypt(secret) }).where(eq(users.id, u.id));
    const url = otpauthUrl(secret, u.email);
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#172A43', light: '#FFFFFF' } });
    return { secret, otpauthUrl: url, qrSvg };
  });

  /** Step 2: confirm with a code from the app. Returns recovery codes ONCE (only hashes are stored). */
  app.post('/auth/mfa/enable', { preHandler: signedIn, ...limit }, async (req) => {
    const { code } = z.object({ code: Code }).strict().parse(req.body);
    const u = await load(req.user!.id);
    if (u.mfaEnabled) throw new DomainError('mfa_already_enabled', 'Already enabled', 409);
    if (!u.mfaPendingSecretEnc) throw new DomainError('mfa_not_pending', 'Start setup first', 409);
    const secret = cipher.decrypt(u.mfaPendingSecretEnc);
    const step = verifyTotp(secret, code);
    if (step === null) throw new DomainError('invalid_code', 'Invalid code', 400);
    const codes = newRecoveryCodes();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ mfaEnabled: true, mfaSecretEnc: u.mfaPendingSecretEnc, mfaPendingSecretEnc: null, mfaLastStep: step }).where(eq(users.id, u.id));
      await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, u.id));
      await tx.insert(mfaRecoveryCodes).values(codes.map((c) => ({ userId: u.id, codeHash: sha256(normalizeRecovery(c)) })));
      // Other devices must sign in again with the second factor.
      await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, u.id), isNull(sessions.revokedAt), sql`${sessions.id} <> ${req.user!.sessionId}`));
      await audit(tx, req, 'mfa.enable', `user:${u.id}`);
    });
    return { recoveryCodes: codes };
  });

  /** Second step of sign-in. Single-use, 5-minute challenge, max 5 attempts. */
  app.post('/auth/mfa/verify', limit, async (req, reply) => {
    const b = Verify.parse(req.body);
    const [ch] = await db.select().from(loginChallenges)
      .where(and(eq(loginChallenges.tokenHash, sha256(b.challenge)), isNull(loginChallenges.usedAt), gt(loginChallenges.expiresAt, new Date()), lt(loginChallenges.attempts, MAX_ATTEMPTS)))
      .limit(1);
    if (!ch) throw new DomainError('challenge_expired', 'Sign in again', 401);
    await db.update(loginChallenges).set({ attempts: sql`${loginChallenges.attempts} + 1` }).where(eq(loginChallenges.id, ch.id));
    const u = await load(ch.userId);
    if (u.status !== 'active') throw new DomainError('suspended', 'Suspended', 403);

    let method: 'totp' | 'recovery' | null = null;
    let step: number | null = null;
    let recoveryId: number | null = null;
    if (b.code) {
      step = checkCode(u, b.code);
      if (step !== null) method = 'totp';
    } else if (b.recoveryCode) {
      const [rc] = await db.select({ id: mfaRecoveryCodes.id }).from(mfaRecoveryCodes)
        .where(and(eq(mfaRecoveryCodes.userId, u.id), eq(mfaRecoveryCodes.codeHash, sha256(normalizeRecovery(b.recoveryCode))), isNull(mfaRecoveryCodes.usedAt))).limit(1);
      if (rc) { method = 'recovery'; recoveryId = rc.id; }
    }
    if (!method) {
      await audit(db, req, 'auth.mfa_failed', `user:${u.id}`, {}, u.id);
      throw new DomainError('invalid_code', 'Invalid code', 401);
    }
    await db.transaction(async (tx) => {
      await tx.update(loginChallenges).set({ usedAt: new Date() }).where(eq(loginChallenges.id, ch.id));
      if (step !== null) await tx.update(users).set({ mfaLastStep: step }).where(eq(users.id, u.id));
      if (recoveryId !== null) await tx.update(mfaRecoveryCodes).set({ usedAt: new Date() }).where(eq(mfaRecoveryCodes.id, recoveryId));
      await audit(tx, req, 'auth.login', `user:${u.id}`, { mfa: method }, u.id);
    });
    await createSession(deps, reply, req, u.id);
    return { user: { id: u.id, email: u.email, role: u.role, name: u.name, locale: u.locale } };
  });

  /** Turning MFA off needs the password AND a current code. Not allowed where MFA is mandatory. */
  app.post('/auth/mfa/disable', { preHandler: signedIn, ...limit }, async (req) => {
    const b = z.object({ password: z.string().max(200), code: Code }).strict().parse(req.body);
    const u = await load(req.user!.id);
    if (!u.mfaEnabled) throw new DomainError('mfa_not_pending', 'Not enabled', 409);
    if (deps.config.strict && MFA_REQUIRED_ROLES.includes(u.role)) throw new DomainError('mfa_required_for_role', 'Required for this account', 403);
    const okPw = await verify(u.passwordHash, b.password);
    const step = okPw ? checkCode(u, b.code) : null;
    if (!okPw || step === null) throw new DomainError('invalid_code', 'Invalid code', 401);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ mfaEnabled: false, mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaLastStep: null }).where(eq(users.id, u.id));
      await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, u.id));
      await audit(tx, req, 'mfa.disable', `user:${u.id}`);
    });
    return { ok: true };
  });
}
