/**
 * Role-based access control. Account roles separate the three applications; admin users additionally
 * hold staff roles that grant least-privilege permissions inside the admin dashboard.
 */
export const ACCOUNT_ROLES = ['client', 'caregiver', 'admin'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const STAFF_ROLES = ['superadmin', 'operations', 'trust_safety', 'finance', 'support'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  'caregivers.read',
  'caregivers.vetting.write',
  'screening.read', // background-screening records — restricted
  'clients.read',
  'bookings.read',
  'bookings.manage',
  'payments.read',
  'payments.refund',
  'incidents.manage',
  'reviews.moderate',
  'compliance.activate_service',
  'staff.manage',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<StaffRole, readonly Permission[]> = {
  superadmin: PERMISSIONS,
  operations: ['caregivers.read', 'caregivers.vetting.write', 'clients.read', 'bookings.read', 'bookings.manage'],
  trust_safety: ['caregivers.read', 'caregivers.vetting.write', 'screening.read', 'clients.read', 'bookings.read', 'incidents.manage', 'reviews.moderate', 'audit.read'],
  finance: ['bookings.read', 'payments.read', 'payments.refund'],
  support: ['caregivers.read', 'clients.read', 'bookings.read'],
};

export function hasPermission(staffRoles: readonly StaffRole[], perm: Permission): boolean {
  return staffRoles.some((r) => GRANTS[r].includes(perm));
}
