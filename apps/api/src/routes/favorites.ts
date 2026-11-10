import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { caregiverProfiles, favorites, users } from '@nuriva/db';
import { DomainError, initialsOf, publicName } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { requireRole } from '../plugins/session.js';
import { activeServices, isListed, loadCandidates, vettingFor } from './search.js';

const PublicId = z.object({ id: z.string().uuid() }).strict();

/** Whether a client saved this caregiver (used by the public profile). */
export async function isFavorite(deps: Deps, clientId: number, caregiverId: number): Promise<boolean> {
  const [row] = await deps.db.select({ c: favorites.caregiverId }).from(favorites)
    .where(and(eq(favorites.clientId, clientId), eq(favorites.caregiverId, caregiverId))).limit(1);
  return Boolean(row);
}

/**
 * Families save caregivers to book them again in one tap. Only caregivers who are listed right now can be
 * added. A saved caregiver who stops being listed (e.g. a vetting step is revoked) stays in the list as
 * "no longer available" with nothing but the name the family already knew — never their profile details.
 */
export async function favoriteRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps;
  const client = { preHandler: requireRole('client') };

  async function caregiverByPublicId(publicId: string) {
    const [row] = await db.select({ userId: caregiverProfiles.userId }).from(caregiverProfiles).where(eq(caregiverProfiles.publicId, publicId)).limit(1);
    if (!row) throw new DomainError('not_found', 'Not found', 404);
    return row.userId;
  }

  app.get('/favorites', client, async (req) => {
    const saved = await db.select({ caregiverId: favorites.caregiverId, savedAt: favorites.createdAt }).from(favorites)
      .where(eq(favorites.clientId, req.user!.id)).orderBy(desc(favorites.createdAt)).limit(200);
    if (!saved.length) return { favorites: [] };
    const ids = saved.map((s) => s.caregiverId);
    const [rows, active, vetting, names] = await Promise.all([
      loadCandidates(deps, inArray(users.id, ids)),
      activeServices(deps),
      vettingFor(deps, ids),
      db.select({ id: users.id, name: users.name, publicId: caregiverProfiles.publicId }).from(users)
        .innerJoin(caregiverProfiles, eq(caregiverProfiles.userId, users.id)).where(inArray(users.id, ids)),
    ]);
    const byId = new Map(rows.map((r) => [r.userId, r]));
    const nameById = new Map(names.map((n) => [n.id, n]));
    return {
      favorites: saved.flatMap((s) => {
        const n = nameById.get(s.caregiverId);
        if (!n) return [];
        const row = byId.get(s.caregiverId);
        const listed = row ? row.divisions.some((d) => isListed(row, d, vetting.get(row.userId), active, deps.config.paymentsEnabled)) : false;
        const base = { id: n.publicId, displayName: publicName(n.name), initials: initialsOf(n.name), savedAt: s.savedAt, available: listed };
        return [listed && row ? { ...base, headline: row.headline, hourlyRateCents: row.hourlyRateCents, yearsExperience: row.yearsExperience } : base];
      }),
    };
  });

  app.put('/favorites/:id', client, async (req, reply) => {
    const { id } = PublicId.parse(req.params);
    const [row] = await loadCandidates(deps, eq(caregiverProfiles.publicId, id));
    const [active, vetting] = row ? await Promise.all([activeServices(deps), vettingFor(deps, [row.userId])]) : [null, null];
    // Same visibility rule as the public profile: an unlisted caregiver is indistinguishable from a missing one.
    if (!row || !row.divisions.some((d) => isListed(row, d, vetting!.get(row.userId), active!, deps.config.paymentsEnabled))) {
      throw new DomainError('not_found', 'Not found', 404);
    }
    const ins = await db.insert(favorites).values({ clientId: req.user!.id, caregiverId: row.userId }).onConflictDoNothing().returning();
    return reply.status(ins.length ? 201 : 200).send({ favorite: true });
  });

  app.delete('/favorites/:id', client, async (req) => {
    const { id } = PublicId.parse(req.params);
    const caregiverId = await caregiverByPublicId(id);
    await db.delete(favorites).where(and(eq(favorites.clientId, req.user!.id), eq(favorites.caregiverId, caregiverId)));
    return { favorite: false };
  });
}
