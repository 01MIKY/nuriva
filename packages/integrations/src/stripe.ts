import { PaymentsError, type CheckoutInput, type CheckoutResult, type CheckoutState, type PaymentsProvider, type PayoutStatus } from './payments.js';

export interface StripeConfig {
  secretKey: string;
  /** API version for Accounts v2 + Express dashboard with Managed Risk (public preview, ADR 0003). */
  v2Version: string;
  baseUrl?: string;
}

const form = (obj: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();

/** Minimal Stripe client using fetch. Errors are mapped to PaymentsError without leaking keys. */
export function createStripeProvider(cfg: StripeConfig): PaymentsProvider {
  const base = cfg.baseUrl ?? 'https://api.stripe.com';
  const auth = { Authorization: `Bearer ${cfg.secretKey}` };

  async function call<T>(method: string, path: string, opts: { form?: string; json?: unknown; account?: string; v2?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { ...auth };
    if (opts.v2) headers['Stripe-Version'] = cfg.v2Version;
    if (opts.account) headers['Stripe-Account'] = opts.account;
    if (opts.form !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${path}`, {
      method, headers,
      body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
    });
    const body = await res.json().catch(() => ({})) as { error?: { code?: string; type?: string; message?: string } };
    if (!res.ok || body.error) {
      const msg = (body.error?.message ?? `HTTP ${res.status}`).replace(/(sk|rk|pk)_(test|live)_[A-Za-z0-9]+/g, '[key]');
      throw new PaymentsError(body.error?.code ?? body.error?.type ?? `http_${res.status}`, msg);
    }
    return body as T;
  }

  return {
    name: 'stripe',

    async createCaregiverAccount({ email, displayName }) {
      const acct = await call<{ id: string }>('POST', '/v2/core/accounts', {
        v2: true,
        json: {
          contact_email: email,
          display_name: displayName,
          dashboard: 'express',
          identity: { country: 'us' },
          defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
          configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
          metadata: { platform: 'nuriva' },
        },
      });
      return { accountId: acct.id };
    },

    async onboardingLink(accountId, returnUrl, refreshUrl) {
      const link = await call<{ url: string }>('POST', '/v2/core/account_links', {
        v2: true,
        json: { account: accountId, use_case: { type: 'account_onboarding', account_onboarding: { return_url: returnUrl, refresh_url: refreshUrl } } },
      });
      return { url: link.url };
    },

    async accountStatus(accountId) {
      const acct = await call<{ configuration?: { merchant?: { capabilities?: { card_payments?: { status?: PayoutStatus } } } } }>(
        'GET', `/v2/core/accounts/${encodeURIComponent(accountId)}?include[0]=configuration.merchant`, { v2: true });
      return acct.configuration?.merchant?.capabilities?.card_payments?.status ?? 'pending';
    },

    async createCheckout(i: CheckoutInput): Promise<CheckoutResult> {
      const s = await call<{ id: string; url: string }>('POST', '/v1/checkout/sessions', {
        account: i.accountId,
        form: form({
          mode: 'payment',
          locale: i.locale,
          success_url: i.successUrl,
          cancel_url: i.cancelUrl,
          'line_items[0][quantity]': 1,
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][unit_amount]': i.amountCents,
          'line_items[0][price_data][product_data][name]': i.description,
          'payment_intent_data[application_fee_amount]': i.applicationFeeCents,
          'payment_intent_data[metadata][booking_id]': i.bookingId,
          'metadata[booking_id]': i.bookingId,
          client_reference_id: `booking_${i.bookingId}`,
        }),
      });
      return { sessionId: s.id, url: s.url };
    },

    async getCheckout(accountId, sessionId): Promise<CheckoutState> {
      const s = await call<{ status: CheckoutState['status']; payment_status: string; payment_intent: string | null; amount_total: number }>(
        'GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { account: accountId });
      return { status: s.status, paid: s.payment_status === 'paid', paymentIntentId: s.payment_intent, amountCents: s.amount_total };
    },

    async refund(accountId, paymentIntentId, amountCents) {
      const r = await call<{ id: string }>('POST', '/v1/refunds', {
        account: accountId,
        form: form({ payment_intent: paymentIntentId, amount: amountCents, refund_application_fee: 'true' }),
      });
      return { refundId: r.id };
    },
  };
}
