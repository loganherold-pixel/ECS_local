import { haversineDistanceMiles } from '../map/routeGeometryUtils';
import { nearestPointOnRoute } from '../routeContext/routeContextGeometry';
import type {
  GeoPoint,
  ItineraryDataSource,
  ItineraryPreTrailProviderState,
  ItineraryPreTrailStopBucket,
  ItineraryPreTrailStopSearchSummary,
  ItineraryPreTrailStops,
  ItineraryRoute,
  ItineraryStop,
  ItineraryWaypoint,
  ResupplyPoint,
  TrailheadStartCandidate,
  TripBuilderConfidence,
  TripBuilderRouteContextInput,
  TripBuilderVehicleProfile,
  WaypointType,
} from './tripBuilderTypes';
import {
  APPROACH_RESUPPLY_POLICY,
  classifyApproachResupplyRoutePosition,
  type ApproachResupplyRoutePosition,
} from './approachResupplyPlanner';
import { resupplyPlaceIdentityFromMetadata } from './resupplyPlaceIdentity';
import { ITINERARY_PRE_TRAIL_STOP_BUCKETS } from './tripBuilderTypes';

export type PreTrailStopBucket = ItineraryPreTrailStopBucket;

export type SelectedPreTrailOption =
  | ItineraryStop
  | ItineraryWaypoint
  | {
      id?: string | null;
      title?: string | null;
      name?: string | null;
      label?: string | null;
      coordinate?: unknown;
      location?: unknown;
      point?: unknown;
      latitude?: number | null;
      longitude?: number | null;
      lat?: number | null;
      lng?: number | null;
      lon?: number | null;
      source?: string | null;
      confidence?: TripBuilderConfidence | number | null;
      notes?: string[] | null;
      metadata?: Record<string, unknown> | null;
    };

export type PreTrailStopCandidate =
  | SelectedPreTrailOption
  | ResupplyPoint
  | NonNullable<TripBuilderRouteContextInput['supplyCandidates']>[number]
  | {
      id?: string | null;
      providerPlaceId?: string | null;
      title?: string | null;
      name?: string | null;
      label?: string | null;
      category?: string | null;
      type?: string | null;
      waypointType?: string | null;
      ecsWaypointType?: string | null;
      coordinate?: unknown;
      location?: unknown;
      point?: unknown;
      latitude?: number | null;
      longitude?: number | null;
      lat?: number | null;
      lng?: number | null;
      lon?: number | null;
      address?: string | null;
      distanceToTrailheadMeters?: number | null;
      distanceFromTrailheadMiles?: number | null;
      driveDistanceToTrailheadMeters?: number | null;
      driveDurationToTrailheadSeconds?: number | null;
      detourDistanceMeters?: number | null;
      detourDurationSeconds?: number | null;
      accessStatus?: 'accessible' | 'inaccessible' | 'unknown' | string | null;
      distanceFromRouteMiles?: number | null;
      distanceFromStartMiles?: number | null;
      distanceFromEndMiles?: number | null;
      routeMileMarker?: number | null;
      openStatus?: string | null;
      businessStatus?: string | null;
      confidence?: TripBuilderConfidence | number | { value?: number | null; reasons?: string[] } | null;
      reliability?: TripBuilderConfidence | number | null;
      score?: number | null;
      rating?: number | null;
      source?: string | null;
      provider?: string | null;
      notes?: string[] | null;
      warnings?: unknown[] | null;
      providerMetadata?: Record<string, unknown> | null;
      metadata?: Record<string, unknown> | null;
      raw?: unknown;
    };

export type PreTrailStopCandidateInput =
  | PreTrailStopCandidate[]
  | Partial<Record<PreTrailStopBucket, PreTrailStopCandidate[] | null>>;

export type PreTrailRankingAnchorBasis =
  | 'trailhead_start'
  | 'approach_route_end_fallback'
  | 'unavailable';

export type RankedPreTrailCandidate = {
  bucket: PreTrailStopBucket;
  stop: ItineraryStop;
  score: number;
  rank: number;
  distanceFromTrailheadMiles: number | null;
  distanceFromResupplyAnchorMiles?: number | null;
  resupplyAnchorStopId?: string | null;
  routeDeviationMiles: number | null;
  detourDistanceMiles: number | null;
  beforeTrailEntry: boolean | null;
  approachRoutePosition: ApproachResupplyRoutePosition;
  source: ItineraryDataSource;
};

export type RankPreTrailStopsArgs = {
  candidates?: PreTrailStopCandidateInput | null;
  trailheadStart?: ItineraryWaypoint | TrailheadStartCandidate | GeoPoint | null;
  approachRoute?: ItineraryRoute | GeoPoint[] | null;
  selectedPreTrailOptions?: Partial<Record<PreTrailStopBucket, SelectedPreTrailOption[] | null>> | null;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  userPreferences?: Record<string, unknown> | null;
  providerAvailable?: boolean | null;
  providerStates?: Partial<Record<PreTrailStopBucket, ItineraryPreTrailProviderState>> | null;
  routeId?: string | null;
  generatedAt?: string;
  maxStopsPerBucket?: number | null;
};

export type RankPreTrailStopsResult = {
  preTrailStops: ItineraryPreTrailStops;
  bucketSummaries: ItineraryPreTrailStopSearchSummary[];
  rankedCandidates: RankedPreTrailCandidate[];
  anchorCoordinate: GeoPoint | null;
  anchorBasis: PreTrailRankingAnchorBasis;
  providerAvailable: boolean;
  providerStates: Record<PreTrailStopBucket, ItineraryPreTrailProviderState>;
  dataUsed: ItineraryDataSource[];
  warnings: string[];
};

export type ResolvePreTrailStopsArgs = {
  trailheadStart?: ItineraryWaypoint | TrailheadStartCandidate | GeoPoint | null;
  approachRoute?: ItineraryRoute | GeoPoint[] | null;
  candidates?: PreTrailStopCandidateInput | null;
  providerAvailable?: boolean | null;
  providerStates?: Partial<Record<PreTrailStopBucket, ItineraryPreTrailProviderState>> | null;
  selectedPreTrailOptions?: Partial<Record<PreTrailStopBucket, SelectedPreTrailOption[] | null>> | null;
  userPreferences?: Record<string, unknown> | null;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  routeContext?: TripBuilderRouteContextInput | null;
  routeId?: string | null;
  generatedAt?: string;
};

export type ResolvedPreTrailStops = {
  preTrailStops: ItineraryPreTrailStops;
  bucketSummaries: ItineraryPreTrailStopSearchSummary[];
  anchorCoordinate: GeoPoint | null;
  dataUsed: ItineraryDataSource[];
  warnings: string[];
};

const DEFAULT_PRE_TRAIL_SEARCH_RADIUS_MILES = 60;

export type PreTrailProviderRequestStatus =
  | 'idle'
  | 'deferred'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error';

