import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export * from './schema.js';
export * from './crypto.js';
export { schema };

export type Db = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10) });
  return { db: drizzle(pool, { schema }), pool };
}
