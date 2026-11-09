import { z } from 'zod';
import { DIVISIONS, SERVICES, type Division } from './services.js';
import { POLICY } from './pricing.js';

export const LANGUAGES = ['en', 'es', 'pt', 'fr', 'ht', 'it', 'de', 'zh', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];

export const servicesFor = (divisions: readonly Division[]): string[] =>
  [...new Set(divisions.flatMap((d) => SERVICES[d] as readonly string[]))];

/** What a caregiver can edit about themselves. Vetting and approval are never part of this. */
export const CaregiverProfileInput = z.object({
  divisions: z.array(z.enum(DIVISIONS)).min(1).max(2),
  headline: z.string().trim().min(10).max(120),
  bio: z.string().trim().min(50).max(2000),
  hourlyRateCents: z.number().int().min(POLICY.minHourlyRateCents).max(POLICY.maxHourlyRateCents),
  yearsExperience: z.number().int().min(0).max(60),
  languages: z.array(z.enum(LANGUAGES)).min(1).max(LANGUAGES.length),
  services: z.array(z.string()).min(1).max(20),
  zip: z.string().trim().regex(/^\d{5}$/, 'invalid_zip'),
}).strict().superRefine((p, ctx) => {
  const allowed = servicesFor(p.divisions);
  p.services.forEach((s, i) => {
    if (!allowed.includes(s)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['services', i], message: 'service_not_in_division' });
  });
});
export type CaregiverProfileInput = z.infer<typeof CaregiverProfileInput>;

export interface CaregiverProfileView {
  divisions: Division[];
  headline: string;
  bio: string;
  hourlyRateCents: number;
  yearsExperience: number;
  languages: string[];
  services: string[];
  zip: string | null;
}

/** Fields still missing before NURIVA can review the application. */
export function profileGaps(p: CaregiverProfileView): Array<'headline' | 'bio' | 'services' | 'languages' | 'zip'> {
  const gaps: Array<'headline' | 'bio' | 'services' | 'languages' | 'zip'> = [];
  if (p.headline.trim().length < 10) gaps.push('headline');
  if (p.bio.trim().length < 50) gaps.push('bio');
  if (p.services.length === 0) gaps.push('services');
  if (p.languages.length === 0) gaps.push('languages');
  if (!p.zip) gaps.push('zip');
  return gaps;
}

/**
 * Public display name: first word + initial of the second word ("Valentina Ríos Gómez" → "Valentina R.").
 * Uses the first surname, as is customary for Spanish names. Full names are never public.
 * Known limitation: compound given names ("Mary Ann Smith" → "Mary A."); a caregiver-chosen display name is a follow-up.
 */
export function publicName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const second = parts[1];
  return second ? `${first} ${second[0]!.toUpperCase()}.` : first;
}

export const initialsOf = (fullName: string) =>
  fullName.trim().split(/\s+/).filter(Boolean).map((p) => p[0]!.toUpperCase()).slice(0, 2).join('');
