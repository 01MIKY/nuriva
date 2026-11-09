import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { VETTING_STEPS } from '@nuriva/domain';
import { signTestWebhook } from '@nuriva/integrations';
import { setup, TEST_WEBHOOK_SECRET } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup({ paymentsEnabled: true }); });
afterAll(async () => { await h?.close(); });

const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));

/** Delivers an event exactly as Stripe would: raw JSON body + Stripe-Signature from Stripe's own helper. */
function deliver(event: object, opts: { secret?: string; timestamp?: number; tamper?: boolean } = {}) {
  const payload = JSON.stringify(event);
  const signature = signTestWebhook(payload, opts.secret ?? TEST_WEBHOOK_SECRET, opts.timestamp);
  return h.app.inject({
    method: 'POST', url: '/v1/webhooks/stripe',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    payload: opts.tamper ? payload.replace('"id"', '"id" ') : payload,
  });
}

describe('Stripe webhooks', () => {
  let carer: Awaited<ReturnType<typeof h.register>>;
  let ana: Awaited<ReturnType<typeof h.register>>;
  let acct = '';

  beforeAll(async () => {
    const root = await h.admin('root.hooks@nuriva.test', ['superadmin']);
    carer = await h.register('caregiver', 'carer.hooks@example.com', { name: 'Valentina Ríos' });
    ana = await h.register('client', 'ana.hooks@example.com', { name: 'Ana López' });
    const put = (url: string, payload: object) => h.app.inject({ method: 'PUT', url, headers: { cookie: carer.c.cookie() }, payload });
    await put('/v1/caregiver/profile', { divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2600, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' });
    await put('/v1/caregiver/availability', { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) });
    for (const step of VETTING_STEPS) await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` });
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-HOOK' });
    await carer.c.post('/v1/caregiver/payouts/onboarding', { locale: 'es' });
    acct = String((await h.db.execute(sql`select stripe_account_id from caregiver_profiles where stripe_account_id is not null`)).rows[0]!.stripe_account_id);
  });

  it('rejects missing, invalid, tampered and stale signatures', async () => {
    const ev = { id: 'evt_bad', object: 'v2.core.event', type: 'v2.core.account.updated', related_object: { id: acct, type: 'v2.core.account' } };
    const noSig = await h.app.inject({ method: 'POST', url: '/v1/webhooks/stripe', headers: { 'content-type': 'application/json' }, payload: JSON.stringify(ev) });
    expect(noSig.statusCode).toBe(400);
    expect((await deliver(ev, { secret: 'whsec_wrong' })).statusCode).toBe(400);
    expect((await deliver(ev, { tamper: true })).statusCode).toBe(400);
    expect((await deliver(ev, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).statusCode).toBe(400);
  });

  it('a thin v2.core.account event makes NURIVA re-read the payout status from Stripe', async () => {
    h.fakePayments.completeOnboarding(acct); // Stripe-side change
    expect((await h.client().get('/v1/caregivers/search?division=kids')).body.results).toEqual([]); // not refreshed yet
    const r = await deliver({ id: 'evt_acct_1', object: 'v2.core.event', type: 'v2.core.account[configuration.merchant].capability_status_updated',
      related_object: { id: acct, type: 'v2.core.account', url: `/v2/core/accounts/${acct}` } });
    expect(r.statusCode).toBe(200);
    expect((await h.client().get('/v1/caregivers/search?division=kids')).body.results).toHaveLength(1);
  });

  it('marks a booking paid from checkout.session.completed, even if the family never returns', async () => {
    const publicId = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0].id;
    const sofia = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } })).body.dependent.id;
    const b = await ana.c.post('/v1/bookings', { caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: dayPlus(5), start: '18:00', end: '22:00', address: '1200 Brickell Bay Dr, Miami FL', notes: '' });
    const id = b.body.booking.id;
    await carer.c.post(`/v1/bookings/${id}/accept`);
    const sessionId = (await ana.c.post(`/v1/bookings/${id}/checkout`, {})).body.url.split('/').pop();
    const event = { id: 'evt_cs_1', object: 'event', type: 'checkout.session.completed', account: acct,
      data: { object: { id: sessionId, object: 'checkout.session', payment_status: 'paid', metadata: { booking_id: String(id) } } } };

    // The payload claims "paid" but Stripe (the provider) says it is not: nothing changes and Stripe will retry.
    const early = await deliver(event);
    expect(early.statusCode).toBe(409);
    expect((await ana.c.get(`/v1/bookings/${id}`)).body.booking.payment.status).toBe('pending');

    h.fakePayments.pay(sessionId);
    expect((await deliver(event)).statusCode).toBe(200); // the retry is processed
    expect((await ana.c.get(`/v1/bookings/${id}`)).body.booking.payment).toMatchObject({ status: 'paid', paidCents: 11440 });

    const dup = await deliver(event);
    expect(dup.json()).toEqual({ received: true, duplicate: true });
    const paidAudits = await h.db.execute(sql`select meta from audit_log where action = 'booking.paid'`);
    expect(paidAudits.rows).toHaveLength(1);
    expect(JSON.stringify(paidAudits.rows[0])).toContain('webhook');
  });

  it('acknowledges unrelated events without acting on them', async () => {
    const r = await deliver({ id: 'evt_other', object: 'event', type: 'customer.created', data: { object: { id: 'cus_1' } } });
    expect(r.statusCode).toBe(200);
  });
});
