import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { vettingRecords } from '@nuriva/db';
import { VETTING_STEPS, missingSteps, type VettingState } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { requireRole } from '../plugins/session.js';

export async function loadVetting(deps: Deps, caregiverId: number): Promise<VettingState> {
  const rows = await deps.db.select().from(vettingRecords).where(eq(vettingRecords.caregiverId, caregiverId));
  const state = Object.fromEntries(VETTING_STEPS.map((s) => [s, 'not_started'])) as VettingState;
  for (const r of rows) state[r.step] = r.status;
  return state;
}

export async function caregiverRoutes(app: FastifyInstance, deps: Deps) {
  /** Caregiver sees their own approval tracker. Screening references are never included. */
  app.get('/caregiver/vetting', { preHandler: requireRole('caregiver') }, async (req) => {
    const state = await loadVetting(deps, req.user!.id);
    const missing = missingSteps(state);
    return {
      steps: VETTING_STEPS.map((step) => ({ step, status: state[step] })),
      canAcceptBookings: missing.length === 0,
    };
  });
}
