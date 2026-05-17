import type { CampScoutCandidate } from '../campScout';
import type {
  DispersedCampingConfidence,
  DispersedCampingLandManager,
  DispersedCampingRegion,
} from '../map/dispersedCampingTypes';
import type { RouteNearbyDispersedCampingRegion } from '../map/dispersedCampingRouteSearch';
import type { RouteCoordinate } from '../map/routeGeometryUtils';

export const ECS_INFERRED_CAMP_CANDIDATE_TITLE = 'ECS-Inferred Camp Candidate';
export const ECS_INFERRED_CAMP_CANDIDATE_WARNING =
  'This is an ECS-inferred candidate, not a confirmed legal campsite. Verify local rules, closures, fire restrictions, permits, road access, and posted signs before camping.';

export type DispersedCampingCandidateGenerationInput = {
  regions: DispersedCampingRegion[];
  routeNearbyRegions?: RouteNearbyDispersedCampingRegion[];
  routeCoordinates?: readonly RouteCoordinate[] | null;
  currentLocation?: RouteCoordinate;
  maxCandidates?: number;
  includeVerifyCandidates?: boolean;
};

export type DispersedCampingEligibilityCandidateAssessment = {
  accepted: boolean;
  regionId: string;
  confidence: DispersedCampingConfidence;
  landManager: DispersedCampingLandManager;
  eligibilityScore: number;
  hardBlockReason?: string;
  warnings: string[];
};

export type DispersedCampingCandidateGenerationResult = {
  candidates: CampScoutCandidate[];
  rejectedRegionIds: string[];
  warnings: string[];
  generatedAt: string;
};
