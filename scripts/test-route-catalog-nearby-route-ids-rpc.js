const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260717212739_route_catalog_nearby_route_ids_rpc.sql',
);
const optimizationMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260718192605_optimize_route_catalog_nearby_route_ids_rpc.sql',
);

assert(fs.existsSync(migrationPath), 'Nearby route ID RPC migration should exist.');
assert(
  fs.existsSync(optimizationMigrationPath),
  'Nearby route ID RPC timeout optimization migration should exist.',
);

const migration = fs.readFileSync(migrationPath, 'utf8');
const normalizedMigration = migration.replace(/\s+/g, ' ').toLowerCase();
const optimizationMigration = fs.readFileSync(optimizationMigrationPath, 'utf8');
const normalizedOptimizationMigration = optimizationMigration.replace(/\s+/g, ' ').toLowerCase();

assert(
  normalizedMigration.includes('create or replace function public.route_catalog_nearby_route_ids') &&
    normalizedMigration.includes('returns table ( route_id uuid, center_distance_miles double precision )'),
  'Migration should expose the route ID and center-distance RPC contract.',
);
assert(
  normalizedMigration.includes('security invoker') &&
    normalizedMigration.includes("set search_path = ''") &&
    normalizedMigration.includes('from public, anon, authenticated') &&
    normalizedMigration.includes('to service_role'),
  'Nearby route lookup must remain a service-role-only security-invoker RPC.',
);
assert(
  normalizedMigration.includes('public.st_dwithin(vr.geog, request.search_center, request.radius_meters)') &&
    normalizedMigration.includes('p_radius_miles <= 500') &&
    normalizedMigration.indexOf('public.st_dwithin') < normalizedMigration.indexOf('limit (select request.row_limit from request)'),
  'PostGIS radius eligibility must enforce the Explore maximum and apply before the bounded LIMIT.',
);
assert(
  normalizedMigration.includes('greatest(1, least(coalesce(p_limit, 600), 2000))') &&
    normalizedMigration.includes("vr.review_status = 'approved'") &&
    normalizedMigration.includes("vr.recommendation_status = 'recommendable'") &&
    normalizedMigration.includes("vr.recommendation_status <> 'recommendable'"),
  'The RPC should cap candidate output and preserve approved/recommendation eligibility modes.',
);

for (const requiredCriterion of [
  'p_vehicle_class',
  'p_min_distance_miles',
  'p_max_distance_miles',
  'p_min_duration_minutes',
  'p_max_duration_minutes',
  'p_min_confidence_score',
  'p_min_remoteness_score',
  'p_max_remoteness_score',
  'p_min_campability_score',
  'p_available_fuel_range_miles',
  'p_available_water_capacity_gallons',
  'p_route_type',
  'p_difficulty',
  'p_source_adapter',
]) {
  assert(
    normalizedMigration.includes(requiredCriterion),
    `Nearby lookup should include ${requiredCriterion}.`,
  );
}

assert(
  normalizedMigration.includes('from public.verified_route_sources vrs') &&
    normalizedMigration.includes('join public.route_sources rs') &&
    normalizedMigration.includes('rs.provider_id = request.source_adapter') &&
    normalizedMigration.includes("request.source_adapter || '_'") &&
    normalizedMigration.indexOf('from public.verified_route_sources vrs') <
      normalizedMigration.indexOf('limit (select request.row_limit from request)'),
  'Exact/prefix provider filtering must happen before LIMIT.',
);

assert(
  normalizedOptimizationMigration.includes(
    'create or replace function public.route_catalog_nearby_route_ids',
  ) &&
    normalizedOptimizationMigration.includes('nearest_candidates as materialized') &&
    normalizedOptimizationMigration.includes('operator(public.<->)') &&
    normalizedOptimizationMigration.includes('parallel unsafe'),
  'The timeout repair should preserve the RPC and use a conservative GiST KNN candidate plan.',
);
assert(
  normalizedOptimizationMigration.includes('least( 8000,') &&
    normalizedOptimizationMigration.includes(
      'greatest(1, least(coalesce($4, 600), 2000)) * 4',
    ) &&
    normalizedOptimizationMigration.includes(
      'limit (select request.candidate_limit from request)',
    ),
  'The KNN plan should overfetch a bounded candidate pool before exact radius qualification.',
);
assert(
  normalizedOptimizationMigration.includes(
    'public.st_dwithin( nearest_candidates.geog, request.search_center, request.radius_meters )',
  ) &&
    normalizedOptimizationMigration.indexOf('operator(public.<->)') <
      normalizedOptimizationMigration.indexOf('limit (select request.candidate_limit from request)') &&
    normalizedOptimizationMigration.indexOf('limit (select request.candidate_limit from request)') <
      normalizedOptimizationMigration.indexOf('public.st_dwithin') &&
    normalizedOptimizationMigration.indexOf('public.st_dwithin') <
      normalizedOptimizationMigration.indexOf('limit (select request.row_limit from request)'),
  'The repair should bound nearest candidates first, then enforce exact radius before final output.',
);

