import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { caregiverProfiles } from '@nuriva/db';
import { DomainError } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../plugins/session.js';
import { providerError } from './payouts.js';

const Start = z.object({ locale: z.enum(['en', 'es']).default('es') }).strict();
const TERMINAL = new Set(['verified', 'canceled']);

/** Re-reads the caregiver's Stripe Identity session and stores only its status. */
export async function refreshIdentityStatus(deps: Deps, caregiverId: number) {
  const [p] = await deps.db.select({ sid: caregiverProfiles.identitySessionId, status: caregiverProfiles.identityStatus, err: caregiverProfiles.identityErrorCode })
    .from(caregiverProfiles).where(eq(caregiverProfiles.userId, caregiverId));
  if (!p?.sid) return { status: 'none' as const, errorCode: null };
  if (TERMINAL.has(p.status)) return { status: p.status, errorCode: p.err };
  const v = await deps.identity.getVerification(p.sid);
  if (v.status !== p.status || v.errorCode !== p.err) {
    await deps.db.transaction(async (tx) => {
      await tx.update(caregiverProfiles).set({ identityStatus: v.status, identityErrorCode: v.errorCode, identityCheckedAt: new Date() })
        .where(eq(caregiverProfiles.userId, caregiverId));
      await audit(tx, null, 'identity.status', `caregiver:${caregiverId}`, { status: v.status }, null);
    });
  }
  return v;
}

/**
 * Identity verification with Stripe Identity (document + live selfie, hosted by Stripe).
 * The result is evidence for NURIVA staff; it never approves the "identity" vetting step by itself.
 */
export async function identityRoutes(app: FastifyInstance, deps: Deps) {
  const cg = { preHandler: requireRole('caregiver') };

  app.get('/caregiver/identity', cg, async (req) => {
    try { return await refreshIdentityStatus(deps, req.user!.id); } catch (e) { return providerError(req, e); }
  });

  app.post('/caregiver/identity/start', cg, async (req) => {
    const { locale } = Start.parse(req.body ?? {});
    try {
      const current = await refreshIdentityStatus(deps, req.user!.id);
      if (current.status === 'verified') throw new DomainError('already_verified', 'Already verified', 409);
      if (current.status === 'processing') throw new DomainError('verification_processing', 'Verification in progress', 409);
      const [p] = await deps.db.select({ sid: caregiverProfiles.identitySessionId }).from(caregiverProfiles).where(eq(caregiverProfiles.userId, req.user!.id));
      if (current.status === 'requires_input' && p?.sid) {
        const url = await deps.identity.resumeUrl(p.sid);
        if (url) return { url };
      }
      const v = await deps.identity.createVerification({
        reference: `caregiver_${req.user!.id}`,
        returnUrl: `${deps.config.WEB_ORIGIN}/${locale}/care/identity?return=1`,
      });
      await deps.db.transaction(async (tx) => {
        await tx.update(caregiverProfiles).set({ identitySessionId: v.sessionId, identityStatus: 'requires_input', identityErrorCode: null, identityCheckedAt: new Date() })
          .where(eq(caregiverProfiles.userId, req.user!.id));
        await audit(tx, req, 'identity.started', `caregiver:${req.user!.id}`, { provider: deps.identity.name });
      });
      return { url: v.url };
    } catch (e) { return providerError(req, e); }
  });
}
