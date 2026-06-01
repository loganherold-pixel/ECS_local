import {
  distancePointToRouteMiles,
  haversineDistanceMiles,
} from '../map/routeGeometryUtils';
import type {
  GeoPoint,
  ItineraryDataSource,
  ItineraryRoute,
  ItineraryWaypoint,
  TripBuilderRouteContextInput,
} from './tripBuilderTypes';

export type BailoutRouteConfidenceStatus =
  | 'confirmed'
  | 'likely'
  | 'weak'
  | 'unknown';

export type BailoutAccessEvidenceType =
  | 'road'
  | 'access_route'
  | 'service'
  | 'fuel'
  | 'town'
  | 'ranger_station'
  | 'medical'
  | 'support'
  | 'route_context_bailout'
  | 'unknown';

export type BailoutAccessEvidence = {
  id: string;
  label: string;
  evidenceType: BailoutAccessEvidenceType;
  sourceKind: string;
  source: string | null;
  provider: string | null;
  distanceToWaypointMiles: number | null;
  distanceToServiceMiles: number | null;
  distanceToFuelMiles: number | null;
  distanceToTownMiles: number | null;
  driveTimeToSafetySeconds: number | null;
  reachableByVehicle: boolean | null;
  hasRouteGeometry: boolean;
  isConfirmedAccess: boolean;
  confidenceScore: number;
  evidenceScore: number;
  warnings: string[];
  dataSource: ItineraryDataSource;
  metadata: Record<string, unknown> | null;
};

export type ResolvedBailoutRouteConfidence = {
  appliesToWaypoint: boolean;
  status: BailoutRouteConfidenceStatus;
  bailoutConfidenceScore: number;
  nearestRoadOrAccessDistanceMiles: number | null;
  nearestServiceDistanceMiles: number | null;
  nearestFuelDistanceMiles: number | null;
  nearestTownDistanceMiles: number | null;
  accessEvidence: BailoutAccessEvidence[];
  warnings: string[];
  dataUsed: ItineraryDataSource[];
  metadata: {
    evaluatedEvidenceCount: number;
    confirmedEvidenceCount: number;
    likelyEvidenceCount: number;
    missingTrailGeometry: boolean;
    providerHints: string[];
  };
};

export type ResolveBailoutRouteConfidenceArgs = {
  bailoutWaypoint?: ItineraryWaypoint | null;
  trailRoute?: ItineraryRoute | GeoPoint[] | null;
  knownRoads?: unknown[] | null;
  mapboxData?: unknown;
  supabaseRouteData?: unknown;
  routeContext?: TripBuilderRouteContextInput | null;
};

type EvidenceSourceRecord = {
  record: Record<string, unknown>;
  sourceKind: string;
};

const METERS_PER_MILE = 1609.344;
const PROVIDER_HINTS = [
  'known_roads',
  'mapbox_roads_or_routes',
  'supabase_route_records',
  'route_context_bailout_candidates',
  'service_or_fuel_or_town_records',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(clamp(value) * 100) / 100;
}

function roundDistance(value: number | null): number | null {
  return value == null ? null : Math.round(value * 100) / 100;
}

function metersToMiles(value: number | null): number | null {
  return value == null ? null : value / METERS_PER_MILE;
}

function validPoint(latitude: number | null, longitude: number | null): GeoPoint | null {
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function normalizeCoordinate(value: unknown): GeoPoint | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    const longitude = finiteNumber(value[0]);
    const latitude = finiteNumber(value[1]);
    return validPoint(latitude, longitude);
  }

  if (!isRecord(value)) return null;

  if (Array.isArray(value.center)) return normalizeCoordinate(value.center);
  if (value.type === 'Point' && Array.isArray(value.coordinates)) return normalizeCoordinate(value.coordinates);

  const nested = value.coordinate ?? value.location ?? value.point;
  if (nested && nested !== value) {
    const nestedPoint = normalizeCoordinate(nested);
    if (nestedPoint) return nestedPoint;
  }

  return validPoint(
    finiteNumber(value.latitude ?? value.lat),
    finiteNumber(value.longitude ?? value.lng ?? value.lon),
  );
}

