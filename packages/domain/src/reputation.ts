/**
 * Caregiver levels and badges. Computed ONLY from what happened on NURIVA, shown as facts (never as a safety
 * promise), and purely informational: they do not change a caregiver's terms (see docs/COMPLIANCE.md on
 * classification). Thresholds are PLACEHOLDERS for the owner to confirm.
 */
export interface ReputationStats {
  completed: number;
  ratingAvg: number | null;
  ratingCount: number;
  /** Families with two or more completed bookings with this caregiver. */
  repeatFamilies: number;
  /** Visits the caregiver cancelled whose start was in the last 90 days or later. */
  cancellations90d: number;
  /** Median minutes between a request and the caregiver's answer, and how many answers it is based on. */
  medianResponseMinutes: number | null;
  responses: number;
  languages: readonly string[];
}

export type Level = 'new' | 'silver' | 'gold';
export type Requirement = 'completed' | 'rating' | 'reviews' | 'repeatFamilies' | 'reliability';

export const LEVEL_RULES = {
  silver: { completed: 10, rating: 4.5, reviews: 3, repeatFamilies: 0, maxCancellations90d: 1 },
  gold: { completed: 30, rating: 4.7, reviews: 10, repeatFamilies: 3, maxCancellations90d: 0 },
} as const;

export const FAST_RESPONSE_MINUTES = 120;

export function missingFor(level: 'silver' | 'gold', s: ReputationStats): Array<{ key: Requirement; need: number }> {
  const r = LEVEL_RULES[level];
  const out: Array<{ key: Requirement; need: number }> = [];
  if (s.completed < r.completed) out.push({ key: 'completed', need: r.completed - s.completed });
  if (s.ratingCount < r.reviews) out.push({ key: 'reviews', need: r.reviews - s.ratingCount });
  if (s.ratingAvg !== null && s.ratingCount >= r.reviews && s.ratingAvg < r.rating) out.push({ key: 'rating', need: r.rating });
  if (s.repeatFamilies < r.repeatFamilies) out.push({ key: 'repeatFamilies', need: r.repeatFamilies - s.repeatFamilies });
  if (s.cancellations90d > r.maxCancellations90d) out.push({ key: 'reliability', need: r.maxCancellations90d });
  return out;
}

export function caregiverLevel(s: ReputationStats): Level {
  if (missingFor('gold', s).length === 0) return 'gold';
  if (missingFor('silver', s).length === 0) return 'silver';
  return 'new';
}

export function levelProgress(s: ReputationStats) {
  const level = caregiverLevel(s);
  const next = level === 'new' ? 'silver' : level === 'silver' ? 'gold' : null;
  return { level, next, missing: next ? missingFor(next, s) : [] };
}

export type Badge = { key: 'bilingual' } | { key: 'repeatFamilies'; n: number } | { key: 'fastResponse' } | { key: 'noCancellations' };

export function caregiverBadges(s: ReputationStats): Badge[] {
  const out: Badge[] = [];
  if (s.languages.includes('en') && s.languages.includes('es')) out.push({ key: 'bilingual' });
  if (s.repeatFamilies >= 2) out.push({ key: 'repeatFamilies', n: s.repeatFamilies });
  if (s.responses >= 3 && s.medianResponseMinutes !== null && s.medianResponseMinutes <= FAST_RESPONSE_MINUTES) out.push({ key: 'fastResponse' });
  if (s.completed >= 5 && s.cancellations90d === 0) out.push({ key: 'noCancellations' });
  return out;
}
