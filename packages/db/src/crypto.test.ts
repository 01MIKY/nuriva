import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFieldCipher, parseKeyring } from './crypto.js';

const k = () => randomBytes(32).toString('base64');

describe('field encryption', () => {
  const k1 = k();
  const cipher = createFieldCipher(parseKeyring(`k1:${k1}`));

  it('round-trips and never contains plaintext', () => {
    const enc = cipher.encrypt('Sofía, 4 años — alergia al maní');
    expect(enc).not.toContain('Sofía');
    expect(cipher.decrypt(enc)).toBe('Sofía, 4 años — alergia al maní');
  });
  it('uses a fresh IV each time', () => {
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });
  it('detects tampering', () => {
    const parts = cipher.encrypt('secret').split('.');
    parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });
  it('supports key rotation: new primary encrypts, old key still decrypts', () => {
    const old = cipher.encrypt('legacy');
    const rotated = createFieldCipher(parseKeyring(`k2:${k()},k1:${k1}`));
    expect(rotated.decrypt(old)).toBe('legacy');
    expect(rotated.encrypt('new').startsWith('v1.k2.')).toBe(true);
  });
  it('rejects malformed keys', () => {
    expect(() => parseKeyring('k1:short')).toThrow(/32 bytes/);
    expect(() => parseKeyring(undefined)).toThrow(/not set/);
  });
});
