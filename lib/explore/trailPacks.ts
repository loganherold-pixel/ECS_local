import type { ExpeditionOpportunity, RegionGroupId } from '../discoverEngine';
import {
  scoreECSTrailPackConfidence,
  shouldPromoteTrailPackByDefault,
  type ECSTrailPackConfidence,
  type ECSTrailPackConfidenceInput,
} from './trailPackConfidence';
import {
  isTrailPackPubliclyDiscoverable,
  type ECSTrailPackReviewState,
} from './trailPackReviewQueue';

export type ECSTrailPackSource =
  | 'ecs_submitted'
  | 'community_reviewed'
  | 'ecs_validated'
  | 'imported_gpx'
  | 'imported_kml'
  | 'partner_source'
  | 'needs_review';

export type ECSTrailPackRouteType =
  | 'loop'
  | 'out_and_back'
  | 'point_to_point'
  | 'area_pack'
  | 'unknown';

export type ECSTrailPackDifficulty = 'easy' | 'moderate' | 'technical' | 'extreme' | 'unknown';

export type ECSTrailPackReviewStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'needs_more_data';

export type ECSTrailPackCoordinate = {
  latitude: number;
  longitude: number;
};

export type ECSTrailPackRouteGeometry = {
  type: 'LineString' | 'MultiLineString';
  coordinates: number[][] | number[][][];
};

