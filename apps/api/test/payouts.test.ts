import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup({ paymentsEnabled: true }); });
afterAll(async () => { await h?.close(); });

describe('caregiver payouts (Stripe Connect, fake provider)', () => {
  let carer: Awaited<ReturnType<typeof h.register>>;
  let root: Awaited<ReturnType<typeof h.admin>>;

  beforeAll(async () => {
    root = await h.admin('root.payouts@nuriva.test', ['superadmin']);
    carer = await h.register('caregiver', 'carer.payouts@example.com', { name: 'Valentina Ríos' });
    await h.app.inject({ method: 'PUT', url: '/v1/caregiver/profile', headers: { cookie: carer.c.cookie() }, payload: {
      divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2600, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' } });
    for (const step of VETTING_STEPS) expect((await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` })).status).toBe(200);
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-PAY' });
  });

  it('starts with no payout account', async () => {
    expect((await carer.c.get('/v1/caregiver/payouts')).body).toEqual({ status: 'none', paymentsEnabled: true });
  });

  it('keeps an approved caregiver out of search until they can receive payments', async () => {
    expect((await h.client().get('/v1/caregivers/search?division=kids')).body.results).toEqual([]);
  });

  it('creates the connected account once and returns a Stripe-hosted onboarding link', async () => {
    const a = await carer.c.post('/v1/caregiver/payouts/onboarding', { locale: 'es' });
    expect(a.status).toBe(200);
    expect(a.body.url).toContain('/onboarding/acct_fake_');
    expect(decodeURIComponent(a.body.url)).toContain('http://localhost:3000/es/care/payouts?return=1');
    const b = await carer.c.post('/v1/caregiver/payouts/onboarding', { locale: 'en' });
    const accounts = await h.db.execute(sql`select stripe_account_id from caregiver_profiles where stripe_account_id is not null`);
    expect(accounts.rows).toHaveLength(1); // reused, not duplicated
    expect(b.body.url).toContain(String(accounts.rows[0]!.stripe_account_id));
    expect((await carer.c.get('/v1/caregiver/payouts')).body.status).toBe('restricted');
  });

  it('lists the caregiver once Stripe reports payments active', async () => {
    const acct = String((await h.db.execute(sql`select stripe_account_id from caregiver_profiles where stripe_account_id is not null`)).rows[0]!.stripe_account_id);
    h.fakePayments.completeOnboarding(acct);
    expect((await carer.c.get('/v1/caregiver/payouts')).body.status).toBe('active');
    expect((await h.client().get('/v1/caregivers/search?division=kids')).body.results).toHaveLength(1);
  });

  it('never exposes the Stripe account id publicly and audits account creation', async () => {
    const dump = JSON.stringify((await h.client().get('/v1/caregivers/search?division=kids')).body);
    expect(dump).not.toContain('acct_');
    const a = await h.db.execute(sql`select action from audit_log where action = 'payouts.account_created'`);
    expect(a.rows).toHaveLength(1);
  });

  it('is caregiver-only and validates input', async () => {
    const client = await h.register('client', 'client.payouts@example.com');
    expect((await client.c.get('/v1/caregiver/payouts')).status).toBe(403);
    expect((await carer.c.post('/v1/caregiver/payouts/onboarding', { locale: 'fr' })).status).toBe(400);
  });
});
