import type { ChildDetails, EmergencyContact, PetDetails } from '@nuriva/domain';

export type Dependent =
  | { id: number; kind: 'child'; name: string; details: ChildDetails }
  | { id: number; kind: 'pet'; name: string; details: PetDetails };

export interface Household {
  dependents: Dependent[];
  emergencyContact: EmergencyContact | null;
}