function normalizeGeometry(value: unknown): GeoPoint[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map(normalizeCoordinate)
      .filter((point): point is GeoPoint => point != null);
  }

  if (!isRecord(value)) return [];

  if (value.type === 'LineString' && Array.isArray(value.coordinates)) {
    return normalizeGeometry(value.coordinates);
  }

  if (isRecord(value.geometry)) {
    const geometryPoints = normalizeGeometry(value.geometry);
    if (geometryPoints.length > 0) return geometryPoints;
  }

  for (const key of ['routeGeometry', 'accessRouteGeometry', 'exitRouteGeometry', 'coordinates', 'geometryCoordinates']) {
    const points = normalizeGeometry(value[key]);
    if (points.length > 0) return points;
  }

  return [];
}

function routeGeometryPoints(route?: ItineraryRoute | GeoPoint[] | null): GeoPoint[] {
  if (Array.isArray(route)) return route.filter((point) => point != null);
  const direct = route?.geometry?.filter((point): point is GeoPoint => point != null) ?? [];
  if (direct.length >= 2) return direct;
  return route?.segments
    ?.flatMap((segment) => segment.geometry ?? [])
    .filter((point): point is GeoPoint => point != null) ?? [];
}

function source(
  label: string,
  state: ItineraryDataSource['state'],
  extras: Partial<ItineraryDataSource> = {},
): ItineraryDataSource {
  return { label, state, ...extras };
}

function confidenceNumber(value: unknown): number | null {
  if (isRecord(value)) return confidenceNumber(value.value);
  const numeric = finiteNumber(value);
  if (numeric == null) return null;
  return numeric > 1 ? clamp(numeric / 100) : clamp(numeric);
}

function distanceMilesFromRecord(record: Record<string, unknown>, mileKeys: string[], meterKeys: string[]): number | null {
  for (const key of mileKeys) {
    const value = finiteNumber(record[key]);
    if (value != null) return value;
  }
  for (const key of meterKeys) {
    const value = finiteNumber(record[key]);
    if (value != null) return metersToMiles(value);
  }
  return null;
}

function evidenceType(record: Record<string, unknown>, sourceKind: string): BailoutAccessEvidenceType {
  const text = [
    sourceKind,
    record.category,
    record.type,
    record.kind,
    record.accessType,
    record.label,
    record.name,
    isRecord(record.providerMetadata) ? record.providerMetadata.category : null,
  ].map((item) => String(item ?? '').toLowerCase().replace(/[_-]+/g, ' ')).join(' ');

  if (text.includes('route context bailout')) return 'route_context_bailout';
  if (/\bfuel|gas\b/.test(text)) return 'fuel';
  if (/\btown|city|village\b/.test(text)) return 'town';
  if (/\branger\b/.test(text)) return 'ranger_station';
  if (/\bmedical|hospital|clinic\b/.test(text)) return 'medical';
  if (/\bsupport|repair|service\b/.test(text)) return 'support';
  if (/\baccess route|exit route|bailout route|connector\b/.test(text)) return 'access_route';
  if (/\broad|trailhead|access\b/.test(text)) return 'road';
  if (/\bservice\b/.test(text)) return 'service';
  return 'unknown';
}

function evidenceTypeScore(type: BailoutAccessEvidenceType): number {
  switch (type) {
    case 'access_route':
      return 0.86;
    case 'route_context_bailout':
      return 0.78;
    case 'fuel':
    case 'town':
    case 'ranger_station':
    case 'support':
      return 0.74;
    case 'medical':
      return 0.68;
    case 'service':
      return 0.64;
    case 'road':
      return 0.56;
    default:
      return 0.28;
  }
}

function sourceStateFor(sourceKind: string, record: Record<string, unknown>): ItineraryDataSource['state'] {
  const state = String(record.state ?? record.dataState ?? '').toLowerCase();
  if (state === 'live' || state === 'cached' || state === 'stale' || state === 'manual' || state === 'estimated' || state === 'missing' || state === 'unknown') {
    return state as ItineraryDataSource['state'];
  }
  if (sourceKind === 'operator_manual') return 'manual';
  if (sourceKind === 'known_road' || sourceKind === 'mapbox' || sourceKind === 'supabase' || sourceKind === 'route_context_bailout') return 'cached';
  return 'unknown';
}

