/**
 * Payments provider boundary (see docs/adr/0003). Everything NURIVA does with money goes through this
 * interface, so the rest of the code never depends on Stripe's API shape.
 */
export type PayoutStatus = 'active' | 'pending' | 'restricted' | 'unsupported';

export interface CheckoutInput {
  accountId: string;          // caregiver's connected account (direct charge)
  amountCents: number;        // what the family pays
  applicationFeeCents: number; // NURIVA's share (client fee + commission)
  description: string;
  bookingId: number;
  successUrl: string;         // must contain {CHECKOUT_SESSION_ID}
  cancelUrl: string;
  locale: 'en' | 'es';
}

export interface CheckoutResult { sessionId: string; url: string }
export interface CheckoutState { status: 'open' | 'complete' | 'expired'; paid: boolean; paymentIntentId: string | null; amountCents: number }

export interface PaymentsProvider {
  readonly name: 'stripe' | 'fake';
  createCaregiverAccount(input: { email: string; displayName: string }): Promise<{ accountId: string }>;
  onboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }>;
  accountStatus(accountId: string): Promise<PayoutStatus>;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  getCheckout(accountId: string, sessionId: string): Promise<CheckoutState>;
  /** Refunds on the caregiver's account; NURIVA's fee is refunded proportionally. */
  refund(accountId: string, paymentIntentId: string, amountCents: number): Promise<{ refundId: string }>;
}

export class PaymentsError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'PaymentsError'; }
}