function clampLimit(value) {
  return Math.max(1, Math.min(value ?? 600, 2000));
}

function knnCandidateLimit(value) {
  return Math.min(8000, clampLimit(value) * 4);
}

function sourceMatches(providerId, adapter) {
  return !adapter || providerId === adapter || providerId.startsWith(`${adapter}_`);
}

function routeMatches(route, criteria) {
  if (route.reviewStatus !== 'approved') return false;
  if (
    criteria.recommendationFilter === 'recommendable' &&
    route.recommendationStatus !== 'recommendable'
  ) return false;
  if (
    criteria.recommendationFilter === 'non_recommendable' &&
    route.recommendationStatus === 'recommendable'
  ) return false;
  if (route.centerDistanceMiles > criteria.radiusMiles) return false;
  if (criteria.vehicleClass && !route.vehicleFit.includes(criteria.vehicleClass)) return false;
  if (criteria.minDistanceMiles != null && route.distanceMiles < criteria.minDistanceMiles) return false;
  if (criteria.maxDistanceMiles != null && route.distanceMiles > criteria.maxDistanceMiles) return false;
  if (criteria.minDurationMinutes != null && route.durationMinutes < criteria.minDurationMinutes) return false;
  if (criteria.maxDurationMinutes != null && route.durationMinutes > criteria.maxDurationMinutes) return false;
  if (criteria.minConfidenceScore != null && route.confidenceScore < criteria.minConfidenceScore) return false;
  if (criteria.minRemotenessScore != null && route.remotenessScore < criteria.minRemotenessScore) return false;
  if (criteria.maxRemotenessScore != null && route.remotenessScore > criteria.maxRemotenessScore) return false;
  if (criteria.minCampabilityScore != null && route.campabilityScore < criteria.minCampabilityScore) return false;
  if (
    criteria.availableFuelRangeMiles > 0 &&
    route.minimumFuelRangeMiles > criteria.availableFuelRangeMiles
  ) return false;
  if (
    criteria.availableWaterCapacityGallons > 0 &&
    route.minimumWaterCapacityGallons > criteria.availableWaterCapacityGallons
  ) return false;
  if (criteria.routeType && route.routeType !== criteria.routeType) return false;
  if (criteria.difficulty && route.difficulty !== criteria.difficulty) return false;
  if (
    criteria.sourceAdapter &&
    !route.providerIds.some((providerId) => sourceMatches(providerId, criteria.sourceAdapter))
  ) return false;
  return true;
}

function selectNearbyRouteIds(routes, criteria) {
  return routes
    .filter((route) => routeMatches(route, criteria))
    .sort((left, right) =>
      left.centerDistanceMiles - right.centerDistanceMiles ||
      right.confidenceScore - left.confidenceScore ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.id.localeCompare(right.id))
    .slice(0, clampLimit(criteria.limit));
}

function selectNearbyRouteIdsWithKnnPool(routes, criteria) {
  const withoutRadius = routes.filter((route) =>
    routeMatches(route, { ...criteria, radiusMiles: Number.POSITIVE_INFINITY }));
  const nearestCandidates = withoutRadius
    .sort((left, right) =>
      (left.knnDistanceMiles ?? left.centerDistanceMiles) -
        (right.knnDistanceMiles ?? right.centerDistanceMiles) ||
      left.id.localeCompare(right.id))
    .slice(0, knnCandidateLimit(criteria.limit));
  return nearestCandidates
    .filter((route) => route.centerDistanceMiles <= criteria.radiusMiles)
    .sort((left, right) =>
      left.centerDistanceMiles - right.centerDistanceMiles ||
      right.confidenceScore - left.confidenceScore ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.id.localeCompare(right.id))
    .slice(0, clampLimit(criteria.limit));
}

