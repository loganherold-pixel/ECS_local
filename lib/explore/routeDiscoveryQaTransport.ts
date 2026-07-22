import type { LiveTrailPackCatalogSearchCriteria } from './liveTrailPackCatalog';
import { createPrivacySafeSearchFingerprint, recordExplorePerformanceEvent } from './explorePerformance';
import { ROUTE_DISCOVERY_QA_REGION } from './routeDiscoveryQaRuntime';

type QaTransportResult = { data: unknown; error: { message: string } | null };
type QaRecord = Record<string, any>;
let invocationCount = 0;

function coordinateAt(distanceMiles: number, bearingDegrees: number) {
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitudeMiles = 69;
  const longitudeMiles = latitudeMiles * Math.cos((ROUTE_DISCOVERY_QA_REGION.latitude * Math.PI) / 180);
  return {
    latitude: ROUTE_DISCOVERY_QA_REGION.latitude + (Math.cos(bearing) * distanceMiles) / latitudeMiles,
    longitude: ROUTE_DISCOVERY_QA_REGION.longitude + (Math.sin(bearing) * distanceMiles) / longitudeMiles,
  };
}

function offsetFrom(center: { latitude: number; longitude: number }, distanceMiles: number, bearingDegrees: number) {
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitudeMiles = 69;
  const longitudeMiles = latitudeMiles * Math.cos((center.latitude * Math.PI) / 180);
  return {
    latitude: center.latitude + (Math.cos(bearing) * distanceMiles) / latitudeMiles,
    longitude: center.longitude + (Math.sin(bearing) * distanceMiles) / longitudeMiles,
  };
}

function fixtureCoordinate(index: number) {
  if (index <= 26) return coordinateAt(8 + ((index - 1) % 13) * 6, (index * 137.508) % 360);
  if (index <= 30) return coordinateAt(145 + (index - 27) * 85, (index * 97) % 360);
  return coordinateAt(18, (index * 71) % 360);
}

function resolveFixtureCenter(candidate: QaRecord): { latitude: number; longitude: number } | null {
  const possibleCenters = [
    candidate.center_coordinate,
    candidate.trailhead,
    { latitude: candidate.center_latitude, longitude: candidate.center_longitude },
  ];
  for (const possibleCenter of possibleCenters) {
    const latitude = Number(possibleCenter?.latitude);
    const longitude = Number(possibleCenter?.longitude);
    if (
      Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
      Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ) {
      return { latitude, longitude };
    }
  }
  return null;
}

