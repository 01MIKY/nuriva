import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { users, caregiverProfiles, vettingRecords, serviceActivations, reviews } from '@nuriva/db';
import {
  DIVISIONS, LANGUAGES, VETTING_STEPS, SERVICES, DomainError, bookability, publicName, initialsOf, profileGaps,
  type Division, type VettingState,
} from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { loadAvailability } from './caregiver.js';
import { isFavorite } from './favorites.js';

const SearchQuery = z.object({
  division: z.enum(DIVISIONS),
  service: z.string().max(40).optional(),
  language: z.enum(LANGUAGES).optional(),
  maxRate: z.coerce.number().int().min(15).max(200).optional(),
  sort: z.enum(['recommended', 'rate', 'experience']).default('recommended'),
}).strict();

const PublicId = z.object({ id: z.string().uuid() }).strict();

export type Row = Awaited<ReturnType<typeof loadCandidates>>[number];

export async function loadCandidates(deps: Deps, where?: ReturnType<typeof eq>) {
  return deps.db.select({
    userId: users.id, name: users.name, createdAt: users.createdAt, status: users.status,
    publicId: caregiverProfiles.publicId, divisions: caregiverProfiles.divisions, headline: caregiverProfiles.headline,
    bio: caregiverProfiles.bio, hourlyRateCents: caregiverProfiles.hourlyRateCents, yearsExperience: caregiverProfiles.yearsExperience,
    languages: caregiverProfiles.languages, services: caregiverProfiles.services, zip: caregiverProfiles.zip,
    payoutStatus: caregiverProfiles.payoutStatus,
  }).from(users).innerJoin(caregiverProfiles, eq(caregiverProfiles.userId, users.id))
    .where(where ? and(eq(users.status, 'active'), where) : eq(users.status, 'active')).limit(1000);
}

