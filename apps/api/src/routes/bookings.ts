import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { bookings, dependents, users, caregiverProfiles } from '@nuriva/db';
import { applicationFeeCents, cancellationRefund } from '@nuriva/domain';
import {
  DIVISIONS, DomainError, MULTI_DAY_SERVICES, SLOT_HOLDING, assertTransition, contactRevealed, fitsAvailability, publicName,
  quote, validateSchedule, zonedToUtc, type BookingStatus, type Division, type Service,
} from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../plugins/session.js';
import { activeServices, bookableServices, isListed, loadCandidates, vettingFor } from './search.js';
import { loadAvailability } from './caregiver.js';
import { providerError, refreshPayoutStatus } from './payouts.js';

const BookingRequest = z.object({
  caregiverId: z.string().uuid(),
  division: z.enum(DIVISIONS),
  service: z.string().max(40),
  dependentIds: z.array(z.number().int().positive()).min(1).max(6),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
  end: z.string().regex(/^(([01]\d|2[0-3]):(00|30)|24:00)$/),
  address: z.string().trim().min(10).max(200),
  notes: z.string().trim().max(1000).default(''),
}).strict();

const IdParam = z.object({ id: z.coerce.number().int().positive() }).strict();
const CancelBody = z.object({ reason: z.string().trim().max(300).optional() }).strict();
const CheckoutBody = z.object({ locale: z.enum(['en', 'es']).default('es') }).strict();
const ConfirmBody = z.object({ sessionId: z.string().min(10).max(255) }).strict();

interface DependentSnapshot { kind: 'child' | 'pet'; name: string; details: Record<string, unknown> }

const nextDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export async function bookingRoutes(app: FastifyInstance, deps: Deps) {
  const { db, cipher } = deps;
  const enabled = async () => {
    if (!deps.config.bookingsEnabled) throw new DomainError('bookings_unavailable', 'Bookings are not open yet', 403);
  };

  type Row = typeof bookings.$inferSelect;

  /** Party-only access; anyone else gets the same 404 as a non-existent booking. */
  async function loadFor(req: FastifyRequest, id: number): Promise<{ row: Row; role: 'client' | 'caregiver' }> {
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    const u = req.user!;
    if (!row || (row.clientId !== u.id && row.caregiverId !== u.id)) throw new DomainError('not_found', 'Not found', 404);
    return { row, role: row.clientId === u.id ? 'client' : 'caregiver' };
  }

  /**
   * What each party may see. Before acceptance the caregiver sees only what is needed to decide
   * (ages / species, area-level location); names, health notes, address and notes are revealed on acceptance.
   */
  async function present(row: Row, role: 'client' | 'caregiver') {
    const [[client], [cg]] = await Promise.all([
      db.select({ name: users.name }).from(users).where(eq(users.id, row.clientId)),
      db.select({ name: users.name, publicId: caregiverProfiles.publicId }).from(users)
        .innerJoin(caregiverProfiles, eq(caregiverProfiles.userId, users.id)).where(eq(users.id, row.caregiverId)),
    ]);
    const revealed = role === 'client' || contactRevealed(row.status);
    const snap = cipher.decryptJson<DependentSnapshot[]>(row.dependentsEnc);
    return {
      id: row.id, status: row.status, division: row.division, service: row.service,
      startAt: row.startAt, endAt: row.endAt, createdAt: row.createdAt, respondedAt: row.respondedAt,
      price: { hourlyRateCents: row.hourlyRateCents, subtotalCents: row.subtotalCents, clientFeeCents: row.clientFeeCents, totalCents: row.totalCents, estimate: true },
      caregiver: { displayName: publicName(cg?.name ?? ''), publicId: cg?.publicId ?? null },
      client: { firstName: (client?.name ?? '').split(' ')[0] ?? '' },
      dependents: revealed
        ? snap
        : snap.map((d) => ({ kind: d.kind, details: d.kind === 'child' ? { ageYears: d.details.ageYears } : { species: d.details.species, ageYears: d.details.ageYears } })),
      address: revealed ? cipher.decrypt(row.addressEnc) : null,
      notes: revealed && row.notesEnc ? cipher.decrypt(row.notesEnc) : null,
      detailsRevealed: revealed,
      viewerRole: role,
      payment: { status: row.paymentStatus, paidCents: row.paidCents, refundedCents: row.refundedCents, paidAt: row.paidAt },
      paymentsEnabled: deps.config.paymentsEnabled,
    };
  }

  app.post('/bookings', { preHandler: [requireRole('client'), enabled] }, async (req, reply) => {
    const b = BookingRequest.parse(req.body);
    const [row] = await loadCandidates(deps, eq(caregiverProfiles.publicId, b.caregiverId));
    if (!row) throw new DomainError('not_bookable', 'Not bookable', 409);
    const [active, vetting] = await Promise.all([activeServices(deps), vettingFor(deps, [row.userId])]);
    if (!isListed(row, b.division, vetting.get(row.userId), active, deps.config.paymentsEnabled) || !bookableServices(row, b.division, active).includes(b.service)) {
      throw new DomainError('not_bookable', 'Not bookable', 409);
    }
    const multiDay = MULTI_DAY_SERVICES.has(b.service as Service);
    const startAt = zonedToUtc(b.date, b.start);
    const endsNextDay = b.end === '24:00' || b.end <= b.start;
    const endAt = zonedToUtc(endsNextDay ? nextDay(b.date) : b.date, b.end === '24:00' ? '00:00' : b.end);
    const minutes = validateSchedule({ division: b.division, service: b.service, startAt, endAt });
    if (!fitsAvailability(await loadAvailability(deps, row.userId), startAt, endAt, { multiDay })) {
      throw new DomainError('outside_availability', 'Outside availability', 409);
    }

    const kind = b.division === 'kids' ? 'child' : 'pet';
    const deps_ = await db.select().from(dependents).where(and(eq(dependents.ownerId, req.user!.id), inArray(dependents.id, b.dependentIds)));
    if (deps_.length !== new Set(b.dependentIds).size || deps_.some((d) => d.kind !== kind)) {
      throw new DomainError('invalid_dependents', 'Invalid selection', 400);
    }
    const snapshot: DependentSnapshot[] = deps_.map((d) => ({ kind: d.kind, name: cipher.decrypt(d.displayNameEnc), details: cipher.decryptJson(d.detailsEnc) }));
    const q = quote(row.hourlyRateCents, minutes);

    const created = await db.transaction(async (tx) => {
      // Serialise requests for this caregiver, then re-check overlap inside the lock.
      await tx.execute(sql`SELECT 1 FROM caregiver_profiles WHERE user_id = ${row.userId} FOR UPDATE`);
      const clash = await tx.select({ id: bookings.id }).from(bookings).where(and(
        eq(bookings.caregiverId, row.userId), inArray(bookings.status, [...SLOT_HOLDING]), lt(bookings.startAt, endAt), gt(bookings.endAt, startAt),
      )).limit(1);
      if (clash.length) throw new DomainError('slot_taken', 'Slot taken', 409);
      const [ins] = await tx.insert(bookings).values({
        clientId: req.user!.id, caregiverId: row.userId, division: b.division, service: b.service, startAt, endAt,
        addressEnc: cipher.encrypt(b.address), notesEnc: b.notes ? cipher.encrypt(b.notes) : null,
        dependentsEnc: cipher.encryptJson(snapshot), dependentCount: snapshot.length,
        hourlyRateCents: q.hourlyRateCents, subtotalCents: q.subtotalCents, clientFeeCents: q.clientFeeCents, totalCents: q.totalCents,
      }).returning();
      await audit(tx, req, 'booking.request', `booking:${ins!.id}`, { division: b.division, service: b.service });
      return ins!;
    });
    return reply.status(201).send({ booking: await present(created, 'client') });
  });

  app.get('/bookings', { preHandler: requireRole('client', 'caregiver') }, async (req) => {
    const u = req.user!;
    const rows = await db.select().from(bookings)
      .where(u.role === 'client' ? eq(bookings.clientId, u.id) : eq(bookings.caregiverId, u.id))
      .orderBy(desc(bookings.startAt)).limit(100);
    const role = u.role === 'client' ? 'client' : 'caregiver';
    return { bookings: await Promise.all(rows.map((r) => present(r, role))) };
  });

  app.get('/bookings/:id', { preHandler: requireRole('client', 'caregiver') }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const { row, role } = await loadFor(req, id);
    return { booking: await present(row, role) };
  });

  async function transition(req: FastifyRequest, to: BookingStatus) {
    const { id } = IdParam.parse(req.params);
    const { row, role } = await loadFor(req, id);
    assertTransition(row.status, to, role);
    if (to === 'accepted') {
      // A caregiver can only accept while every approval is still valid and the service is still active.
      const [cand] = await loadCandidates(deps, eq(users.id, row.caregiverId));
      const [active, vetting] = await Promise.all([activeServices(deps), vettingFor(deps, [row.caregiverId])]);
      if (!cand || !isListed(cand, row.division as Division, vetting.get(row.caregiverId), active, deps.config.paymentsEnabled)
        || !bookableServices(cand, row.division as Division, active).includes(row.service)) {
        throw new DomainError('not_bookable', 'Not bookable', 409);
      }
    }
    const updated = await db.transaction(async (tx) => {
      // Lock the booking so two cancellations cannot both refund.
      const [cur] = await tx.select().from(bookings).where(eq(bookings.id, row.id)).for('update');
      if (!cur || cur.status !== row.status) throw new DomainError('stale', 'Booking changed, refresh', 409);
      let refund = 0;
      if (to === 'cancelled' && (cur.paymentStatus === 'paid' || cur.paymentStatus === 'partially_refunded')) {
        refund = cancellationRefund({ status: cur.status, startAt: cur.startAt, subtotalCents: cur.subtotalCents, paidCents: cur.paidCents, refundedCents: cur.refundedCents }, role);
        if (refund > 0) {
          const [p] = await tx.select({ acct: caregiverProfiles.stripeAccountId }).from(caregiverProfiles).where(eq(caregiverProfiles.userId, cur.caregiverId));
          try {
            await deps.payments.refund(p!.acct!, cur.paymentIntentId!, refund, `booking-${cur.id}-refund-${cur.refundedCents}`);
          } catch (e) { providerError(req, e); }
        }
      }
      const refunded = cur.refundedCents + refund;
      const [u] = await tx.update(bookings).set({
        status: to,
        ...(to === 'accepted' || to === 'declined' ? { respondedAt: new Date() } : {}),
        ...(to === 'cancelled' ? { cancelledBy: req.user!.id } : {}),
        ...(refund > 0 ? { refundedCents: refunded, paymentStatus: refunded >= cur.paidCents ? 'refunded' : 'partially_refunded' } : {}),
      }).where(eq(bookings.id, row.id)).returning();
      await audit(tx, req, `booking.${to}`, `booking:${row.id}`, { from: row.status, ...(refund > 0 ? { refundCents: refund } : {}) });
      return u!;
    });
    return { booking: await present(updated, role) };
  }

  const cg = { preHandler: requireRole('caregiver') };
  app.post('/bookings/:id/accept', cg, (req) => transition(req, 'accepted'));
  app.post('/bookings/:id/decline', cg, (req) => transition(req, 'declined'));
  app.post('/bookings/:id/cancel', { preHandler: requireRole('client', 'caregiver') }, (req) => {
    CancelBody.parse(req.body ?? {});
    return transition(req, 'cancelled');
  });

  const payments = async () => {
    if (!deps.config.paymentsEnabled) throw new DomainError('payments_disabled', 'Payments are not enabled', 403);
  };

  /** Family pays an accepted booking on Stripe Checkout (direct charge on the caregiver's account, ADR 0003). */
  app.post('/bookings/:id/checkout', { preHandler: [requireRole('client'), payments] }, async (req) => {
    const { locale } = CheckoutBody.parse(req.body ?? {});
    const { id } = IdParam.parse(req.params);
    const { row } = await loadFor(req, id);
    if (row.status !== 'accepted') throw new DomainError('invalid_transition', 'Only accepted bookings can be paid', 409);
    if (row.paymentStatus === 'paid') throw new DomainError('already_paid', 'Already paid', 409);
    const [p] = await db.select({ acct: caregiverProfiles.stripeAccountId }).from(caregiverProfiles).where(eq(caregiverProfiles.userId, row.caregiverId));
    try {
      // Stripe accepts a Checkout before onboarding is complete, so NURIVA checks this itself.
      if (!p?.acct || (await refreshPayoutStatus(deps, row.caregiverId)) !== 'active') {
        throw new DomainError('payouts_not_ready', 'Caregiver cannot receive payments yet', 409);
      }
      const fee = applicationFeeCents(row.subtotalCents, row.clientFeeCents);
      const back = `${deps.config.WEB_ORIGIN}/${locale}/bookings/${row.id}`;
      const co = await deps.payments.createCheckout({
        accountId: p.acct, amountCents: row.totalCents, applicationFeeCents: fee, bookingId: row.id, locale,
        description: `NURIVA · ${row.service.replace(/_/g, ' ')} · #${row.id}`,
        successUrl: `${back}?paid={CHECKOUT_SESSION_ID}`, cancelUrl: back,
      });
      await db.transaction(async (tx) => {
        await tx.update(bookings).set({ checkoutSessionId: co.sessionId, paymentStatus: 'pending', applicationFeeCents: fee }).where(eq(bookings.id, row.id));
        await audit(tx, req, 'booking.checkout_created', `booking:${row.id}`, { amountCents: row.totalCents, feeCents: fee });
      });
      return { url: co.url };
    } catch (e) { return providerError(req, e); }
  });

  /** Called when the family returns from Checkout. Trusts only what Stripe reports for the stored session. */
  app.post('/bookings/:id/payment/confirm', { preHandler: [requireRole('client'), payments] }, async (req) => {
    const { sessionId } = ConfirmBody.parse(req.body);
    const { id } = IdParam.parse(req.params);
    const { row, role } = await loadFor(req, id);
    try {
      const updated = await markBookingPaid(deps, row.id, sessionId, req);
      return { booking: await present(updated, role) };
    } catch (e) { return providerError(req, e); }
  });
}

