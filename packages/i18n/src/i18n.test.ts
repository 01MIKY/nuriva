import { describe, expect, it } from 'vitest';
import { SERVICES, BOOKING_STATUSES, VETTING_STEPS } from '@nuriva/domain';
import { catalogs, t, negotiateLocale, formatMoney, type MessageKey } from './index.js';

function flatten(obj: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[prefix + k] = v;
    else Object.assign(out, flatten(v as object, `${prefix}${k}.`));
  }
  return out;
}
const en = flatten(catalogs.en);
const es = flatten(catalogs.es);
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('translation parity (no untranslated screens)', () => {
  it('has the same keys in English and Spanish', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
  it('has no empty strings', () => {
    for (const [k, v] of Object.entries({ ...en, ...es })) expect(v.trim(), k).not.toBe('');
  });
  it('keeps the same placeholders in both languages', () => {
    for (const k of Object.keys(en)) expect(placeholders(es[k]!), k).toEqual(placeholders(en[k]!));
  });
  it('translates every domain service, booking status and vetting step', () => {
    for (const s of [...SERVICES.kids, ...SERVICES.pets]) expect(en[`services.${s}`], s).toBeDefined();
    for (const s of BOOKING_STATUSES) expect(en[`bookingStatus.${s}`], s).toBeDefined();
    for (const s of VETTING_STEPS) expect(en[`vetting.steps.${s}`], s).toBeDefined();
  });
  it('flags Spanish strings identical to English for review (brand names excepted)', () => {
    const allowed = new Set(['brand.name', 'divisions.kids', 'divisions.pets', 'web.nav.kids', 'web.nav.pets', 'web.home.kidsTitle', 'web.home.petsTitle', 'admin.title', 'admin.roles.superadmin', 'admin.roles.trust_safety']);
    const same = Object.keys(en).filter((k) => !allowed.has(k) && en[k] === es[k]);
    expect(same).toEqual([]);
  });
});

describe('helpers', () => {
  it('interpolates', () => {
    expect(t('es', 'common.perHour', { amount: '$28' })).toBe('$28/hora');
  });
  it('throws on unknown keys', () => {
    expect(() => t('en', 'nope.missing' as MessageKey)).toThrow(/Missing translation/);
  });
  it('negotiates locale', () => {
    expect(negotiateLocale('es-US,es;q=0.9,en;q=0.8')).toBe('es');
    expect(negotiateLocale('fr-FR')).toBe('en');
    expect(negotiateLocale(undefined)).toBe('en');
  });
  it('formats USD', () => {
    expect(formatMoney('en', 2800)).toBe('$28.00');
    expect(formatMoney('es', 2800)).toContain('28.00');
  });
});
