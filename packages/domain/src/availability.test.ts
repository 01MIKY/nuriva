import { describe, expect, it } from 'vitest';
import { AvailabilityInput, fitsAvailability, localParts, zonedToUtc } from './index.js';

describe('time zones (Miami)', () => {
  it('converts local Miami time to UTC across daylight-saving changes', () => {
    expect(zonedToUtc('2026-07-15', '18:00').toISOString()).toBe('2026-07-15T22:00:00.000Z'); // EDT, UTC-4
    expect(zonedToUtc('2026-11-14', '18:00').toISOString()).toBe('2026-11-14T23:00:00.000Z'); // EST, UTC-5
    expect(zonedToUtc('2026-11-01', '01:30').toISOString()).toBe('2026-11-01T05:30:00.000Z'); // ambiguous hour → first occurrence
    expect(zonedToUtc('2026-03-08', '02:30').toISOString()).toBe('2026-03-08T07:30:00.000Z'); // nonexistent → next valid instant
  });
  it('reads local weekday and minutes', () => {
    expect(localParts(new Date('2026-11-14T23:00:00Z'))).toMatchObject({ weekday: 6, minutes: 18 * 60 }); // Saturday 18:00
  });
});

describe('availability', () => {
  const sat = [{ weekday: 6, start: '17:00', end: '23:00' }];
  it('validates windows strictly', () => {
    expect(AvailabilityInput.safeParse({ windows: sat }).success).toBe(true);
    expect(AvailabilityInput.safeParse({ windows: [{ weekday: 6, start: '17:15', end: '23:00' }] }).success).toBe(false);
    expect(AvailabilityInput.safeParse({ windows: [{ weekday: 6, start: '20:00', end: '18:00' }] }).success).toBe(false);
    expect(AvailabilityInput.safeParse({ windows: [...sat, { weekday: 6, start: '22:00', end: '23:30' }] }).success).toBe(false);
    expect(AvailabilityInput.safeParse({ windows: [{ weekday: 1, start: '00:00', end: '24:00' }] }).success).toBe(true);
  });
  it('accepts a booking inside a window and rejects one outside it', () => {
    const s = zonedToUtc('2026-11-14', '18:00');
    expect(fitsAvailability(sat, s, zonedToUtc('2026-11-14', '22:00'), { multiDay: false })).toBe(true);
    expect(fitsAvailability(sat, s, zonedToUtc('2026-11-14', '23:30'), { multiDay: false })).toBe(false);
    expect(fitsAvailability(sat, zonedToUtc('2026-11-13', '18:00'), zonedToUtc('2026-11-13', '20:00'), { multiDay: false })).toBe(false);
  });
  it('lets overnight services start inside a window and finish the next day', () => {
    expect(fitsAvailability(sat, zonedToUtc('2026-11-14', '21:00'), zonedToUtc('2026-11-15', '08:00'), { multiDay: true })).toBe(true);
    expect(fitsAvailability(sat, zonedToUtc('2026-11-14', '21:00'), zonedToUtc('2026-11-15', '08:00'), { multiDay: false })).toBe(false);
  });
  it('allows a window that ends at midnight', () => {
    const late = [{ weekday: 6, start: '20:00', end: '24:00' }];
    expect(fitsAvailability(late, zonedToUtc('2026-11-14', '20:00'), zonedToUtc('2026-11-15', '00:00'), { multiDay: false })).toBe(true);
  });
});
