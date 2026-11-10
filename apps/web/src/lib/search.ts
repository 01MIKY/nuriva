import type { Badge } from '@nuriva/domain';

/** Public reputation shown on cards and profiles (computed by the API from NURIVA history only). */
export interface PublicReputation { level: 'silver' | 'gold' | null; badges: Badge[]; completed: number }

export interface CaregiverCard extends PublicReputation {
  id: string; displayName: string; initials: string; headline: string; hourlyRateCents: number;
  yearsExperience: number; languages: string[]; services: string[]; verified: boolean;
  rating: { avg: number; count: number } | null;
}
export interface SearchResponse { division: 'kids' | 'pets'; availableServices: string[]; results: CaregiverCard[] }
export interface PublicProfile extends PublicReputation {
  id: string; displayName: string; initials: string; headline: string; bio: string; hourlyRateCents: number;
  yearsExperience: number; languages: string[]; divisions: Array<{ division: 'kids' | 'pets'; services: string[] }>;
  verifiedSteps: string[]; memberSince: string;
  rating: { avg: number; count: number } | null;
  reviews: Array<{ rating: number; comment: string; createdAt: string; author: string }>;
}
/** Stable, friendly avatar colour per caregiver (brand tints only). */
export const avatarTint = (id: string) => ['#E7BFA0', '#F2D4BC', '#8FAE9D', '#B9CFC2'][parseInt(id.slice(0, 2), 16) % 4];
