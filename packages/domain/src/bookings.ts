import { DomainError } from './errors.js';
import type { ActorRole } from './pricing.js';

export const BOOKING_STATUSES = ['requested', 'accepted', 'declined', 'cancelled', 'in_progress', 'completed'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Booking state machine: from → to → roles allowed to make the move. */
const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingStatus, readonly ActorRole[]>>> = {
  requested: { accepted: ['caregiver'], declined: ['caregiver'], cancelled: ['client', 'caregiver', 'admin'] },
  accepted: { in_progress: ['caregiver'], cancelled: ['client', 'caregiver', 'admin'] },
  in_progress: { completed: ['caregiver', 'admin'] },
  declined: {},
  cancelled: {},
  completed: {},
};

export function assertTransition(from: BookingStatus, to: BookingStatus, role: ActorRole): void {
  const allowed = TRANSITIONS[from][to];
  if (!allowed) throw new DomainError('invalid_transition', `Cannot move booking from ${from} to ${to}`, 409);
  if (!allowed.includes(role)) throw new DomainError('forbidden', `A ${role} cannot perform this action`, 403);
}

export function canTransition(from: BookingStatus, to: BookingStatus, role: ActorRole): boolean {
  return TRANSITIONS[from][to]?.includes(role) ?? false;
}

/** Statuses that hold a caregiver's time slot (used for overlap detection). */
export const SLOT_HOLDING: readonly BookingStatus[] = ['requested', 'accepted', 'in_progress'];

/** Contact details and exact address are revealed only once the caregiver accepts. */
export function contactRevealed(status: BookingStatus): boolean {
  return status === 'accepted' || status === 'in_progress' || status === 'completed';
}
