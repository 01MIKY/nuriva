import { z } from 'zod';

/**
 * Household: the children and pets a client books care for. Data minimisation for children:
 * first name / nickname and age in years only (no birth dates, no photos, no school names).
 * Everything here is stored encrypted at rest and shown to a caregiver only for a booking they accepted.
 */
export const MAX_DEPENDENTS = 12;
export const PET_SPECIES = ['dog', 'cat', 'bird', 'rabbit', 'other'] as const;

const text = (max: number) => z.string().trim().max(max).default('');

export const ChildDetails = z.object({
  ageYears: z.number().int().min(0).max(17),
  allergies: text(500),
  medications: text(500),
  notes: text(1000),
}).strict();

export const PetDetails = z.object({
  species: z.enum(PET_SPECIES),
  breed: text(80),
  ageYears: z.number().int().min(0).max(40),
  medications: text(500),
  notes: text(1000),
}).strict();

const Name = z.string().trim().min(1).max(40);

export const DependentInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('child'), name: Name, details: ChildDetails }).strict(),
  z.object({ kind: z.literal('pet'), name: Name, details: PetDetails }).strict(),
]);
export type DependentInput = z.infer<typeof DependentInput>;
export type ChildDetails = z.infer<typeof ChildDetails>;
export type PetDetails = z.infer<typeof PetDetails>;

export const EmergencyContact = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[+()\d\s.-]{7,25}$/, 'invalid_phone'),
  relationship: z.string().trim().min(2).max(40),
}).strict();
export type EmergencyContact = z.infer<typeof EmergencyContact>;
