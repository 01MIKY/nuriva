import { DomainError } from './errors.js';
import { type Division, type Service, isService, SHORT_SERVICES, MULTI_DAY_SERVICES } from './services.js';

/**
 * Commercial policy. PLACEHOLDER VALUES pending business approval (see blueprint "Huecos").
 * All money is integer cents (USD).
 */
export const POLICY = Object.freeze({
  clientFeeRate: 0.1,
  commissionRate: 0.15,
  minLeadMinutes: 60,
  minMinutes: 60,
  minShortMinutes: 30,
  maxMinutes: 24 * 60,
  maxMultiDayMinutes: 14 * 24 * 60,
  freeCancelHours: 24,
  lateCancelRate: 0.5,
  minHourlyRateCents: 1500, // Florida minimum wage reference; confirm with counsel for contractor model
  maxHourlyRateCents: 20000,
});

export interface ScheduleInput {
  division: Division;
  service: string;
  startAt: Date;
  endAt: Date;
  now?: Date;
}

/** Validates a requested schedule and returns its duration in minutes. */
export function validateSchedule({ division, service, startAt, endAt, now = new Date() }: ScheduleInput): number {
  if (!isService(division, service)) throw new DomainError('invalid_service', 'Service not offered in this division');
  const s = startAt.getTime();
  const e = endAt.getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) throw new DomainError('invalid_time', 'Invalid start or end time');
  if (s < now.getTime() + POLICY.minLeadMinutes * 60_000) throw new DomainError('too_soon', 'Booking starts too soon');
  const mins = Math.round((e - s) / 60_000);
  const svc = service as Service;
  const min = SHORT_SERVICES.has(svc) ? POLICY.minShortMinutes : POLICY.minMinutes;
  const max = MULTI_DAY_SERVICES.has(svc) ? POLICY.maxMultiDayMinutes : POLICY.maxMinutes;
  if (mins < min) throw new DomainError('too_short', `Minimum duration is ${min} minutes`);
  if (mins > max) throw new DomainError('too_long', `Maximum duration is ${max} minutes`);
  return mins;
}

export interface Quote {
  hourlyRateCents: number;
  minutes: number;
  subtotalCents: number;
  clientFeeCents: number;
  commissionCents: number;
  totalCents: number;
  caregiverPayoutCents: number;
}

export function quote(hourlyRateCents: number, minutes: number): Quote {
  if (!Number.isInteger(hourlyRateCents) || hourlyRateCents <= 0) throw new DomainError('invalid_rate', 'Invalid rate');
  if (!Number.isInteger(minutes) || minutes <= 0) throw new DomainError('invalid_duration', 'Invalid duration');
  const subtotalCents = Math.round((hourlyRateCents * minutes) / 60);
  const clientFeeCents = Math.round(subtotalCents * POLICY.clientFeeRate);
  const commissionCents = Math.round(subtotalCents * POLICY.commissionRate);
  return {
    hourlyRateCents,
    minutes,
    subtotalCents,
    clientFeeCents,
    commissionCents,
    totalCents: subtotalCents + clientFeeCents,
    caregiverPayoutCents: subtotalCents - commissionCents,
  };
}

export type ActorRole = 'client' | 'caregiver' | 'admin';

/**
 * Amount retained on cancellation (PLACEHOLDER policy):
 * free for pending requests, for caregiver/admin cancellations, and for client cancellations
 * at least `freeCancelHours` ahead; otherwise `lateCancelRate` of the subtotal.
 */
export function cancellationFee(
  booking: { status: string; startAt: Date; subtotalCents: number },
  byRole: ActorRole,
  now: Date = new Date(),
): number {
  if (booking.status === 'requested' || byRole !== 'client') return 0;
  const hoursAhead = (booking.startAt.getTime() - now.getTime()) / 3_600_000;
  if (hoursAhead >= POLICY.freeCancelHours) return 0;
  return Math.round(booking.subtotalCents * POLICY.lateCancelRate);
}
