import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, totp, verifyTotp, newRecoveryCodes, otpauthUrl } from '../src/lib/totp.js';

// RFC 6238 Appendix B test vectors (SHA-1, secret "12345678901234567890", 8 digits)
const RFC_SECRET = Buffer.from('12345678901234567890');
const VECTORS: Array<[number, string]> = [
  [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
  [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
];

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    for (const [t, code] of VECTORS) expect(totp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(code);
  });
  it('round-trips base32 (RFC 4648 vector)', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
  });
  it('accepts the current code and ±30s drift, rejects older codes and junk', () => {
    const b32 = base32Encode(RFC_SECRET);
    const now = 1111111111 * 1000;
    const step = Math.floor(1111111111 / 30);
    const code = totp(RFC_SECRET, step);
    expect(verifyTotp(b32, code, now)).toBe(step);
    expect(verifyTotp(b32, code, now + 30_000)).toBe(step);
    expect(verifyTotp(b32, code, now + 90_000)).toBeNull();
    expect(verifyTotp(b32, '12345', now)).toBeNull();
    expect(verifyTotp(b32, 'abcdef', now)).toBeNull();
  });
  it('generates unique recovery codes and a valid otpauth URL', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(otpauthUrl('ABC', 'ana@example.com')).toBe('otpauth://totp/NURIVA%3Aana%40example.com?secret=ABC&issuer=NURIVA&algorithm=SHA1&digits=6&period=30');
  });
});
