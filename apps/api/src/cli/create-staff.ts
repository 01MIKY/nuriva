/**
 * Creates a NURIVA staff (admin) account. This is the ONLY way to create admins: there is no
 * self-registration and no API endpoint for it.
 *
 *   pnpm --filter @nuriva/api create-staff --email ops@nuriva.com --name "Ops Lead" --roles superadmin
 *
 * A strong random password is generated and printed once. The person must change it and enrol MFA
 * on first sign-in (MFA is required for staff in staging and production).
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { sql } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { createDb, users, staffRoleAssignments, auditLog } from '@nuriva/db';
import { STAFF_ROLES, type StaffRole } from '@nuriva/domain';

export async function createStaff(databaseUrl: string, input: { email: string; name: string; roles: StaffRole[] }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Invalid email');
  if (input.name.trim().length < 2) throw new Error('Name is required');
  if (!input.roles.length || input.roles.some((r) => !STAFF_ROLES.includes(r))) {
    throw new Error(`Roles must be a comma-separated list of: ${STAFF_ROLES.join(', ')}`);
  }
  const password = randomBytes(18).toString('base64url');
  const { db, pool } = createDb(databaseUrl);
  try {
    const existing = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (existing.length) throw new Error('An account with this email already exists');
    const id = await db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({
        email, name: input.name.trim(), role: 'admin', passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
        termsAcceptedAt: new Date(), termsVersion: 'staff',
      }).returning({ id: users.id });
      await tx.insert(staffRoleAssignments).values(input.roles.map((role) => ({ userId: u!.id, role })));
      await tx.insert(auditLog).values({ actorId: null, action: 'staff.create', target: `user:${u!.id}`, meta: { roles: input.roles, via: 'cli' } });
      return u!.id;
    });
    return { id, email, password };
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, roles: { type: 'string' } } });
  const url = process.env.DATABASE_URL;
  if (!url || !values.email || !values.name || !values.roles) {
    console.error('Usage: DATABASE_URL=... create-staff --email <email> --name "<name>" --roles superadmin[,trust_safety,...]');
    process.exit(1);
  }
  try {
    const r = await createStaff(url, { email: values.email, name: values.name, roles: values.roles.split(',').map((x) => x.trim()) as StaffRole[] });
    console.log(`Staff account created: ${r.email} (id ${r.id})`);
    console.log(`Temporary password (shown once): ${r.password}`);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}
