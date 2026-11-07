import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { sql } from 'drizzle-orm';
import type { Deps } from './lib/context.js';
import { errorHandler } from './lib/errors.js';
import { registerSession } from './plugins/session.js';
import { authRoutes } from './routes/auth.js';
import { caregiverRoutes } from './routes/caregiver.js';
import { adminRoutes } from './routes/admin.js';
import { householdRoutes } from './routes/household.js';
import { mfaRoutes } from './routes/mfa.js';

export async function buildApp(deps: Deps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.config.NURIVA_ENV === 'test' ? false : {
      level: deps.config.strict ? 'info' : 'debug',
      // Never log credentials or session cookies.
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
    trustProxy: deps.config.strict,
    bodyLimit: 256 * 1024,
  });

  // Only JSON bodies are accepted: removes the text/plain parser that would allow "simple" cross-site POSTs.
  app.removeContentTypeParser('text/plain');

  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  app.setErrorHandler(errorHandler);
  registerSession(app, deps);

  app.get('/health', async () => {
    await deps.db.execute(sql`select 1`);
    return { ok: true, env: deps.config.NURIVA_ENV };
  });

  await app.register(async (api) => {
    await authRoutes(api, deps);
    await caregiverRoutes(api, deps);
    await adminRoutes(api, deps);
    await householdRoutes(api, deps);
    await mfaRoutes(api, deps);
  }, { prefix: '/v1' });

  return app;
}
