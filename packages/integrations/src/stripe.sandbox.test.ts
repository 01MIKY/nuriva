import { describe, expect, it } from 'vitest';
import { createStripeProvider } from './index.js';

/**
 * Live check against Stripe TEST mode. Runs only with STRIPE_SANDBOX=1 (the key is injected by the environment
 * proxy; STRIPE_SECRET_KEY can be a placeholder there). Skipped in CI.
 */
const run = process.env.STRIPE_SANDBOX === '1';
const V2 = '2026-10-28.preview';

describe.skipIf(!run)('Stripe sandbox (live, test mode)', () => {
  const stripe = createStripeProvider({ secretKey: process.env.STRIPE_SECRET_KEY ?? 'proxy-injected', v2Version: V2 });

  it('creates an Express caregiver account with managed risk, an onboarding link and a hosted checkout', async () => {
    const { accountId } = await stripe.createCaregiverAccount({ email: 'sandbox.carer@example.com', displayName: 'Sandbox Carer' });
    try {
      expect(accountId).toMatch(/^acct_/);
      const link = await stripe.onboardingLink(accountId, 'https://example.com/return', 'https://example.com/refresh');
      expect(new URL(link.url).host).toBe('connect.stripe.com');
      expect(['pending', 'restricted']).toContain(await stripe.accountStatus(accountId));
      // Observed in the sandbox: Stripe ALLOWS creating a Checkout Session before onboarding is complete.
      // NURIVA therefore enforces `accountStatus === 'active'` itself before creating one (see bookings API).
      const co = await stripe.createCheckout({
        accountId, amountCents: 11440, applicationFeeCents: 2600, description: 'NURIVA test', bookingId: 1,
        successUrl: 'https://example.com/ok?session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'https://example.com/cancel', locale: 'es',
      });
      expect(co.sessionId).toMatch(/^cs_test_/);
      expect(new URL(co.url).host).toBe('checkout.stripe.com');
      const state = await stripe.getCheckout(accountId, co.sessionId);
      expect(state).toMatchObject({ status: 'open', paid: false, amountCents: 11440 });
    } finally {
      // Clean up the test account.
      await fetch(`https://api.stripe.com/v2/core/accounts/${accountId}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? 'proxy-injected'}`, 'Stripe-Version': V2, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applied_configurations: ['merchant'] }),
      });
    }
  }, 60_000);

  it('creates a Stripe Identity session (document + live selfie), reads it and cancels it', async () => {
    const v = await stripe.identity.createVerification({ reference: 'caregiver_sandbox', returnUrl: 'https://example.com/return' });
    try {
      expect(v.sessionId).toMatch(/^vs_/);
      expect(new URL(v.url).host).toBe('verify.stripe.com');
      expect(await stripe.identity.getVerification(v.sessionId)).toEqual({ status: 'requires_input', errorCode: null });
      expect(await stripe.identity.resumeUrl(v.sessionId)).toMatch(/^https:\/\/verify\.stripe\.com\//);
    } finally {
      await fetch(`https://api.stripe.com/v1/identity/verification_sessions/${v.sessionId}/cancel`, {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? 'proxy-injected'}` },
      });
    }
  }, 60_000);
});