export function preTrailProviderStateFromRequestStatus(
  status: PreTrailProviderRequestStatus,
): ItineraryPreTrailProviderState {
  if (status === 'ready') return 'ready';
  if (status === 'empty') return 'empty';
  if (status === 'error') return 'error';
  return 'pending';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'string' ? Number(value) : value;
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : null;
}

function confidenceNumber(value: unknown): number | null {
  if (isRecord(value)) return finiteNumber(value.value);
  const numeric = finiteNumber(value);
  if (numeric == null) return null;
  return numeric > 1 ? Math.min(1, numeric / 100) : Math.max(0, numeric);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundTenths(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10;
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

  const latitude = finiteNumber(value.latitude ?? value.lat);
  const longitude = finiteNumber(value.longitude ?? value.lng ?? value.lon);
  const point = validPoint(latitude, longitude);
  if (!point) return null;

  const elevationFeet = finiteNumber(value.elevationFeet);
  const elevationMeters = finiteNumber(value.elevationMeters);
  const accuracyMeters = finiteNumber(value.accuracyMeters);
  return {
    ...point,
    ...(elevationFeet != null ? { elevationFeet } : {}),
    ...(elevationMeters != null ? { elevationMeters } : {}),
    ...(accuracyMeters != null ? { accuracyMeters } : {}),
    ...(typeof value.source === 'string' || isRecord(value.source) ? { source: value.source as GeoPoint['source'] } : {}),
  };
}

function source(label: string, state: ItineraryDataSource['state'], extras: Partial<ItineraryDataSource> = {}): ItineraryDataSource {
  return {
    label,
    state,
    ...extras,
  };
}

function normalizeConfidence(value: unknown, fallback: TripBuilderConfidence): TripBuilderConfidence {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'unknown') return value;
  const numeric = confidenceNumber(value);
  if (numeric == null) return fallback;
  if (numeric >= 0.78) return 'high';
  if (numeric >= 0.5) return 'medium';
  if (numeric > 0) return 'low';
  return fallback;
}

function waypointTitle(record: Record<string, unknown>, fallback: string): string {
  const value = record.title ?? record.name ?? record.label ?? fallback;
  const text = String(value ?? '').trim();
  return text || fallback;
}

function bucketType(bucket: PreTrailStopBucket): WaypointType {
  if (bucket === 'generalSupply') return 'supply';
  return bucket;
}

function emptyPreTrailStops(): ItineraryPreTrailStops {
  return {
    fuel: [],
    grocery: [],
    water: [],
    generalSupply: [],
  };
}

function trailheadAnchor(value: ResolvePreTrailStopsArgs['trailheadStart']): GeoPoint | null {
  if (!value) return null;
  if (isRecord(value) && 'coordinate' in value) return normalizeCoordinate(value.coordinate);
  return normalizeCoordinate(value);
}

function routeContextCandidateCount(
  routeContext: TripBuilderRouteContextInput | null | undefined,
  bucket: PreTrailStopBucket,
): number | null {
  if (!routeContext) return null;
  const detailedCandidates = routeContext.supplyCandidates ?? [];
  if (detailedCandidates.length > 0) {
    return detailedCandidates.filter((candidate) => (
      isRecord(candidate) && candidateBucket(candidate as Record<string, unknown>) === bucket
    )).length;
  }
  const mode = String(routeContext.supplyMode ?? '').toLowerCase();
  const count = finiteNumber(routeContext.supplyCandidateCount);
  if (count == null) return null;
  if (bucket === 'fuel' && (mode === 'gas' || mode === 'gas_and_grocery')) return count;
  if ((bucket === 'grocery' || bucket === 'generalSupply') && (mode === 'grocery' || mode === 'gas_and_grocery')) return count;
  return null;
}

