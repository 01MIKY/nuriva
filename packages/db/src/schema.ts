import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, bigserial, bigint, text, timestamp, boolean, integer, jsonb, uniqueIndex, index, primaryKey, check, uuid,
} from 'drizzle-orm/pg-core';

const id = () => bigserial('id', { mode: 'number' }).primaryKey();
const fk = (name: string) => bigint(name, { mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const accountRole = pgEnum('account_role', ['client', 'caregiver', 'admin']);
export const staffRole = pgEnum('staff_role', ['superadmin', 'operations', 'trust_safety', 'finance', 'support']);
export const accountStatus = pgEnum('account_status', ['active', 'suspended']);
export const locale = pgEnum('locale', ['en', 'es']);
export const division = pgEnum('division', ['kids', 'pets']);
export const vettingStep = pgEnum('vetting_step', ['identity', 'background', 'interview', 'training', 'agreement', 'final_approval']);
export const stepStatus = pgEnum('step_status', ['not_started', 'pending', 'passed', 'failed']);
export const dependentKind = pgEnum('dependent_kind', ['child', 'pet']);

/** Columns suffixed `_enc` hold AES-256-GCM ciphertext produced by ./crypto.ts — never plaintext. */
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: accountRole('role').notNull(),
  name: text('name').notNull(),
  phoneEnc: text('phone_enc'),
  /** JSON {name, phone, relationship}, encrypted. */
  emergencyContactEnc: text('emergency_contact_enc'),
  locale: locale('locale').notNull().default('en'),
  status: accountStatus('status').notNull().default('active'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  /** TOTP secret (base32), encrypted. Pending secret holds an enrolment not yet confirmed with a code. */
  mfaSecretEnc: text('mfa_secret_enc'),
  mfaPendingSecretEnc: text('mfa_pending_secret_enc'),
  /** Last accepted TOTP time step — a code can never be used twice (replay protection). */
  mfaLastStep: bigint('mfa_last_step', { mode: 'number' }),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }).notNull(),
  termsVersion: text('terms_version').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)]);

export const staffRoleAssignments = pgTable('staff_role_assignments', {
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: staffRole('role').notNull(),
  grantedBy: fk('granted_by').references(() => users.id),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.role] })]);

