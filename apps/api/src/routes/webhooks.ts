import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { caregiverProfiles, stripeEvents } from '@nuriva/db';
import { DomainError } from '@nuriva/domain';
import { verifyStripeWebhook } from '@nuriva/integrations';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { refreshPayoutStatus } from './payouts.js';
import { markBookingPaid } from './bookings.js';

export const STRIPE_WEBHOOK_PATH = '/v1/webhooks/stripe';
const CHECKOUT_PAID = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

/**
 * Stripe event destination. Authenticated by the Stripe-Signature header (official library), not by cookies.
 * Events are treated as hints: NURIVA re-reads the current state from Stripe before changing anything,
 * and each event id is processed once.
 */
export async function webhookRoutes(app: FastifyInstance, deps: Deps) {
  // Raw body is required to verify the signature, so this scope keeps JSON as an unparsed string.
  await app.register(async (scope) => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 512 * 1024 }, (_req, body, done) => done(null, body));

    scope.post('/webhooks/stripe', async (req, reply) => {
      const secret = deps.config.STRIPE_WEBHOOK_SECRET;
      if (!secret) throw new DomainError('webhooks_not_configured', 'Webhooks are not configured', 503);
      const sig = req.headers['stripe-signature'];
      if (typeof sig !== 'string' || typeof req.body !== 'string') throw new DomainError('invalid_signature', 'Missing signature', 400);
      let event;
      try {
        event = verifyStripeWebhook(req.body, sig, secret);
      } catch {
        req.log.warn('stripe webhook signature rejected');
        throw new DomainError('invalid_signature', 'Invalid signature', 400);
      }

      // Idempotency: first writer wins; redeliveries are acknowledged without reprocessing.
      const inserted = await deps.db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
      if (!inserted.length) return reply.send({ received: true, duplicate: true });

      try {
        if (event.type.startsWith('v2.core.account') && event.relatedObjectId) {
          const [p] = await deps.db.select({ userId: caregiverProfiles.userId }).from(caregiverProfiles)
            .where(eq(caregiverProfiles.stripeAccountId, event.relatedObjectId));
          if (p) await refreshPayoutStatus(deps, p.userId);
        } else if (CHECKOUT_PAID.has(event.type) && event.object) {
          const bookingId = Number((event.object.metadata as Record<string, string> | undefined)?.booking_id);
          const sessionId = String(event.object.id ?? '');
          if (Number.isInteger(bookingId) && bookingId > 0 && sessionId) await markBookingPaid(deps, bookingId, sessionId, null);
        }
        await audit(deps.db, null, 'stripe.webhook', `stripe_event:${event.id}`, { type: event.type }, null);
      } catch (e) {
        // Let Stripe retry: forget the event so the redelivery is processed.
        await deps.db.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
        throw e;
      }
      return reply.send({ received: true });
    });
  });
}
