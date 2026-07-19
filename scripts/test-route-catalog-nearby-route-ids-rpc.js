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
const stabilizationMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260718231818_stabilize_route_catalog_pagination.sql',
);
const restoredKnnPageMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260718233128_restore_route_catalog_page_knn_plan.sql',
);
const cursorPaginationMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260719001253_route_catalog_cursor_pagination.sql',
);

assert(fs.existsSync(migrationPath), 'Nearby route ID RPC migration should exist.');
assert(
  fs.existsSync(optimizationMigrationPath),
  'Nearby route ID RPC timeout optimization migration should exist.',
);
assert(
  fs.existsSync(stabilizationMigrationPath),
  'Nearby route ID RPC pagination stabilization migration should exist.',
);
assert(
  fs.existsSync(restoredKnnPageMigrationPath),
  'Nearby route page RPC KNN-plan restoration migration should exist.',
);
assert(
  fs.existsSync(cursorPaginationMigrationPath),
  'Nearby route cursor pagination migration should exist.',
);

const migration = fs.readFileSync(migrationPath, 'utf8');
const normalizedMigration = migration.replace(/\s+/g, ' ').toLowerCase();
const optimizationMigration = fs.readFileSync(optimizationMigrationPath, 'utf8');
const normalizedOptimizationMigration = optimizationMigration.replace(/\s+/g, ' ').toLowerCase();
const stabilizationMigration = fs.readFileSync(stabilizationMigrationPath, 'utf8');
const normalizedStabilizationMigration = stabilizationMigration.replace(/\s+/g, ' ').toLowerCase();
const restoredKnnPageMigration = fs.readFileSync(restoredKnnPageMigrationPath, 'utf8');
const normalizedRestoredKnnPageMigration = restoredKnnPageMigration.replace(/\s+/g, ' ').toLowerCase();
const cursorPaginationMigration = fs.readFileSync(cursorPaginationMigrationPath, 'utf8');
const normalizedCursorPaginationMigration = cursorPaginationMigration.replace(/\s+/g, ' ').toLowerCase();

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
assert(
  normalizedStabilizationMigration.includes(
    'create or replace function public.route_catalog_nearby_public_route_page',
  ) &&
    normalizedStabilizationMigration.includes('p_offset integer default 0') &&
    normalizedStabilizationMigration.includes('operator(public.<->)') &&
    normalizedStabilizationMigration.includes('public.st_distance(') &&
    normalizedStabilizationMigration.includes('public.st_dwithin(') &&
    normalizedStabilizationMigration.includes('offset (select request.row_offset from request)') &&
    normalizedStabilizationMigration.includes('limit (select request.row_limit from request)'),
  'The pagination repair should expose an offset-aware page RPC with one stable KNN order, exact display distance, and exact radius qualification.',
);
assert(
  normalizedStabilizationMigration.indexOf('public.st_dwithin') <
      normalizedStabilizationMigration.indexOf('order by') &&
    normalizedStabilizationMigration.indexOf('order by') <
      normalizedStabilizationMigration.indexOf('offset (select request.row_offset from request)') &&
    normalizedStabilizationMigration.indexOf('offset (select request.row_offset from request)') <
      normalizedStabilizationMigration.indexOf('limit (select request.row_limit from request)'),
  'Exact radius eligibility and stable ordering must be applied before OFFSET/LIMIT assigns page slots.',
);
assert(
  normalizedStabilizationMigration.includes('not exists ( select 1 from public.verified_route_sources restricted_vrs') &&
    normalizedStabilizationMigration.includes("restricted_rs.source_type, ''))) = 'partner_restricted'") &&
    normalizedStabilizationMigration.includes("restricted_rs.authority, ''))) = 'partner_restricted'") &&
    normalizedStabilizationMigration.indexOf('not exists ( select 1 from public.verified_route_sources restricted_vrs') <
      normalizedStabilizationMigration.indexOf('offset (select request.row_offset from request)'),
  'Restricted source records must be excluded before public route page slots are assigned.',
);
assert(
  normalizedStabilizationMigration.includes('security invoker') &&
    normalizedStabilizationMigration.includes("set search_path = ''") &&
    normalizedStabilizationMigration.includes('from public, anon, authenticated') &&
    normalizedStabilizationMigration.includes('to service_role'),
  'The stabilization migration must preserve the service-role-only security-invoker contract.',
);
assert(
  normalizedRestoredKnnPageMigration.includes(
    'create or replace function public.route_catalog_nearby_public_route_page',
  ) &&
    normalizedRestoredKnnPageMigration.includes('nearest_public_candidates as materialized') &&
    normalizedRestoredKnnPageMigration.includes(
      'vr.geog operator(public.<->) public.st_setsrid(public.st_makepoint($2, $1), 4326)::public.geography',
    ) &&
    normalizedRestoredKnnPageMigration.includes(
      'limit (select request.candidate_limit from request)',
    ),
  'The forward repair must bind the KNN order directly to request parameters and bound its indexed prefix.',
);
assert(
  normalizedRestoredKnnPageMigration.indexOf(
    'limit (select request.candidate_limit from request)',
  ) < normalizedRestoredKnnPageMigration.indexOf('where public.st_dwithin(') &&
    normalizedRestoredKnnPageMigration.includes(
      'public.st_dwithin( nearest_public_candidates.geog, request.search_center, request.radius_meters, false )',
    ) &&
    normalizedRestoredKnnPageMigration.includes(
      'public.st_distance( nearest_public_candidates.geog, request.search_center, false )',
    ),
  'Radius qualification must follow the bounded KNN prefix and use the same spherical geography metric.',
);
assert(
  normalizedRestoredKnnPageMigration.indexOf(
    'not exists ( select 1 from public.verified_route_sources restricted_vrs',
  ) < normalizedRestoredKnnPageMigration.indexOf(
    'limit (select request.candidate_limit from request)',
  ) &&
    normalizedRestoredKnnPageMigration.includes('security invoker') &&
    normalizedRestoredKnnPageMigration.includes("set search_path = ''") &&
    normalizedRestoredKnnPageMigration.includes('from public, anon, authenticated') &&
    normalizedRestoredKnnPageMigration.includes('to service_role'),
  'Restricted records must be filtered before the KNN prefix slots without weakening RPC grants.',
);
assert(
  normalizedCursorPaginationMigration.includes(
    'verified_routes_public_recommendation_bbox_idx',
  ) &&
    !normalizedCursorPaginationMigration.includes('create index') &&
    normalizedCursorPaginationMigration.includes(
      'create or replace function public.route_catalog_nearby_public_route_cursor_page',
    ) &&
    normalizedCursorPaginationMigration.includes('p_cursor_route_id uuid default null') &&
    normalizedCursorPaginationMigration.includes(
      '(vr.center_latitude, vr.center_longitude, vr.id) > (scan_cursor_latitude, scan_cursor_longitude, scan_cursor_route_id)',
    ) &&
    normalizedCursorPaginationMigration.includes(
      'vr.center_latitude >= scan_cursor_latitude',
    ) &&
    normalizedCursorPaginationMigration.includes(
      'scan_cursor_latitude double precision := -91',
    ) &&
    normalizedCursorPaginationMigration.includes(
      "scan_cursor_route_id uuid := '00000000-0000-0000-0000-000000000000'::uuid",
    ) &&
    normalizedCursorPaginationMigration.includes(
      'select vr.center_latitude, vr.center_longitude, vr.id into scan_cursor_latitude, scan_cursor_longitude, scan_cursor_route_id',
    ) &&
    !normalizedCursorPaginationMigration.includes('scan_cursor_latitude is null') &&
    normalizedCursorPaginationMigration.includes(
      'when min_latitude <= -90 or max_latitude >= 90 then 180::double precision',
    ) &&
    normalizedCursorPaginationMigration.includes(
      'sin(angular_radius) / greatest( abs(cos(radians(p_latitude)))',
    ) &&
    normalizedCursorPaginationMigration.includes(
      'earth_radius_meters constant double precision := 6371000',
    ) &&
    normalizedCursorPaginationMigration.includes('limit batch_limit'),
  'The cursor repair must use a deterministic route-ID-resolved keyset, a pole-safe spherical longitude bound, and bounded ordered scan batches.',
);
assert(
  normalizedCursorPaginationMigration.includes(
    'public.st_dwithin( vr.geog, search_center, radius_meters, false ) as within_radius',
  ) &&
    normalizedCursorPaginationMigration.includes("vr.review_status = 'approved'") &&
    normalizedCursorPaginationMigration.includes("vr.recommendation_status = 'recommendable'") &&
    normalizedCursorPaginationMigration.indexOf(
      'not exists ( select 1 from public.verified_route_sources restricted_vrs',
    ) < normalizedCursorPaginationMigration.indexOf('limit batch_limit') &&
    normalizedCursorPaginationMigration.includes('return next'),
  'Cursor pages must enforce exact radius and public source/eligibility gates before yielding route slots.',
);
assert(
  normalizedCursorPaginationMigration.includes('security invoker') &&
    normalizedCursorPaginationMigration.includes("set search_path = ''") &&
    normalizedCursorPaginationMigration.includes('from public, anon, authenticated') &&
    normalizedCursorPaginationMigration.includes('to service_role'),
  'The cursor RPC must remain service-role-only with an empty search path.',
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
      (left.knnDistanceMiles ?? left.centerDistanceMiles) -
        (right.knnDistanceMiles ?? right.centerDistanceMiles) ||
      right.confidenceScore - left.confidenceScore ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.id.localeCompare(right.id))
    .slice(0, clampLimit(criteria.limit));
}

