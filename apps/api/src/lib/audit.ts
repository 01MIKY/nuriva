import { auditLog, type Db } from '@nuriva/db';
import type { FastifyRequest } from 'fastify';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Records a security-relevant action. Never put secrets, passwords, tokens or plaintext sensitive
 * fields in `meta`. Pass the transaction handle so the audit row commits atomically with the change.
 */
export async function audit(
  db: Db | Tx,
  req: FastifyRequest | null,
  action: string,
  target: string | null,
  meta: Record<string, unknown> = {},
  actorId: number | null = req?.user?.id ?? null,
): Promise<void> {
  await db.insert(auditLog).values({ actorId, action, target, meta, ip: req?.ip ?? null });
}
