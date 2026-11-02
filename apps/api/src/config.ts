import { z } from 'zod';

/**
 * Environment configuration, validated at startup. Four environments:
 * development (local), test (CI), staging and production. Staging and production refuse to
 * start without real secrets and enforce secure cookies + origin checks.
 */
const Env = z.object({
  NURIVA_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url(),
  NURIVA_DATA_KEYS: z.string().min(1),
  APP_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:3002'),
  TERMS_VERSION: z.string().default('2026-11-draft'),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 7),
});

export type Config = z.infer<typeof Env> & { strict: boolean; origins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${fields}. See .env.example`);
  }
  const c = parsed.data;
  const strict = c.NURIVA_ENV === 'staging' || c.NURIVA_ENV === 'production';
  if (strict && c.DATABASE_URL.includes('local_only')) throw new Error('Development database credentials are not allowed in ' + c.NURIVA_ENV);
  return { ...c, strict, origins: c.APP_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) };
}
