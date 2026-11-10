import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { bookings, bookingMessages, bookingUpdates, reviews, incidents, users } from '@nuriva/db';
import { DomainError } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { requireRole, requirePermission } from '../plugins/session.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() }).strict();
const Message = z.object({ body: z.string().trim().min(1).max(1000) }).strict();
const Update = z.object({ note: z.string().trim().min(1).max(500) }).strict();
const Review = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).default('') }).strict();
const Incident = z.object({ severity: z.enum(['low', 'medium', 'high', 'emergency']), description: z.string().trim().min(10).max(2000) }).strict();
const IncidentUpdate = z.object({ status: z.enum(['open', 'investigating', 'resolved']), note: z.string().trim().min(3).max(2000) }).strict();
const ReviewQuery = z.object({ filter: z.enum(['all', 'hidden']).default('all') }).strict();
const Visibility = z.object({ hidden: z.boolean(), reason: z.string().trim().min(3).max(500) }).strict();
const IncidentQuery = z.object({ status: z.enum(['open', 'investigating', 'resolved', 'all']).default('open') }).strict();

const CHECK_IN_EARLY_MS = 30 * 60_000;
const REVIEW_WINDOW_MS = 30 * 86400_000;

/**
 * The service itself: messages between the two parties, caregiver check-in / updates / check-out,
 * the family's review, and safety incidents handled by Trust & Safety.
 */
