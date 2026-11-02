import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { users, vettingRecords, vettingEvents, serviceActivations, caregiverProfiles } from '@nuriva/db';
import { DomainError, VETTING_STEPS, STEP_STATUSES, canGrantFinalApproval, isService, DIVISIONS } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { requirePermission } from '../plugins/session.js';
import { loadVetting } from './caregiver.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const VettingUpdate = z.object({
  step: z.enum(VETTING_STEPS),
  status: z.enum(STEP_STATUSES),
  /** Provider report id, interview record, training certificate, etc. Required: no status without evidence. */
  reference: z.string().trim().min(3).max(500),
}).strict();

const Activation = z.object({
  division: z.enum(DIVISIONS),
  service: z.string(),
  active: z.boolean(),
  complianceRef: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(2000).default(''),
}).strict();

export async function adminRoutes(app: FastifyInstance, deps: Deps) {
  const { db, cipher } = deps;

  async function getCaregiver(id: number) {
    const [row] = await db.select({ id: users.id, name: users.name, email: users.email, status: users.status, divisions: caregiverProfiles.divisions })
      .from(users).innerJoin(caregiverProfiles, eq(caregiverProfiles.userId, users.id)).where(eq(users.id, id)).limit(1);
    if (!row) throw new DomainError('not_found', 'Caregiver not found', 404);
    return row;
  }

  app.get('/admin/caregivers/:id/vetting', { preHandler: requirePermission(deps, 'caregivers.read') }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const caregiver = await getCaregiver(id);
    const state = await loadVetting(deps, id);
    return { caregiver, steps: VETTING_STEPS.map((s) => ({ step: s, status: state[s] })) };
  });

  app.post('/admin/caregivers/:id/vetting', { preHandler: requirePermission(deps, 'caregivers.vetting.write') }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const b = VettingUpdate.parse(req.body);
    await getCaregiver(id);
    // Background decisions are restricted to staff who may read screening records.
    if (b.step === 'background' && !req.user!.staffRoles.some((r) => r === 'trust_safety' || r === 'superadmin')) {
      throw new DomainError('forbidden', 'Only Trust & Safety can record background decisions', 403);
    }
    const state = await loadVetting(deps, id);
    if (b.step === 'final_approval' && b.status === 'passed' && !canGrantFinalApproval(state)) {
      throw new DomainError('vetting_incomplete', 'All previous steps must pass before final approval', 409);
    }
    await db.transaction(async (tx) => {
      await tx.update(vettingRecords).set({ status: b.status, updatedBy: req.user!.id, updatedAt: new Date() })
        .where(and(eq(vettingRecords.caregiverId, id), eq(vettingRecords.step, b.step)));
      await tx.insert(vettingEvents).values({
        caregiverId: id, step: b.step, fromStatus: state[b.step], toStatus: b.status,
        actorId: req.user!.id, referenceEnc: cipher.encrypt(b.reference),
      });
      // If an earlier step is revoked, final approval is revoked with it.
      if (b.step !== 'final_approval' && b.status !== 'passed' && state.final_approval === 'passed') {
        await tx.update(vettingRecords).set({ status: 'pending', updatedBy: req.user!.id, updatedAt: new Date() })
          .where(and(eq(vettingRecords.caregiverId, id), eq(vettingRecords.step, 'final_approval')));
      }
      await audit(tx, req, 'vetting.update', `caregiver:${id}`, { step: b.step, from: state[b.step], to: b.status });
    });
    const after = await loadVetting(deps, id);
    return { steps: VETTING_STEPS.map((s) => ({ step: s, status: after[s] })) };
  });

  /** Screening history with decrypted references — restricted permission, and every read is audited. */
  app.get('/admin/caregivers/:id/screening', { preHandler: requirePermission(deps, 'screening.read') }, async (req) => {
    const { id } = IdParam.parse(req.params);
    await getCaregiver(id);
    const rows = await db.select().from(vettingEvents).where(eq(vettingEvents.caregiverId, id)).orderBy(desc(vettingEvents.id));
    await audit(db, req, 'screening.read', `caregiver:${id}`);
    return {
      events: rows.map((r) => ({
        step: r.step, from: r.fromStatus, to: r.toStatus, actorId: r.actorId, createdAt: r.createdAt,
        reference: cipher.decrypt(r.referenceEnc),
      })),
    };
  });

  app.get('/admin/compliance/services', { preHandler: requirePermission(deps, 'caregivers.read') }, async () => {
    const rows = await db.select().from(serviceActivations).orderBy(desc(serviceActivations.id));
    return { activations: rows };
  });

  /** Activating (or deactivating) a service requires a documented compliance reference. */
  app.post('/admin/compliance/services', { preHandler: requirePermission(deps, 'compliance.activate_service') }, async (req, reply) => {
    const b = Activation.parse(req.body);
    if (!isService(b.division, b.service)) throw new DomainError('invalid_service', 'Unknown service for this division');
    const [row] = await db.transaction(async (tx) => {
      const inserted = await tx.insert(serviceActivations).values({ ...b, approvedBy: req.user!.id }).returning();
      await audit(tx, req, b.active ? 'compliance.activate' : 'compliance.deactivate', `service:${b.division}.${b.service}`, { complianceRef: b.complianceRef });
      return inserted;
    });
    return reply.status(201).send({ activation: row });
  });
}

/** True when the latest compliance record for a service is active. */
export async function isServiceActive(deps: Deps, division: (typeof DIVISIONS)[number], service: string): Promise<boolean> {
  const [row] = await deps.db.select({ active: serviceActivations.active }).from(serviceActivations)
    .where(and(eq(serviceActivations.division, division), eq(serviceActivations.service, service)))
    .orderBy(desc(serviceActivations.createdAt), desc(serviceActivations.id)).limit(1);
  return row?.active ?? false;
}
