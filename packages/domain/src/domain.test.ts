import { describe, expect, it } from 'vitest';
import {
  quote, validateSchedule, cancellationFee, assertTransition, canTransition, DomainError,
  bookability, emptyVetting, canGrantFinalApproval, missingSteps, VETTING_STEPS, hasPermission, type VettingState,
} from './index.js';

const NOW = new Date('2026-11-02T12:00:00Z');
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe('quote', () => {
  it('computes fees in integer cents', () => {
    const q = quote(2800, 150); // $28/h for 2.5h
    expect(q).toEqual({
      hourlyRateCents: 2800, minutes: 150, subtotalCents: 7000, clientFeeCents: 700,
      commissionCents: 1050, totalCents: 7700, caregiverPayoutCents: 5950,
    });
  });
  it('rounds once per line item', () => {
    const q = quote(2333, 61);
    expect(Number.isInteger(q.subtotalCents) && Number.isInteger(q.clientFeeCents)).toBe(true);
    expect(q.totalCents).toBe(q.subtotalCents + q.clientFeeCents);
  });
  it('rejects invalid input', () => {
    expect(() => quote(0, 60)).toThrow(DomainError);
    expect(() => quote(2000, 1.5)).toThrow(DomainError);
  });
});

describe('validateSchedule', () => {
  const base = { division: 'kids' as const, service: 'occasional', now: NOW };
  it('accepts a valid 3h booking', () => {
    expect(validateSchedule({ ...base, startAt: at(24), endAt: at(27) })).toBe(180);
  });
  it('rejects services from the other division', () => {
    expect(() => validateSchedule({ ...base, service: 'dog_walking', startAt: at(24), endAt: at(25) })).toThrow(/Service not offered/);
  });
  it('enforces lead time', () => {
    expect(() => validateSchedule({ ...base, startAt: at(0.5), endAt: at(3) })).toThrow(/too soon/);
  });
  it('allows 30-minute dog walks but not 30-minute babysitting', () => {
    expect(validateSchedule({ division: 'pets', service: 'dog_walking', startAt: at(24), endAt: at(24.5), now: NOW })).toBe(30);
    expect(() => validateSchedule({ ...base, startAt: at(24), endAt: at(24.5) })).toThrow(/Minimum/);
  });
  it('limits single-day services to 24h and multi-day to 14 days', () => {
    expect(() => validateSchedule({ ...base, startAt: at(24), endAt: at(49) })).toThrow(/Maximum/);
    expect(validateSchedule({ division: 'pets', service: 'boarding', startAt: at(24), endAt: at(24 + 72), now: NOW })).toBe(72 * 60);
    expect(() => validateSchedule({ division: 'pets', service: 'boarding', startAt: at(24), endAt: at(24 + 15 * 24), now: NOW })).toThrow(/Maximum/);
  });
});

describe('cancellationFee', () => {
  const b = { status: 'accepted', startAt: at(10), subtotalCents: 10000 };
  it('is free for pending requests', () => expect(cancellationFee({ ...b, status: 'requested' }, 'client', NOW)).toBe(0));
  it('is free when the caregiver cancels', () => expect(cancellationFee(b, 'caregiver', NOW)).toBe(0));
  it('is free 24h+ ahead', () => expect(cancellationFee({ ...b, startAt: at(30) }, 'client', NOW)).toBe(0));
  it('charges 50% of subtotal when late', () => expect(cancellationFee(b, 'client', NOW)).toBe(5000));
});

describe('booking state machine', () => {
  it('lets caregivers accept requests', () => expect(() => assertTransition('requested', 'accepted', 'caregiver')).not.toThrow());
  it('does not let clients accept', () => expect(() => assertTransition('requested', 'accepted', 'client')).toThrow(/cannot perform/));
  it('does not allow completing a request directly', () => expect(canTransition('requested', 'completed', 'admin')).toBe(false));
  it('treats terminal states as final', () => expect(canTransition('completed', 'cancelled', 'admin')).toBe(false));
});

describe('vetting and bookability', () => {
  const passed = Object.fromEntries(VETTING_STEPS.map((s) => [s, 'passed'])) as VettingState;
  const input = { accountActive: true, vetting: passed, caregiverDivisions: ['kids'] as const, division: 'kids' as const, serviceActive: true };

  it('requires every step before final approval', () => {
    const v = { ...passed, final_approval: 'not_started' as const, interview: 'pending' as const };
    expect(canGrantFinalApproval(v)).toBe(false);
    expect(canGrantFinalApproval({ ...v, interview: 'passed' })).toBe(true);
  });
  it('lists missing steps', () => expect(missingSteps(emptyVetting())).toHaveLength(VETTING_STEPS.length));
  it('is bookable only when fully approved', () => {
    expect(bookability(input)).toEqual({ ok: true });
    expect(bookability({ ...input, vetting: { ...passed, background: 'pending' } })).toEqual({ ok: false, reason: 'vetting_incomplete' });
  });
  it('blocks inactive services, other divisions and suspended accounts', () => {
    expect(bookability({ ...input, serviceActive: false })).toEqual({ ok: false, reason: 'service_inactive' });
    expect(bookability({ ...input, division: 'pets' })).toEqual({ ok: false, reason: 'division_mismatch' });
    expect(bookability({ ...input, accountActive: false })).toEqual({ ok: false, reason: 'account_inactive' });
  });
});

describe('staff permissions', () => {
  it('restricts screening records to trust & safety and superadmin', () => {
    expect(hasPermission(['trust_safety'], 'screening.read')).toBe(true);
    expect(hasPermission(['superadmin'], 'screening.read')).toBe(true);
    for (const r of ['operations', 'finance', 'support'] as const) expect(hasPermission([r], 'screening.read')).toBe(false);
  });
  it('limits service activation to superadmin', () => {
    expect(hasPermission(['operations', 'trust_safety', 'finance', 'support'], 'compliance.activate_service')).toBe(false);
  });
});

describe('public names', async () => {
  const { publicName, initialsOf } = await import('./index.js');
  it('uses first name + first surname initial', () => {
    expect(publicName('Valentina Ríos Gómez')).toBe('Valentina R.');
    expect(publicName('Andrés Pérez')).toBe('Andrés P.');
    expect(publicName('  Cher  ')).toBe('Cher');
    expect(initialsOf('valentina ríos')).toBe('VR');
  });
});
