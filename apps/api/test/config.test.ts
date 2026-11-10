import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = { DATABASE_URL: 'postgres://u:p@db.example.com/x', STRIPE_SECRET_KEY: 'sk_test_placeholder' };

describe('field-encryption keyring configuration', () => {
  it('builds the keyring from one generated key and its id (hosts such as Render)', () => {
    const c = loadConfig({ ...base, NURIVA_ENV: 'staging', NURIVA_DATA_KEY: 'B0jrphAPOY7pg92AN0c9MN4yecczLMdwnx4OkA1KFUk=', NURIVA_DATA_KEY_ID: 'stg1' });
    expect(c.NURIVA_DATA_KEYS).toBe('stg1:B0jrphAPOY7pg92AN0c9MN4yecczLMdwnx4OkA1KFUk=');
  });
  it('prefers an explicit keyring, which is how keys are rotated', () => {
    const c = loadConfig({ ...base, NURIVA_DATA_KEYS: 'k2:new,k1:old', NURIVA_DATA_KEY: 'ignored' });
    expect(c.NURIVA_DATA_KEYS).toBe('k2:new,k1:old');
  });
  it('refuses to start without any key', () => {
    expect(() => loadConfig({ ...base, NURIVA_ENV: 'staging' })).toThrow(/NURIVA_DATA_KEYS/);
  });
  it('rejects an unsafe key id', () => {
    expect(() => loadConfig({ ...base, NURIVA_DATA_KEY: 'x', NURIVA_DATA_KEY_ID: 'a:b' })).toThrow(/NURIVA_DATA_KEY_ID/);
  });
});

describe('proxy trust', () => {
  it('trusts exactly one hop (the web/admin app) by default in every environment', () => {
    for (const NURIVA_ENV of ['development', 'staging', 'production'] as const) {
      expect(loadConfig({ ...base, NURIVA_DATA_KEYS: 'k:x', NURIVA_ENV }).trustedProxyHops).toBe(1);
    }
    expect(loadConfig({ ...base, NURIVA_DATA_KEYS: 'k:x', TRUSTED_PROXY_HOPS: '0' }).trustedProxyHops).toBe(0);
  });
});
