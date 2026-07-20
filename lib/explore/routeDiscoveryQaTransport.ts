import type { LiveTrailPackCatalogSearchCriteria } from './liveTrailPackCatalog';

type QaTransportResult = { data: unknown; error: { message: string } | null };

const QA_REGION = { latitude: 0, longitude: -140 } as const;
let invocationCount = 0;

function route(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const suffix = String(index).padStart(3, '0');
  const latitude = QA_REGION.latitude + index * 0.001;
  const longitude = QA_REGION.longitude + index * 0.001;
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

function successPayload(): Record<string, unknown> {
  const qualifying = Array.from({ length: 55 }, (_, index) => route(index + 1));
  return {
    ok: true,
    records: [
      ...qualifying,
      route(56, { public_id: 'ecs-acceptance-route-001' }),
      route(57, { review_status: 'pending_review' }),
      route(58, { recommendation_status: 'not_recommended' }),
      route(59, { restricted_access_coverage_pct: 100 }),
      route(60, { route_geometry: null, geometry_quality: 'missing' }),
    ],
    coverageState: {
      state: 'ready',
      title: 'Route-discovery QA transport',
      message: 'Synthetic internal acceptance records are active.',
    },
    meta: {
      candidateCount: 60,
      radiusMatchedCount: 60,
      curationCandidateCount: 4,
      anySourceBackedCandidateCount: 60,
      radiusFilterApplied: true,
      resultLimit: 20,
      additionalMatchesExist: true,
      nextPage: null,
      nextCursor: null,
      geometryMode: 'preview_simplified',
      qaTransport: 'route-discovery-qa-v1',
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
  return { data: successPayload(), error: null };
}

export function getRouteDiscoveryQaTransportMetadata(): Record<string, unknown> {
  return {
    id: 'route-discovery-qa-v1',
    nonProduction: true,
    remoteActivation: false,
    containsProductionRecords: false,
    invocationCount,
  };
}
