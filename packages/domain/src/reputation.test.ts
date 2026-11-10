import { describe, expect, it } from 'vitest';
import { caregiverBadges, caregiverLevel, levelProgress, type ReputationStats } from './index.js';

const base: ReputationStats = { completed: 0, ratingAvg: null, ratingCount: 0, repeatFamilies: 0, cancellations90d: 0, medianResponseMinutes: null, responses: 0, languages: ['es'] };
const st = (o: Partial<ReputationStats>) => ({ ...base, ...o });

describe('caregiver levels', () => {
  it('starts at the initial level and lists what is missing for Silver', () => {
    expect(levelProgress(st({ completed: 3, ratingAvg: 5, ratingCount: 1 }))).toEqual({
      level: 'new', next: 'silver', missing: [{ key: 'completed', need: 7 }, { key: 'reviews', need: 2 }],
    });
  });
  it('reaches Silver and then Gold only with every requirement met', () => {
    const silver = st({ completed: 10, ratingAvg: 4.6, ratingCount: 3, cancellations90d: 1 });
    expect(caregiverLevel(silver)).toBe('silver');
    expect(caregiverLevel({ ...silver, ratingAvg: 4.4 })).toBe('new');
    expect(caregiverLevel({ ...silver, cancellations90d: 2 })).toBe('new');
    const gold = st({ completed: 30, ratingAvg: 4.8, ratingCount: 12, repeatFamilies: 3 });
    expect(levelProgress(gold)).toEqual({ level: 'gold', next: null, missing: [] });
    expect(levelProgress({ ...gold, repeatFamilies: 1, cancellations90d: 1 })).toEqual({
      level: 'silver', next: 'gold', missing: [{ key: 'repeatFamilies', need: 2 }, { key: 'reliability', need: 0 }],
    });
    expect(levelProgress({ ...gold, ratingAvg: 4.6 }).missing).toEqual([{ key: 'rating', need: 4.7 }]);
  });
});

describe('caregiver badges', () => {
  it('shows only facts backed by enough history', () => {
    expect(caregiverBadges(base)).toEqual([]);
    expect(caregiverBadges(st({ languages: ['en', 'es'], repeatFamilies: 2, responses: 3, medianResponseMinutes: 45, completed: 5 }))).toEqual([
      { key: 'bilingual' }, { key: 'repeatFamilies', n: 2 }, { key: 'fastResponse' }, { key: 'noCancellations' },
    ]);
    expect(caregiverBadges(st({ responses: 2, medianResponseMinutes: 10 }))).toEqual([]); // too few answers
    expect(caregiverBadges(st({ completed: 8, cancellations90d: 1 }))).toEqual([]);
  });
});
