import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { VETTING_STEPS } from '@nuriva/domain';
import { setup } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));

describe('receipts', () => {
  let carer: Awaited<ReturnType<typeof h.register>>;
  let ana: Awaited<ReturnType<typeof h.register>>;
  let luis: Awaited<ReturnType<typeof h.register>>;
  let done = 0;
  let paidOnly = 0;

  beforeAll(async () => {
    const root = await h.admin('root.receipt@nuriva.test', ['superadmin']);
    carer = await h.register('caregiver', 'carer.receipt@example.com', { name: 'Valentina Ríos Gómez' });
    ana = await h.register('client', 'ana.receipt@example.com', { name: 'Ana López Pérez' });
    luis = await h.register('client', 'luis.receipt@example.com');
    const put = (url: string, payload: object) => h.app.inject({ method: 'PUT', url, headers: { cookie: carer.c.cookie() }, payload });
    await put('/v1/caregiver/profile', { divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
      hourlyRateCents: 2500, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' });
    await put('/v1/caregiver/availability', { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) });
    for (const step of VETTING_STEPS) await root.c.post(`/v1/admin/caregivers/${carer.id}/vetting`, { step, status: 'passed', reference: `${step} evidence` });
    await root.c.post('/v1/admin/compliance/services', { division: 'kids', service: 'occasional', active: true, complianceRef: 'MEMO-RECEIPT' });
    const publicId = (await h.client().get('/v1/caregivers/search?division=kids')).body.results[0].id;
    const kid = (await ana.c.post('/v1/household/dependents', { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } })).body.dependent.id;
    const make = async (n: number) => {
      const id = (await ana.c.post('/v1/bookings', { caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [kid], date: dayPlus(n), start: '18:00', end: '21:00', address: '1200 Brickell Bay Dr, Miami FL 33131', notes: '' })).body.booking.id;
      expect((await carer.c.post(`/v1/bookings/${id}/accept`)).status).toBe(200);
      return id as number;
    };
    done = await make(4);
    paidOnly = await make(6);
  });

  it('is only available once the service is completed (or, for the family, paid)', async () => {
    expect((await ana.c.get(`/v1/bookings/${done}/receipt`)).body.error).toBe('receipt_unavailable');
    expect((await carer.c.get(`/v1/bookings/${done}/receipt`)).status).toBe(409);
    expect((await luis.c.get(`/v1/bookings/${done}/receipt`)).status).toBe(404);
  });

  it('gives the family the amounts it pays and the caregiver her earnings after commission', async () => {
    await h.db.execute(sql`update bookings set status = 'completed' where id = ${done}`);
    const fam = (await ana.c.get(`/v1/bookings/${done}/receipt`)).body.receipt;
    // 3 h × $25 = $75.00; family fee 10 % = $7.50; total $82.50
    expect(fam).toMatchObject({
      number: `NUR-${String(done).padStart(6, '0')}`, viewerRole: 'client', minutes: 180, hourlyRateCents: 2500,
      subtotalCents: 7500, clientFeeCents: 750, totalCents: 8250, family: 'Ana López Pérez', caregiver: 'Valentina R.',
      payment: { status: 'none', paidCents: 0, netPaidCents: 0 },
    });
    const cg = (await carer.c.get(`/v1/bookings/${done}/receipt`)).body.receipt;
    // Commission 15 % of $75.00 = $11.25 → $63.75 before Stripe processing fees
    expect(cg).toMatchObject({ viewerRole: 'caregiver', subtotalCents: 7500, commissionRate: 0.15, commissionCents: 1125, netCents: 6375, family: 'Ana' });
    expect(cg).not.toHaveProperty('totalCents');
    expect(JSON.stringify(cg)).not.toContain('López');
  });

  it('a paid booking has a family receipt with what was paid and refunded, before the service', async () => {
    await h.db.execute(sql`update bookings set payment_status = 'partially_refunded', paid_cents = 8250, refunded_cents = 4500, application_fee_cents = 1875, paid_at = now() where id = ${paidOnly}`);
    const fam = (await ana.c.get(`/v1/bookings/${paidOnly}/receipt`)).body.receipt;
    expect(fam.payment).toMatchObject({ status: 'partially_refunded', paidCents: 8250, refundedCents: 4500, netPaidCents: 3750 });
    expect((await carer.c.get(`/v1/bookings/${paidOnly}/receipt`)).status).toBe(409); // not completed
  });
});
