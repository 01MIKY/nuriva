/**
 * Weekly bookings ("same caregiver, same time, every week"): a family requests N weekly visits at once.
 * Each visit is an ordinary booking (own status, check-in, payment and cancellation); the series only groups them.
 */
export const SERIES_MIN_WEEKS = 2;
export const SERIES_MAX_WEEKS = 12;

/** The local calendar dates of `weeks` weekly visits starting on `date` (YYYY-MM-DD). */
export function weeklyDates(date: string, weeks: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date');
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > SERIES_MAX_WEEKS) throw new Error('Invalid number of weeks');
  const base = new Date(`${date}T12:00:00Z`);
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + 7 * i);
    return d.toISOString().slice(0, 10);
  });
}
