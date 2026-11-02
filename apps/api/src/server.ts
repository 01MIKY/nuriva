import { createDb, createFieldCipher, parseKeyring } from '@nuriva/db';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const cipher = createFieldCipher(parseKeyring(config.NURIVA_DATA_KEYS));
const app = await buildApp({ config, db, cipher });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.PORT, host: '0.0.0.0' });