function userPreferenceText(userPreferences: Record<string, unknown> | null | undefined, key: string): string {
  return String(userPreferences?.[key] ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function userPreferenceDisabled(userPreferences: Record<string, unknown> | null | undefined, key: string): boolean {
  const value = userPreferences?.[key];
  return value === false || userPreferenceText(userPreferences, key) === 'false' || userPreferenceText(userPreferences, key) === 'no';
}

function preTrailBucketRequested(
  bucket: PreTrailStopBucket,
  userPreferences: Record<string, unknown> | null | undefined,
): boolean {
  if (!userPreferences) return true;

  const preference =
    userPreferenceText(userPreferences, 'smartResupplyPreference') ||
    userPreferenceText(userPreferences, 'smart_resupply_preference') ||
    userPreferenceText(userPreferences, 'preTrailPoiPreference');

  if (preference === 'no' || preference === 'none' || preference === 'disabled' || preference === 'not_requested') {
    return false;
  }

  if (bucket === 'fuel') {
    if (userPreferenceDisabled(userPreferences, 'refuelEnabled') || userPreferenceDisabled(userPreferences, 'fuelEnabled')) {
      return false;
    }
    return true;
  }

  if (bucket === 'water') {
    return false;
  }

  if (
    userPreferenceDisabled(userPreferences, 'resupplyEnabled') ||
    userPreferenceDisabled(userPreferences, 'suppliesEnabled')
  ) {
    return false;
  }

  if (preference === 'fuel_only' || preference === 'fuel' || preference === 'refuel_only') {
    return false;
  }

  return true;
}

function stopDistanceFromTrailheadMiles(anchor: GeoPoint | null, coordinate: GeoPoint | null): number | null {
  if (!anchor || !coordinate) return null;
  return Math.round(haversineDistanceMiles(anchor, coordinate) * 10) / 10;
}

function metersToMiles(value: unknown): number | null {
  const meters = finiteNumber(value);
  return meters == null ? null : roundTenths(meters / 1609.344);
}

function approachRouteCoordinates(value: RankPreTrailStopsArgs['approachRoute']): GeoPoint[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(normalizeCoordinate).filter((point): point is GeoPoint => point != null);
  }
  const routeRecord = value as ItineraryRoute;
  const geometry = Array.isArray(routeRecord.geometry)
    ? routeRecord.geometry
    : routeRecord.segments.flatMap((segment) => segment.geometry ?? []);
  return geometry.map(normalizeCoordinate).filter((point): point is GeoPoint => point != null);
}

function rankingAnchor(args: {
  trailheadStart?: RankPreTrailStopsArgs['trailheadStart'];
  approachRoute?: RankPreTrailStopsArgs['approachRoute'];
}): { anchor: GeoPoint | null; basis: PreTrailRankingAnchorBasis; warnings: string[] } {
  const explicitAnchor = trailheadAnchor(args.trailheadStart);
  if (explicitAnchor) {
    return { anchor: explicitAnchor, basis: 'trailhead_start', warnings: [] };
  }

  const approachPoints = approachRouteCoordinates(args.approachRoute);
  const fallback = approachPoints[approachPoints.length - 1] ?? null;
  if (fallback) {
    return {
      anchor: fallback,
      basis: 'approach_route_end_fallback',
      warnings: ['Trailhead start is unavailable; pre-trail ranking used the approach route endpoint as a low-confidence anchor.'],
    };
  }

  return {
    anchor: null,
    basis: 'unavailable',
    warnings: ['Trailhead start is unavailable, so pre-trail stops cannot be ranked relative to trail entry.'],
  };
}

function candidateEntries(
  candidates: PreTrailStopCandidateInput | null | undefined,
): Array<{ candidate: PreTrailStopCandidate; bucketHint: PreTrailStopBucket | null }> {
  if (!candidates) return [];
  if (Array.isArray(candidates)) {
    return candidates.map((candidate) => ({ candidate, bucketHint: null }));
  }
  return ITINERARY_PRE_TRAIL_STOP_BUCKETS.flatMap((bucket) => (
    (candidates[bucket] ?? []).map((candidate) => ({ candidate, bucketHint: bucket }))
  ));
}

function routeContextCandidates(
  routeContext: TripBuilderRouteContextInput | null | undefined,
): PreTrailStopCandidate[] {
  const candidates = routeContext?.supplyCandidates ?? [];
  if (routeContext?.status !== 'stale') return candidates;
  return candidates.map((candidate) => (
    isRecord(candidate)
      ? {
          ...candidate,
          source: 'stale_route_context_engine',
        }
      : candidate
  ));
}

function mergeCandidateInputWithRouteContext(
  candidates: PreTrailStopCandidateInput | null | undefined,
  routeContext: TripBuilderRouteContextInput | null | undefined,
): PreTrailStopCandidateInput | null {
  const contextCandidates = routeContextCandidates(routeContext);
  if (contextCandidates.length === 0) return candidates ?? null;
  if (!candidates) return contextCandidates;
  if (Array.isArray(candidates)) return [...candidates, ...contextCandidates];

  const merged: Partial<Record<PreTrailStopBucket, PreTrailStopCandidate[] | null>> = {};
  ITINERARY_PRE_TRAIL_STOP_BUCKETS.forEach((bucket) => {
    const bucketCandidates = candidates[bucket] ?? [];
    if (bucketCandidates.length > 0) merged[bucket] = [...bucketCandidates];
  });

  contextCandidates.forEach((candidate) => {
    if (!isRecord(candidate)) return;
    const bucket = candidateBucket(candidate as Record<string, unknown>);
    if (!bucket) return;
    merged[bucket] = [...(merged[bucket] ?? []), candidate];
  });

  return merged;
}

function candidateBucket(record: Record<string, unknown>, hint?: PreTrailStopBucket | null): PreTrailStopBucket | null {
  if (hint) return hint;
  const raw = [
    record.category,
    record.type,
    record.waypointType,
    record.ecsWaypointType,
    record.sourceType,
    isRecord(record.metadata) ? record.metadata.preTrailStopBucket : null,
    isRecord(record.providerMetadata) ? record.providerMetadata.searchCategory : null,
    isRecord(record.providerMetadata) ? record.providerMetadata.sourceCategory : null,
  ].map((value) => String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')).filter(Boolean);
  const text = [
    ...raw,
    record.name,
    record.title,
    record.label,
    record.address,
  ].map((value) => String(value ?? '').toLowerCase()).join(' ');

  if (raw.some((value) => value === 'fuel' || value === 'gas') || /\b(gas|fuel|diesel|truck_stop|travel_center)\b/.test(text)) {
    return 'fuel';
  }
  if (raw.some((value) => value === 'grocery') || /\b(grocery|grocer|market|supermarket|food)\b/.test(text)) {
    return 'grocery';
  }
  if (raw.some((value) => value === 'water') || /\b(water|refill|potable)\b/.test(text)) {
    return 'water';
  }
  if (raw.some((value) => value === 'supply' || value === 'supplies' || value === 'general_supply' || value === 'food_supplies') ||
      /\b(supply|supplies|hardware|outfitter|outdoor|general_store)\b/.test(text)) {
    return raw.includes('food_supplies') ? 'grocery' : 'generalSupply';
  }
  return null;
}

function candidateProvider(record: Record<string, unknown>): string | null {
  const providerMetadata = isRecord(record.providerMetadata) ? record.providerMetadata : null;
  const metadata = isRecord(record.metadata) ? record.metadata : null;
  const value =
    record.provider ??
    providerMetadata?.providerId ??
    providerMetadata?.source ??
    metadata?.provider ??
    null;
  const text = String(value ?? '').trim();
  return text || null;
}

function candidateSourceText(record: Record<string, unknown>, fallback: string): string {
  const provider = candidateProvider(record);
  const sourceValue = record.source ?? record.sourceType ?? provider ?? fallback;
  const text = String(sourceValue ?? '').trim();
  return text || fallback;
}

function candidateSource(record: Record<string, unknown>, bucket: PreTrailStopBucket): ItineraryDataSource {
  const provider = candidateProvider(record);
  const sourceValue = candidateSourceText(record, bucket);
  const providerMetadata = isRecord(record.providerMetadata) ? record.providerMetadata : null;
  const metadata = isRecord(record.metadata) ? record.metadata : null;
  const sourceHints = [
    sourceValue,
    provider,
    providerMetadata?.source,
    providerMetadata?.sourceType,
    providerMetadata?.providerId,
    metadata?.source,
    metadata?.sourceType,
  ].map((value) => String(value ?? '')).join(' ');
  const manual = /operator|manual|selected/i.test(sourceHints);
  const demo = /demo|fixture|mock/i.test(sourceHints);
  const stale = /stale/i.test(sourceHints);
  const live = /mapbox_search|google_places|live/i.test(sourceHints);
  const state: ItineraryDataSource['state'] =
    manual ? 'manual' :
    demo ? 'mock' :
    stale ? 'stale' :
    live ? 'live' :
    'cached';
  return source('ranked_pre_trail_candidate', state, {
    provider,
    source: sourceValue,
    confidence: (confidenceNumber(record.confidence) ?? record.confidence) as ItineraryDataSource['confidence'],
  });
}

function categoryMatchQuality(record: Record<string, unknown>, bucket: PreTrailStopBucket): number {
  const providerMetadata = isRecord(record.providerMetadata) ? record.providerMetadata : null;
  const metadata = isRecord(record.metadata) ? record.metadata : null;
  const direct =
    finiteNumber(record.categoryMatchQuality) ??
    finiteNumber(providerMetadata?.categoryMatchQuality) ??
    finiteNumber(metadata?.categoryMatchQuality);
  if (direct != null) return clampScore(direct > 1 ? direct / 100 : direct);
  return candidateBucket(record) === bucket ? 1 : 0.58;
}

function normalizedOpenStatus(record: Record<string, unknown>): string {
  const raw = String(record.openStatus ?? record.businessStatus ?? '').trim().toLowerCase();
  if (raw === 'open' || raw === 'operational') return 'open';
  if (raw === 'closed') return 'closed';
  if (raw === 'temporarily_closed' || raw === 'temporary_closed') return 'temporarily_closed';
  return raw || 'unknown';
}

function openStatusScore(status: string): number {
  if (status === 'open') return 1;
  if (status === 'closed') return 0.05;
  if (status === 'temporarily_closed') return 0.18;
  return 0.72;
}

function distanceScore(distanceMiles: number | null): number {
  if (distanceMiles == null) return 0.45;
  if (distanceMiles <= 1.5) return 1;
  if (distanceMiles <= 5) return 0.9;
  if (distanceMiles <= 15) return 0.72;
  if (distanceMiles <= 30) return 0.48;
  if (distanceMiles <= 60) return 0.24;
  return 0.1;
}

function routeDeviationScore(distanceMiles: number | null): number {
  if (distanceMiles == null) return 0.62;
  if (distanceMiles <= 0.6) return 1;
  if (distanceMiles <= 2) return 0.86;
  if (distanceMiles <= APPROACH_RESUPPLY_POLICY.preferredRouteBufferMiles) return 0.58;
  if (distanceMiles <= APPROACH_RESUPPLY_POLICY.maximumRouteDetourMiles) return 0.32;
  return 0.12;
}

function confidenceScore(value: unknown): number {
  const numeric = confidenceNumber(value);
  if (numeric != null) return numeric;
  const label = normalizeConfidence(value, 'unknown');
  if (label === 'high') return 0.9;
  if (label === 'medium') return 0.68;
  if (label === 'low') return 0.38;
  return 0.52;
}

function vehicleRelevanceScore(bucket: PreTrailStopBucket, vehicleProfile: TripBuilderVehicleProfile | null | undefined): number {
  if (bucket !== 'fuel') return 0.62;
  const rangeMiles = finiteNumber(vehicleProfile?.rangeMiles);
  if (rangeMiles == null) return 0.66;
  if (rangeMiles < 120) return 1;
  if (rangeMiles < 220) return 0.84;
  if (rangeMiles < 350) return 0.68;
  return 0.55;
}

function nearestRouteDistanceMiles(points: GeoPoint[], coordinate: GeoPoint | null): number | null {
  if (!coordinate || points.length < 2) return null;
  const projection = nearestPointOnRoute(
    { lat: coordinate.latitude, lng: coordinate.longitude },
    points.map((point) => ({ lat: point.latitude, lng: point.longitude })),
  );
  return roundTenths(projection ? projection.distanceMeters / 1609.344 : null);
}

function approachRoutePosition(
  points: GeoPoint[],
  anchor: GeoPoint | null,
  coordinate: GeoPoint | null,
): ApproachResupplyRoutePosition {
  if (!anchor || !coordinate || points.length < 2) return 'unknown';
  return classifyApproachResupplyRoutePosition({
    approachRoute: points,
    coordinate,
    origin: points[0],
    trailhead: anchor,
  });
}

function beforeTrailEntry(position: ApproachResupplyRoutePosition): boolean | null {
  if (position === 'unknown') return null;
  return position === 'on_approach';
}

function beforeTrailEntryScore(value: boolean | null): number {
  if (value === true) return 1;
  if (value === false) return 0.24;
  return 0.72;
}

function candidateDistanceFromTrailhead(record: Record<string, unknown>, anchor: GeoPoint | null, coordinate: GeoPoint | null): number | null {
  return roundTenths(
    finiteNumber(record.distanceFromTrailheadMiles) ??
    metersToMiles(record.distanceToTrailheadMeters) ??
    stopDistanceFromTrailheadMiles(anchor, coordinate),
  );
}

function candidateDetourMiles(record: Record<string, unknown>): number | null {
  return metersToMiles(record.detourDistanceMeters);
}

function candidateRouteDeviationMiles(record: Record<string, unknown>, approachPoints: GeoPoint[], coordinate: GeoPoint | null): number | null {
  return roundTenths(
    candidateDetourMiles(record) ??
    finiteNumber(record.distanceFromRouteMiles) ??
    nearestRouteDistanceMiles(approachPoints, coordinate),
  );
}

function candidateDedupKey(candidate: RankedPreTrailCandidate): string {
  const metadata = candidate.stop.metadata ?? {};
  const placeIdentity = resupplyPlaceIdentityFromMetadata(metadata);
  if (placeIdentity) return `${candidate.bucket}:${placeIdentity}`;
  const coordinate = candidate.stop.coordinate;
  const coordinateKey = coordinate
    ? `${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}`
    : 'no-coordinate';
  return `${candidate.bucket}:${candidate.stop.title.toLowerCase()}:${coordinateKey}`;
}

function candidateWarnings(
  record: Record<string, unknown>,
  openStatus: string,
  routeDeviationMiles: number | null,
  beforeTrail: boolean | null,
  routePosition: ApproachResupplyRoutePosition,
): string[] {
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.map((warning) => {
        if (typeof warning === 'string') return warning;
        if (isRecord(warning)) return String(warning.message ?? warning.code ?? '').trim();
        return '';
      }).filter(Boolean)
    : [];
  if (openStatus === 'closed' || openStatus === 'temporarily_closed') {
    warnings.push('Provider indicates this stop may be closed or unavailable. Verify before relying on it.');
  }
  if (routeDeviationMiles != null && routeDeviationMiles > APPROACH_RESUPPLY_POLICY.maximumRouteDetourMiles) {
    warnings.push('Candidate appears to require a large approach-route deviation.');
  }
  if (routePosition === 'behind_origin') {
    warnings.push('Candidate lies behind the trip origin on the canonical approach route.');
  } else if (routePosition === 'after_trailhead') {
    warnings.push('Candidate occurs after the trailhead on the canonical approach route.');
  } else if (beforeTrail === false) {
    warnings.push('Candidate may not occur before trail entry based on available approach geometry.');
  }
  return warnings;
}

function preTrailSchedulingExclusion(candidate: RankedPreTrailCandidate): string | null {
  const metadata = candidate.stop.metadata ?? {};
  const openStatus = String(metadata.openStatus ?? '').toLowerCase();
  if (openStatus === 'closed' || openStatus === 'temporarily_closed') {
    return `${candidate.stop.title} was excluded because provider operating data marks it ${openStatus.replace('_', ' ')}.`;
  }
  const routePosition = String(metadata.approachRoutePosition ?? candidate.approachRoutePosition);
  if (routePosition === 'behind_origin') {
    return `${candidate.stop.title} was excluded because it lies behind the trip origin.`;
  }
  if (routePosition === 'after_trailhead') {
    return `${candidate.stop.title} was excluded because it occurs after the trailhead.`;
  }
  if (candidate.beforeTrailEntry === false || metadata.beforeTrailEntry === false) {
    return `${candidate.stop.title} was excluded because it does not occur before trail entry.`;
  }
  if (metadata.beforeRemoteEntry === false) {
    return `${candidate.stop.title} was excluded because it occurs after the service-loss boundary.`;
  }
  const routeDeviationMiles = candidate.routeDeviationMiles ?? finiteNumber(metadata.routeDeviationMiles);
  if (routeDeviationMiles != null && routeDeviationMiles > APPROACH_RESUPPLY_POLICY.maximumRouteDetourMiles) {
    return `${candidate.stop.title} was excluded because its approach deviation exceeds the configured limit.`;
  }
  if (String(metadata.accessStatus ?? '').toLowerCase() === 'inaccessible') {
    return `${candidate.stop.title} was excluded because provider access data marks it inaccessible.`;
  }
  return null;
}

function rankScore(args: {
  record: Record<string, unknown>;
  bucket: PreTrailStopBucket;
  distanceFromTrailheadMiles: number | null;
  routeDeviationMiles: number | null;
  beforeTrail: boolean | null;
  openStatus: string;
  vehicleProfile?: TripBuilderVehicleProfile | null;
}): { score: number; components: Record<string, number> } {
  const components = {
    distanceToTrailhead: distanceScore(args.distanceFromTrailheadMiles),
    routeDeviation: routeDeviationScore(args.routeDeviationMiles),
    beforeTrailEntry: beforeTrailEntryScore(args.beforeTrail),
    categoryMatch: categoryMatchQuality(args.record, args.bucket),
    openStatus: openStatusScore(args.openStatus),
    sourceConfidence: confidenceScore(args.record.confidence ?? args.record.reliability),
    vehicleRelevance: vehicleRelevanceScore(args.bucket, args.vehicleProfile),
  };
  const base =
    components.distanceToTrailhead * 0.3 +
    components.routeDeviation * 0.22 +
    components.beforeTrailEntry * 0.14 +
    components.categoryMatch * 0.14 +
    components.openStatus * 0.08 +
    components.sourceConfidence * 0.08 +
    components.vehicleRelevance * 0.04;
  const providerScore = confidenceNumber(args.record.score);
  const availabilityPenalty =
    args.openStatus === 'closed' ? 0.55 :
    args.openStatus === 'temporarily_closed' ? 0.68 :
    1;
  const score = (providerScore == null ? base : base * 0.85 + providerScore * 0.15) * availabilityPenalty;
  return {
    score: Math.round(clampScore(score) * 1000) / 1000,
    components,
  };
}

function normalizePreTrailOption(args: {
  option: SelectedPreTrailOption;
  bucket: PreTrailStopBucket;
  routeId: string;
  sequence: number;
  trailheadAnchor: GeoPoint | null;
  anchorBasis?: PreTrailRankingAnchorBasis;
}): ItineraryStop | null {
  if (!isRecord(args.option)) return null;
  const optionRecord = args.option as Record<string, unknown>;
  const type = bucketType(args.bucket);
  const coordinate = normalizeCoordinate(optionRecord.coordinate ?? optionRecord.location ?? optionRecord.point ?? optionRecord);
  const title = waypointTitle(optionRecord, `${args.bucket} stop`);
  const distanceFromTrailheadMiles = stopDistanceFromTrailheadMiles(args.trailheadAnchor, coordinate);
  return {
    id: String(optionRecord.id ?? `${args.routeId}-${args.bucket}-${args.sequence}`),
    type,
    phase: 'pre_trail_resupply',
    title,
    coordinate,
    sequence: args.sequence,
    plannedDay: 1,
    stopRole: 'pre_trail_resupply',
    source: source('selected_pre_trail_option', 'manual', { source: String(optionRecord.source ?? args.bucket) }),
    confidence: normalizeConfidence(optionRecord.confidence, coordinate ? 'medium' : 'low'),
    notes: Array.isArray(optionRecord.notes) ? optionRecord.notes.map(String) : undefined,
    metadata: {
      ...(isRecord(optionRecord.metadata) ? optionRecord.metadata : {}),
      preTrailStopBucket: args.bucket,
      preTrailAnchor: args.trailheadAnchor,
      distanceFromTrailheadMiles,
      distanceBasis: args.anchorBasis ?? 'trailhead_start',
      operatorSelected: true,
    },
  };
}

function normalizeRankedCandidate(args: {
  candidate: PreTrailStopCandidate;
  bucketHint: PreTrailStopBucket | null;
  routeId: string;
  sequence: number;
  anchor: GeoPoint | null;
  anchorBasis: PreTrailRankingAnchorBasis;
  approachPoints: GeoPoint[];
  vehicleProfile?: TripBuilderVehicleProfile | null;
}): RankedPreTrailCandidate | null {
  if (!isRecord(args.candidate) || !args.anchor) return null;
  const record = args.candidate as Record<string, unknown>;
  const bucket = candidateBucket(record, args.bucketHint);
  if (!bucket) return null;
  const coordinate = normalizeCoordinate(record.coordinate ?? record.location ?? record.point ?? record);
  if (!coordinate) return null;

  const title = waypointTitle(record, `${bucket} stop`);
  const distanceFromTrailheadMiles = candidateDistanceFromTrailhead(record, args.anchor, coordinate);
  const routeDeviationMiles = candidateRouteDeviationMiles(record, args.approachPoints, coordinate);
  const detourDistanceMiles = candidateDetourMiles(record);
  const detourDurationSeconds = finiteNumber(record.detourDurationSeconds);
  const routePosition = approachRoutePosition(args.approachPoints, args.anchor, coordinate);
  const beforeTrail = beforeTrailEntry(routePosition);
  const openStatus = normalizedOpenStatus(record);
  const sourceValue = candidateSource(record, bucket);
  const score = rankScore({
    record,
    bucket,
    distanceFromTrailheadMiles,
    routeDeviationMiles,
    beforeTrail,
    openStatus,
    vehicleProfile: args.vehicleProfile,
  });
  const providerMetadata = isRecord(record.providerMetadata) ? record.providerMetadata : null;
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  const providerPlaceId = String(record.providerPlaceId ?? providerMetadata?.providerPlaceId ?? '').trim() || null;
  const notes = [
    ...(Array.isArray(record.notes) ? record.notes.map(String) : []),
    ...candidateWarnings(record, openStatus, routeDeviationMiles, beforeTrail, routePosition),
  ];

  return {
    bucket,
    score: score.score,
    rank: 0,
    distanceFromTrailheadMiles,
    routeDeviationMiles,
    detourDistanceMiles,
    beforeTrailEntry: beforeTrail,
    approachRoutePosition: routePosition,
    source: sourceValue,
    stop: {
      id: String(record.id ?? `${args.routeId}-${bucket}-candidate-${args.sequence}`),
      type: bucketType(bucket),
      phase: 'pre_trail_resupply',
      title,
      coordinate,
      sequence: args.sequence,
      plannedDay: 1,
      stopRole: 'pre_trail_resupply',
      source: sourceValue,
      confidence: normalizeConfidence(record.confidence ?? record.reliability, 'medium'),
      notes: notes.length > 0 ? notes : undefined,
      metadata: {
        ...metadata,
        preTrailStopBucket: bucket,
        preTrailAnchor: args.anchor,
        distanceFromTrailheadMiles,
        distanceBasis: args.anchorBasis,
        routeDeviationMiles,
        detourDistanceMiles,
        detourDurationSeconds,
        beforeTrailEntry: beforeTrail,
        approachRoutePosition: routePosition,
        rankScore: score.score,
        rankComponents: score.components,
        categoryMatchQuality: categoryMatchQuality(record, bucket),
        openStatus,
        accessStatus: record.accessStatus ?? metadata.accessStatus ?? null,
        providerPlaceId,
        provider: sourceValue.provider ?? null,
        providerMetadata,
        sourceScore: confidenceNumber(record.score),
      },
    },
  };
}

function sortedUniqueRankedCandidates(candidates: RankedPreTrailCandidate[], maxStopsPerBucket: number): RankedPreTrailCandidate[] {
  const seen = new Set<string>();
  const unique: RankedPreTrailCandidate[] = [];
  candidates
    .sort((left, right) => (
      Number(!isOperatorSelected(left)) - Number(!isOperatorSelected(right)) ||
      right.score - left.score ||
      (left.distanceFromTrailheadMiles ?? Number.POSITIVE_INFINITY) -
        (right.distanceFromTrailheadMiles ?? Number.POSITIVE_INFINITY) ||
      left.stop.title.localeCompare(right.stop.title)
    ))
    .forEach((candidate) => {
      const key = candidateDedupKey(candidate);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(candidate);
    });

  return ITINERARY_PRE_TRAIL_STOP_BUCKETS.flatMap((bucket) => (
    unique
      .filter((candidate) => candidate.bucket === bucket)
      .slice(0, maxStopsPerBucket)
      .map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
        stop: {
          ...candidate.stop,
          sequence: index + 1,
          metadata: {
            ...(candidate.stop.metadata ?? {}),
            rank: index + 1,
          },
        },
      }))
  ));
}

