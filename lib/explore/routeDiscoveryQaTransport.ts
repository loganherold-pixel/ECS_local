import type { LiveTrailPackCatalogSearchCriteria } from './liveTrailPackCatalog';
import { ROUTE_DISCOVERY_QA_REGION } from './routeDiscoveryQaRuntime';

type QaTransportResult = { data: unknown; error: { message: string } | null };

let invocationCount = 0;

function route(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const suffix = String(index).padStart(3, '0');
  const latitude = ROUTE_DISCOVERY_QA_REGION.latitude + index * 0.001;
  const longitude = ROUTE_DISCOVERY_QA_REGION.longitude + index * 0.001;
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    public_id: `ecs-acceptance-route-${suffix}`,
    name: `ECS ACCEPTANCE ROUTE ${suffix} — NON-PRODUCTION`,
    description: 'Synthetic internal QA record. Not legal, access, or navigation advice.',
    route_type: index % 2 === 0 ? 'loop' : 'out_and_back',
    center_latitude: latitude,
    center_longitude: longitude,
    route_geometry: {
      type: 'LineString',
      coordinates: [[longitude, latitude], [longitude + 0.0005, latitude + 0.0005]],
    },
    route_geometry_mode: 'preview_simplified',
    distance_miles: 10 + index,
    estimated_duration_minutes: 60 + index,
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
      provider_id: 'ecs-route-discovery-acceptance',
      source_type: 'official',
      label: 'ECS ROUTE DISCOVERY ACCEPTANCE — SYNTHETIC',
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

type QaFixtureDiagnostics = Record<string, number>;

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

function successPayload(criteria: LiveTrailPackCatalogSearchCriteria): Record<string, unknown> {
  const qualifying = Array.from({ length: 55 }, (_, index) => route(index + 1));
  const source = [
    ...qualifying,
    route(56, { public_id: 'ecs-acceptance-route-001' }),
    route(57, { review_status: 'pending_review' }),
    route(58, { recommendation_status: 'not_recommended' }),
    route(59, { restricted_access_coverage_pct: 100 }),
    route(60, { route_geometry: null, geometry_quality: 'missing' }),
    route(61, { center_latitude: 2, center_longitude: -138 }),
    route(62, { center_latitude: 4, center_longitude: -140 }),
  ];
  const diagnostics: QaFixtureDiagnostics = { source: source.length };
  const accessFiltered = source.filter((candidate) => Number(candidate.restricted_access_coverage_pct) === 0);
  diagnostics.access = accessFiltered.length;
  const statusFiltered = accessFiltered.filter(
    (candidate) => candidate.review_status === 'approved' && candidate.recommendation_status === 'recommendable' && candidate.verification_status === 'official_verified',
  );
  diagnostics.status = statusFiltered.length;
  const validated = statusFiltered.filter((candidate) => {
    const latitude = Number(candidate.center_latitude);
    const longitude = Number(candidate.center_longitude);
    const geometry = candidate.route_geometry as { coordinates?: unknown[] } | null;
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Array.isArray(geometry?.coordinates) && geometry.coordinates.length >= 2;
  });
  diagnostics.validation = validated.length;
  const viewportFiltered = validated.filter((candidate) => {
    const latitude = Number(candidate.center_latitude);
    const longitude = Number(candidate.center_longitude);
    const viewport = ROUTE_DISCOVERY_QA_REGION.viewport;
    return latitude >= viewport.south && latitude <= viewport.north && longitude >= viewport.west && longitude <= viewport.east;
  });
  diagnostics.viewport = viewportFiltered.length;
  const radiusMiles = typeof criteria.radiusMiles === 'number' && criteria.radiusMiles > 0
    ? criteria.radiusMiles
    : ROUTE_DISCOVERY_QA_REGION.defaultRadiusMiles;
  const radiusFiltered = viewportFiltered.filter((candidate) =>
    haversineMiles(Number(candidate.center_latitude), Number(candidate.center_longitude)) <= radiusMiles,
  );
  diagnostics.radius = radiusFiltered.length;
  const refined = radiusFiltered.filter((candidate) => {
    if (criteria.routeType && candidate.route_type !== criteria.routeType) return false;
    if (criteria.difficulty && candidate.difficulty !== criteria.difficulty) return false;
    const duration = Number(candidate.estimated_duration_minutes);
    if (typeof criteria.minDurationMinutes === 'number' && duration < criteria.minDurationMinutes) return false;
    if (typeof criteria.maxDurationMinutes === 'number' && duration > criteria.maxDurationMinutes) return false;
    return true;
  });
  diagnostics.refinement = refined.length;
  const seen = new Set<string>();
  const deduped = refined.filter((candidate) => {
    const identity = String(candidate.public_id);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  diagnostics.deduplication = deduped.length;
  const ranked = [...deduped].sort((left, right) =>
    Number(right.confidence_score) - Number(left.confidence_score) || String(left.public_id).localeCompare(String(right.public_id)),
  );
  diagnostics.ranking = ranked.length;
  const records = ranked.slice(0, 20);
  diagnostics.final = records.length;
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
      curationCandidateCount: 4,
      anySourceBackedCandidateCount: 60,
      radiusFilterApplied: true,
      resultLimit: 20,
      additionalMatchesExist: ranked.length > 20,
      nextPage: null,
      nextCursor: null,
      geometryMode: 'preview_simplified',
      qaTransport: 'route-discovery-qa-v1',
      qaRegionId: ROUTE_DISCOVERY_QA_REGION.regionId,
      fixtureDiagnostics: diagnostics,
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
  if (scenario === 'ecs_acceptance_delayed_a') {
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
  if (criteria.qaMode !== 'route_discovery_qa' || criteria.qaRegionId !== ROUTE_DISCOVERY_QA_REGION.regionId) {
    return { data: null, error: { message: 'Synthetic QA search region is required.' } };
  }
  return { data: successPayload(criteria), error: null };
}

export function getRouteDiscoveryQaTransportMetadata(): Record<string, unknown> {
  return {
    id: 'route-discovery-qa-v1',
    nonProduction: true,
    remoteActivation: false,
    containsProductionRecords: false,
    invocationCount,
    regionId: ROUTE_DISCOVERY_QA_REGION.regionId,
  };
}
