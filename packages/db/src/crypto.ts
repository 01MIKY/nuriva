import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Field-level encryption (AES-256-GCM) for sensitive data at rest: children's and pets' details,
 * phone numbers, emergency contacts and screening references.
 *
 * Format: `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url parts). The key id allows rotation:
 * new writes use the primary key; old ciphertexts are still readable with retired keys.
 * In production keys come from AWS Secrets Manager / KMS — never from source code.
 */
export interface Keyring {
  primary: string;
  keys: Record<string, Buffer>;
}

/** Parses `NURIVA_DATA_KEYS="k1:<base64 32 bytes>,k0:<base64>"` — first entry is primary. */
export function parseKeyring(spec: string | undefined): Keyring {
  if (!spec) throw new Error('NURIVA_DATA_KEYS is not set');
  const keys: Record<string, Buffer> = {};
  let primary = '';
  for (const part of spec.split(',')) {
    const [kid, b64] = part.trim().split(':');
    if (!kid || !b64 || !/^[a-z0-9_-]+$/i.test(kid)) throw new Error('Malformed NURIVA_DATA_KEYS entry');
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) throw new Error(`Data key "${kid}" must be 32 bytes`);
    keys[kid] = key;
    primary ||= kid;
  }
  return { primary, keys };
}

export function createFieldCipher(ring: Keyring) {
  function encrypt(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', ring.keys[ring.primary]!, iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return ['v1', ring.primary, iv, c.getAuthTag(), ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
  }
  function decrypt(stored: string): string {
    const [v, kid, iv, tag, ct] = stored.split('.');
    if (v !== 'v1' || !kid || !iv || !tag || ct === undefined) throw new Error('Not an encrypted field');
    const key = ring.keys[kid];
    if (!key) throw new Error(`Unknown data key "${kid}"`);
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  }
  return {
    encrypt,
    decrypt,
    encryptOptional: (v: string | null | undefined) => (v ? encrypt(v) : null),
    decryptOptional: (v: string | null | undefined) => (v ? decrypt(v) : null),
    encryptJson: (v: unknown) => encrypt(JSON.stringify(v)),
    decryptJson: <T>(v: string): T => JSON.parse(decrypt(v)) as T,
  };
}
export type FieldCipher = ReturnType<typeof createFieldCipher>;