const baseRoute = {
  reviewStatus: 'approved',
  recommendationStatus: 'recommendable',
  centerDistanceMiles: 25,
  vehicleFit: ['4x4'],
  distanceMiles: 12,
  durationMinutes: 180,
  confidenceScore: 90,
  remotenessScore: 7,
  campabilityScore: 80,
  minimumFuelRangeMiles: 100,
  minimumWaterCapacityGallons: 3,
  routeType: 'point_to_point',
  difficulty: 'moderate',
  providerIds: ['usfs_mvum_mendocino_nf'],
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const criteria = {
  radiusMiles: 100,
  limit: 600,
  recommendationFilter: 'recommendable',
  vehicleClass: '4x4',
  minDistanceMiles: 5,
  maxDistanceMiles: 100,
  minDurationMinutes: 60,
  maxDurationMinutes: 600,
  minConfidenceScore: 70,
  minRemotenessScore: 3,
  maxRemotenessScore: 10,
  minCampabilityScore: 50,
  availableFuelRangeMiles: 200,
  availableWaterCapacityGallons: 5,
  routeType: 'point_to_point',
  difficulty: 'moderate',
  sourceAdapter: 'usfs_mvum',
};

const distantHighConfidenceRoutes = Array.from({ length: 600 }, (_, index) => ({
  ...baseRoute,
  id: `distant-${String(index).padStart(3, '0')}`,
  centerDistanceMiles: 250 + index,
  confidenceScore: 100,
  providerIds: ['usfs_mvum_elsewhere'],
}));
const mendocinoRoutes = Array.from({ length: 23 }, (_, index) => ({
  ...baseRoute,
  id: `mendocino-${String(index).padStart(2, '0')}`,
  centerDistanceMiles: 10 + index,
}));

const legacyPrelimited = [...distantHighConfidenceRoutes, ...mendocinoRoutes]
  .sort((left, right) => right.confidenceScore - left.confidenceScore)
  .slice(0, 600)
  .filter((route) => route.centerDistanceMiles <= criteria.radiusMiles);
assert.strictEqual(
  legacyPrelimited.length,
  0,
  'Fixture should reproduce the pre-limit defect: distant rows crowd nearby rows out.',
);

const nearby = selectNearbyRouteIds([...distantHighConfidenceRoutes, ...mendocinoRoutes], criteria);
assert.strictEqual(nearby.length, 23, 'All 23 eligible Mendocino summaries should survive pre-limit eligibility.');
assert(nearby.every((route) => route.id.startsWith('mendocino-')));

const knnNearby = selectNearbyRouteIdsWithKnnPool(
  [...distantHighConfidenceRoutes, ...mendocinoRoutes],
  { ...criteria, limit: 50 },
);
assert.strictEqual(
  knnNearby.length,
  23,
  'The bounded KNN pool should retain every eligible nearby summary when fewer than the output limit exist.',
);
assert(knnNearby.every((route) => route.id.startsWith('mendocino-')));

const excludedFixtures = [
  { ...baseRoute, id: 'pending-review', reviewStatus: 'pending_review' },
  { ...baseRoute, id: 'not-recommended', recommendationStatus: 'not_recommended' },
  { ...baseRoute, id: 'outside-radius', centerDistanceMiles: 101 },
  { ...baseRoute, id: 'vehicle-mismatch', vehicleFit: ['motorcycle'] },
  { ...baseRoute, id: 'fuel-mismatch', minimumFuelRangeMiles: 250 },
  { ...baseRoute, id: 'source-mismatch', providerIds: ['nps_public_trails'] },
];
assert.deepStrictEqual(
  selectNearbyRouteIds(excludedFixtures, criteria),
  [],
  'Approval, recommendation, radius, vehicle, resource, and source gates must remain enforced.',
);

const oversized = Array.from({ length: 2100 }, (_, index) => ({
  ...baseRoute,
  id: `eligible-${String(index).padStart(4, '0')}`,
  centerDistanceMiles: index / 100,
}));
assert.strictEqual(
  selectNearbyRouteIds(oversized, { ...criteria, limit: 5000 }).length,
  2000,
  'The candidate RPC contract must cap results at 2,000.',
);

console.log('Route catalog nearby-route RPC contract and eligibility checks passed');
