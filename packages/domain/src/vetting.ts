import type { Division } from './services.js';

/**
 * Caregiver vetting pipeline controlled by NURIVA. Every step is recorded by an admin with a
 * reference (provider report id, interview notes id, etc.) — statuses are never self-reported.
 */
export const VETTING_STEPS = ['identity', 'background', 'interview', 'training', 'agreement', 'final_approval'] as const;
export type VettingStep = (typeof VETTING_STEPS)[number];

export const STEP_STATUSES = ['not_started', 'pending', 'passed', 'failed'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export type VettingState = Record<VettingStep, StepStatus>;

export const emptyVetting = (): VettingState =>
  Object.fromEntries(VETTING_STEPS.map((s) => [s, 'not_started'])) as VettingState;

/** Steps that must pass before `final_approval` can be granted. */
export const PREREQUISITES: readonly VettingStep[] = VETTING_STEPS.filter((s) => s !== 'final_approval');

export function missingSteps(state: VettingState): VettingStep[] {
  return VETTING_STEPS.filter((s) => state[s] !== 'passed');
}

export function canGrantFinalApproval(state: VettingState): boolean {
  return PREREQUISITES.every((s) => state[s] === 'passed');
}

export interface BookabilityInput {
  accountActive: boolean;
  vetting: VettingState;
  caregiverDivisions: readonly Division[];
  division: Division;
  /** True when the requested service has an active compliance approval. */
  serviceActive: boolean;
}

export type NotBookableReason = 'account_inactive' | 'vetting_incomplete' | 'division_mismatch' | 'service_inactive';

/**
 * The single rule used by search, booking creation and booking acceptance:
 * a caregiver may only appear or accept work when every applicable approval is complete.
 */
export function bookability(i: BookabilityInput): { ok: true } | { ok: false; reason: NotBookableReason } {
  if (!i.accountActive) return { ok: false, reason: 'account_inactive' };
  if (missingSteps(i.vetting).length) return { ok: false, reason: 'vetting_incomplete' };
  if (!i.caregiverDivisions.includes(i.division)) return { ok: false, reason: 'division_mismatch' };
  if (!i.serviceActive) return { ok: false, reason: 'service_inactive' };
  return { ok: true };
}
