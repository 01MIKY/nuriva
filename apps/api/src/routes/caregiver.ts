import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { caregiverProfiles, vettingRecords } from '@nuriva/db';
import { CaregiverProfileInput, VETTING_STEPS, missingSteps, profileGaps, DomainError, type CaregiverProfileView, type VettingState } from '@nuriva/domain';
import type { Deps } from '../lib/context.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../plugins/session.js';

export async function loadVetting(deps: Deps, caregiverId: number): Promise<VettingState> {
  const rows = await deps.db.select().from(vettingRecords).where(eq(vettingRecords.caregiverId, caregiverId));
  const state = Object.fromEntries(VETTING_STEPS.map((s) => [s, 'not_started'])) as VettingState;
  for (const r of rows) state[r.step] = r.status;
  return state;
}

export async function loadProfile(deps: Deps, caregiverId: number): Promise<CaregiverProfileView> {
  const [p] = await deps.db.select().from(caregiverProfiles).where(eq(caregiverProfiles.userId, caregiverId)).limit(1);
  if (!p) throw new DomainError('not_found', 'Profile not found', 404);
  return {
    divisions: p.divisions, headline: p.headline, bio: p.bio, hourlyRateCents: p.hourlyRateCents,
    yearsExperience: p.yearsExperience, languages: p.languages, services: p.services, zip: p.zip,
  };
}

export async function caregiverRoutes(app: FastifyInstance, deps: Deps) {
  const caregiver = { preHandler: requireRole('caregiver') };

  /** Caregiver sees their own approval tracker. Screening references are never included. */
  app.get('/caregiver/vetting', caregiver, async (req) => {
    const state = await loadVetting(deps, req.user!.id);
    return {
      steps: VETTING_STEPS.map((step) => ({ step, status: state[step] })),
      canAcceptBookings: missingSteps(state).length === 0,
    };
  });

  app.get('/caregiver/profile', caregiver, async (req) => {
    const profile = await loadProfile(deps, req.user!.id);
    return { profile, gaps: profileGaps(profile) };
  });

  /** Self-service profile. Vetting status is untouched: NURIVA staff control approval. */
  app.put('/caregiver/profile', caregiver, async (req) => {
    const b = CaregiverProfileInput.parse(req.body);
    await deps.db.transaction(async (tx) => {
      await tx.update(caregiverProfiles).set({
        divisions: [...new Set(b.divisions)], headline: b.headline, bio: b.bio, hourlyRateCents: b.hourlyRateCents,
        yearsExperience: b.yearsExperience, languages: [...new Set(b.languages)], services: [...new Set(b.services)], zip: b.zip,
      }).where(eq(caregiverProfiles.userId, req.user!.id));
      await audit(tx, req, 'caregiver.profile_update', `caregiver:${req.user!.id}`, { divisions: b.divisions, rate: b.hourlyRateCents });
    });
    const profile = await loadProfile(deps, req.user!.id);
    return { profile, gaps: profileGaps(profile) };
  });
}
