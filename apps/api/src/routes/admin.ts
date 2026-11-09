import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import { users, vettingRecords, vettingEvents, serviceActivations, caregiverProfiles, auditLog } from '@nuriva/db';
import { DomainError, VETTING_STEPS, STEP_STATUSES, canGrantFinalApproval, isService, DIVISIONS, missingSteps, profileGaps, type VettingState } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { requirePermission } from '../plugins/session.js';
import { loadVetting, loadProfile } from './caregiver.js';

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

  const ListQuery = z.object({ filter: z.enum(['all', 'review', 'approved', 'rejected']).default('all') }).strict();

  /** Caregiver pipeline for staff: profile completeness and vetting progress. No screening data here. */
  app.get('/admin/caregivers', { preHandler: requirePermission(deps, 'caregivers.read') }, async (req) => {
    const { filter } = ListQuery.parse(req.query);
    const rows = await db.select({
      id: users.id, name: users.name, email: users.email, status: users.status, createdAt: users.createdAt,
      divisions: caregiverProfiles.divisions, headline: caregiverProfiles.headline, bio: caregiverProfiles.bio,
      hourlyRateCents: caregiverProfiles.hourlyRateCents, yearsExperience: caregiverProfiles.yearsExperience,
      languages: caregiverProfiles.languages, services: caregiverProfiles.services, zip: caregiverProfiles.zip,
    }).from(users).innerJoin(caregiverProfiles, eq(caregiverProfiles.userId, users.id)).orderBy(desc(users.createdAt)).limit(500);
    const ids = rows.map((r) => r.id);
    const records = ids.length ? await db.select().from(vettingRecords).where(inArray(vettingRecords.caregiverId, ids)) : [];
    const byId = new Map<number, VettingState>();
    for (const r of records) {
      const st = byId.get(r.caregiverId) ?? (Object.fromEntries(VETTING_STEPS.map((x) => [x, 'not_started'])) as VettingState);
      st[r.step] = r.status;
      byId.set(r.caregiverId, st);
    }
    const items = rows.map((r) => {
      const state = byId.get(r.id) ?? (Object.fromEntries(VETTING_STEPS.map((x) => [x, 'not_started'])) as VettingState);
      const passed = VETTING_STEPS.filter((x) => state[x] === 'passed').length;
      const anyFailed = VETTING_STEPS.some((x) => state[x] === 'failed');
      return {
        id: r.id, name: r.name, email: r.email, status: r.status, createdAt: r.createdAt, divisions: r.divisions,
        profileComplete: profileGaps(r).length === 0, passed, total: VETTING_STEPS.length,
        approved: missingSteps(state).length === 0, anyFailed,
      };
    });
    const filtered = items.filter((i) => filter === 'all' || (filter === 'approved' && i.approved)
      || (filter === 'rejected' && i.anyFailed) || (filter === 'review' && !i.approved && !i.anyFailed));
    return { caregivers: filtered };
  });

  app.get('/admin/caregivers/:id', { preHandler: requirePermission(deps, 'caregivers.read') }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const caregiver = await getCaregiver(id);
    const profile = await loadProfile(deps, id);
    const state = await loadVetting(deps, id);
    const [idv] = await db.select({ status: caregiverProfiles.identityStatus, sessionId: caregiverProfiles.identitySessionId, errorCode: caregiverProfiles.identityErrorCode, checkedAt: caregiverProfiles.identityCheckedAt })
      .from(caregiverProfiles).where(eq(caregiverProfiles.userId, id));
    return { caregiver, profile, gaps: profileGaps(profile), steps: VETTING_STEPS.map((x) => ({ step: x, status: state[x] })), identityCheck: idv ?? null };
  });

  const AuditQuery = z.object({ before: z.coerce.number().int().positive().optional() }).strict();

  /** Most recent audit entries (append-only). Paginated with ?before=<id>. */
  app.get('/admin/audit', { preHandler: requirePermission(deps, 'audit.read') }, async (req) => {
    const { before } = AuditQuery.parse(req.query);
    const rows = await db.select({ id: auditLog.id, actorId: auditLog.actorId, action: auditLog.action, target: auditLog.target, meta: auditLog.meta, createdAt: auditLog.createdAt })
      .from(auditLog).where(before ? lt(auditLog.id, before) : undefined).orderBy(desc(auditLog.id)).limit(100);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is number => x !== null))];
    const actors = actorIds.length ? await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(inArray(users.id, actorIds)).orderBy(asc(users.id)) : [];
    const names = new Map(actors.map((a) => [a.id, `${a.name} (${a.role})`]));
    return { entries: rows.map((r) => ({ ...r, actor: r.actorId ? names.get(r.actorId) ?? `#${r.actorId}` : null })) };
  });

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
