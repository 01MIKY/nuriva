import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, count, eq } from 'drizzle-orm';
import { dependents, users } from '@nuriva/db';
import { DependentInput, EmergencyContact, MAX_DEPENDENTS, DomainError } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../plugins/session.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() }).strict();

/**
 * A client's household. Only the owner can read or change it. Names and details are encrypted at rest;
 * audit entries record what happened (kind, id) but never the plaintext.
 */
export async function householdRoutes(app: FastifyInstance, deps: Deps) {
  const { db, cipher } = deps;
  const client = { preHandler: requireRole('client') };

  const present = (row: typeof dependents.$inferSelect) => ({
    id: row.id,
    kind: row.kind,
    name: cipher.decrypt(row.displayNameEnc),
    details: cipher.decryptJson<Record<string, unknown>>(row.detailsEnc),
    createdAt: row.createdAt,
  });

  async function owned(userId: number, id: number) {
    const [row] = await db.select().from(dependents).where(and(eq(dependents.id, id), eq(dependents.ownerId, userId))).limit(1);
    // Same response for "not yours" and "does not exist", so ids cannot be probed.
    if (!row) throw new DomainError('not_found', 'Not found', 404);
    return row;
  }

  app.get('/household', client, async (req) => {
    const rows = await db.select().from(dependents).where(eq(dependents.ownerId, req.user!.id)).orderBy(asc(dependents.id));
    const [u] = await db.select({ ec: users.emergencyContactEnc }).from(users).where(eq(users.id, req.user!.id));
    return {
      dependents: rows.map(present),
      emergencyContact: u?.ec ? cipher.decryptJson<EmergencyContact>(u.ec) : null,
    };
  });

  app.post('/household/dependents', client, async (req, reply) => {
    const b = DependentInput.parse(req.body);
    const row = await db.transaction(async (tx) => {
      const [c] = await tx.select({ n: count() }).from(dependents).where(eq(dependents.ownerId, req.user!.id));
      if ((c?.n ?? 0) >= MAX_DEPENDENTS) throw new DomainError('household_full', 'Household limit reached', 409);
      const [inserted] = await tx.insert(dependents).values({
        ownerId: req.user!.id, kind: b.kind, displayNameEnc: cipher.encrypt(b.name), detailsEnc: cipher.encryptJson(b.details),
      }).returning();
      await audit(tx, req, 'household.dependent_create', `dependent:${inserted!.id}`, { kind: b.kind });
      return inserted!;
    });
    return reply.status(201).send({ dependent: present(row) });
  });

  app.put('/household/dependents/:id', client, async (req) => {
    const { id } = IdParam.parse(req.params);
    const b = DependentInput.parse(req.body);
    const existing = await owned(req.user!.id, id);
    if (existing.kind !== b.kind) throw new DomainError('validation', 'Kind cannot change', 400);
    const [row] = await db.transaction(async (tx) => {
      const updated = await tx.update(dependents).set({ displayNameEnc: cipher.encrypt(b.name), detailsEnc: cipher.encryptJson(b.details) })
        .where(eq(dependents.id, id)).returning();
      await audit(tx, req, 'household.dependent_update', `dependent:${id}`, { kind: b.kind });
      return updated;
    });
    return { dependent: present(row!) };
  });

  app.delete('/household/dependents/:id', client, async (req) => {
    const { id } = IdParam.parse(req.params);
    const existing = await owned(req.user!.id, id);
    await db.transaction(async (tx) => {
      await tx.delete(dependents).where(eq(dependents.id, id));
      await audit(tx, req, 'household.dependent_delete', `dependent:${id}`, { kind: existing.kind });
    });
    return { ok: true };
  });

  app.put('/household/emergency-contact', client, async (req) => {
    const b = EmergencyContact.parse(req.body);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ emergencyContactEnc: cipher.encryptJson(b) }).where(eq(users.id, req.user!.id));
      await audit(tx, req, 'household.emergency_contact_update', `user:${req.user!.id}`);
    });
    return { emergencyContact: b };
  });
}