function isResupplyBucket(bucket: PreTrailStopBucket): boolean {
  return bucket === 'grocery' || bucket === 'generalSupply';
}

function isOperatorSelected(candidate: RankedPreTrailCandidate): boolean {
  return candidate.source.state === 'manual' || candidate.stop.metadata?.operatorSelected === true;
}

function refuelAnchorCandidate(candidates: RankedPreTrailCandidate[]): RankedPreTrailCandidate | null {
  return candidates
    .filter((candidate) => candidate.bucket === 'fuel' && candidate.stop.coordinate)
    .sort((left, right) => {
      const selectedDelta = Number(!isOperatorSelected(left)) - Number(!isOperatorSelected(right));
      if (selectedDelta !== 0) return selectedDelta;
      return left.rank - right.rank || right.score - left.score;
    })[0] ?? null;
}

function annotateResupplyAnchors(candidates: RankedPreTrailCandidate[]): RankedPreTrailCandidate[] {
  const refuel = refuelAnchorCandidate(candidates);
  const refuelCoordinate = refuel?.stop.coordinate ?? null;
  if (!refuel || !refuelCoordinate) return candidates;

  const anchoredCandidates = candidates.map((candidate) => {
    if (!isResupplyBucket(candidate.bucket)) return candidate;
    const distanceFromResupplyAnchorMiles = stopDistanceFromTrailheadMiles(refuelCoordinate, candidate.stop.coordinate);
    const nextMetadata = {
      ...(candidate.stop.metadata ?? {}),
      resupplyAnchorStopId: refuel.stop.id,
      resupplyAnchorTitle: refuel.stop.title,
      resupplyAnchorBucket: 'fuel',
      resupplyAnchorBasis: 'selected_refuel_stop',
      distanceFromResupplyAnchorMiles,
    };
    return {
      ...candidate,
      distanceFromResupplyAnchorMiles,
      resupplyAnchorStopId: refuel.stop.id,
      stop: {
        ...candidate.stop,
        metadata: nextMetadata,
      },
    };
  });

  return ITINERARY_PRE_TRAIL_STOP_BUCKETS.flatMap((bucket) => {
    const bucketCandidates = anchoredCandidates.filter((candidate) => candidate.bucket === bucket);
    const sorted = isResupplyBucket(bucket)
      ? bucketCandidates.sort((left, right) => {
          const selectedDelta = Number(!isOperatorSelected(left)) - Number(!isOperatorSelected(right));
          if (selectedDelta !== 0) return selectedDelta;
          const anchorDistanceDelta =
            (left.distanceFromResupplyAnchorMiles ?? Number.POSITIVE_INFINITY) -
            (right.distanceFromResupplyAnchorMiles ?? Number.POSITIVE_INFINITY);
          if (Math.abs(anchorDistanceDelta) > 0.001) return anchorDistanceDelta;
          return right.score - left.score ||
            (left.distanceFromTrailheadMiles ?? Number.POSITIVE_INFINITY) -
              (right.distanceFromTrailheadMiles ?? Number.POSITIVE_INFINITY) ||
            left.stop.title.localeCompare(right.stop.title);
        })
      : bucketCandidates.sort((left, right) => left.rank - right.rank);

    return sorted.map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      stop: {
        ...candidate.stop,
        sequence: index + 1,
        metadata: {
          ...(candidate.stop.metadata ?? {}),
          rank: index + 1,
        },
      },
    }));
  });
}