function sourceScore(sourceKind: string, record: Record<string, unknown>): number {
  const text = [
    sourceKind,
    record.source,
    record.provider,
    isRecord(record.providerMetadata) ? record.providerMetadata.providerId : null,
  ].map((item) => String(item ?? '').toLowerCase().replace(/[_-]+/g, ' ')).join(' ');

  if (/\bsupabase|ecs supabase\b/.test(text)) return 0.86;
  if (/\bmapbox\b/.test(text)) return 0.74;
  if (/\broute context\b/.test(text)) return 0.68;
  if (/\bknown road|official|agency\b/.test(text)) return 0.66;
  if (/\boperator|manual|user\b/.test(text)) return 0.58;
  return 0.42;
}

function distanceScore(distanceMiles: number | null): number {
  if (distanceMiles == null) return 0.28;
  if (distanceMiles <= 0.1) return 1;
  if (distanceMiles <= 0.5) return 0.84;
  if (distanceMiles <= 2) return 0.62;
  if (distanceMiles <= 5) return 0.38;
  return 0.14;
}

function serviceScore(distanceMiles: number | null): number {
  if (distanceMiles == null) return 0.36;
  if (distanceMiles <= 5) return 0.82;
  if (distanceMiles <= 20) return 0.64;
  if (distanceMiles <= 60) return 0.42;
  return 0.18;
}

function booleanFrom(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const text = value.toLowerCase();
    if (text === 'true' || text === 'yes' || text === 'confirmed') return true;
    if (text === 'false' || text === 'no') return false;
  }
  return null;
}

function confirmedAccess(record: Record<string, unknown>): boolean {
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  const providerMetadata = isRecord(record.providerMetadata) ? record.providerMetadata : {};
  const explicit =
    booleanFrom(record.isConfirmedAccess) ??
    booleanFrom(record.confirmedAccess) ??
    booleanFrom(record.confirmed) ??
    booleanFrom(metadata.isConfirmedAccess) ??
    booleanFrom(metadata.confirmedAccess) ??
    booleanFrom(providerMetadata.isConfirmedAccess) ??
    booleanFrom(providerMetadata.confirmedAccess);
  if (explicit != null) return explicit;
  const status = String(record.accessStatus ?? record.routeStatus ?? providerMetadata.accessStatus ?? '').toLowerCase();
  return status === 'confirmed' || status === 'verified';
}

function reachableByVehicle(record: Record<string, unknown>): boolean | null {
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  const providerMetadata = isRecord(record.providerMetadata) ? record.providerMetadata : {};
  return booleanFrom(record.reachableByVehicle) ??
    booleanFrom(metadata.reachableByVehicle) ??
    booleanFrom(providerMetadata.reachableByVehicle);
}

function driveTimeToSafetySeconds(record: Record<string, unknown>): number | null {
  return finiteNumber(record.driveTimeToSafetySeconds) ??
    finiteNumber(record.driveDurationSeconds) ??
    finiteNumber(record.durationSeconds);
}

function evidenceLabel(record: Record<string, unknown>, type: BailoutAccessEvidenceType): string {
  const value = record.label ?? record.name ?? record.title;
  const text = String(value ?? '').trim();
  if (text) return text;
  if (type === 'road') return 'Known road/access evidence';
  if (type === 'access_route') return 'Known access route evidence';
  if (type === 'route_context_bailout') return 'Route context bailout evidence';
  return 'Bailout access evidence';
}

function evidenceId(record: Record<string, unknown>, sourceKind: string, index: number, coordinate: GeoPoint | null): string {
  const value = record.id ?? record.providerPlaceId;
  if (value != null && String(value).trim()) return String(value);
  if (coordinate) return `${sourceKind}-${coordinate.latitude.toFixed(5)}-${coordinate.longitude.toFixed(5)}`;
  return `${sourceKind}-${index + 1}`;
}

function hasAccessProof(evidence: Pick<BailoutAccessEvidence, 'hasRouteGeometry' | 'reachableByVehicle' | 'driveTimeToSafetySeconds' | 'isConfirmedAccess' | 'evidenceType'>): boolean {
  return evidence.isConfirmedAccess ||
    evidence.hasRouteGeometry ||
    evidence.reachableByVehicle === true ||
    evidence.driveTimeToSafetySeconds != null ||
    evidence.evidenceType === 'fuel' ||
    evidence.evidenceType === 'town' ||
    evidence.evidenceType === 'ranger_station' ||
    evidence.evidenceType === 'support' ||
    evidence.evidenceType === 'medical';
}

