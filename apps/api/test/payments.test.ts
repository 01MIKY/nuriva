import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup({ paymentsEnabled: true }); });
afterAll(async () => { await h?.close(); });

const TZ = 'America/New_York';
const localDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const localTime = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
/** A 1-hour slot starting ~2-2.5 h from now (Miami time), i.e. inside the late-cancellation window. */
function soonSlot() {
  const t = new Date(Date.now() + 2 * 3600_000);
  t.setUTCMinutes(t.getUTCMinutes() < 30 ? 30 : 60, 0, 0);
  let date = localDate(t);
  let start = localTime(t);
  if (start >= '23:00') { date = localDate(new Date(t.getTime() + 3600_000)); start = '00:00'; }
  const end = `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:${start.slice(3)}`;
  return { date, start, end };
}
const dayPlus = (n: number) => localDate(new Date(Date.now() + n * 86400_000));

describe('booking payments (direct charge on the caregiver account, fake provider)', () => {
  let root: Awaited<ReturnType<typeof h.admin>>;
  let carer: Awaited<ReturnType<typeof h.register>>;
  let ana: Awaited<ReturnType<typeof h.register>>;
  let publicId = '';
  let acct = '';
  let sofia = 0;

  const book = async (slot: { date: string; start: string; end: string }) => {
    const r = await ana.c.post('/v1/bookings', { caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], ...slot, address: '1200 Brickell Bay Dr, Miami FL', notes: '' });
    expect(r.status).toBe(201);
    const id = r.body.booking.id as number;
    expect((await carer.c.post(`/v1/bookings/${id}/accept`)).status).toBe(200);
    return id;
  };
  const payFor = async (id: number) => {
    const co = await ana.c.post(`/v1/bookings/${id}/checkout`, { locale: 'es' });
    expect(co.status).toBe(200);
    const sessionId = co.body.url.split('/').pop() as string;
    h.fakePayments.pay(sessionId);
    const ok = await ana.c.post(`/v1/bookings/${id}/payment/confirm`, { sessionId });
    expect(ok.status).toBe(200);
    return { sessionId, booking: ok.body.booking };
  };

  beforeAll(async () => {
    root = await h.admin('root.pay@nuriva.test', ['superadmin']);
    carer = await h.register('caregiver', 'carer.pay@example.com', { name: 'Valentina Ríos' });
    ana = await h.register('client', 'ana.pay@example.com', { name: 'Ana López' });
    const put = (url: string, payload: object) => h.app.inject({ method: 'PUT', url, headers: { cookie: carer.c.cookie() }, payload });
    await put('/v1/caregiver/profile', { divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2600, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' });
    await put('/v1/caregiver/availability', { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '00:00', end: '24:00' })) });
    for (const step of VETTING_STEPS) expect((await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` })).status).toBe(200);
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-PAY-2' });
    await carer.c.post('/v1/caregiver/payouts/onboarding', { locale: 'es' });
    acct = String((await h.db.execute(sql`select stripe_account_id from caregiver_profiles where stripe_account_id is not null`)).rows[0]!.stripe_account_id);
    h.fakePayments.completeOnboarding(acct);
    // The caregiver returns from Stripe to the Payouts page, which refreshes the stored status.
    expect((await carer.c.get('/v1/caregiver/payouts')).body.status).toBe('active');
    publicId = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0].id;
    sofia = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } })).body.dependent.id;
  });

  it('cannot pay before the caregiver accepts', async () => {
    const r = await ana.c.post('/v1/bookings', { caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: dayPlus(9), start: '10:00', end: '12:00', address: '1200 Brickell Bay Dr, Miami FL', notes: '' });
    expect((await ana.c.post(`/v1/bookings/${r.body.booking.id}/checkout`, {})).body.error).toBe('invalid_transition');
    await ana.c.post(`/v1/bookings/${r.body.booking.id}/cancel`, {});
  });

  it('charges the total on the caregiver account with NURIVA fee = service fee + 15 % commission', async () => {
    const id = await book({ date: dayPlus(5), start: '18:00', end: '22:00' });
    const co = await ana.c.post(`/v1/bookings/${id}/checkout`, { locale: 'es' });
    expect(co.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\/pay\/cs_fake_/);
    const session = [...h.fakePayments.sessions.values()].at(-1)!;
    expect(session).toMatchObject({ accountId: acct, amount: 11440, fee: 1040 + 1560, bookingId: id });
    expect((await ana.c.get(`/v1/bookings/${id}`)).body.booking.payment.status).toBe('pending');
  });

  it('only marks a booking paid when Stripe confirms the stored session', async () => {
    const id = await book({ date: dayPlus(6), start: '18:00', end: '22:00' });
    const co = await ana.c.post(`/v1/bookings/${id}/checkout`, {});
    const sessionId = co.body.url.split('/').pop();
    expect((await ana.c.post(`/v1/bookings/${id}/payment/confirm`, { sessionId })).body.error).toBe('payment_not_completed');
    expect((await ana.c.post(`/v1/bookings/${id}/payment/confirm`, { sessionId: 'cs_fake_forged123' })).body.error).toBe('payment_mismatch');
    h.fakePayments.pay(sessionId);
    const ok = await ana.c.post(`/v1/bookings/${id}/payment/confirm`, { sessionId });
    expect(ok.body.booking.payment).toMatchObject({ status: 'paid', paidCents: 11440, refundedCents: 0 });
    expect((await ana.c.post(`/v1/bookings/${id}/payment/confirm`, { sessionId })).status).toBe(200); // idempotent
    expect((await ana.c.post(`/v1/bookings/${id}/checkout`, {})).body.error).toBe('already_paid');
  });

  it('refunds everything when the family cancels 24 h or more ahead', async () => {
    const id = await book({ date: dayPlus(7), start: '18:00', end: '22:00' });
    await payFor(id);
    const before = h.fakePayments.refunds.length;
    const r = await ana.c.post(`/v1/bookings/${id}/cancel`, {});
    expect(r.body.booking).toMatchObject({ status: 'cancelled', payment: { status: 'refunded', refundedCents: 11440 } });
    expect(h.fakePayments.refunds.slice(before)).toEqual([expect.objectContaining({ accountId: acct, amountCents: 11440 })]);
  });

  it('keeps 50 % of the care cost on a late family cancellation', async () => {
    const id = await book(soonSlot());
    const { booking } = await payFor(id);
    const late = 2600; // 1 h × $26 → 50 % kept = $13.00
    const r = await ana.c.post(`/v1/bookings/${id}/cancel`, {});
    expect(r.body.booking.payment).toMatchObject({ status: 'partially_refunded', refundedCents: booking.payment.paidCents - late / 2 });
  });

  it('refunds everything when the caregiver cancels (late caregiver cancellations are covered by the domain tests)', async () => {
    const id = await book({ date: dayPlus(8), start: '09:00', end: '10:00' });
    const { booking } = await payFor(id);
    const r = await carer.c.post(`/v1/bookings/${id}/cancel`, {});
    expect(r.body.booking.payment).toMatchObject({ status: 'refunded', refundedCents: booking.payment.paidCents });
  });

  it('refuses checkout if the caregiver can no longer receive payments', async () => {
    const id = await book({ date: dayPlus(10), start: '09:00', end: '11:00' });
    h.fakePayments.restrict(acct);
    expect((await ana.c.post(`/v1/bookings/${id}/checkout`, {})).body.error).toBe('payouts_not_ready');
    h.fakePayments.completeOnboarding(acct);
  });

  it('audits checkout, payment and refunds', async () => {
    const actions = (await h.db.execute(sql`select action, meta from audit_log where action in ('booking.checkout_created','booking.paid','booking.cancelled')`)).rows;
    expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(['booking.checkout_created', 'booking.paid', 'booking.cancelled']));
    expect(actions.some((a) => JSON.stringify(a.meta).includes('refundCents'))).toBe(true);
  });
});

describe('payments switched off', () => {
  it('refuses checkout when payments are disabled', async () => {
    const off = await setup({ paymentsEnabled: false });
    try {
      const client = await off.register('client', 'off.pay@example.com');
      const r = await client.c.post('/v1/bookings/1/checkout', {});
      expect(r.body.error).toBe('payments_disabled');
    } finally { await off.close(); }
  });
});