export async function serviceRoutes(app: FastifyInstance, deps: Deps) {
  const { db, cipher } = deps;
  const parties = { preHandler: requireRole('client', 'caregiver') };

  async function loadFor(req: FastifyRequest) {
    const { id } = IdParam.parse(req.params);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    const u = req.user!;
    if (!row || (row.clientId !== u.id && row.caregiverId !== u.id)) throw new DomainError('not_found', 'Not found', 404);
    return { row, role: row.clientId === u.id ? ('client' as const) : ('caregiver' as const) };
  }

  async function timeline(bookingId: number) {
    const rows = await db.select().from(bookingUpdates).where(eq(bookingUpdates.bookingId, bookingId)).orderBy(asc(bookingUpdates.id));
    return rows.map((r) => ({ id: r.id, kind: r.kind, note: r.noteEnc ? cipher.decrypt(r.noteEnc) : null, createdAt: r.createdAt }));
  }

  // ---------- Messages ----------
  app.get('/bookings/:id/messages', parties, async (req) => {
    const { row } = await loadFor(req);
    const rows = await db.select().from(bookingMessages).where(eq(bookingMessages.bookingId, row.id)).orderBy(asc(bookingMessages.id)).limit(500);
    return { messages: rows.map((m) => ({ id: m.id, mine: m.senderId === req.user!.id, body: cipher.decrypt(m.bodyEnc), createdAt: m.createdAt })) };
  });

  app.post('/bookings/:id/messages', { ...parties, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { body } = Message.parse(req.body);
    const { row } = await loadFor(req);
    if (row.status === 'declined' || row.status === 'cancelled') throw new DomainError('conversation_closed', 'Closed', 409);
    const [m] = await db.insert(bookingMessages).values({ bookingId: row.id, senderId: req.user!.id, bodyEnc: cipher.encrypt(body) }).returning();
    return reply.status(201).send({ message: { id: m!.id, mine: true, body, createdAt: m!.createdAt } });
  });

  // ---------- Care timeline ----------
  app.get('/bookings/:id/timeline', parties, async (req) => {
    const { row } = await loadFor(req);
    return { updates: await timeline(row.id) };
  });

  async function move(req: FastifyRequest, from: 'accepted' | 'in_progress', to: 'in_progress' | 'completed', kind: 'check_in' | 'check_out') {
    const { row, role } = await loadFor(req);
    if (role !== 'caregiver') throw new DomainError('forbidden', 'Caregiver only', 403);
    if (row.status !== from) throw new DomainError('invalid_transition', `Booking is ${row.status}`, 409);
    if (kind === 'check_in') {
      const now = Date.now();
      if (now < row.startAt.getTime() - CHECK_IN_EARLY_MS) throw new DomainError('too_early', 'Too early to check in', 409);
      if (now > row.endAt.getTime()) throw new DomainError('too_late', 'Booking time has passed', 409);
      if (deps.config.paymentsEnabled && row.paymentStatus !== 'paid') throw new DomainError('not_paid', 'Booking is not paid', 409);
    }
    await db.transaction(async (tx) => {
      const [u] = await tx.update(bookings).set({ status: to }).where(and(eq(bookings.id, row.id), eq(bookings.status, from))).returning({ id: bookings.id });
      if (!u) throw new DomainError('stale', 'Booking changed', 409);
      await tx.insert(bookingUpdates).values({ bookingId: row.id, kind });
      await audit(tx, req, `booking.${kind}`, `booking:${row.id}`);
    });
    return { status: to, updates: await timeline(row.id) };
  }

  app.post('/bookings/:id/check-in', parties, (req) => move(req, 'accepted', 'in_progress', 'check_in'));
  app.post('/bookings/:id/check-out', parties, (req) => move(req, 'in_progress', 'completed', 'check_out'));

  app.post('/bookings/:id/updates', parties, async (req, reply) => {
    const { note } = Update.parse(req.body);
    const { row, role } = await loadFor(req);
    if (role !== 'caregiver') throw new DomainError('forbidden', 'Caregiver only', 403);
    if (row.status !== 'in_progress') throw new DomainError('invalid_transition', 'Only during the service', 409);
    await db.insert(bookingUpdates).values({ bookingId: row.id, kind: 'update', noteEnc: cipher.encrypt(note) });
    return reply.status(201).send({ updates: await timeline(row.id) });
  });

  // ---------- Reviews ----------
  app.get('/bookings/:id/review', parties, async (req) => {
    const { row } = await loadFor(req);
    const [r] = await db.select().from(reviews).where(eq(reviews.bookingId, row.id));
    return { review: r ? { rating: r.rating, comment: r.comment, createdAt: r.createdAt } : null };
  });

  app.post('/bookings/:id/review', parties, async (req, reply) => {
    const b = Review.parse(req.body);
    const { row, role } = await loadFor(req);
    if (role !== 'client') throw new DomainError('forbidden', 'Only the family can review', 403);
    if (row.status !== 'completed') throw new DomainError('not_completed', 'Only completed bookings', 409);
    if (Date.now() - row.endAt.getTime() > REVIEW_WINDOW_MS) throw new DomainError('review_window_closed', 'Too late to review', 409);
    const inserted = await db.insert(reviews).values({ bookingId: row.id, clientId: row.clientId, caregiverId: row.caregiverId, rating: b.rating, comment: b.comment })
      .onConflictDoNothing().returning();
    if (!inserted.length) throw new DomainError('already_reviewed', 'Already reviewed', 409);
    await audit(db, req, 'review.create', `booking:${row.id}`, { rating: b.rating });
    return reply.status(201).send({ review: { rating: b.rating, comment: b.comment } });
  });

  // ---------- Incidents ----------
  app.post('/bookings/:id/incidents', { ...parties, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const b = Incident.parse(req.body);
    const { row } = await loadFor(req);
    const created = await db.transaction(async (tx) => {
      const [i] = await tx.insert(incidents).values({ bookingId: row.id, reporterId: req.user!.id, severity: b.severity, descriptionEnc: cipher.encrypt(b.description) }).returning();
      await audit(tx, req, 'incident.create', `incident:${i!.id}`, { severity: b.severity, booking: row.id });
      return i!;
    });
    if (b.severity === 'emergency' || b.severity === 'high') req.log.warn({ incident: created.id, severity: b.severity }, 'safety incident reported');
    return reply.status(201).send({ incident: { id: created.id, severity: created.severity, status: created.status }, emergencyGuidance: b.severity === 'emergency' });
  });

  // ---------- Trust & Safety (admin) ----------
  const ts = (perm: 'incidents.manage') => ({ preHandler: requirePermission(deps, perm) });

  app.get('/admin/incidents', ts('incidents.manage'), async (req) => {
    const { status } = IncidentQuery.parse(req.query);
    const rows = await db.select({ id: incidents.id, bookingId: incidents.bookingId, severity: incidents.severity, status: incidents.status, createdAt: incidents.createdAt, reporterRole: users.role })
      .from(incidents).innerJoin(users, eq(users.id, incidents.reporterId))
      .where(status === 'all' ? undefined : eq(incidents.status, status)).orderBy(desc(incidents.createdAt)).limit(200);
    const order = { emergency: 0, high: 1, medium: 2, low: 3 } as const;
    return { incidents: rows.sort((a, b) => order[a.severity] - order[b.severity]) };
  });

  app.get('/admin/incidents/:id', ts('incidents.manage'), async (req) => {
    const { id } = IdParam.parse(req.params);
    const [i] = await db.select().from(incidents).where(eq(incidents.id, id));
    if (!i) throw new DomainError('not_found', 'Not found', 404);
    const [rep] = await db.select({ name: users.name, role: users.role }).from(users).where(eq(users.id, i.reporterId));
    await audit(db, req, 'incident.read', `incident:${id}`);
    return { incident: {
      id: i.id, bookingId: i.bookingId, severity: i.severity, status: i.status, createdAt: i.createdAt, updatedAt: i.updatedAt,
      reporter: rep, description: cipher.decrypt(i.descriptionEnc), resolution: i.resolutionEnc ? cipher.decrypt(i.resolutionEnc) : null,
    } };
  });

  app.post('/admin/incidents/:id/status', ts('incidents.manage'), async (req) => {
    const { id } = IdParam.parse(req.params);
    const b = IncidentUpdate.parse(req.body);
    const [i] = await db.transaction(async (tx) => {
      const u = await tx.update(incidents).set({ status: b.status, resolutionEnc: cipher.encrypt(b.note), handledBy: req.user!.id, updatedAt: new Date() })
        .where(eq(incidents.id, id)).returning();
      if (!u.length) throw new DomainError('not_found', 'Not found', 404);
      await audit(tx, req, 'incident.status', `incident:${id}`, { status: b.status });
      return u;
    });
    return { incident: { id: i!.id, status: i!.status } };
  });

  // ---------- Review moderation (Trust & Safety) ----------
  // Policy (FTC): hide only abusive content, personal data or reviews unrelated to the service — never
  // because a review is negative. Hiding is reversible and always requires a reason (audited).
  app.get('/admin/reviews', { preHandler: requirePermission(deps, 'reviews.moderate') }, async (req) => {
    const { filter } = ReviewQuery.parse(req.query);
    const rows = await db.select({ id: reviews.id, bookingId: reviews.bookingId, rating: reviews.rating, comment: reviews.comment, hidden: reviews.hidden,
      createdAt: reviews.createdAt, caregiverId: reviews.caregiverId, author: users.name })
      .from(reviews).innerJoin(users, eq(users.id, reviews.clientId))
      .where(filter === 'hidden' ? eq(reviews.hidden, true) : undefined).orderBy(desc(reviews.createdAt)).limit(200);
    return { reviews: rows.map((r) => ({ ...r, author: r.author.split(' ')[0] ?? '' })) };
  });

  app.post('/admin/reviews/:id/visibility', { preHandler: requirePermission(deps, 'reviews.moderate') }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const b = Visibility.parse(req.body);
    const [r] = await db.transaction(async (tx) => {
      const u = await tx.update(reviews).set({ hidden: b.hidden }).where(eq(reviews.id, id)).returning({ id: reviews.id, hidden: reviews.hidden });
      if (!u.length) throw new DomainError('not_found', 'Not found', 404);
      await audit(tx, req, b.hidden ? 'review.hide' : 'review.unhide', `review:${id}`, { reason: b.reason });
      return u;
    });
    return { review: r };
  });
}