function normalizeEvidence(args: {
  waypointCoordinate: GeoPoint;
  item: EvidenceSourceRecord;
  index: number;
}): BailoutAccessEvidence | null {
  const record = args.item.record;
  const type = evidenceType(record, args.item.sourceKind);
  const coordinate = normalizeCoordinate(record.coordinate ?? record.location ?? record.point ?? record);
  const geometry = normalizeGeometry(record.geometry ?? record.routeGeometry ?? record.accessRouteGeometry ?? record.exitRouteGeometry ?? record.coordinates);
  const directDistance = distanceMilesFromRecord(record, [
    'distanceToWaypointMiles',
    'distanceFromWaypointMiles',
    'distanceToBailoutMiles',
    'distanceMiles',
    'distance_miles',
  ], [
    'distanceToWaypointMeters',
    'distanceFromWaypointMeters',
    'distanceToBailoutMeters',
    'distanceMeters',
    'distance_meters',
  ]);
  const geometryDistance = geometry.length >= 2
    ? distancePointToRouteMiles(args.waypointCoordinate, geometry)
    : null;
  const coordinateDistance = coordinate
    ? haversineDistanceMiles(args.waypointCoordinate, coordinate)
    : null;
  const distanceToWaypointMiles = roundDistance(directDistance ?? geometryDistance ?? coordinateDistance);

  if (distanceToWaypointMiles == null && !coordinate && geometry.length < 2) return null;

  const distanceToServiceMiles = roundDistance(distanceMilesFromRecord(record, [
    'distanceToServiceMiles',
    'distanceToServicesMiles',
    'serviceDistanceMiles',
  ], [
    'distanceToServiceMeters',
    'distanceToServicesMeters',
    'serviceDistanceMeters',
  ]));
  const distanceToFuelMiles = roundDistance(distanceMilesFromRecord(record, [
    'distanceToFuelMiles',
    'distanceToFuelStopMiles',
    'fuelDistanceMiles',
  ], [
    'distanceToFuelMeters',
    'distanceToFuelStopMeters',
    'fuelDistanceMeters',
  ]));
  const distanceToTownMiles = roundDistance(distanceMilesFromRecord(record, [
    'distanceToTownMiles',
    'townDistanceMiles',
  ], [
    'distanceToTownMeters',
    'townDistanceMeters',
  ]));
  const sourceValue = String(record.source ?? args.item.sourceKind).trim() || args.item.sourceKind;
  const provider = String(record.provider ?? (isRecord(record.providerMetadata) ? record.providerMetadata.providerId : '') ?? '').trim() || null;
  const dataState = sourceStateFor(args.item.sourceKind, record);
  const recordConfidence = confidenceNumber(record.confidence ?? record.score);
  const isConfirmedAccess = confirmedAccess(record);
  const reachable = reachableByVehicle(record);
  const driveTime = driveTimeToSafetySeconds(record);
  const sourceReliability = sourceScore(args.item.sourceKind, record);
  const serviceDistanceScore = Math.max(
    serviceScore(distanceToServiceMiles),
    serviceScore(distanceToFuelMiles),
    serviceScore(distanceToTownMiles),
  );
  let evidenceScore = roundScore(
    distanceScore(distanceToWaypointMiles) * 0.24 +
      sourceReliability * 0.2 +
      evidenceTypeScore(type) * 0.18 +
      (recordConfidence ?? 0.48) * 0.14 +
      (geometry.length >= 2 ? 0.78 : 0.34) * 0.1 +
      (reachable === true ? 0.82 : reachable === false ? 0.18 : 0.42) * 0.08 +
      serviceDistanceScore * 0.06,
  );
  const evidenceWarnings: string[] = [];

  if (!hasAccessProof({
    hasRouteGeometry: geometry.length >= 2,
    reachableByVehicle: reachable,
    driveTimeToSafetySeconds: driveTime,
    isConfirmedAccess,
    evidenceType: type,
  })) {
    evidenceScore = Math.min(evidenceScore, 0.48);
    evidenceWarnings.push('Evidence is a nearby road/access hint but does not confirm bailout reachability.');
  }
  if (reachable === false) {
    evidenceScore = Math.min(evidenceScore, 0.32);
    evidenceWarnings.push('Evidence says this access is not reachable by vehicle.');
  }
  if (isConfirmedAccess) {
    evidenceScore = Math.max(evidenceScore, 0.78);
  }
  if (recordConfidence != null && recordConfidence < 0.5) {
    evidenceWarnings.push('Bailout access evidence confidence is low.');
  }

  return {
    id: evidenceId(record, args.item.sourceKind, args.index, coordinate),
    label: evidenceLabel(record, type),
    evidenceType: type,
    sourceKind: args.item.sourceKind,
    source: sourceValue,
    provider,
    distanceToWaypointMiles,
    distanceToServiceMiles,
    distanceToFuelMiles,
    distanceToTownMiles,
    driveTimeToSafetySeconds: driveTime,
    reachableByVehicle: reachable,
    hasRouteGeometry: geometry.length >= 2,
    isConfirmedAccess,
    confidenceScore: roundScore(recordConfidence ?? sourceReliability),
    evidenceScore: roundScore(evidenceScore),
    warnings: evidenceWarnings,
    dataSource: source('bailout_route_confidence', dataState, {
      source: sourceValue,
      provider,
      confidence: recordConfidence ?? sourceReliability,
    }),
    metadata: {
      sourceKind: args.item.sourceKind,
      providerMetadata: isRecord(record.providerMetadata) ? record.providerMetadata : null,
      rawMetadata: isRecord(record.metadata) ? record.metadata : null,
    },
  };
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

function evidenceFromUnknown(input: unknown, sourceKind: string): EvidenceSourceRecord[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .filter(isRecord)
      .map((record) => ({ record, sourceKind }));
  }
  if (!isRecord(input)) return [];

  const records: EvidenceSourceRecord[] = [];
  const keys = [
    'knownRoads',
    'roads',
    'accessRoutes',
    'access_routes',
    'bailoutRoutes',
    'bailout_routes',
    'exitRoutes',
    'exit_routes',
    'routes',
    'features',
    'records',
    'routeRecords',
    'services',
    'serviceAreas',
    'fuelStops',
    'fuel',
    'towns',
  ];

  keys.forEach((key) => {
    objectArray(input[key]).forEach((record) => {
      if (key === 'features' && isRecord(record.properties)) {
        records.push({
          record: {
            ...record.properties,
            geometry: record.geometry,
          },
          sourceKind,
        });
      } else {
        records.push({ record, sourceKind });
      }
    });
  });

  if (
    normalizeCoordinate(input) ||
    normalizeGeometry(input).length >= 2 ||
    input.distanceToWaypointMiles != null ||
    input.distanceToWaypointMeters != null
  ) {
    records.push({ record: input, sourceKind });
  }

  return records;
}