/** Current compliance state per "division.service" (latest register row wins). */
export async function activeServices(deps: Deps): Promise<Set<string>> {
  const rows = await deps.db.select().from(serviceActivations).orderBy(desc(serviceActivations.createdAt), desc(serviceActivations.id));
  const seen = new Set<string>();
  const active = new Set<string>();
  for (const r of rows) {
    const k = `${r.division}.${r.service}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (r.active) active.add(k);
  }
  return active;
}

export async function vettingFor(deps: Deps, ids: number[]): Promise<Map<number, VettingState>> {
  const out = new Map<number, VettingState>();
  if (!ids.length) return out;
  const rows = await deps.db.select().from(vettingRecords).where(inArray(vettingRecords.caregiverId, ids));
  for (const r of rows) {
    const st = out.get(r.caregiverId) ?? (Object.fromEntries(VETTING_STEPS.map((s) => [s, 'not_started'])) as VettingState);
    st[r.step] = r.status;
    out.set(r.caregiverId, st);
  }
  return out;
}

/** Rating summary from visible reviews of completed bookings. */
async function ratings(deps: Deps, ids: number[]) {
  const out = new Map<number, { avg: number; count: number }>();
  if (!ids.length) return out;
  const rows = await deps.db.select({ cg: reviews.caregiverId, avg: sql<number>`round(avg(${reviews.rating})::numeric, 1)::float`, count: sql<number>`count(*)::int` })
    .from(reviews).where(and(inArray(reviews.caregiverId, ids), eq(reviews.hidden, false))).groupBy(reviews.caregiverId);
  for (const r of rows) out.set(r.cg, { avg: r.avg, count: r.count });
  return out;
}

/** Services this caregiver can actually be booked for in a division: offered by them AND active in the register. */
export function bookableServices(row: Row, division: Division, active: Set<string>): string[] {
  return row.services.filter((s) => (SERVICES[division] as readonly string[]).includes(s) && active.has(`${division}.${s}`));
}

/**
 * Single listing rule. With payments enabled, a caregiver must also be able to receive payments
 * (Stripe card_payments active), otherwise a family could not complete a booking.
 */
export function isListed(row: Row, division: Division, vetting: VettingState | undefined, active: Set<string>, requirePayouts = false) {
  if (!vetting || profileGaps(row).length > 0) return false;
  if (requirePayouts && row.payoutStatus !== 'active') return false;
  const svc = bookableServices(row, division, active);
  return bookability({ accountActive: row.status === 'active', vetting, caregiverDivisions: row.divisions, division, serviceActive: svc.length > 0 }).ok;
}

/**
 * Public, unauthenticated discovery. Only caregivers who passed every vetting step and offer at least one
 * compliance-activated service appear. No email, ZIP, internal id or vetting evidence is ever returned.
 */
export async function searchRoutes(app: FastifyInstance, deps: Deps) {
  app.get('/caregivers/search', async (req) => {
    const q = SearchQuery.parse(req.query);
    const [rows, active] = await Promise.all([loadCandidates(deps), activeServices(deps)]);
    const vetting = await vettingFor(deps, rows.map((r) => r.userId));
    let results = rows
      .filter((r) => isListed(r, q.division, vetting.get(r.userId), active, deps.config.paymentsEnabled))
      .map((r) => ({ row: r, services: bookableServices(r, q.division, active) }))
      .filter(({ row, services }) => (!q.service || services.includes(q.service))
        && (!q.language || row.languages.includes(q.language))
        && (!q.maxRate || row.hourlyRateCents <= q.maxRate * 100));
    const rated = await ratings(deps, results.map((r) => r.row.userId));
    results = results.sort((a, b) => q.sort === 'rate' ? a.row.hourlyRateCents - b.row.hourlyRateCents
      : q.sort === 'experience' ? b.row.yearsExperience - a.row.yearsExperience
      : b.row.yearsExperience - a.row.yearsExperience || a.row.hourlyRateCents - b.row.hourlyRateCents);
    return {
      division: q.division,
      // Services that can be searched right now in this division (the filter chips).
      availableServices: (SERVICES[q.division] as readonly string[]).filter((s) => active.has(`${q.division}.${s}`)),
      results: results.slice(0, 50).map(({ row, services }) => ({
        id: row.publicId, displayName: publicName(row.name), initials: initialsOf(row.name), headline: row.headline,
        hourlyRateCents: row.hourlyRateCents, yearsExperience: row.yearsExperience, languages: row.languages, services, verified: true,
        rating: rated.get(row.userId) ?? null,
      })),
    };
  });

  app.get('/caregivers/:id', async (req) => {
    const { id } = PublicId.parse(req.params);
    const [rows, active] = await Promise.all([loadCandidates(deps, eq(caregiverProfiles.publicId, id)), activeServices(deps)]);
    const row = rows[0];
    if (!row) throw new DomainError('not_found', 'Not found', 404);
    const vetting = (await vettingFor(deps, [row.userId])).get(row.userId);
    const byDivision = row.divisions
      .filter((d) => isListed(row, d, vetting, active, deps.config.paymentsEnabled))
      .map((d) => ({ division: d, services: bookableServices(row, d, active) }));
    // Not bookable anywhere → indistinguishable from a profile that does not exist.
    if (!byDivision.length) throw new DomainError('not_found', 'Not found', 404);
    const rated = (await ratings(deps, [row.userId])).get(row.userId) ?? null;
    const latest = await deps.db.select({ rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt, author: users.name })
      .from(reviews).innerJoin(users, eq(users.id, reviews.clientId))
      .where(and(eq(reviews.caregiverId, row.userId), eq(reviews.hidden, false))).orderBy(desc(reviews.createdAt)).limit(10);
    return {
      caregiver: {
        rating: rated,
        reviews: latest.map((r) => ({ rating: r.rating, comment: r.comment, createdAt: r.createdAt, author: (r.author.split(' ')[0] ?? '') })),
        id: row.publicId, displayName: publicName(row.name), initials: initialsOf(row.name), headline: row.headline, bio: row.bio,
        hourlyRateCents: row.hourlyRateCents, yearsExperience: row.yearsExperience, languages: row.languages,
        divisions: byDivision, verifiedSteps: VETTING_STEPS, memberSince: row.createdAt,
      },
      bookingsEnabled: deps.config.bookingsEnabled,
      paymentsEnabled: deps.config.paymentsEnabled,
      // Only meaningful for a signed-in family; null for everyone else.
      favorite: req.user?.role === 'client' ? await isFavorite(deps, req.user.id, row.userId) : null,
    };
  });

  /** Weekly hours of a listed caregiver (Miami time), so families pick a time that can be accepted. */
  app.get('/caregivers/:id/availability', async (req) => {
    const { id } = PublicId.parse(req.params);
    const [rows, active] = await Promise.all([loadCandidates(deps, eq(caregiverProfiles.publicId, id)), activeServices(deps)]);
    const row = rows[0];
    const vetting = row ? (await vettingFor(deps, [row.userId])).get(row.userId) : undefined;
    if (!row || !row.divisions.some((d) => isListed(row, d, vetting, active, deps.config.paymentsEnabled))) throw new DomainError('not_found', 'Not found', 404);
    return { timeZone: 'America/New_York', windows: await loadAvailability(deps, row.userId) };
  });
}
