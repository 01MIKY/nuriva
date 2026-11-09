import { randomBytes } from 'node:crypto';
import { PaymentsError, type CheckoutState, type PaymentsProvider, type PayoutStatus } from './payments.js';

/**
 * In-memory provider for automated tests ONLY. The API refuses to start with it in staging/production.
 * Tests drive it with the helpers below (complete onboarding, pay a checkout).
 */
export function createFakePaymentsProvider() {
  const id = (p: string) => `${p}_fake_${randomBytes(6).toString('hex')}`;
  const accounts = new Map<string, { status: PayoutStatus }>();
  const sessions = new Map<string, { accountId: string; amount: number; fee: number; state: CheckoutState; bookingId: number }>();
  const refunds: Array<{ accountId: string; paymentIntentId: string; amountCents: number; idempotencyKey: string }> = [];
  const refundKeys = new Map<string, string>();

  const provider: PaymentsProvider = {
    name: 'fake',
    async createCaregiverAccount() { const a = id('acct'); accounts.set(a, { status: 'restricted' }); return { accountId: a }; },
    async onboardingLink(accountId, returnUrl) {
      if (!accounts.has(accountId)) throw new PaymentsError('resource_missing', 'No such account');
      return { url: `https://connect.stripe.test/onboarding/${accountId}?return=${encodeURIComponent(returnUrl)}` };
    },
    async accountStatus(accountId) { return accounts.get(accountId)?.status ?? 'unsupported'; },
    async createCheckout(i) {
      if (accounts.get(i.accountId)?.status !== 'active') throw new PaymentsError('account_invalid', 'Account cannot accept payments');
      const s = id('cs');
      sessions.set(s, { accountId: i.accountId, amount: i.amountCents, fee: i.applicationFeeCents, bookingId: i.bookingId,
        state: { status: 'open', paid: false, paymentIntentId: null, amountCents: i.amountCents } });
      return { sessionId: s, url: `https://checkout.stripe.test/pay/${s}` };
    },
    async getCheckout(accountId, sessionId) {
      const s = sessions.get(sessionId);
      if (!s || s.accountId !== accountId) throw new PaymentsError('resource_missing', 'No such checkout session');
      return { ...s.state };
    },
    async refund(accountId, paymentIntentId, amountCents, idempotencyKey) {
      // Same idempotency key → same refund, like Stripe.
      const existing = refundKeys.get(idempotencyKey);
      if (existing) return { refundId: existing };
      const refundId = id('re');
      refundKeys.set(idempotencyKey, refundId);
      refunds.push({ accountId, paymentIntentId, amountCents, idempotencyKey });
      return { refundId };
    },
  };

  return {
    provider,
    completeOnboarding: (accountId: string) => accounts.set(accountId, { status: 'active' }),
    restrict: (accountId: string) => accounts.set(accountId, { status: 'restricted' }),
    pay: (sessionId: string) => {
      const s = sessions.get(sessionId);
      if (!s) throw new Error('unknown session');
      s.state = { status: 'complete', paid: true, paymentIntentId: id('pi'), amountCents: s.amount };
    },
    sessions, refunds,
  };
}
