import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { sessions, users, staffRoleAssignments } from '@nuriva/db';
import { DomainError, hasPermission, type AccountRole, type Permission } from '@nuriva/domain';
import { negotiateLocale, isLocale } from '@nuriva/i18n';
import type { Deps } from '../lib/context.js';

/** Roles that must use MFA in staging and production. */
export const MFA_REQUIRED_ROLES: readonly AccountRole[] = ['admin', 'caregiver'];

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function cookieName(strict: boolean) {
  // __Host- prefix forces Secure, Path=/ and no Domain — only possible over HTTPS.
  return strict ? '__Host-nuriva_sid' : 'nuriva_sid';
}

export async function createSession(deps: Deps, reply: FastifyReply, req: FastifyRequest, userId: number) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + deps.config.SESSION_TTL_HOURS * 3_600_000);
  await deps.db.insert(sessions).values({
    userId, tokenHash: sha256(token), expiresAt, userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
  });
  reply.setCookie(cookieName(deps.config.strict), token, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: deps.config.strict, expires: expiresAt,
  });
}

export function clearSessionCookie(deps: Deps, reply: FastifyReply) {
  reply.clearCookie(cookieName(deps.config.strict), { path: '/' });
}

export function registerSession(app: FastifyInstance, deps: Deps) {
  app.decorateRequest('user', null);
  app.decorateRequest('locale', 'en');
  app.decorateRequest('mfaMissing', false);

  app.addHook('onRequest', async (req) => {
    const q = req.query as Record<string, unknown> | undefined;
    req.locale = isLocale(q?.lang) ? q.lang : negotiateLocale(req.headers['accept-language']);

    // CSRF defence in depth: only JSON bodies are parsed (see app.ts — forms and text/plain get 415),
    // cookies are SameSite=Lax, and in strict envs state-changing requests must come from an allowed origin.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (deps.config.strict && (!origin || !deps.config.origins.includes(origin))) {
        throw new DomainError('forbidden', 'Origin not allowed', 403);
      }
    }

    const token = req.cookies[cookieName(deps.config.strict)];
    if (!token) return;
    const [row] = await deps.db
      .select({ sessionId: sessions.id, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (!row || row.user.status !== 'active') return;
    const roles = row.user.role === 'admin'
      ? (await deps.db.select({ role: staffRoleAssignments.role }).from(staffRoleAssignments)
          .where(eq(staffRoleAssignments.userId, row.user.id))).map((r) => r.role)
      : [];
    req.user = {
      id: row.user.id, email: row.user.email, role: row.user.role, name: row.user.name,
      locale: row.user.locale, staffRoles: roles, mfaEnabled: row.user.mfaEnabled, sessionId: row.sessionId,
    };
    if (!isLocale(q?.lang)) req.locale = row.user.locale;
    req.mfaMissing = deps.config.strict && MFA_REQUIRED_ROLES.includes(row.user.role) && !row.user.mfaEnabled;
  });
}

/** Route guard: require a signed-in account of one of the given roles. */
export const requireRole = (...roles: AccountRole[]) => async (req: FastifyRequest) => {
  if (!req.user) throw new DomainError('unauthenticated', 'Sign in required', 401);
  if (roles.length && !roles.includes(req.user.role)) throw new DomainError('forbidden', 'Wrong account type', 403);
  if (req.mfaMissing) throw new DomainError('mfa_required', 'Set up two-step verification first', 403);
};

/**
 * Route guard for the admin dashboard: staff permission + (in staging/production) MFA.
 * Staff without MFA can only reach /auth/* (to enrol) in staging and production.
 */
export const requirePermission = (deps: Deps, perm: Permission) => async (req: FastifyRequest) => {
  if (!req.user) throw new DomainError('unauthenticated', 'Sign in required', 401);
  if (req.user.role !== 'admin' || !hasPermission(req.user.staffRoles, perm)) {
    throw new DomainError('forbidden', `Missing permission ${perm}`, 403);
  }
  if (req.mfaMissing) throw new DomainError('mfa_required', 'Set up two-step verification first', 403);
};
