import { z } from 'zod';

/** All availability is expressed in the market's local time. Launch market: Miami. */
export const MARKET_TZ = 'America/New_York';

const HHMM = z.string().regex(/^([01]\d|2[0-3]):(00|30)$/, 'time_half_hour');
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const AvailabilityWindow = z.object({
  weekday: z.number().int().min(0).max(6), // 0 = Sunday
  start: HHMM,
  end: z.union([HHMM, z.literal('24:00')]),
}).strict().refine((w) => toMinutes(w.end) > toMinutes(w.start), { message: 'end_after_start', path: ['end'] });

/** Weekly availability: up to 3 non-overlapping windows per day, 30-minute granularity. */
export const AvailabilityInput = z.object({ windows: z.array(AvailabilityWindow).max(21) }).strict().superRefine((v, ctx) => {
  for (let d = 0; d < 7; d++) {
    const day = v.windows.filter((w) => w.weekday === d).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    if (day.length > 3) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'max_3_per_day', path: ['windows'] });
    for (let i = 1; i < day.length; i++) {
      if (toMinutes(day[i]!.start) < toMinutes(day[i - 1]!.end)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'overlap', path: ['windows'] });
    }
  }
});
export type AvailabilityWindow = z.infer<typeof AvailabilityWindow>;

interface LocalParts { year: number; month: number; day: number; weekday: number; minutes: number }

/** Wall-clock parts of an instant in a time zone. */
export function localParts(d: Date, tz = MARKET_TZ): LocalParts {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday!);
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), weekday, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * Converts a local date + time in `tz` to the exact UTC instant (DST-aware).
 * Nonexistent local times (spring-forward gap) resolve to the following valid instant.
 */
export function zonedToUtc(date: string, time: string, tz = MARKET_TZ): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Invalid date or time');
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const target = Date.UTC(y, mo - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, Math.floor(p.minutes / 60), p.minutes % 60);
    const diff = target - asUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/**
 * True when [start, end) fits inside one availability window on the start's local day.
 * Overnight / multi-day services only need to START inside a window.
 */
export function fitsAvailability(windows: readonly AvailabilityWindow[], start: Date, end: Date, opts: { multiDay: boolean; tz?: string }): boolean {
  const s = localParts(start, opts.tz);
  const e = localParts(end, opts.tz);
  const sameDay = s.year === e.year && s.month === e.month && s.day === e.day;
  const endMin = sameDay ? e.minutes : e.minutes === 0 && end.getTime() - start.getTime() <= 24 * 3600_000 ? 1440 : null;
  return windows.some((w) => {
    if (w.weekday !== s.weekday) return false;
    const ws = toMinutes(w.start);
    const we = toMinutes(w.end);
    if (opts.multiDay) return s.minutes >= ws && s.minutes < we;
    return endMin !== null && s.minutes >= ws && endMin <= we;
  });
}