/**
 * Marks a booking paid after asking Stripe for the stored Checkout session. Shared by the family's return
 * from Checkout and by the Stripe webhook, so both apply exactly the same checks. Idempotent.
 */
export async function markBookingPaid(deps: Deps, bookingId: number, sessionId: string, req: FastifyRequest | null) {
  const [row] = await deps.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!row) throw new DomainError('not_found', 'Not found', 404);
  if (row.paymentStatus !== 'none' && row.paymentStatus !== 'pending') return row; // already paid (or refunded)
  if (!row.checkoutSessionId || row.checkoutSessionId !== sessionId) throw new DomainError('payment_mismatch', 'Unknown payment session', 409);
  const [p] = await deps.db.select({ acct: caregiverProfiles.stripeAccountId }).from(caregiverProfiles).where(eq(caregiverProfiles.userId, row.caregiverId));
  const state = await deps.payments.getCheckout(p!.acct!, sessionId);
  if (!state.paid || !state.paymentIntentId) throw new DomainError('payment_not_completed', 'Payment not completed', 409);
  if (state.amountCents !== row.totalCents) throw new DomainError('payment_mismatch', 'Amount mismatch', 409);
  return deps.db.transaction(async (tx) => {
    const [u] = await tx.update(bookings).set({ paymentStatus: 'paid', paymentIntentId: state.paymentIntentId, paidCents: state.amountCents, paidAt: new Date() })
      .where(and(eq(bookings.id, row.id), eq(bookings.checkoutSessionId, sessionId), inArray(bookings.paymentStatus, ['none', 'pending']))).returning();
    if (!u) {
      const [cur] = await tx.select().from(bookings).where(eq(bookings.id, row.id));
      return cur!; // a concurrent confirmation won the race
    }
    await audit(tx, req, 'booking.paid', `booking:${row.id}`, { amountCents: state.amountCents, via: req ? 'return' : 'webhook' }, req?.user?.id ?? null);
    return u;
  });
}