function dedupeDataSources(sources: ItineraryDataSource[]): ItineraryDataSource[] {
  const seen = new Set<string>();
  return sources.filter((item) => {
    const key = `${item.label}:${item.source ?? ''}:${item.provider ?? ''}:${item.state}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function routeContextDataState(routeContext: TripBuilderRouteContextInput): ItineraryDataSource['state'] {
  const status = String(routeContext.status ?? '').toLowerCase();
  if (status === 'stale') return 'stale';
  if (status === 'error' || status === 'idle') return 'missing';
  const candidates = routeContextCandidates(routeContext);
  if (candidates.some((candidate) => isRecord(candidate) && candidateSource(candidate as Record<string, unknown>, 'fuel').state === 'live')) {
    return 'live';
  }
  if (status === 'ready' || status === 'partial') return 'cached';
  return 'unknown';
}

function bucketSummary(args: {
  bucket: PreTrailStopBucket;
  anchor: GeoPoint | null;
  anchorBasis: PreTrailRankingAnchorBasis;
  stopCount: number;
  selectedCount: number;
  providerCandidateCount: number;
  providerState: ItineraryPreTrailProviderState;
  requested: boolean;
  routeContextCount: number | null;
  generatedAt: string;
  dataUsed: ItineraryDataSource[];
  candidateCountBeforeDedupe: number;
  duplicateCount: number;
  excludedCount: number;
  suppressedAlternativeCount: number;
}): ItineraryPreTrailStopSearchSummary {
  const warnings: string[] = [];
  let status: ItineraryPreTrailStopSearchSummary['status'];

  if (args.selectedCount > 0) {
    status = 'selected';
  } else if (args.stopCount > 0) {
    status = 'ranked';
  } else if (!args.requested) {
    status = 'not_requested';
    warnings.push('Pre-trail POI planning not requested.');
  } else if (!args.anchor) {
    status = 'missing_anchor';
    warnings.push('Trailhead start is unavailable, so pre-trail stops cannot be searched relative to the trailhead.');
  } else if (args.providerState === 'pending') {
    status = 'provider_pending';
    warnings.push('Live pre-trail provider search is still pending; empty buckets are not confirmed no-results.');
  } else if (args.providerState === 'ready' || args.providerState === 'empty') {
    status = 'no_results';
    warnings.push('Pre-trail provider search returned no usable stops for this bucket.');
  } else {
    status = 'provider_unavailable';
    warnings.push(args.providerState === 'error'
      ? 'Live pre-trail POI lookup failed; no provider-backed stops were generated for this bucket.'
      : 'Live pre-trail POI lookup is unavailable; no provider-backed stops were generated.');
    if (args.routeContextCount != null && args.routeContextCount > 0) {
      warnings.push('Route context reports supply candidates, but no usable candidate coordinates were provided for this bucket.');
    }
  }

  if (args.stopCount > 0 && args.providerState === 'pending') {
    warnings.push('Cached, selected, or Route Context stops remain visible while live provider refresh is pending.');
  } else if (args.stopCount > 0 && (args.providerState === 'error' || args.providerState === 'unavailable')) {
    warnings.push('Cached, selected, or Route Context stops remain visible, but live provider refresh is unavailable.');
  }

  return {
    bucket: args.bucket,
    status,
    providerState: args.providerState,
    anchorCoordinate: args.anchor,
    stopCount: args.stopCount,
    provider: status === 'selected'
      ? 'operator_selected'
      : args.dataUsed.find((item) => item.provider)?.provider ?? null,
    searchedAt: args.generatedAt,
    searchRadiusMiles: args.anchor ? DEFAULT_PRE_TRAIL_SEARCH_RADIUS_MILES : null,
    warnings,
    dataUsed: args.dataUsed,
    metadata: {
      searchAnchor: args.anchorBasis,
      providerAvailable: args.providerState === 'ready' || args.providerState === 'empty',
      providerState: args.providerState,
      requested: args.requested,
      providerCandidateCount: args.providerCandidateCount,
      routeContextCandidateCount: args.routeContextCount,
      candidateCountBeforeDedupe: args.candidateCountBeforeDedupe,
      duplicateCount: args.duplicateCount,
      excludedCount: args.excludedCount,
      suppressedAlternativeCount: args.suppressedAlternativeCount,
      providerPipeline: ['route_context', 'mapbox_search', 'manual_selection'],
    },
  };
}

export function rankPreTrailStops({
  candidates = null,
  trailheadStart,
  approachRoute = null,
  selectedPreTrailOptions = null,
  vehicleProfile = null,
  userPreferences = null,
  providerAvailable = null,
  providerStates = null,
  routeId = 'suggested-route',
  generatedAt = new Date().toISOString(),
  maxStopsPerBucket = 5,
}: RankPreTrailStopsArgs): RankPreTrailStopsResult {
  const approachPoints = approachRouteCoordinates(approachRoute);
  const { anchor, basis, warnings: anchorWarnings } = rankingAnchor({ trailheadStart, approachRoute });
  const preTrailStops = emptyPreTrailStops();
  const selectedSource = source('selected_pre_trail_options', 'manual');
  const providerUnavailableSource = source('pre_trail_poi_provider', 'missing', {
    provider: null,
    notes: [
      'No live pre-trail POI candidates were available.',
      'ECS does not invent fuel or grocery stops when provider data is missing.',
    ],
  });
  const providerPendingSource = source('pre_trail_poi_provider', 'unknown', {
    provider: null,
    notes: ['Live pre-trail POI search is pending; no empty result has been confirmed.'],
  });
  const notRequestedSource = source('pre_trail_poi_planning', 'manual', {
    notes: ['Pre-trail POI planning not requested.'],
  });
  const providerResultSource = source('pre_trail_poi_provider', 'cached', {
    provider: 'pre_trail_candidates',
    notes: ['Pre-trail candidate data was ranked relative to the trailhead start.'],
  });
  const candidateItems = candidateEntries(candidates);
  const legacyProviderState: ItineraryPreTrailProviderState = providerAvailable == null
    ? candidates != null ? 'ready' : 'unavailable'
    : providerAvailable ? 'ready' : 'unavailable';
  const resolvedProviderStates = Object.fromEntries(
    ITINERARY_PRE_TRAIL_STOP_BUCKETS.map((bucket) => [
      bucket,
      providerStates?.[bucket] ?? legacyProviderState,
    ]),
  ) as Record<PreTrailStopBucket, ItineraryPreTrailProviderState>;
  const providerDataSourceForState = (state: ItineraryPreTrailProviderState): ItineraryDataSource => (
    state === 'pending'
      ? providerPendingSource
      : state === 'ready' || state === 'empty'
        ? providerResultSource
        : providerUnavailableSource
  );
  const anyBucketRequested = ITINERARY_PRE_TRAIL_STOP_BUCKETS.some((bucket) => preTrailBucketRequested(bucket, userPreferences));
  const requestedProviderStates = ITINERARY_PRE_TRAIL_STOP_BUCKETS
    .filter((bucket) => preTrailBucketRequested(bucket, userPreferences))
    .map((bucket) => resolvedProviderStates[bucket]);
  const providerIsAvailable = requestedProviderStates.length > 0 && requestedProviderStates.every(
    (state) => state === 'ready' || state === 'empty',
  );
  const selectedBuckets = new Set<PreTrailStopBucket>();
  const ranked: RankedPreTrailCandidate[] = [];
  const schedulingExclusions: { bucket: PreTrailStopBucket; message: string }[] = [];
  const suppressedAlternativeCounts: Record<PreTrailStopBucket, number> = {
    fuel: 0,
    grocery: 0,
    water: 0,
    generalSupply: 0,
  };

  ITINERARY_PRE_TRAIL_STOP_BUCKETS.forEach((bucket) => {
    const selectedOptions = selectedPreTrailOptions?.[bucket] ?? [];
    if (selectedOptions.length > 0) selectedBuckets.add(bucket);
    selectedOptions.forEach((option, index) => {
      const stop = normalizePreTrailOption({
        option,
        bucket,
        routeId: String(routeId ?? 'suggested-route'),
        sequence: index + 1,
        trailheadAnchor: anchor,
        anchorBasis: basis,
      });
      if (!stop?.coordinate) {
        schedulingExclusions.push({
          bucket,
          message: `The selected ${bucket} stop was invalid and must be reselected before it can be scheduled.`,
        });
        return;
      }
      const selectedRoutePosition = approachRoutePosition(approachPoints, anchor, stop.coordinate);
      const selectedCandidate: RankedPreTrailCandidate = {
        bucket,
        stop: {
          ...stop,
          metadata: {
            ...(stop.metadata ?? {}),
            rankScore: 1,
            rankComponents: {
              operatorSelected: 1,
            },
            beforeTrailEntry: beforeTrailEntry(selectedRoutePosition),
            approachRoutePosition: selectedRoutePosition,
          },
        },
        score: 1,
        rank: 0,
        distanceFromTrailheadMiles: stopDistanceFromTrailheadMiles(anchor, stop.coordinate),
        routeDeviationMiles: null,
        detourDistanceMiles: null,
        beforeTrailEntry: beforeTrailEntry(selectedRoutePosition),
        approachRoutePosition: selectedRoutePosition,
        source: selectedSource,
      };
      const exclusion = preTrailSchedulingExclusion(selectedCandidate);
      if (exclusion) {
        schedulingExclusions.push({ bucket, message: exclusion });
        return;
      }
      ranked.push(selectedCandidate);
    });
  });

  candidateItems.forEach(({ candidate, bucketHint }, index) => {
    const normalized = normalizeRankedCandidate({
      candidate,
      bucketHint,
      routeId: String(routeId ?? 'suggested-route'),
      sequence: index + 1,
      anchor,
      anchorBasis: basis,
      approachPoints,
      vehicleProfile,
    });
    if (!normalized) return;
    if (selectedBuckets.has(normalized.bucket)) {
      suppressedAlternativeCounts[normalized.bucket] += 1;
      return;
    }
    const exclusion = preTrailSchedulingExclusion(normalized);
    if (exclusion) {
      schedulingExclusions.push({ bucket: normalized.bucket, message: exclusion });
      return;
    }
    ranked.push(normalized);
  });

  const maxPerBucket = Math.max(1, Math.min(finiteNumber(maxStopsPerBucket) ?? 5, 20));
  const rankedCandidates = annotateResupplyAnchors(sortedUniqueRankedCandidates(ranked, maxPerBucket));
  rankedCandidates.forEach((candidate) => {
    preTrailStops[candidate.bucket].push(candidate.stop);
  });

  const dataUsed = dedupeDataSources([
    ...(rankedCandidates.some((candidate) => candidate.source.label === selectedSource.label) ? [selectedSource] : []),
    ...(!anyBucketRequested ? [notRequestedSource] : []),
    ...(anyBucketRequested
      ? ITINERARY_PRE_TRAIL_STOP_BUCKETS
          .filter((bucket) => preTrailBucketRequested(bucket, userPreferences))
          .map((bucket) => providerDataSourceForState(resolvedProviderStates[bucket]))
      : []),
    ...rankedCandidates.map((candidate) => candidate.source),
    ...(userPreferences ? [source('pre_trail_user_preferences', 'manual')] : []),
    ...(vehicleProfile ? [source('pre_trail_vehicle_profile', 'manual', { confidence: vehicleProfile.confidence ?? null })] : []),
  ]);

  const bucketSummaries = ITINERARY_PRE_TRAIL_STOP_BUCKETS.map((bucket) => {
    const rawSelectedCount = selectedPreTrailOptions?.[bucket]?.length ?? 0;
    const selectedCount = rankedCandidates.filter((candidate) => (
      candidate.bucket === bucket && isOperatorSelected(candidate)
    )).length;
    const requested = preTrailBucketRequested(bucket, userPreferences);
    const providerCandidateCount = candidateItems.filter((item) => (
      item.bucketHint === bucket ||
      (isRecord(item.candidate) && candidateBucket(item.candidate as Record<string, unknown>, item.bucketHint) === bucket)
    )).length;
    const stopCount = preTrailStops[bucket].length;
    const excludedCount = schedulingExclusions.filter((item) => item.bucket === bucket).length;
    const schedulableBucketCandidates = ranked.filter((candidate) => candidate.bucket === bucket);
    const duplicateCount = Math.max(
      0,
      schedulableBucketCandidates.length - new Set(schedulableBucketCandidates.map(candidateDedupKey)).size,
    );
    const providerState = resolvedProviderStates[bucket];
    const bucketDataUsed = dedupeDataSources([
      ...(selectedCount > 0 ? [selectedSource] : []),
      ...(!requested ? [notRequestedSource] : [providerDataSourceForState(providerState)]),
      ...rankedCandidates
        .filter((candidate) => candidate.bucket === bucket)
        .map((candidate) => candidate.source),
    ]);
    const summary = bucketSummary({
      bucket,
      anchor,
      anchorBasis: basis,
      stopCount,
      selectedCount,
      providerCandidateCount,
      providerState,
      requested,
      routeContextCount: null,
      generatedAt,
      dataUsed: bucketDataUsed,
      candidateCountBeforeDedupe: rawSelectedCount + providerCandidateCount,
      duplicateCount,
      excludedCount,
      suppressedAlternativeCount: suppressedAlternativeCounts[bucket],
    });
    const exclusionWarnings = schedulingExclusions
      .filter((item) => item.bucket === bucket)
      .map((item) => item.message);
    return exclusionWarnings.length > 0
      ? { ...summary, warnings: [...(summary.warnings ?? []), ...exclusionWarnings] }
      : summary;
  });

  const warnings = [
    ...anchorWarnings,
    ...bucketSummaries.flatMap((summary) => summary.warnings ?? []),
  ];

  return {
    preTrailStops,
    bucketSummaries,
    rankedCandidates,
    anchorCoordinate: anchor,
    anchorBasis: basis,
    providerAvailable: providerIsAvailable,
    providerStates: resolvedProviderStates,
    dataUsed,
    warnings,
  };
}

export function resolvePreTrailStops({
  trailheadStart,
  approachRoute = null,
  candidates = null,
  providerAvailable = null,
  providerStates = null,
  selectedPreTrailOptions = null,
  userPreferences = null,
  vehicleProfile = null,
  routeContext = null,
  routeId = 'suggested-route',
  generatedAt = new Date().toISOString(),
}: ResolvePreTrailStopsArgs): ResolvedPreTrailStops {
  const candidateInput = mergeCandidateInputWithRouteContext(candidates, routeContext);
  const ranking = rankPreTrailStops({
    candidates: candidateInput,
    trailheadStart,
    approachRoute,
    selectedPreTrailOptions,
    userPreferences,
    vehicleProfile,
    providerAvailable: providerAvailable ?? (candidateInput != null ? true : null),
    providerStates,
    routeId,
    generatedAt,
  });
  const bucketSummaries = ranking.bucketSummaries.map((summary) => ({
    ...summary,
    warnings: [
      ...(summary.warnings ?? []),
      ...(
        summary.stopCount === 0 &&
        summary.status === 'provider_unavailable' &&
        (routeContextCandidateCount(routeContext, summary.bucket) ?? 0) > 0
          ? ['Route context reports supply candidates, but no usable candidate coordinates were provided for this bucket.']
          : []
      ),
    ],
    metadata: {
      ...(summary.metadata ?? {}),
      routeContextCandidateCount: routeContextCandidateCount(routeContext, summary.bucket),
    },
  }));

  return {
    preTrailStops: ranking.preTrailStops,
    bucketSummaries,
    anchorCoordinate: ranking.anchorCoordinate,
    dataUsed: dedupeDataSources([
      ...ranking.dataUsed,
      ...(routeContext ? [source('pre_trail_route_context', routeContextDataState(routeContext), { source: routeContext.status ?? 'route_context' })] : []),
    ]),
    warnings: Array.from(new Set([
      ...ranking.warnings,
      ...bucketSummaries.flatMap((summary) => summary.warnings ?? []),
    ])),
  };
}
