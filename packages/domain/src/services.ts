/** Divisions and the services each one offers. Service availability is additionally gated by
 * compliance activation records in the database (see docs/COMPLIANCE.md). */
export const DIVISIONS = ['kids', 'pets'] as const;
export type Division = (typeof DIVISIONS)[number];

export const SERVICES = {
  kids: ['occasional', 'scheduled', 'nanny', 'overnight', 'school_pickup', 'special_needs', 'date_night'],
  pets: ['dog_walking', 'drop_in', 'pet_sitting', 'overnight', 'boarding', 'puppy_care', 'senior_pet_care'],
} as const satisfies Record<Division, readonly string[]>;

export type KidsService = (typeof SERVICES.kids)[number];
export type PetsService = (typeof SERVICES.pets)[number];
export type Service = KidsService | PetsService;

/** Services shorter than one hour are allowed for these. */
export const SHORT_SERVICES: ReadonlySet<Service> = new Set(['dog_walking', 'drop_in']);
/** Services allowed to span more than 24 hours. */
export const MULTI_DAY_SERVICES: ReadonlySet<Service> = new Set(['overnight', 'boarding', 'nanny']);

/**
 * Services that likely need counsel review before activation (licensing, special care, care
 * outside the client's home). This is a design flag, not a legal determination.
 */
export const COUNSEL_REVIEW_SERVICES: ReadonlyArray<{ division: Division; service: Service; reason: string }> = [
  { division: 'kids', service: 'special_needs', reason: 'Special-needs care may require additional qualifications and disclosures.' },
  { division: 'kids', service: 'overnight', reason: 'Overnight childcare raises additional supervision and screening questions.' },
  { division: 'pets', service: 'boarding', reason: 'Boarding at a caregiver home may require local (Miami-Dade) licensing.' },
];

export function isService(division: Division, service: string): service is Service {
  return (SERVICES[division] as readonly string[]).includes(service);
}
