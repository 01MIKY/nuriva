import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { caregiverProfiles, users } from '@nuriva/db';
import { DomainError, publicName } from '@nuriva/domain';
import { PaymentsError, type PayoutStatus } from '@nuriva/integrations';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../plugins/session.js';

const Onboard = z.object({ locale: z.enum(['en', 'es']).default('es') }).strict();

/** Maps provider failures to a stable, translatable error without leaking provider details to users. */
export function providerError(req: { log: { warn: (o: object, m: string) => void } }, e: unknown): never {
  if (e instanceof PaymentsError) {
    req.log.warn({ code: e.code }, 'payments provider error');
    throw new DomainError('payments_unavailable', 'Payments provider error', 502);
  }
  throw e;
}

/** Re-reads the caregiver's payout status from the provider and stores it. */
export async function refreshPayoutStatus(deps: Deps, caregiverId: number): Promise<PayoutStatus | 'none'> {
  const [p] = await deps.db.select({ acct: caregiverProfiles.stripeAccountId, status: caregiverProfiles.payoutStatus })
    .from(caregiverProfiles).where(eq(caregiverProfiles.userId, caregiverId));
  if (!p?.acct) return 'none';
  const status = await deps.payments.accountStatus(p.acct);
  if (status !== p.status) {
    await deps.db.update(caregiverProfiles).set({ payoutStatus: status, payoutCheckedAt: new Date() }).where(eq(caregiverProfiles.userId, caregiverId));
  }
  return status;
}

/**
 * Caregiver payout setup (ADR 0003): Stripe hosts onboarding and holds bank/tax details; NURIVA stores only
 * the connected account id and its status.
 */
export async function payoutRoutes(app: FastifyInstance, deps: Deps) {
  const cg = { preHandler: requireRole('caregiver') };

  app.get('/caregiver/payouts', cg, async (req) => {
    try {
      const status = await refreshPayoutStatus(deps, req.user!.id);
      return { status, paymentsEnabled: deps.config.paymentsEnabled };
    } catch (e) { return providerError(req, e); }
  });

  app.post('/caregiver/payouts/onboarding', cg, async (req) => {
    const { locale } = Onboard.parse(req.body ?? {});
    const [p] = await deps.db.select({ acct: caregiverProfiles.stripeAccountId }).from(caregiverProfiles).where(eq(caregiverProfiles.userId, req.user!.id));
    try {
      let acct = p?.acct ?? null;
      if (!acct) {
        const [u] = await deps.db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, req.user!.id));
        acct = (await deps.payments.createCaregiverAccount({ email: u!.email, displayName: publicName(u!.name) })).accountId;
        await deps.db.transaction(async (tx) => {
          await tx.update(caregiverProfiles).set({ stripeAccountId: acct, payoutStatus: 'restricted', payoutCheckedAt: new Date() })
            .where(eq(caregiverProfiles.userId, req.user!.id));
          await audit(tx, req, 'payouts.account_created', `caregiver:${req.user!.id}`, { provider: deps.payments.name });
        });
      }
      const back = `${deps.config.WEB_ORIGIN}/${locale}/care/payouts`;
      const link = await deps.payments.onboardingLink(acct, `${back}?return=1`, `${back}?refresh=1`);
      return { url: link.url };
    } catch (e) { return providerError(req, e); }
  });
}
