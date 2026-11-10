import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { bookings, caregiverProfiles, reviews } from '@nuriva/db';
import { caregiverBadges, levelProgress, type ReputationStats } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { requireRole } from '../plugins/session.js';

/** Rating summary from visible reviews (hidden ones never count). */
export async function ratingsFor(deps: Deps, ids: number[]) {
  const out = new Map<number, { avg: number; count: number }>();
  if (!ids.length) return out;
  const rows = await deps.db.select({ cg: reviews.caregiverId, avg: sql<number>`round(avg(${reviews.rating})::numeric, 1)::float`, count: sql<number>`count(*)::int` })
    .from(reviews).where(and(inArray(reviews.caregiverId, ids), eq(reviews.hidden, false))).groupBy(reviews.caregiverId);
  for (const r of rows) out.set(r.cg, { avg: r.avg, count: r.count });
  return out;
}

/** Reputation stats for many caregivers in three queries. Only what happened on NURIVA counts. */
export async function reputationFor(deps: Deps, people: Array<{ userId: number; languages: readonly string[] }>): Promise<Map<number, ReputationStats>> {
  const ids = people.map((p) => p.userId);
  const out = new Map<number, ReputationStats>();
  if (!ids.length) return out;
  const repeatPairs = deps.db.select({ cg: bookings.caregiverId, client: bookings.clientId }).from(bookings)
    .where(and(eq(bookings.status, 'completed'), inArray(bookings.caregiverId, ids)))
    .groupBy(bookings.caregiverId, bookings.clientId).having(sql`count(*) >= 2`).as('repeat_pairs');
  const [agg, repeat, rated] = await Promise.all([
    deps.db.select({
      cg: bookings.caregiverId,
      completed: sql<number>`(count(*) filter (where ${bookings.status} = 'completed'))::int`,
      cancellations: sql<number>`(count(*) filter (where ${bookings.status} = 'cancelled' and ${bookings.cancelledBy} = ${bookings.caregiverId} and ${bookings.startAt} >= now() - interval '90 days'))::int`,
      responses: sql<number>`count(${bookings.respondedAt})::int`,
      median: sql<number | null>`(percentile_cont(0.5) within group (order by extract(epoch from (${bookings.respondedAt} - ${bookings.createdAt})) / 60))::float`,
    }).from(bookings).where(inArray(bookings.caregiverId, ids)).groupBy(bookings.caregiverId),
    deps.db.select({ cg: repeatPairs.cg, n: sql<number>`count(*)::int` }).from(repeatPairs).groupBy(repeatPairs.cg),
    ratingsFor(deps, ids),
  ]);
  const aggBy = new Map(agg.map((a) => [a.cg, a]));
  const repeatBy = new Map(repeat.map((r) => [r.cg, r.n]));
  for (const p of people) {
    const a = aggBy.get(p.userId);
    const r = rated.get(p.userId);
    out.set(p.userId, {
      completed: a?.completed ?? 0, cancellations90d: a?.cancellations ?? 0,
      responses: a?.responses ?? 0, medianResponseMinutes: a?.median === null || a?.median === undefined ? null : Math.round(a.median),
      ratingAvg: r?.avg ?? null, ratingCount: r?.count ?? 0, repeatFamilies: repeatBy.get(p.userId) ?? 0, languages: p.languages,
    });
  }
  return out;
}

/** Public part of the reputation: level (only Silver/Gold are shown), factual badges and completed services. */
export function publicReputation(s: ReputationStats) {
  const { level } = levelProgress(s);
  return { level: level === 'new' ? null : level, badges: caregiverBadges(s), completed: s.completed };
}

export async function reputationRoutes(app: FastifyInstance, deps: Deps) {
  /** The caregiver's own level, stats and what is missing for the next level (informational only). */
  app.get('/caregiver/reputation', { preHandler: requireRole('caregiver') }, async (req) => {
    const [p] = await deps.db.select({ languages: caregiverProfiles.languages }).from(caregiverProfiles).where(eq(caregiverProfiles.userId, req.user!.id));
    const stats = (await reputationFor(deps, [{ userId: req.user!.id, languages: p?.languages ?? [] }])).get(req.user!.id)!;
    return { stats, ...levelProgress(stats), badges: caregiverBadges(stats) };
  });
}
