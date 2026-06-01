import type { CampScoutCoordinate } from './types';

export type CampScoutAreaSelectionMode =
  | 'idle'
  | 'drawing'
  | 'areaReady'
  | 'scanning'
  | 'results'
  | 'error';

export type CampScoutAreaValidationStatus =
  | 'valid'
  | 'too_few_points'
  | 'too_small'
  | 'too_large'
  | 'excessive_candidates';

export type CampScoutAreaValidationOptions = {
  minAreaSquareMiles?: number;
  maxAreaSquareMiles?: number;
  estimatedCandidateCount?: number;
  maxEstimatedCandidates?: number;
};

export type CampScoutAreaValidationResult = {
  ok: boolean;
  status: CampScoutAreaValidationStatus;
  areaSquareMiles: number;
  message: string;
};

export const CAMP_SCOUT_MIN_POLYGON_POINTS = 3;
export const CAMP_SCOUT_MIN_AREA_SQUARE_MILES = 0.01;
export const CAMP_SCOUT_MAX_AREA_SQUARE_MILES = 150;
export const CAMP_SCOUT_MAX_ESTIMATED_CANDIDATES = 20;

const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const formatArea = (areaSquareMiles: number): string => {
  if (areaSquareMiles < 0.1) {
    return `${Math.round(areaSquareMiles * 640)} acres`;
  }

  if (areaSquareMiles < 10) {
    return `${areaSquareMiles.toFixed(1)} sq mi`;
  }

  return `${Math.round(areaSquareMiles)} sq mi`;
};

export const computeCampScoutPolygonAreaSquareMiles = (
  points: CampScoutCoordinate[],
): number => {
  if (points.length < CAMP_SCOUT_MIN_POLYGON_POINTS) {
    return 0;
  }

  const centroidLatitude =
    points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const latitudeScale = EARTH_RADIUS_MILES;
  const longitudeScale = EARTH_RADIUS_MILES * Math.cos(toRadians(centroidLatitude));
  const projectedPoints = points.map((point) => ({
    x: toRadians(point.longitude) * longitudeScale,
    y: toRadians(point.latitude) * latitudeScale,
  }));

  const twiceArea = projectedPoints.reduce((sum, point, index) => {
    const next = projectedPoints[(index + 1) % projectedPoints.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);

  return Math.abs(twiceArea) / 2;
};

export const validateCampScoutArea = (
  points: CampScoutCoordinate[],
  options: CampScoutAreaValidationOptions = {},
): CampScoutAreaValidationResult => {
  const minAreaSquareMiles =
    options.minAreaSquareMiles ?? CAMP_SCOUT_MIN_AREA_SQUARE_MILES;
  const maxAreaSquareMiles =
    options.maxAreaSquareMiles ?? CAMP_SCOUT_MAX_AREA_SQUARE_MILES;
  const maxEstimatedCandidates =
    options.maxEstimatedCandidates ?? CAMP_SCOUT_MAX_ESTIMATED_CANDIDATES;
  const areaSquareMiles = computeCampScoutPolygonAreaSquareMiles(points);

  if (points.length < CAMP_SCOUT_MIN_POLYGON_POINTS) {
    return {
      ok: false,
      status: 'too_few_points',
      areaSquareMiles,
      message: 'Add at least 3 points before closing a Camp Scout area.',
    };
  }

  if (areaSquareMiles < minAreaSquareMiles) {
    return {
      ok: false,
      status: 'too_small',
      areaSquareMiles,
      message: `Camp Scout needs a larger scan area than ${formatArea(
        areaSquareMiles,
      )}. Add a wider boundary before scanning.`,
    };
  }

  if (areaSquareMiles > maxAreaSquareMiles) {
    return {
      ok: false,
      status: 'too_large',
      areaSquareMiles,
      message: `This Camp Scout area is ${formatArea(
        areaSquareMiles,
      )}. Tighten the scan to ${formatArea(maxAreaSquareMiles)} or less.`,
    };
  }

  if (
    typeof options.estimatedCandidateCount === 'number' &&
    options.estimatedCandidateCount > maxEstimatedCandidates
  ) {
    return {
      ok: false,
      status: 'excessive_candidates',
      areaSquareMiles,
      message:
        'This area would produce too many candidate pins. Tighten the scan boundary before scanning.',
    };
  }

  return {
    ok: true,
    status: 'valid',
    areaSquareMiles,
    message: `Camp Scout area ready: ${formatArea(areaSquareMiles)} selected.`,
  };
};

export const canScanCampScoutArea = (
  mode: CampScoutAreaSelectionMode,
  points: CampScoutCoordinate[],
  options: CampScoutAreaValidationOptions = {},
): boolean => {
  if (mode !== 'areaReady' && mode !== 'results') {
    return false;
  }

  return validateCampScoutArea(points, options).ok;
};