export type ECSTrailPack = {
  id: string;
  name: string;
  description?: string;
  source: ECSTrailPackSource;
  routeType: ECSTrailPackRouteType;
  centerCoordinate: ECSTrailPackCoordinate;
  routeGeometry?: ECSTrailPackRouteGeometry;
  distanceMiles?: number;
  estimatedDurationMinutes?: number;
  difficulty?: ECSTrailPackDifficulty;
  vehicleFit?: string[];
  confidenceScore: number;
  confidenceReasons: string[];
  lastVerifiedAt?: string;
  positiveFeedbackCount?: number;
  negativeFeedbackCount?: number;
  completionCount?: number;
  reviewStatus: ECSTrailPackReviewStatus;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

export type ECSTrailPackDiscoveryItem = ECSTrailPack & {
  distanceFromUserMiles: number;
  evaluatedConfidence: ECSTrailPackConfidence;
};

export type ECSTrailPackDiscoveryOptions = {
  includeOwnDrafts?: boolean;
  ownTrailPackIds?: string[];
  includeBroaderResults?: boolean;
  confidenceInputsByTrailPackId?: Record<string, ECSTrailPackConfidenceInput>;
  reviewStatesByTrailPackId?: Record<string, ECSTrailPackReviewState>;
};

const EARTH_RADIUS_MILES = 3958.7613;
const REGION_GROUP_BY_TAG: Array<[RegExp, RegionGroupId]> = [
  [/(moab|utah|canyonlands)/i, 'utah-canyonlands'],
  [/(tahoe|sierra|california)/i, 'sierra-nevada'],
  [/(colorado|san juan|rocky|rockies|alpine)/i, 'colorado-high-country'],
  [/(appalachian|georgia|carolina|kentucky)/i, 'southern-appalachians'],
  [/(oregon|cascade)/i, 'oregon-cascades'],
  [/(new mexico|gila|highlands)/i, 'new-mexico'],
];

export function getTrailPackSourceLabel(source: ECSTrailPackSource): string {
  switch (source) {
    case 'ecs_submitted':
      return 'ECS Submitted';
    case 'community_reviewed':
      return 'Community Reviewed';
    case 'ecs_validated':
      return 'ECS Validated';
    case 'imported_gpx':
      return 'Imported GPX';
    case 'imported_kml':
      return 'Imported KML';
    case 'partner_source':
      return 'Partner Source';
    case 'needs_review':
      return 'Needs Review';
    default:
      return 'Needs Review';
  }
}

export function getTrailPackRouteTypeLabel(routeType: ECSTrailPackRouteType): string {
  switch (routeType) {
    case 'loop':
      return 'Loop';
    case 'out_and_back':
      return 'Out-and-back';
    case 'point_to_point':
      return 'Point-to-point';
    case 'area_pack':
      return 'Area pack';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

export function getTrailPackDifficultyLabel(difficulty: ECSTrailPackDifficulty | undefined): string {
  switch (difficulty) {
    case 'easy':
      return 'Easy';
    case 'moderate':
      return 'Moderate';
    case 'technical':
      return 'Technical';
    case 'extreme':
      return 'Extreme';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

export function distanceMilesBetween(
  left: ECSTrailPackCoordinate,
  right: ECSTrailPackCoordinate,
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLng = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_MILES * c * 10) / 10;
}

export function getTrailPackGeometryCoordinates(pack: Pick<ECSTrailPack, 'routeGeometry'>): ECSTrailPackCoordinate[] {
  const geometry = pack.routeGeometry;
  if (!geometry) return [];
  const rawCoordinates = geometry.type === 'MultiLineString'
    ? (geometry.coordinates as number[][][]).flat()
    : (geometry.coordinates as number[][]);

  return rawCoordinates
    .map((coordinate) => {
      const [longitude, latitude] = coordinate;
      return { latitude, longitude };
    })
    .filter((coordinate) =>
      Number.isFinite(coordinate.latitude) &&
      Number.isFinite(coordinate.longitude) &&
      Math.abs(coordinate.latitude) <= 90 &&
      Math.abs(coordinate.longitude) <= 180,
    );
}

export function getTrailPackDistanceFromUserMiles(
  pack: ECSTrailPack,
  userCoordinate: ECSTrailPackCoordinate,
): number {
  const geometryCoordinates = getTrailPackGeometryCoordinates(pack);
  const candidateCoordinates = geometryCoordinates.length > 0
    ? geometryCoordinates
    : [pack.centerCoordinate];

  return candidateCoordinates.reduce((nearestDistance, coordinate) => {
    const distance = distanceMilesBetween(userCoordinate, coordinate);
    return Math.min(nearestDistance, distance);
  }, Number.POSITIVE_INFINITY);
}

export function canStartTrailPackGuidance(pack: Pick<ECSTrailPack, 'routeGeometry'>): boolean {
  return getTrailPackGeometryCoordinates(pack).length >= 2;
}

export function getDiscoverableTrailPacks(
  trailPacks: ECSTrailPack[],
  userCoordinate: ECSTrailPackCoordinate,
  radiusMiles: number,
  options: ECSTrailPackDiscoveryOptions = {},
): ECSTrailPackDiscoveryItem[] {
  const ownTrailPackIds = new Set(options.ownTrailPackIds ?? []);

  return trailPacks
    .filter((pack) => {
      const reviewState = options.reviewStatesByTrailPackId?.[pack.id];
      if (isTrailPackPubliclyDiscoverable(pack, reviewState)) return true;
      return !!options.includeOwnDrafts && ownTrailPackIds.has(pack.id);
    })
    .map((pack) => {
      const evaluatedConfidence = scoreECSTrailPackConfidence(
        pack,
        options.confidenceInputsByTrailPackId?.[pack.id],
      );
      return {
        ...pack,
        confidenceScore: evaluatedConfidence.score,
        confidenceReasons: evaluatedConfidence.reasons,
        distanceFromUserMiles: getTrailPackDistanceFromUserMiles(pack, userCoordinate),
        evaluatedConfidence,
      };
    })
    .filter((pack) => {
      if (ownTrailPackIds.has(pack.id)) return true;
      if (options.includeBroaderResults) {
        return pack.evaluatedConfidence.blockers.length === 0 && pack.evaluatedConfidence.band !== 'low';
      }
      return shouldPromoteTrailPackByDefault(pack.evaluatedConfidence);
    })
    .filter((pack) => pack.distanceFromUserMiles <= radiusMiles)
    .sort(compareTrailPacksForDiscovery);
}

export function compareTrailPacksForDiscovery(
  left: ECSTrailPackDiscoveryItem,
  right: ECSTrailPackDiscoveryItem,
): number {
  const confidenceDelta = right.confidenceScore - left.confidenceScore;
  if (confidenceDelta !== 0) return confidenceDelta;

  const distanceDelta = left.distanceFromUserMiles - right.distanceFromUserMiles;
  if (distanceDelta !== 0) return distanceDelta;

  const leftVerified = left.lastVerifiedAt ? Date.parse(left.lastVerifiedAt) : 0;
  const rightVerified = right.lastVerifiedAt ? Date.parse(right.lastVerifiedAt) : 0;
  const verifiedDelta = rightVerified - leftVerified;
  if (verifiedDelta !== 0) return verifiedDelta;

  const leftSignal = (left.positiveFeedbackCount ?? 0) - (left.negativeFeedbackCount ?? 0);
  const rightSignal = (right.positiveFeedbackCount ?? 0) - (right.negativeFeedbackCount ?? 0);
  const signalDelta = rightSignal - leftSignal;
  if (signalDelta !== 0) return signalDelta;

  return left.id.localeCompare(right.id);
}

export function trailPackToExpeditionOpportunity(
  pack: ECSTrailPackDiscoveryItem | ECSTrailPack,
): ExpeditionOpportunity & {
  routeGeometry?: ECSTrailPackRouteGeometry;
  routeMetadata?: Record<string, unknown>;
} {
  const distanceFromUserMiles =
    'distanceFromUserMiles' in pack && Number.isFinite(pack.distanceFromUserMiles)
      ? pack.distanceFromUserMiles
      : undefined;
  const difficulty = pack.difficulty ?? 'unknown';
  const terrainDifficulty =
    difficulty === 'easy' ? 2 :
    difficulty === 'moderate' ? 4 :
    difficulty === 'technical' ? 7 :
    difficulty === 'extreme' ? 9 :
    5;

  return {
    id: `trail-pack:${pack.id}`,
    name: pack.name,
    region: getTrailPackRegionLabel(pack),
    regionGroup: inferTrailPackRegionGroup(pack),
    distanceMiles: pack.distanceMiles ?? 0,
    terrainType: getTrailPackRouteTypeLabel(pack.routeType),
    remotenessScore: Math.max(1, Math.min(10, Math.round(pack.confidenceScore / 10))),
    estimatedFuelRequired: Math.max(1, Math.round((pack.distanceMiles ?? 12) / 12)),
    suggestedCamps: 0,
    rigCompatibility: pack.confidenceScore,
    difficultyRating: getTrailPackDifficultyLabel(difficulty).toUpperCase(),
    description: pack.description ?? 'ECS Trail Pack route collection for Explore preview.',
    highlights: pack.confidenceReasons.length > 0
      ? pack.confidenceReasons.slice(0, 4)
      : ['Approved Trail Pack available for Explore preview.'],
    elevationGainFt: 0,
    estimatedDays: Math.max(1, Math.ceil((pack.estimatedDurationMinutes ?? 180) / 480)),
    bestSeason: 'Verify locally',
    permitRequired: false,
    imageTag: 'trail-pack',
    startLat: pack.centerCoordinate.latitude,
    startLng: pack.centerCoordinate.longitude,
    distanceFromUserMiles,
    terrainDifficulty,
    matchScore: pack.confidenceScore,
    popularityScore: Math.min(100, ((pack.positiveFeedbackCount ?? 0) * 4) + ((pack.completionCount ?? 0) * 2)),
    estimatedTravelHours: pack.estimatedDurationMinutes
      ? Math.round((pack.estimatedDurationMinutes / 60) * 10) / 10
      : undefined,
    hiddenGem: false,
    routeGeometry: pack.routeGeometry,
    routeMetadata: {
      source: 'trail_pack',
      trailPackId: pack.id,
      trailPackSource: pack.source,
      trailPackSourceLabel: getTrailPackSourceLabel(pack.source),
      trailPackRouteType: pack.routeType,
      confidenceScore: pack.confidenceScore,
      reviewStatus: pack.reviewStatus,
    },
  };
}

export function getDefaultECSTrailPacks(): ECSTrailPack[] {
  return DEFAULT_ECS_TRAIL_PACKS;
}

function getTrailPackRegionLabel(pack: ECSTrailPack): string {
  const tagRegion = pack.tags?.find((tag) => /moab|utah|tahoe|sierra|colorado|georgia|oregon|new mexico/i.test(tag));
  if (tagRegion) return tagRegion;
  return getTrailPackSourceLabel(pack.source);
}

function inferTrailPackRegionGroup(pack: ECSTrailPack): RegionGroupId {
  const searchable = [
    pack.name,
    pack.description,
    pack.tags?.join(' '),
    getTrailPackRegionLabel(pack),
  ].filter(Boolean).join(' ');
  const match = REGION_GROUP_BY_TAG.find(([pattern]) => pattern.test(searchable));
  return match?.[1] ?? 'great-basin';
}

const DEFAULT_ECS_TRAIL_PACKS: ECSTrailPack[] = [
  {
    id: 'moab-sand-flats-connector-pack',
    name: 'Sand Flats Connector Pack',
    description: 'ECS-native Trail Pack linking approved Sand Flats connector tracks with moderate vehicle access notes.',
    source: 'ecs_validated',
    routeType: 'area_pack',
    centerCoordinate: { latitude: 38.5733, longitude: -109.5507 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.5872, 38.5899],
        [-109.5662, 38.5782],
        [-109.5388, 38.5644],
        [-109.5141, 38.5586],
      ],
    },
    distanceMiles: 18,
    estimatedDurationMinutes: 210,
    difficulty: 'moderate',
    vehicleFit: ['high-clearance SUV', '4x4 recommended'],
    confidenceScore: 91,
    confidenceReasons: [
      'Validated against ECS route quality checks.',
      'Recent completion signal from ECS users.',
      'Route geometry is available for preview.',
    ],
    lastVerifiedAt: '2026-03-18T00:00:00.000Z',
    positiveFeedbackCount: 22,
    negativeFeedbackCount: 1,
    completionCount: 14,
    reviewStatus: 'approved',
    tags: ['Moab', 'Utah', 'slickrock'],
    createdAt: '2025-11-03T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z',
  },
  {
    id: 'tahoe-forest-loop-pack',
    name: 'Tahoe Forest Loop',
    description: 'Community-reviewed Sierra forest loop with compact Trail Pack guidance and seasonal access caveats.',
    source: 'community_reviewed',
    routeType: 'loop',
    centerCoordinate: { latitude: 39.2585, longitude: -120.1789 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-120.1924, 39.2621],
        [-120.1685, 39.2822],
        [-120.1459, 39.2637],
        [-120.1684, 39.2441],
        [-120.1924, 39.2621],
      ],
    },
    distanceMiles: 37,
    estimatedDurationMinutes: 360,
    difficulty: 'moderate',
    vehicleFit: ['4x4 recommended'],
    confidenceScore: 86,
    confidenceReasons: [
      'Multiple positive community reports.',
      'Loop geometry supports preview before guidance.',
      'Moderate technical rating fits common overland builds.',
    ],
    lastVerifiedAt: '2026-03-20T00:00:00.000Z',
    positiveFeedbackCount: 18,
    negativeFeedbackCount: 2,
    completionCount: 11,
    reviewStatus: 'approved',
    tags: ['Tahoe', 'Sierra', 'forest'],
    createdAt: '2025-10-22T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  },
  {
    id: 'san-juan-alpine-gpx-pack',
    name: 'San Juan Alpine GPX Pack',
    description: 'Imported GPX Trail Pack reviewed by ECS for high-country route confidence.',
    source: 'imported_gpx',
    routeType: 'point_to_point',
    centerCoordinate: { latitude: 37.9216, longitude: -107.6818 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-107.7561, 37.9353],
        [-107.7148, 37.9144],
        [-107.6625, 37.9032],
        [-107.5984, 37.8851],
      ],
    },
    distanceMiles: 24,
    estimatedDurationMinutes: 300,
    difficulty: 'technical',
    vehicleFit: ['high-clearance 4x4', 'low range helpful'],
    confidenceScore: 82,
    confidenceReasons: [
      'Imported GPX includes route geometry.',
      'ECS checks found a strong route identity.',
      'Positive completion signal is present.',
    ],
    lastVerifiedAt: '2026-02-14T00:00:00.000Z',
    positiveFeedbackCount: 9,
    negativeFeedbackCount: 1,
    completionCount: 5,
    reviewStatus: 'approved',
    tags: ['Colorado', 'San Juan', 'alpine'],
    createdAt: '2025-09-18T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
  },
  {
    id: 'north-georgia-ridge-scout',
    name: 'North Georgia Ridge Scout',
    description: 'ECS-submitted out-and-back route awaiting updated geometry before guidance.',
    source: 'ecs_submitted',
    routeType: 'out_and_back',
    centerCoordinate: { latitude: 34.7746, longitude: -83.7891 },
    distanceMiles: 12,
    estimatedDurationMinutes: 150,
    difficulty: 'easy',
    vehicleFit: ['stock SUV'],
    confidenceScore: 73,
    confidenceReasons: [
      'Approved submission with useful route notes.',
      'Moderate confidence until route geometry is refreshed.',
    ],
    lastVerifiedAt: '2026-01-09T00:00:00.000Z',
    positiveFeedbackCount: 7,
    negativeFeedbackCount: 1,
    completionCount: 3,
    reviewStatus: 'approved',
    tags: ['Georgia', 'Appalachian', 'forest'],
    createdAt: '2025-12-02T00:00:00.000Z',
    updatedAt: '2026-01-09T00:00:00.000Z',
  },
  {
    id: 'partner-catalog-placeholder',
    name: 'Partner Catalog Placeholder',
    source: 'partner_source',
    routeType: 'unknown',
    centerCoordinate: { latitude: 38.5733, longitude: -109.5507 },
    confidenceScore: 0,
    confidenceReasons: ['Reserved for future partner route catalogs.'],
    reviewStatus: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
