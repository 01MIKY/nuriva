import 'server-only';
import { redirect } from 'next/navigation';
import { hasPermission, type Permission } from '@nuriva/domain';
import type { Locale } from '@nuriva/i18n';
import { apiGet, type Me } from './server-api';

export type Staff = NonNullable<Me['user']>;

/** Returns the signed-in staff member, or redirects to sign-in. Non-staff accounts get the no-access page. */
export async function requireStaff(locale: Locale): Promise<Staff> {
  const me = await apiGet<Me>('/v1/auth/me', locale);
  const user = me.body?.user;
  if (!user) redirect(`/${locale}/login`);
  if (user.role !== 'admin') redirect(`/${locale}/no-access`);
  return user;
}

export const can = (staff: Staff, perm: Permission) => hasPermission(staff.staffRoles, perm);

/** UI guard only — the API enforces the same permission on every request. */
export async function requirePermission(locale: Locale, perm: Permission): Promise<Staff> {
  const staff = await requireStaff(locale);
  if (!can(staff, perm)) redirect(`/${locale}/caregivers`);
  return staff;
}
