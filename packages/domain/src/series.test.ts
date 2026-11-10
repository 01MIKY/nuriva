import { describe, expect, it } from 'vitest';
import { weeklyDates, zonedToUtc } from './index.js';

describe('weekly booking dates', () => {
  it('repeats the same weekday, across month and year boundaries', () => {
    expect(weeklyDates('2026-12-17', 4)).toEqual(['2026-12-17', '2026-12-24', '2026-12-31', '2027-01-07']);
    expect(weeklyDates('2026-11-10', 1)).toEqual(['2026-11-10']);
  });
  it('keeps the Miami wall-clock time across the DST change', () => {
    const [a, b] = weeklyDates('2027-03-11', 2).map((d) => zonedToUtc(d, '18:00'));
    expect(a!.toISOString()).toBe('2027-03-11T23:00:00.000Z'); // EST
    expect(b!.toISOString()).toBe('2027-03-18T22:00:00.000Z'); // EDT, still 18:00 local
  });
  it('rejects invalid input', () => {
    expect(() => weeklyDates('11/10/2026', 2)).toThrow();
    expect(() => weeklyDates('2026-11-10', 13)).toThrow();
    expect(() => weeklyDates('2026-11-10', 0)).toThrow();
  });
});