function selectStablePublicPage(routes, criteria) {
  const offset = Math.max(0, criteria.offset ?? 0);
  const limit = Math.max(1, Math.min(criteria.limit ?? 51, 501));
  return routes
    .filter((route) => !route.restricted && routeMatches(route, criteria))
    .sort((left, right) =>
      (left.knnDistanceMiles ?? left.centerDistanceMiles) -
        (right.knnDistanceMiles ?? right.centerDistanceMiles) ||
      right.confidenceScore - left.confidenceScore ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.id.localeCompare(right.id))
    .slice(offset, offset + limit);
}

function selectStablePublicCursorPage(routes, criteria, cursorRouteId = null) {
  const pageSize = Math.max(1, Math.min(criteria.pageSize ?? 50, 500));
  const cursorRoute = cursorRouteId
    ? routes.find((route) => route.id === cursorRouteId)
    : null;
  const tupleAfterCursor = (route) => {
    if (!cursorRoute) return true;
    return route.centerLatitude > cursorRoute.centerLatitude ||
      (route.centerLatitude === cursorRoute.centerLatitude &&
        route.centerLongitude > cursorRoute.centerLongitude) ||
      (route.centerLatitude === cursorRoute.centerLatitude &&
        route.centerLongitude === cursorRoute.centerLongitude &&
        route.id.localeCompare(cursorRoute.id) > 0);
  };
  const lookahead = routes
    .filter((route) => !route.restricted && routeMatches(route, criteria) && tupleAfterCursor(route))
    .sort((left, right) =>
      left.centerLatitude - right.centerLatitude ||
      left.centerLongitude - right.centerLongitude ||
      left.id.localeCompare(right.id))
    .slice(0, pageSize + 1);
  const records = lookahead.slice(0, pageSize);
  return {
    records,
    hasMore: lookahead.length > pageSize,
    nextCursorRouteId: lookahead.length > pageSize ? records[records.length - 1].id : null,
  };
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

const shiftingExactDistanceRoutes = Array.from({ length: 80 }, (_, index) => ({
  ...baseRoute,
  id: `stable-prefix-${String(index).padStart(2, '0')}`,
  knnDistanceMiles: index + 1,
  centerDistanceMiles: index === 60 ? 0.5 : index + 1,
}));
const stablePrefix50 = selectNearbyRouteIdsWithKnnPool(
  shiftingExactDistanceRoutes,
  { ...criteria, radiusMiles: 100, limit: 50, sourceAdapter: '' },
);
const stablePrefix80 = selectNearbyRouteIdsWithKnnPool(
  shiftingExactDistanceRoutes,
  { ...criteria, radiusMiles: 100, limit: 80, sourceAdapter: '' },
);
assert.deepStrictEqual(
  stablePrefix80.slice(0, 50).map((route) => route.id),
  stablePrefix50.map((route) => route.id),
  'Growing the KNN pool must preserve every earlier pagination boundary even when exact spheroid distance would reorder a later row.',
);

const stablePublicRoutes = Array.from({ length: 101 }, (_, index) => ({
  ...baseRoute,
  id: `public-page-${String(index).padStart(3, '0')}`,
  knnDistanceMiles: index + 1,
  centerDistanceMiles: index === 75 ? 0.25 : index + 1,
}));
const restrictedPageSlot = {
  ...baseRoute,
  id: 'restricted-page-slot',
  knnDistanceMiles: 25.5,
  centerDistanceMiles: 25.5,
  restricted: true,
};
const stablePageOne = selectStablePublicPage(
  [...stablePublicRoutes, restrictedPageSlot],
  { ...criteria, radiusMiles: 500, sourceAdapter: '', offset: 0, limit: 50 },
);
const stablePageTwo = selectStablePublicPage(
  [...stablePublicRoutes, restrictedPageSlot],
  { ...criteria, radiusMiles: 500, sourceAdapter: '', offset: 50, limit: 50 },
);
const stablePageThree = selectStablePublicPage(
  [...stablePublicRoutes, restrictedPageSlot],
  { ...criteria, radiusMiles: 500, sourceAdapter: '', offset: 100, limit: 50 },
);
assert.strictEqual(stablePageOne.length, 50);
assert.strictEqual(stablePageTwo.length, 50);
assert.strictEqual(stablePageThree.length, 1);
assert.strictEqual(
  new Set([...stablePageOne, ...stablePageTwo, ...stablePageThree].map((route) => route.id)).size,
  101,
  'Every revealable route must appear exactly once across stable public pages.',
);
assert(
  [...stablePageOne, ...stablePageTwo, ...stablePageThree]
    .every((route) => route.id !== restrictedPageSlot.id),
  'Restricted diagnostics must not consume a public route slot.',
);

const cursorPublicRoutes = Array.from({ length: 101 }, (_, index) => ({
  ...baseRoute,
  id: `cursor-page-${String(index).padStart(3, '0')}`,
  centerLatitude: 30 + Math.floor(index / 7) / 100,
  centerLongitude: -120 + (index % 7) / 100,
  centerDistanceMiles: index === 100 ? 3 : 20 + index / 10,
}));
const restrictedCursorSlot = {
  ...baseRoute,
  id: 'cursor-page-restricted',
  centerLatitude: 30.035,
  centerLongitude: -119.995,
  restricted: true,
};
const cursorPages = [];
let cursorRouteId = null;
do {
  const cursorPage = selectStablePublicCursorPage(
    [...cursorPublicRoutes, restrictedCursorSlot],
    { ...criteria, radiusMiles: 500, sourceAdapter: '', pageSize: 50 },
    cursorRouteId,
  );
  cursorPages.push(cursorPage);
  cursorRouteId = cursorPage.nextCursorRouteId;
} while (cursorRouteId);
assert.deepStrictEqual(cursorPages.map((page) => page.records.length), [50, 50, 1]);
assert.deepStrictEqual(cursorPages.map((page) => page.hasMore), [true, true, false]);
const cursorTraversal = cursorPages.flatMap((page) => page.records);
assert.strictEqual(cursorTraversal.length, 101);
assert.strictEqual(new Set(cursorTraversal.map((route) => route.id)).size, 101);
assert.strictEqual(cursorTraversal[50].id, cursorPages[1].records[0].id);
assert.strictEqual(cursorTraversal[100].centerDistanceMiles, 3);
assert(
  cursorTraversal.every((route) => route.id !== restrictedCursorSlot.id),
  'A restricted provider diagnostic must not consume a cursor-page route slot.',
);
for (let index = 1; index < cursorTraversal.length; index += 1) {
  const previous = cursorTraversal[index - 1];
  const current = cursorTraversal[index];
  assert(
    previous.centerLatitude < current.centerLatitude ||
      (previous.centerLatitude === current.centerLatitude &&
        previous.centerLongitude < current.centerLongitude) ||
      (previous.centerLatitude === current.centerLatitude &&
        previous.centerLongitude === current.centerLongitude &&
        previous.id.localeCompare(current.id) < 0),
    'Cursor traversal order must be strictly increasing by latitude, longitude, and route ID.',
  );
}

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