function route(index: number, overrides: QaRecord = {}): QaRecord {
  const suffix = String(index).padStart(3, '0');
  const center = fixtureCoordinate(index);
  const end = offsetFrom(center, 2 + (index % 4), ((index * 97) + 1.5) % 360);
  return {
    id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    public_id: `ecs-qa-synthetic-route-${suffix}`,
    name: `ECS QA SYNTHETIC ROUTE ${suffix} — NOT A REAL TRAIL`,
    description: 'Synthetic internal QA geometry. No legal-access, public-safety, or navigation claim.',
    route_type: index % 2 === 0 ? 'loop' : 'out_and_back',
    center_coordinate: center,
    center_latitude: center.latitude,
    center_longitude: center.longitude,
    trailhead: center,
    route_geometry: {
      type: 'LineString',
      coordinates: [[center.longitude, center.latitude], [end.longitude, end.latitude]],
    },
    route_geometry_mode: 'preview_simplified',
    route_intelligence: { fixture_region_id: ROUTE_DISCOVERY_QA_REGION.regionId },
    distance_miles: 8 + index,
    estimated_duration_minutes: 90 + index,
    difficulty: index % 3 === 0 ? 'moderate' : 'easy',
    vehicle_fit: ['highway_legal_4x4'],
    official_access_coverage_pct: 100,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: 0,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'official_verified',
    recommendation_status: 'recommendable',
    review_status: 'approved',
    confidence_score: 100 - Math.floor(index / 2),
    source_records: [{
      provider_id: 'ecs-route-discovery-qa-synthetic',
      source_type: 'official',
      label: 'ECS ROUTE DISCOVERY QA — SYNTHETIC ONLY',
      authority: 'acceptance_only',
      last_verified_at: '2099-01-01T00:00:00.000Z',
      attribution: 'Synthetic ECS internal acceptance data',
      license: 'acceptance-only',
    }],
    community_signal: { independent_confirmations: 1, completions: 1 },
    created_at: '2099-01-01T00:00:00.000Z',
    updated_at: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function normalizeFixtureProviderRecord(candidate: QaRecord): QaRecord {
  const center = resolveFixtureCenter(candidate);
  if (!center) return { ...candidate };
  return {
    ...candidate,
    center_coordinate: center,
    center_latitude: center.latitude,
    center_longitude: center.longitude,
    trailhead: center,
  };
}

function haversineMiles(latitude: number, longitude: number): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(latitude - ROUTE_DISCOVERY_QA_REGION.latitude);
  const longitudeDelta = toRadians(longitude - ROUTE_DISCOVERY_QA_REGION.longitude);
  const originLatitude = toRadians(ROUTE_DISCOVERY_QA_REGION.latitude);
  const targetLatitude = toRadians(latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(targetLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function radiusCategory(radiusMiles: number) {
  if (radiusMiles <= 100) return 'default_100_miles';
  if (radiusMiles <= 500) return 'expanded_500_miles';
  return 'custom_radius';
}

function recordStage(
  event: Parameters<typeof recordExplorePerformanceEvent>[0],
  inputCount: number,
  outputCount: number,
  criteria: LiveTrailPackCatalogSearchCriteria,
  exclusions: Record<string, number> = {},
) {
  const radiusMiles = typeof criteria.radiusMiles === 'number' && criteria.radiusMiles > 0
    ? criteria.radiusMiles
    : ROUTE_DISCOVERY_QA_REGION.defaultRadiusMiles;
  recordExplorePerformanceEvent(event, {
    inputCount,
    outputCount,
    resultCount: outputCount,
    qaRegionId: ROUTE_DISCOVERY_QA_REGION.regionId,
    radiusCategory: radiusCategory(radiusMiles),
    searchFingerprint: createPrivacySafeSearchFingerprint({
      qaMode: criteria.qaMode,
      qaRegionId: criteria.qaRegionId,
      radiusMiles,
      refinement: criteria.refinement ?? 'all',
      category: criteria.category ?? 'trail_packs',
      fixtureVersion: ROUTE_DISCOVERY_QA_REGION.fixtureVersion,
    }),
    exclusionReasonCounts: exclusions,
  });
}

export function createRouteDiscoveryQaFixtureRecords(): QaRecord[] {
  const qualifying = Array.from({ length: 30 }, (_, index) => route(index + 1));
  const missingCenter = route(31, { center_coordinate: undefined, center_latitude: undefined, center_longitude: undefined });
  const swappedCenter = route(32, {
    center_coordinate: {
      latitude: fixtureCoordinate(32).longitude,
      longitude: fixtureCoordinate(32).latitude,
    },
  });
  return [
    ...qualifying,
    missingCenter,
    swappedCenter,
    route(33, { public_id: 'ecs-qa-synthetic-route-001' }),
    route(34, { review_status: 'pending_review' }),
    route(35, { recommendation_status: 'not_recommended' }),
    route(36, { verification_status: 'geometry_only' }),
    route(37, { restricted_access_coverage_pct: 100 }),
    route(38, { route_geometry: null, geometry_quality: 'missing' }),
    route(39, {
      center_coordinate: { latitude: 50.5, longitude: -103.5 },
      center_latitude: 50.5,
      center_longitude: -103.5,
      route_geometry: { type: 'LineString', coordinates: [[-103.5, 50.5], [-103.49, 50.51]] },
    }),
    route(40, {
      center_coordinate: { latitude: 38.5, longitude: -106.4 },
      center_latitude: 38.5,
      center_longitude: -106.4,
      trailhead: { latitude: 38.5, longitude: -106.4 },
      route_geometry: { type: 'LineString', coordinates: [[-106.4, 38.5], [-106.39, 38.51]] },
    }),
  ];
}

function successPayload(criteria: LiveTrailPackCatalogSearchCriteria): Record<string, unknown> {
  const source = createRouteDiscoveryQaFixtureRecords();
  recordStage('fixture_records_created', 0, source.length, criteria);
  const providerNormalized = source.map(normalizeFixtureProviderRecord);
  recordStage('provider_records_normalized', source.length, providerNormalized.length, criteria);
  const accessFiltered = providerNormalized.filter((candidate) => Number(candidate.restricted_access_coverage_pct) === 0);
  recordStage('access_filter_complete', providerNormalized.length, accessFiltered.length, criteria, {
    restricted_access: providerNormalized.length - accessFiltered.length,
  });
  const moderationFiltered = accessFiltered.filter((candidate) => candidate.review_status === 'approved');
  recordStage('moderation_filter_complete', accessFiltered.length, moderationFiltered.length, criteria, {
    review_not_approved: accessFiltered.length - moderationFiltered.length,
  });
  const validated = moderationFiltered.filter((candidate) => {
    const center = resolveFixtureCenter(candidate);
    const geometry = candidate.route_geometry as { coordinates?: unknown[] } | null;
    return candidate.recommendation_status === 'recommendable' &&
      candidate.verification_status === 'official_verified' &&
      center != null &&
      Array.isArray(geometry?.coordinates) && geometry.coordinates.length >= 2;
  });
  recordStage('validation_filter_complete', moderationFiltered.length, validated.length, criteria, {
    invalid_or_nonrecommendable: moderationFiltered.length - validated.length,
  });
  recordStage('QA_search_region_resolved', validated.length, validated.length, criteria);
  const radiusMiles = typeof criteria.radiusMiles === 'number' && criteria.radiusMiles > 0
    ? criteria.radiusMiles
    : ROUTE_DISCOVERY_QA_REGION.defaultRadiusMiles;
  const radiusFiltered = validated.filter((candidate) => {
    const center = resolveFixtureCenter(candidate);
    return center != null && haversineMiles(center.latitude, center.longitude) <= radiusMiles;
  });
  recordStage('radius_filter_complete', validated.length, radiusFiltered.length, criteria, {
    outside_radius: validated.length - radiusFiltered.length,
  });
  const viewport = ROUTE_DISCOVERY_QA_REGION.viewport;
  const viewportFiltered = radiusFiltered.filter((candidate) => {
    const center = resolveFixtureCenter(candidate);
    return center != null && center.latitude >= viewport.south && center.latitude <= viewport.north &&
      center.longitude >= viewport.west && center.longitude <= viewport.east;
  });
  recordStage('viewport_filter_complete', radiusFiltered.length, viewportFiltered.length, criteria, {
    outside_viewport: radiusFiltered.length - viewportFiltered.length,
  });
  const categoryFiltered = viewportFiltered;
  recordStage('category_filter_complete', viewportFiltered.length, categoryFiltered.length, criteria);
  const refined = categoryFiltered.filter((candidate) => {
    if (criteria.routeType && candidate.route_type !== criteria.routeType) return false;
    if (criteria.difficulty && candidate.difficulty !== criteria.difficulty) return false;
    const duration = Number(candidate.estimated_duration_minutes);
    if (typeof criteria.minDurationMinutes === 'number' && duration < criteria.minDurationMinutes) return false;
    if (typeof criteria.maxDurationMinutes === 'number' && duration > criteria.maxDurationMinutes) return false;
    return true;
  });
  recordStage('refinement_filter_complete', categoryFiltered.length, refined.length, criteria, {
    refinement_mismatch: categoryFiltered.length - refined.length,
  });
  const seen = new Set<string>();
  const deduped = refined.filter((candidate) => {
    const identity = String(candidate.public_id);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  recordStage('duplicate_filter_complete', refined.length, deduped.length, criteria, {
    duplicate_identity: refined.length - deduped.length,
  });
  const ranked = [...deduped].sort((left, right) =>
    Number(right.confidence_score) - Number(left.confidence_score) || String(left.public_id).localeCompare(String(right.public_id)),
  );
  recordStage('ranking_complete', deduped.length, ranked.length, criteria);
  const records = ranked.slice(0, 20);
  recordStage('result_cap_complete', ranked.length, records.length, criteria, {
    strict_cap: Math.max(0, ranked.length - records.length),
  });
  const searchFingerprint = createPrivacySafeSearchFingerprint({
    qaMode: criteria.qaMode,
    qaRegionId: criteria.qaRegionId,
    radiusMiles,
    refinement: criteria.refinement ?? 'all',
    category: criteria.category ?? 'trail_packs',
    fixtureVersion: ROUTE_DISCOVERY_QA_REGION.fixtureVersion,
  });
  return {
    ok: true,
    records,
    coverageState: {
      state: 'ready',
      title: 'Route-discovery QA transport',
      message: 'Synthetic internal acceptance records are active.',
    },
    meta: {
      candidateCount: source.length,
      radiusMatchedCount: radiusFiltered.length,
      curationCandidateCount: source.length - validated.length,
      anySourceBackedCandidateCount: source.length,
      radiusFilterApplied: true,
      resultLimit: 20,
      additionalMatchesExist: ranked.length > 20,
      nextPage: null,
      nextCursor: null,
      geometryMode: 'preview_simplified',
      qaTransport: 'route-discovery-qa-v2',
      qaRegionId: ROUTE_DISCOVERY_QA_REGION.regionId,
      qaFixtureVersion: ROUTE_DISCOVERY_QA_REGION.fixtureVersion,
      searchFingerprint,
    },
  };
}

export async function invokeRouteDiscoveryQaTransport(
  _body: Record<string, unknown>,
  criteria: LiveTrailPackCatalogSearchCriteria,
): Promise<QaTransportResult> {
  invocationCount += 1;
  const scenario = criteria.sourceAdapter;
  if (scenario === 'ecs_acceptance_provider_failure') {
    return { data: null, error: { message: 'Synthetic route-discovery provider failure.' } };
  }
  if (scenario === 'ecs_acceptance_malformed') {
    return { data: { ok: true, records: 'invalid', meta: { nextPage: 2 } }, error: null };
  }
  if (scenario === 'ecs_acceptance_delayed_a') await new Promise<void>((resolve) => setTimeout(resolve, 250));
  if (
    criteria.qaMode !== 'route_discovery_qa' ||
    criteria.qaRegionId !== ROUTE_DISCOVERY_QA_REGION.regionId ||
    criteria.qaFixtureVersion !== ROUTE_DISCOVERY_QA_REGION.fixtureVersion
  ) {
    return { data: null, error: { message: 'Canonical synthetic QA search context is required.' } };
  }
  return { data: successPayload(criteria), error: null };
}

export function getRouteDiscoveryQaTransportMetadata(): Record<string, unknown> {
  return {
    id: 'route-discovery-qa-v2',
    nonProduction: true,
    remoteActivation: false,
    containsProductionRecords: false,
    invocationCount,
    regionId: ROUTE_DISCOVERY_QA_REGION.regionId,
    fixtureVersion: ROUTE_DISCOVERY_QA_REGION.fixtureVersion,
  };
}
