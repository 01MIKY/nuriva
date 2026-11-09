import Stripe from 'stripe';

/** Normalised view of a Stripe webhook delivery (thin v2 notification or snapshot event). */
export interface WebhookEvent {
  id: string;
  type: string;
  /** Connected account the event belongs to (snapshot events from connected accounts). */
  account: string | null;
  /** Thin events: the related object id (e.g. acct_… for v2.core.account.*). */
  relatedObjectId: string | null;
  /** Snapshot events: the object in `data.object` (treated as a hint only — always re-fetch). */
  object: Record<string, unknown> | null;
}

const verifier = new Stripe('sk_test_signature_verification_only');

/**
 * Verifies the Stripe-Signature header with Stripe's official library (HMAC-SHA256, 300 s tolerance)
 * and returns the event. Throws if the signature, timestamp or payload is invalid.
 */
export function verifyStripeWebhook(rawBody: string, signatureHeader: string, secret: string): WebhookEvent {
  // Thin (v2) notifications and snapshot (v1) events are verified by different SDK methods; both check the
  // signature. The format is read from the payload only to pick the method — nothing is trusted before that.
  let format: unknown;
  try { format = (JSON.parse(rawBody) as { object?: unknown }).object; } catch { throw new Error('Invalid JSON payload'); }
  if (format === 'v2.core.event') {
    const n = verifier.parseEventNotification(rawBody, signatureHeader, secret) as unknown as {
      id: string; type: string; related_object?: { id?: string } | null; context?: string | null;
    };
    return { id: n.id, type: n.type, account: n.context ?? null, relatedObjectId: n.related_object?.id ?? null, object: null };
  }
  const e = verifier.webhooks.constructEvent(rawBody, signatureHeader, secret) as unknown as {
    id: string; type: string; account?: string; data?: { object?: Record<string, unknown> };
  };
  return { id: e.id, type: e.type, account: e.account ?? null, relatedObjectId: null, object: e.data?.object ?? null };
}

/** Test helper (Stripe's own): builds a valid Stripe-Signature header for a payload. */
export function signTestWebhook(payload: string, secret: string, timestamp?: number): string {
  return verifier.webhooks.generateTestHeaderString({ payload, secret, ...(timestamp ? { timestamp } : {}) });
}