function routeContextEvidence(routeContext?: TripBuilderRouteContextInput | null): EvidenceSourceRecord[] {
  return (routeContext?.bailoutCandidates ?? []).map((candidate) => ({
    sourceKind: 'route_context_bailout',
    record: {
      ...candidate,
      type: candidate.category ?? 'route_context_bailout',
      label: candidate.label ?? candidate.name ?? 'Route context bailout candidate',
      coordinate: candidate.coordinate ?? (
        candidate.lat != null && candidate.lng != null
          ? { latitude: candidate.lat, longitude: candidate.lng }
          : null
      ),
      source: candidate.source ?? 'route_context_engine',
      distanceToWaypointMeters: 0,
    } as Record<string, unknown>,
  }));
}

function allEvidenceRecords(args: ResolveBailoutRouteConfidenceArgs): EvidenceSourceRecord[] {
  return [
    ...evidenceFromUnknown(args.knownRoads ?? [], 'known_road'),
    ...evidenceFromUnknown(args.mapboxData, 'mapbox'),
    ...evidenceFromUnknown(args.supabaseRouteData, 'supabase'),
    ...routeContextEvidence(args.routeContext),
  ];
}

function dedupeEvidence(evidence: BailoutAccessEvidence[]): BailoutAccessEvidence[] {
  const seen = new Set<string>();
  const unique: BailoutAccessEvidence[] = [];
  evidence.forEach((item) => {
    const key = `${item.sourceKind}:${item.id}:${item.distanceToWaypointMiles ?? 'unknown'}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  });
  return unique.sort((left, right) => right.evidenceScore - left.evidenceScore);
}

function minDistance(evidence: BailoutAccessEvidence[], predicate: (item: BailoutAccessEvidence) => boolean, selector: (item: BailoutAccessEvidence) => number | null): number | null {
  const values = evidence
    .filter(predicate)
    .map(selector)
    .filter((value): value is number => value != null);
  return values.length > 0 ? Math.min(...values) : null;
}

function dedupeDataSources(sources: ItineraryDataSource[]): ItineraryDataSource[] {
  const seen = new Set<string>();
  return sources.filter((item) => {
    const key = `${item.label}:${item.state}:${item.source ?? ''}:${item.provider ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveStatus(evidence: BailoutAccessEvidence[]): BailoutRouteConfidenceStatus {
  if (evidence.length === 0) return 'unknown';
  const best = evidence[0];
  const confirmed = evidence.some((item) => (
    item.isConfirmedAccess &&
    item.evidenceScore >= 0.72 &&
    hasAccessProof(item)
  ));
  if (confirmed) return 'confirmed';
  const likely = best.evidenceScore >= 0.58 && hasAccessProof(best);
  if (likely) return 'likely';
  return 'weak';
}

function overallScore(status: BailoutRouteConfidenceStatus, evidence: BailoutAccessEvidence[]): number {
  if (status === 'unknown' || evidence.length === 0) return 0;
  const best = evidence[0]?.evidenceScore ?? 0;
  const support = evidence.slice(1, 3).reduce((sum, item) => sum + item.evidenceScore, 0) / 10;
  const raw = Math.min(1, best + support);
  if (status === 'confirmed') return Math.max(0.78, raw);
  if (status === 'likely') return Math.min(0.77, Math.max(0.52, raw));
  return Math.min(0.49, Math.max(0.2, raw));
}

function baseUnknownResult(args: {
  appliesToWaypoint: boolean;
  warning: string;
  evidenceCount?: number;
  missingTrailGeometry?: boolean;
}): ResolvedBailoutRouteConfidence {
  return {
    appliesToWaypoint: args.appliesToWaypoint,
    status: 'unknown',
    bailoutConfidenceScore: 0,
    nearestRoadOrAccessDistanceMiles: null,
    nearestServiceDistanceMiles: null,
    nearestFuelDistanceMiles: null,
    nearestTownDistanceMiles: null,
    accessEvidence: [],
    warnings: [args.warning],
    dataUsed: [source('bailout_route_confidence', 'missing', {
      notes: [args.warning],
    })],
    metadata: {
      evaluatedEvidenceCount: args.evidenceCount ?? 0,
      confirmedEvidenceCount: 0,
      likelyEvidenceCount: 0,
      missingTrailGeometry: args.missingTrailGeometry ?? false,
      providerHints: PROVIDER_HINTS,
    },
  };
}

export function resolveBailoutRouteConfidence({
  bailoutWaypoint = null,
  trailRoute = null,
  knownRoads = null,
  mapboxData = null,
  supabaseRouteData = null,
  routeContext = null,
}: ResolveBailoutRouteConfidenceArgs): ResolvedBailoutRouteConfidence {
  const routeGeometry = routeGeometryPoints(trailRoute);
  const evidenceRecords = allEvidenceRecords({
    bailoutWaypoint,
    trailRoute,
    knownRoads,
    mapboxData,
    supabaseRouteData,
    routeContext,
  });

  if (!bailoutWaypoint) {
    return baseUnknownResult({
      appliesToWaypoint: false,
      warning: 'No bailout waypoint was supplied; bailout route confidence was not evaluated.',
      evidenceCount: evidenceRecords.length,
      missingTrailGeometry: routeGeometry.length < 2,
    });
  }

  if (bailoutWaypoint.type !== 'bailout' && bailoutWaypoint.type !== 'turnaround') {
    return baseUnknownResult({
      appliesToWaypoint: false,
      warning: 'Bailout route confidence only applies to bailout or turnaround waypoints.',
      evidenceCount: evidenceRecords.length,
      missingTrailGeometry: routeGeometry.length < 2,
    });
  }

  if (!bailoutWaypoint.coordinate) {
    return baseUnknownResult({
      appliesToWaypoint: true,
      warning: 'Bailout waypoint coordinate is unavailable; access confidence cannot be evaluated.',
      evidenceCount: evidenceRecords.length,
      missingTrailGeometry: routeGeometry.length < 2,
    });
  }

  const evidence = dedupeEvidence(
    evidenceRecords
      .map((item, index) => normalizeEvidence({
        waypointCoordinate: bailoutWaypoint.coordinate as GeoPoint,
        item,
        index,
      }))
      .filter((item): item is BailoutAccessEvidence => item != null),
  );

  if (evidence.length === 0) {
    const warnings = [
      'No road, access route, service, town, fuel, or route-context evidence was available for this bailout waypoint.',
    ];
    if (routeGeometry.length < 2) {
      warnings.push('Trail route geometry is unavailable; ECS did not infer bailout access from route shape.');
    }
    return {
      ...baseUnknownResult({
        appliesToWaypoint: true,
        warning: warnings[0],
        evidenceCount: evidenceRecords.length,
        missingTrailGeometry: routeGeometry.length < 2,
      }),
      warnings,
      dataUsed: [source('bailout_route_confidence', 'missing', { notes: warnings })],
    };
  }

  const status = resolveStatus(evidence);
  const missingTrailGeometry = routeGeometry.length < 2;
  const warnings: string[] = evidence.flatMap((item) => item.warnings);

  if (missingTrailGeometry) {
    warnings.push('Trail route geometry is unavailable; bailout confidence used access evidence only.');
  }
  if (status === 'unknown') {
    warnings.push('Bailout route access is unknown; ECS did not infer an exit route.');
  } else if (status === 'weak') {
    warnings.push('Bailout access evidence is weak or unconfirmed; verify before relying on it.');
  } else if (status === 'likely') {
    warnings.push('Bailout access appears plausible but is not confirmed by explicit access evidence.');
  } else if (status === 'confirmed') {
    warnings.push('Bailout access has confirming evidence, but field conditions and legality still require verification.');
  }

  const roadOrAccessTypes = new Set<BailoutAccessEvidenceType>(['road', 'access_route', 'route_context_bailout']);
  const confirmedEvidenceCount = evidence.filter((item) => item.isConfirmedAccess).length;
  const likelyEvidenceCount = evidence.filter((item) => item.evidenceScore >= 0.58 && hasAccessProof(item)).length;

  return {
    appliesToWaypoint: true,
    status,
    bailoutConfidenceScore: roundScore(overallScore(status, evidence)),
    nearestRoadOrAccessDistanceMiles: roundDistance(minDistance(
      evidence,
      (item) => roadOrAccessTypes.has(item.evidenceType),
      (item) => item.distanceToWaypointMiles,
    )),
    nearestServiceDistanceMiles: roundDistance(minDistance(
      evidence,
      (item) => item.distanceToServiceMiles != null ||
        item.evidenceType === 'service' ||
        item.evidenceType === 'support' ||
        item.evidenceType === 'ranger_station' ||
        item.evidenceType === 'medical',
      (item) => item.distanceToServiceMiles ?? item.distanceToWaypointMiles,
    )),
    nearestFuelDistanceMiles: roundDistance(minDistance(
      evidence,
      (item) => item.distanceToFuelMiles != null || item.evidenceType === 'fuel',
      (item) => item.distanceToFuelMiles ?? item.distanceToWaypointMiles,
    )),
    nearestTownDistanceMiles: roundDistance(minDistance(
      evidence,
      (item) => item.distanceToTownMiles != null || item.evidenceType === 'town',
      (item) => item.distanceToTownMiles ?? item.distanceToWaypointMiles,
    )),
    accessEvidence: evidence,
    warnings: Array.from(new Set(warnings)),
    dataUsed: dedupeDataSources(evidence.map((item) => item.dataSource)),
    metadata: {
      evaluatedEvidenceCount: evidenceRecords.length,
      confirmedEvidenceCount,
      likelyEvidenceCount,
      missingTrailGeometry,
      providerHints: PROVIDER_HINTS,
    },
  };
}
