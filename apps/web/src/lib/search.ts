export interface CaregiverCard {
  id: string; displayName: string; initials: string; headline: string; hourlyRateCents: number;
  yearsExperience: number; languages: string[]; services: string[]; verified: boolean;
}
export interface SearchResponse { division: 'kids' | 'pets'; availableServices: string[]; results: CaregiverCard[] }
export interface PublicProfile {
  id: string; displayName: string; initials: string; headline: string; bio: string; hourlyRateCents: number;
  yearsExperience: number; languages: string[]; divisions: Array<{ division: 'kids' | 'pets'; services: string[] }>;
  verifiedSteps: string[]; memberSince: string;
}
/** Stable, friendly avatar colour per caregiver (brand tints only). */
export const avatarTint = (id: string) => ['#E7BFA0', '#F2D4BC', '#8FAE9D', '#B9CFC2'][parseInt(id.slice(0, 2), 16) % 4];
