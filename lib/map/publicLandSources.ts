import type {
  DispersedCampingLandManager,
  GeoJSON,
} from './dispersedCampingTypes';

export type PublicLandEligibilitySourceRecord = {
  id: string;
  name?: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  landManager: DispersedCampingLandManager;
  designation?: string;
  accessType?: string;
  hasMvumAccessNearby?: boolean;
  knownClosure?: boolean;
  permitRequired?: boolean;
  fireRestriction?: boolean;
  privateOrTribal?: boolean;
  militaryOrRestricted?: boolean;
  nationalParkOrMonument?: boolean;
  sourceNames: string[];
  source?: string;
  sourceProvider?: string;
  sourceUpdatedAt?: string;
};

export const PUBLIC_LAND_SOURCE_NAMES = {
  blm: 'BLM/PAD-US-style public land polygon',
  usfs: 'USFS/MVUM-style access polygon',
  padUs: 'PAD-US-style protected-area boundary',
  padUsManagerName: 'USGS PAD-US Manager Name FeatureServer',
  local: 'Local agency access dataset',
  demo: 'ECS demo eligibility sample',
} as const;

export function normalizeDispersedCampingLandManager(
  value: unknown,
): DispersedCampingLandManager {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized.includes('BUREAU OF LAND MANAGEMENT') || normalized === 'BLM') return 'BLM';
  if (normalized.includes('FOREST SERVICE') || normalized === 'USFS') return 'USFS';
  if (normalized.includes('NATIONAL PARK') || normalized === 'NPS') return 'NPS';
  if (normalized.includes('STATE')) return 'STATE';
  if (normalized.includes('PRIVATE')) return 'PRIVATE';
  if (normalized.includes('TRIBAL') || normalized.includes('TRIBE')) return 'TRIBAL';
  if (normalized.includes('MILITARY') || normalized.includes('DOD')) return 'MILITARY';
  if (normalized.includes('COUNTY') || normalized.includes('CITY') || normalized.includes('LOCAL')) return 'LOCAL';
  return 'UNKNOWN';
}
