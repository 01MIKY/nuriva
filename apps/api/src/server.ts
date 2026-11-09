import { createDb, createFieldCipher, parseKeyring } from '@nuriva/db';
import { createFakePaymentsProvider, createStripeProvider } from '@nuriva/integrations';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const cipher = createFieldCipher(parseKeyring(config.NURIVA_DATA_KEYS));
const payments = config.paymentsProvider === 'stripe'
  ? createStripeProvider({ secretKey: config.STRIPE_SECRET_KEY!, v2Version: config.STRIPE_API_VERSION_V2 })
  : createFakePaymentsProvider().provider;
const app = await buildApp({ config, db, cipher, payments });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.PORT, host: '0.0.0.0' });
