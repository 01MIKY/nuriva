import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { bookingMessages, users } from '@nuriva/db';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { requirePermission } from '../plugins/session.js';

const Query = z.object({ days: z.enum(['30', '90', '365']).default('90') }).strict();

/**
 * Trust & Safety: who sends chat messages with off-platform signals (contact details or off-app payment), and
 * how often. Counts only — message text is never returned here. Signals come from pattern matching and can be
 * wrong, so they are a reason to talk to the person, never an automatic sanction (docs/RETENTION.md).
 */
export async function trustRoutes(app: FastifyInstance, deps: Deps) {
  app.get('/admin/off-platform', { preHandler: requirePermission(deps, 'incidents.manage') }, async (req) => {
    const { days } = Query.parse(req.query);
    const since = new Date(Date.now() - Number(days) * 86400_000);
    const has = (s: string) => sql<number>`(count(*) filter (where ${s} = any(${bookingMessages.signals})))::int`;
    const rows = await deps.db.select({
      userId: bookingMessages.senderId, name: users.name, role: users.role,
      phone: has('phone'), email: has('email'), link: has('link'), payment: has('payment'),
      total: sql<number>`count(*)::int`,
      bookings: sql<number>`count(distinct ${bookingMessages.bookingId})::int`,
      lastAt: sql<string>`max(${bookingMessages.createdAt})`,
    }).from(bookingMessages).innerJoin(users, eq(users.id, bookingMessages.senderId))
      .where(and(gte(bookingMessages.createdAt, since), sql`cardinality(${bookingMessages.signals}) > 0`))
      .groupBy(bookingMessages.senderId, users.name, users.role)
      .orderBy(desc(sql`count(*)`), desc(sql`max(${bookingMessages.createdAt})`)).limit(200);
    await audit(deps.db, req, 'offplatform.read', null, { days: Number(days) });
    return { days: Number(days), people: rows };
  });
}