/** Server-side sessions so they can be revoked. Only a SHA-256 hash of the token is stored. */
export const sessions = pgTable('sessions', {
  id: id(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('sessions_token_hash_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)]);

export const caregiverProfiles = pgTable('caregiver_profiles', {
  userId: fk('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  /** Opaque id used in public URLs, so internal ids are never exposed or enumerable. */
  publicId: uuid('public_id').notNull().defaultRandom(),
  divisions: division('divisions').array().notNull(),
  headline: text('headline').notNull().default(''),
  bio: text('bio').notNull().default(''),
  hourlyRateCents: integer('hourly_rate_cents').notNull(),
  yearsExperience: integer('years_experience').notNull().default(0),
  languages: text('languages').array().notNull().default(sql`ARRAY['en']::text[]`),
  services: text('services').array().notNull().default(sql`ARRAY[]::text[]`),
  zip: text('zip'),
  /** Stripe connected account (direct charges, ADR 0003) and its last known card_payments status. */
  stripeAccountId: text('stripe_account_id'),
  payoutStatus: text('payout_status').notNull().default('none'),
  payoutCheckedAt: timestamp('payout_checked_at', { withTimezone: true }),
  /** Stripe Identity: only the session id and status are stored — never documents, selfies or birth dates. */
  identitySessionId: text('identity_session_id'),
  identityStatus: text('identity_status').notNull().default('none'),
  identityErrorCode: text('identity_error_code'),
  identityCheckedAt: timestamp('identity_checked_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('caregiver_profiles_public_id_uq').on(t.publicId),
  check('rate_range', sql`${t.hourlyRateCents} BETWEEN 1500 AND 20000`),
  check('identity_status_values', sql`${t.identityStatus} IN ('none','requires_input','processing','verified','canceled')`),
  check('payout_status_values', sql`${t.payoutStatus} IN ('none','pending','restricted','active','unsupported')`),
  check('divisions_nonempty', sql`cardinality(${t.divisions}) > 0`),
]);

/**
 * Current status of each vetting step. Changes only through the admin API, which writes a
 * vetting_events row and an audit_log row in the same transaction.
 */
export const vettingRecords = pgTable('vetting_records', {
  caregiverId: fk('caregiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  step: vettingStep('step').notNull(),
  status: stepStatus('status').notNull().default('not_started'),
  updatedBy: fk('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.caregiverId, t.step] })]);

/** Append-only history. `reference_enc` holds provider report ids / notes (restricted: screening.read). */
export const vettingEvents = pgTable('vetting_events', {
  id: id(),
  caregiverId: fk('caregiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  step: vettingStep('step').notNull(),
  fromStatus: stepStatus('from_status').notNull(),
  toStatus: stepStatus('to_status').notNull(),
  actorId: fk('actor_id').notNull().references(() => users.id),
  referenceEnc: text('reference_enc').notNull(),
  createdAt: createdAt(),
}, (t) => [index('vetting_events_caregiver_idx').on(t.caregiverId)]);

/**
 * Compliance register: a service can be booked only while it has an active row here,
 * created by a superadmin with a documented approval reference.
 */
export const serviceActivations = pgTable('service_activations', {
  id: id(),
  division: division('division').notNull(),
  service: text('service').notNull(),
  active: boolean('active').notNull(),
  complianceRef: text('compliance_ref').notNull(),
  approvedBy: fk('approved_by').notNull().references(() => users.id),
  notes: text('notes').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [index('service_activations_lookup_idx').on(t.division, t.service, t.createdAt)]);

/** Children and pets in a client's household. All details encrypted. */
export const dependents = pgTable('dependents', {
  id: id(),
  ownerId: fk('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: dependentKind('kind').notNull(),
  displayNameEnc: text('display_name_enc').notNull(),
  detailsEnc: text('details_enc').notNull(),
  createdAt: createdAt(),
}, (t) => [index('dependents_owner_idx').on(t.ownerId)]);

/** Append-only audit trail. UPDATE/DELETE are blocked by a trigger (migration 0001). */
export const auditLog = pgTable('audit_log', {
  id: id(),
  actorId: fk('actor_id'),
  action: text('action').notNull(),
  target: text('target'),
  meta: jsonb('meta').notNull().default({}),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [index('audit_log_target_idx').on(t.target), index('audit_log_actor_idx').on(t.actorId)]);

/** One-time recovery codes for MFA. Only a SHA-256 hash is stored. */
export const mfaRecoveryCodes = pgTable('mfa_recovery_codes', {
  id: id(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('mfa_recovery_user_idx').on(t.userId)]);

/** Second step of a sign-in with MFA: short-lived, single-use, attempt-limited. Token stored as a hash. */
export const loginChallenges = pgTable('login_challenges', {
  id: id(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('login_challenges_token_uq').on(t.tokenHash)]);

/** Weekly availability windows in market-local time (minutes from midnight; end may be 1440). */
export const caregiverAvailability = pgTable('caregiver_availability', {
  id: id(),
  caregiverId: fk('caregiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
}, (t) => [
  index('caregiver_availability_cg_idx').on(t.caregiverId),
  check('weekday_range', sql`${t.weekday} BETWEEN 0 AND 6`),
  check('minute_range', sql`${t.startMinute} >= 0 AND ${t.endMinute} <= 1440 AND ${t.endMinute} > ${t.startMinute}`),
]);

export const bookingStatus = pgEnum('booking_status', ['requested', 'accepted', 'declined', 'cancelled', 'in_progress', 'completed']);

/**
 * Booking requests. The address, notes and a snapshot of the children/pets are encrypted; the caregiver
 * sees full details only after accepting. Prices are an estimate until payments are connected.
 */
export const bookings = pgTable('bookings', {
  id: id(),
  clientId: fk('client_id').notNull().references(() => users.id),
  caregiverId: fk('caregiver_id').notNull().references(() => users.id),
  division: division('division').notNull(),
  service: text('service').notNull(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  status: bookingStatus('status').notNull().default('requested'),
  addressEnc: text('address_enc').notNull(),
  notesEnc: text('notes_enc'),
  /** JSON snapshot of the dependents at request time (encrypted), so later household edits do not change it. */
  dependentsEnc: text('dependents_enc').notNull(),
  dependentCount: integer('dependent_count').notNull(),
  hourlyRateCents: integer('hourly_rate_cents').notNull(),
  subtotalCents: integer('subtotal_cents').notNull(),
  clientFeeCents: integer('client_fee_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  cancelledBy: fk('cancelled_by').references(() => users.id),
  /** Payment (direct charge on the caregiver's Stripe account, ADR 0003). Amounts in cents. */
  paymentStatus: text('payment_status').notNull().default('none'),
  checkoutSessionId: text('checkout_session_id'),
  paymentIntentId: text('payment_intent_id'),
  applicationFeeCents: integer('application_fee_cents'),
  paidCents: integer('paid_cents').notNull().default(0),
  refundedCents: integer('refunded_cents').notNull().default(0),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index('bookings_caregiver_time_idx').on(t.caregiverId, t.startAt),
  index('bookings_client_idx').on(t.clientId, t.startAt),
  check('booking_time_order', sql`${t.endAt} > ${t.startAt}`),
  check('payment_status_values', sql`${t.paymentStatus} IN ('none','pending','paid','refunded','partially_refunded')`),
  check('refund_not_above_paid', sql`${t.refundedCents} <= ${t.paidCents}`),
]);

/** Processed Stripe webhook event ids, so a redelivered event is never applied twice. */
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
