/* global __dirname, Buffer */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

const providerContractPath = path.join(
  root,
  'supabase',
  'functions',
  'route-catalog-search',
  'providerContract.ts',
);
const edgeFunctionPath = path.join(
  root,
  'supabase',
  'functions',
  'route-catalog-search',
  'index.ts',
);
const verifiedRoutesSourceVersionMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260715143000_verified_routes_source_version_trigger.sql',
);
const providerSource = fs.readFileSync(providerContractPath, 'utf8');

const {
  buildSafeRouteCatalogDiagnostic,
  decodeRouteCatalogPageCursor,
  encodeRouteCatalogPageCursor,
  expandRouteCatalogCandidateLimit,
  hasRestrictedRouteCatalogSource,
  nextRouteCatalogCandidateInspectionBatch,
  normalizeRouteCatalogPagination,
  normalizeRouteCatalogResultLimit,
  partitionRouteCatalogRecordsByPublicEligibility,
  partitionRouteCatalogRecordsForPage,
  partitionRestrictedRouteCatalogRecords,
  routeCatalogCursorFingerprint,
  selectRouteCatalogSearchResults,
  ROUTE_CATALOG_CANDIDATE_INSPECTION_LIMIT,
  ROUTE_CATALOG_SEARCH_RESULT_LIMIT,
} = require(providerContractPath);

const restrictedCoordinate = [-120.781234, 38.921234];
const restrictedRecord = {
  id: 'restricted-route-id',
  public_id: 'restricted-route-public-id',
  name: 'Restricted route diagnostic',
  route_type: 'loop',
  center_latitude: restrictedCoordinate[1],
  center_longitude: restrictedCoordinate[0],
  route_geometry: {
    type: 'LineString',
    coordinates: [restrictedCoordinate, [-120.75, 38.95]],
  },
  route_intelligence: {
    trailheadCoordinate: {
      latitude: restrictedCoordinate[1],
      longitude: restrictedCoordinate[0],
    },
  },
  raw_payload: { secret: 'must-not-cross-provider-boundary' },
  review_status: 'approved',
  recommendation_status: 'recommendable',
  updated_at: '2026-07-15T00:00:00.000Z',
  source_records: [{
    provider_id: 'partner-provider',
    source_type: 'partner_restricted',
    authority: 'partner_restricted',
    use_permission: 'not_granted',
  }],
};
const officialRecord = {
  id: 'official-route-id',
  public_id: 'official-route-public-id',
  name: 'Official route',
  route_type: 'loop',
  route_geometry: {
    type: 'LineString',
    coordinates: [[-121, 39], [-120.9, 39.1]],
  },
  source_records: [{ source_type: 'official', authority: 'official' }],
};

assert.strictEqual(hasRestrictedRouteCatalogSource(restrictedRecord), true);
assert.strictEqual(hasRestrictedRouteCatalogSource(officialRecord), false);

const partition = partitionRestrictedRouteCatalogRecords([restrictedRecord, officialRecord]);
assert.deepStrictEqual(partition.records, [officialRecord]);
assert.strictEqual(partition.diagnosticRecords.length, 1);
assert.strictEqual(partition.diagnosticRecords[0].routeId, 'restricted-route-id');
assert.deepStrictEqual(partition.diagnosticRecords[0].exclusionReasons, ['source_restricted']);

const paginatedOfficials = Array.from({ length: 51 }, (_, index) => ({
  ...officialRecord,
  id: `official-route-${String(index).padStart(2, '0')}`,
  public_id: `official-route-public-${String(index).padStart(2, '0')}`,
}));
const interleavedProviderRecords = [
  ...paginatedOfficials.slice(0, 25),
  restrictedRecord,
  ...paginatedOfficials.slice(25),
];
const revealablePageOne = partitionRouteCatalogRecordsForPage(interleavedProviderRecords, {
  offset: 0,
  pageSize: 50,
});
const revealablePageTwo = partitionRouteCatalogRecordsForPage(interleavedProviderRecords, {
  offset: 50,
  pageSize: 50,
});
assert.strictEqual(revealablePageOne.records.length, 50);
assert.strictEqual(revealablePageOne.diagnosticRecords.length, 1);
assert.strictEqual(revealablePageOne.hasMoreRevealable, true);
assert.strictEqual(revealablePageTwo.records.length, 1);
assert.strictEqual(revealablePageTwo.records[0].id, paginatedOfficials[50].id);
assert.strictEqual(
  new Set([...revealablePageOne.records, ...revealablePageTwo.records].map((record) => record.id)).size,
  51,
  'Restricted diagnostics must not consume revealable route slots or create cross-page duplicates.',
);
assert.strictEqual(expandRouteCatalogCandidateLimit(51, 50), 102);
assert.strictEqual(expandRouteCatalogCandidateLimit(1500, 50), 2000);
assert.deepStrictEqual(
  [0, 500, 1000, 1500, 2000].map(nextRouteCatalogCandidateInspectionBatch),
  [
    { pageSize: 500, queryLimit: 501 },
    { pageSize: 500, queryLimit: 501 },
    { pageSize: 500, queryLimit: 501 },
    { pageSize: 500, queryLimit: 501 },
    null,
  ],
  'Internal provider inspection must cover four cursor batches up to the existing 2,000-candidate bound.',
);

const rankedCandidates = Array.from({ length: 25 }, (_, index) => ({
  ...officialRecord,
  id: `ranked-route-${String(index).padStart(2, '0')}`,
  public_id: `ranked-route-public-${String(index).padStart(2, '0')}`,
  rank: index,
}));
const higherRankedDuplicate = {
  ...rankedCandidates[5],
  id: 'ranked-route-duplicate-winner',
  rank: 100,
};
const selectedSearchResults = selectRouteCatalogSearchResults(
  [restrictedRecord, ...rankedCandidates, higherRankedDuplicate],
  {
    requestedLimit: 500,
    compareRecords: (left, right) => Number(right.rank ?? 0) - Number(left.rank ?? 0),
  },
);
assert.strictEqual(ROUTE_CATALOG_SEARCH_RESULT_LIMIT, 20);
assert.strictEqual(ROUTE_CATALOG_CANDIDATE_INSPECTION_LIMIT, 500);
assert.strictEqual(selectedSearchResults.resultLimit, 20);
assert.strictEqual(selectedSearchResults.records.length, 20);
assert.strictEqual(selectedSearchResults.records[0].id, higherRankedDuplicate.id);
assert.strictEqual(selectedSearchResults.revealableMatchedCount, 25);
assert.strictEqual(selectedSearchResults.additionalMatchesAvailable, true);
assert.strictEqual(selectedSearchResults.diagnosticRecords.length, 1);
assert.strictEqual(
  new Set(selectedSearchResults.records.map((record) => record.public_id)).size,
  selectedSearchResults.records.length,
  'Provider filtering, deterministic ranking, and identity dedupe must all happen before the final result slice.',
);
const reducedSearchResults = selectRouteCatalogSearchResults(rankedCandidates, {
  requestedLimit: 5,
  compareRecords: (left, right) => Number(right.rank ?? 0) - Number(left.rank ?? 0),
});
assert.strictEqual(reducedSearchResults.resultLimit, 5);
assert.strictEqual(reducedSearchResults.records.length, 5);
assert.strictEqual(reducedSearchResults.additionalMatchesAvailable, true);
assert.deepStrictEqual(
  selectRouteCatalogSearchResults([
    { ...officialRecord, id: 'route-b', public_id: 'route-b' },
    { ...officialRecord, id: 'route-a', public_id: 'route-a' },
  ]).records.map((record) => record.id),
  ['route-a', 'route-b'],
  'Equal-ranked provider rows must use a deterministic identity tie-break.',
);

const eligibilityNowMs = Date.parse('2026-07-18T12:00:00.000Z');
function eligiblePublicSummary(index, overrides = {}) {
  const id = `eligible-public-${String(index).padStart(2, '0')}`;
  return {
    ...officialRecord,
    id,
    public_id: id,
    name: `Eligible public route ${index}`,
    center_latitude: 39,
    center_longitude: -120,
    route_geometry: undefined,
    geometry_quality: 'good',
    distance_miles: 2 + index,
    official_access_coverage_pct: 100,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    vehicle_mismatch: false,
    review_status: 'approved',
    recommendation_status: 'recommendable',
    rank: index,
    source_records: [{
      provider_id: `official-provider-${index}`,
      label: 'Official route source',
      source_type: 'official',
      authority: 'official agency',
      last_verified_at: '2026-07-01T00:00:00.000Z',
      use_permission: 'granted',
    }],
    ...overrides,
  };
}

const preselectionBlockedRecords = [
  eligiblePublicSummary(100, {
    id: 'blocked-access',
    public_id: 'blocked-access',
    official_access_coverage_pct: 79,
    rank: 10_000,
  }),
  eligiblePublicSummary(101, {
    id: 'blocked-current-condition',
    public_id: 'blocked-current-condition',
    current_condition: { blockers: ['Current-condition overlay reports an active official closure.'] },
    rank: 9_999,
  }),
  eligiblePublicSummary(102, {
    id: 'blocked-stale-source',
    public_id: 'blocked-stale-source',
    source_records: [{
      provider_id: 'stale-official-provider',
      label: 'Stale official source',
      source_type: 'official',
      authority: 'official agency',
      last_verified_at: '2024-01-01T00:00:00.000Z',
      use_permission: 'granted',
    }],
    rank: 9_998,
  }),
  eligiblePublicSummary(103, {
    id: 'blocked-source-identity',
    public_id: 'blocked-source-identity',
    source_records: [{
      provider_id: 'missing-label-provider',
      source_type: 'official',
      authority: 'official agency',
      last_verified_at: '2026-07-01T00:00:00.000Z',
    }],
    rank: 9_997,
  }),
  eligiblePublicSummary(104, {
    id: 'blocked-source-restriction',
    public_id: 'blocked-source-restriction',
    source_records: [{
      provider_id: 'bdr',
      label: 'Known restricted provider',
      source_type: 'official',
      authority: 'official agency',
      last_verified_at: '2026-07-01T00:00:00.000Z',
      use_permission: 'granted',
    }],
    rank: 9_996,
  }),
  eligiblePublicSummary(105, {
    id: 'blocked-moderation',
    public_id: 'blocked-moderation',
    review_status: 'pending_review',
    rank: 9_995,
  }),
  eligiblePublicSummary(106, {
    id: 'blocked-format',
    public_id: 'blocked-format',
    route_type: 'unknown',
    rank: 9_994,
  }),
  eligiblePublicSummary(107, {
    id: 'blocked-summary-geometry',
    public_id: 'blocked-summary-geometry',
    geometry_quality: 'missing',
    rank: 9_993,
  }),
  eligiblePublicSummary(108, {
    id: 'blocked-vehicle',
    public_id: 'blocked-vehicle',
    vehicle_mismatch: true,
    rank: 9_992,
  }),
];
const eligiblePool = Array.from({ length: 25 }, (_, index) => eligiblePublicSummary(index));
const publicEligibilityPartition = partitionRouteCatalogRecordsByPublicEligibility(
  [...preselectionBlockedRecords, ...eligiblePool],
  { nowMs: eligibilityNowMs, includeGeometry: false, includePreviewGeometry: false },
);
assert.strictEqual(publicEligibilityPartition.records.length, 25);
assert.strictEqual(publicEligibilityPartition.diagnosticRecords.length, preselectionBlockedRecords.length);
assert(
  publicEligibilityPartition.records.some((record) => record.id === 'eligible-public-00'),
  'An otherwise eligible two-mile summary route must survive Edge preselection.',
);
const publicEligibilityReasons = new Map(
  publicEligibilityPartition.diagnosticRecords.map((diagnostic) => [
    diagnostic.routeId,
    new Set(diagnostic.exclusionReasons),
  ]),
);
[
  ['blocked-access', 'access_unverified'],
  ['blocked-current-condition', 'current_condition_blocked'],
  ['blocked-stale-source', 'stale_required_source'],
  ['blocked-source-identity', 'access_unverified'],
  ['blocked-source-restriction', 'source_restricted'],
  ['blocked-moderation', 'moderation_pending'],
  ['blocked-format', 'unsupported_route_type'],
  ['blocked-summary-geometry', 'missing_geometry'],
  ['blocked-vehicle', 'vehicle_incompatible'],
].forEach(([routeId, reason]) => {
  assert(
    publicEligibilityReasons.get(routeId)?.has(reason),
    `${routeId} must retain the ${reason} diagnostic after Edge preselection.`,
  );
});
const eligibilityTopTwenty = selectRouteCatalogSearchResults(
  publicEligibilityPartition.records,
  {
    requestedLimit: 20,
    compareRecords: (left, right) => Number(right.rank ?? 0) - Number(left.rank ?? 0),
  },
);
assert.strictEqual(eligibilityTopTwenty.records.length, 20);
assert(
  eligibilityTopTwenty.records.every((record) => String(record.id).startsWith('eligible-public-')),
  'All public eligibility gates must run before deterministic ranking and the top-20 slice.',
);
assert.strictEqual(
  eligibilityTopTwenty.records[0].id,
  'eligible-public-24',
  'Blocked high-rank records must not displace a lower-ranked eligible route.',
);

const invalidFullGeometry = partitionRouteCatalogRecordsByPublicEligibility([
  eligiblePublicSummary(200, {
    id: 'blocked-impossible-geometry',
    public_id: 'blocked-impossible-geometry',
    route_geometry: {
      type: 'LineString',
      coordinates: [[-120, 39], [0, 0]],
    },
  }),
], {
  nowMs: eligibilityNowMs,
  includeGeometry: true,
});
assert.strictEqual(invalidFullGeometry.records.length, 0);
assert(
  invalidFullGeometry.diagnosticRecords[0].exclusionReasons.includes('invalid_geometry'),
  'A full-geometry route with an impossible jump must be rejected before ranking.',
);

const invalidSummaryGeometry = partitionRouteCatalogRecordsByPublicEligibility([
  eligiblePublicSummary(202, {
    id: 'blocked-summary-impossible-geometry',
    public_id: 'blocked-summary-impossible-geometry',
    route_geometry: {
      type: 'LineString',
      coordinates: [[-120, 39], [0, 0]],
    },
  }),
  eligiblePublicSummary(203, {
    id: 'blocked-summary-malformed-geometry',
    public_id: 'blocked-summary-malformed-geometry',
    route_geometry: {
      type: 'LineString',
      coordinates: [[-120, 39]],
    },
  }),
], {
  nowMs: eligibilityNowMs,
  includeGeometry: false,
  includePreviewGeometry: false,
});
assert.strictEqual(invalidSummaryGeometry.records.length, 0);
assert(
  invalidSummaryGeometry.diagnosticRecords.every((diagnostic) =>
    diagnostic.exclusionReasons.includes('invalid_geometry')),
  'Known malformed or impossible raw geometry must be rejected before the summary top-20 slice.',
);

const geometryCenteredRoute = partitionRouteCatalogRecordsByPublicEligibility([
  eligiblePublicSummary(201, {
    id: 'geometry-centered-route',
    public_id: 'geometry-centered-route',
    center_latitude: undefined,
    center_longitude: undefined,
    route_geometry: {
      type: 'LineString',
      coordinates: [[-120, 39], [-119.99, 39.01]],
    },
  }),
], {
  nowMs: eligibilityNowMs,
  includeGeometry: true,
});
assert.strictEqual(
  geometryCenteredRoute.records.length,
  1,
  'Valid detail geometry must supply route identity/location when explicit center fields are absent.',
);
const geometryCenteredSummary = partitionRouteCatalogRecordsByPublicEligibility([
  eligiblePublicSummary(204, {
    id: 'geometry-centered-summary',
    public_id: 'geometry-centered-summary',
    center_latitude: undefined,
    center_longitude: undefined,
    route_geometry: {
      type: 'LineString',
      coordinates: [[-120, 39], [-119.99, 39.01]],
    },
  }),
], {
  nowMs: eligibilityNowMs,
  includeGeometry: false,
  includePreviewGeometry: false,
});
assert.strictEqual(
  geometryCenteredSummary.records.length,
  0,
  'An omitted-geometry summary must retain an explicit center so client normalization cannot discard a selected slot.',
);

const serializedProviderBoundary = JSON.stringify({
  records: partition.records,
  diagnosticRecords: partition.diagnosticRecords,
});
const serializedDiagnostic = JSON.stringify(partition.diagnosticRecords[0]);
[
  'raw_payload',
  'must-not-cross-provider-boundary',
  String(restrictedCoordinate[0]),
  String(restrictedCoordinate[1]),
].forEach((forbiddenValue) => {
  assert(
    !serializedProviderBoundary.includes(forbiddenValue),
    `Raw provider-boundary serialization must not contain restricted ${forbiddenValue}.`,
  );
});
[
  'route_geometry',
  'routeGeometry',
  'route_intelligence',
  'routeIntelligence',
  'center_latitude',
  'center_longitude',
  'coordinates',
  'raw_payload',
].forEach((forbiddenKey) => {
  assert(
    !serializedDiagnostic.includes(forbiddenKey),
    `Safe restricted diagnostic must not contain ${forbiddenKey}.`,
  );
});

const curationDiagnostic = buildSafeRouteCatalogDiagnostic({
  id: 'curation-route',
  public_id: 'curation-route-public',
  name: 'Curation route',
  route_type: 'loop',
  geometry_quality: 'missing',
  official_access_coverage_pct: 20,
  unknown_access_coverage_pct: 80,
  active_closure_count: 1,
  vehicle_mismatch: true,
  seasonal_restriction_count: 1,
  stale_at: '2020-01-01T00:00:00.000Z',
  review_status: 'needs_more_data',
  recommendation_status: 'needs_review',
});
assert(curationDiagnostic);
assert.deepStrictEqual(
  new Set(curationDiagnostic.exclusionReasons),
  new Set([
    'missing_geometry',
    'access_unverified',
    'current_condition_blocked',
    'moderation_pending',
    'vehicle_incompatible',
    'date_or_season_blocked',
    'stale_required_source',
  ]),
);

assert.deepStrictEqual(
  normalizeRouteCatalogPagination({ page: 2, pageSize: 25 }),
  { page: 1, pageSize: 20, offset: 0, windowEnd: 20, windowExceeded: false },
);
assert.deepStrictEqual(
  normalizeRouteCatalogPagination({ page: 3, limit: 7.9, offset: 75 }),
  { page: 1, pageSize: 7, offset: 0, windowEnd: 7, windowExceeded: false },
);
assert.strictEqual(normalizeRouteCatalogResultLimit(undefined), 20);
assert.strictEqual(normalizeRouteCatalogResultLimit(0), 20);
assert.strictEqual(normalizeRouteCatalogResultLimit(-10), 20);
assert.strictEqual(normalizeRouteCatalogResultLimit(500), 20);
assert.strictEqual(normalizeRouteCatalogResultLimit('6.8'), 6);
assert.deepStrictEqual(
  normalizeRouteCatalogPagination({ page: 5, pageSize: 500, offset: 2_000 }),
  { page: 1, pageSize: 20, offset: 0, windowEnd: 20, windowExceeded: false },
  'Public page and offset inputs must normalize to one total-search result set.',
);

const edgeSource = fs.readFileSync(edgeFunctionPath, 'utf8');
const edgeTranspile = ts.transpileModule(edgeSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: edgeFunctionPath,
  reportDiagnostics: true,
});
assert.deepStrictEqual(
  (edgeTranspile.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error),
  [],
  'The route-catalog-search Edge entry must remain valid TypeScript.',
);

function loadEdgeRefinementHelpers(source) {
  const edgePrefix = source.split(/\r?\nserve\(async/)[0];
  const isolatedSource = `${edgePrefix.replace(/^import[\s\S]*?;\r?\n/gm, '')}
module.exports = {
  normalizeExploreRefinement,
  routeMatchesExploreRefinement,
  filterRouteCatalogRecordsByExploreRefinement,
  normalizeRouteCatalogViewportFilter,
  filterRouteCatalogRecordsByViewport,
};`;
  const transpiled = ts.transpileModule(isolatedSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: edgeFunctionPath,
    reportDiagnostics: true,
  });
  assert.deepStrictEqual(
    (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error),
    [],
    'The isolated Edge refinement contract must remain valid TypeScript.',
  );
  const helperModule = { exports: {} };
  Function('module', 'exports', transpiled.outputText)(helperModule, helperModule.exports);
  return helperModule.exports;
}

const {
  normalizeExploreRefinement,
  routeMatchesExploreRefinement,
  filterRouteCatalogRecordsByExploreRefinement,
  normalizeRouteCatalogViewportFilter,
  filterRouteCatalogRecordsByViewport,
} = loadEdgeRefinementHelpers(edgeSource);

assert.strictEqual(normalizeExploreRefinement('dayTrip'), 'dayTrip');
assert.strictEqual(normalizeExploreRefinement('weekend_trip'), 'weekendTrip');
assert.strictEqual(normalizeExploreRefinement('remoteness'), 'remoteness');
assert.strictEqual(normalizeExploreRefinement('expedition'), 'expedition');
assert.strictEqual(normalizeExploreRefinement('unsupported'), null);

const edgeRefinementRecords = [
  { id: 'day', estimated_duration_minutes: 600, description: 'Local route' },
  {
    id: 'camping-day',
    estimated_duration_minutes: 600,
    route_intelligence: { requiresCamping: true },
  },
  { id: 'weekend', estimated_duration_minutes: 900 },
  { id: 'expedition-duration', estimated_duration_minutes: 1_500 },
  { id: 'expedition-distance', distance_miles: 180 },
  {
    id: 'remote-distance',
    remoteness_score: 3,
    route_intelligence: { distanceToNearestTownMiles: 18 },
  },
  {
    id: 'near-distance-high-score',
    remoteness_score: 9,
    route_intelligence: { distanceToNearestTownMiles: 3 },
  },
  { id: 'remote-score', remoteness_score: 8 },
  { id: 'hinted-day', description: 'Short same-day trail run.' },
  { id: 'hinted-weekend', description: 'Weekend overnight route.' },
];

assert.deepStrictEqual(
  filterRouteCatalogRecordsByExploreRefinement(edgeRefinementRecords, 'dayTrip').map((record) => record.id),
  ['day', 'hinted-day'],
  'Day Trip must use the 12-hour threshold and reject a route that requires camping.',
);
assert.deepStrictEqual(
  filterRouteCatalogRecordsByExploreRefinement(edgeRefinementRecords, 'weekendTrip').map((record) => record.id),
  ['weekend', 'hinted-weekend'],
  'Weekend Trip must use the greater-than-12 through 24-hour window plus explicit hints.',
);
assert.deepStrictEqual(
  filterRouteCatalogRecordsByExploreRefinement(edgeRefinementRecords, 'expedition').map((record) => record.id),
  ['expedition-duration', 'expedition-distance'],
  'Expedition must use the over-24-hour threshold and the 150-mile fallback when duration is absent.',
);
assert.deepStrictEqual(
  filterRouteCatalogRecordsByExploreRefinement(edgeRefinementRecords, 'remoteness').map((record) => record.id),
  ['remote-distance', 'remote-score'],
  'Explicit isolation distance must take precedence over a conflicting remoteness score.',
);
assert.strictEqual(
  routeMatchesExploreRefinement(
    { estimated_duration_minutes: 600, distance_miles: 180 },
    'expedition',
  ),
  false,
  'The expedition distance fallback must not override a known day-trip duration.',
);

const higherRankedNonDayRoutes = Array.from({ length: 25 }, (_, index) => ({
  ...officialRecord,
  id: `non-day-${index}`,
  public_id: `non-day-${index}`,
  estimated_duration_minutes: 900,
  rank: 1_000 - index,
}));
const lowerRankedDayRoutes = Array.from({ length: 25 }, (_, index) => ({
  ...officialRecord,
  id: `day-route-${index}`,
  public_id: `day-route-${index}`,
  estimated_duration_minutes: 600,
  rank: index,
}));
const refinedBeforeSelection = filterRouteCatalogRecordsByExploreRefinement(
  [...higherRankedNonDayRoutes, ...lowerRankedDayRoutes],
  'dayTrip',
);
const refinedTopTwenty = selectRouteCatalogSearchResults(refinedBeforeSelection, {
  requestedLimit: 20,
  compareRecords: (left, right) => Number(right.rank ?? 0) - Number(left.rank ?? 0),
});
assert.strictEqual(refinedTopTwenty.records.length, 20);
assert(
  refinedTopTwenty.records.every((record) => String(record.id).startsWith('day-route-')),
  'Refinement filtering must run on the complete eligible pool before ranking and the final top-20 slice.',
);

const viewportResolution = normalizeRouteCatalogViewportFilter({
  viewportBbox: {
    minLng: -120.7,
    minLat: 39.2,
    maxLng: -120.3,
    maxLat: 39.4,
  },
  regionTags: ['tahoe_nf'],
});
assert.strictEqual(viewportResolution.invalid, false);
assert(viewportResolution.filter, 'A valid semantic map viewport must normalize into an Edge filter.');
assert.deepStrictEqual(
  normalizeRouteCatalogViewportFilter({}),
  { filter: null, invalid: false },
  'Non-map catalog consumers must remain valid without a viewport filter.',
);
assert.strictEqual(
  normalizeRouteCatalogViewportFilter({ viewportBbox: { minLng: 999 } }).invalid,
  true,
  'Malformed or out-of-world viewport bounds must be rejected instead of silently bypassing the filter.',
);
assert.strictEqual(
  normalizeRouteCatalogViewportFilter({
    viewportBbox: { minLng: null, minLat: 39.2, maxLng: -120.3, maxLat: 39.4 },
  }).invalid,
  true,
  'Null or missing coordinate values must not coerce to zero during viewport validation.',
);

const higherRankedOutsideViewport = Array.from({ length: 25 }, (_, index) => ({
  ...officialRecord,
  id: `outside-viewport-${index}`,
  public_id: `outside-viewport-${index}`,
  center_latitude: 39.3,
  center_longitude: -120.9,
  route_geometry: {
    type: 'LineString',
    coordinates: [[-120.91, 39.29], [-120.89, 39.31]],
  },
  rank: 2_000 - index,
}));
const lowerRankedInsideViewport = Array.from({ length: 23 }, (_, index) => ({
  ...officialRecord,
  id: `inside-viewport-${index}`,
  public_id: `inside-viewport-${index}`,
  center_latitude: 39.3,
  center_longitude: -120.4,
  route_geometry: {
    type: 'LineString',
    coordinates: [[-120.42, 39.28], [-120.38, 39.32]],
  },
  rank: index,
}));
const viewportEligible = filterRouteCatalogRecordsByViewport(
  [...higherRankedOutsideViewport, ...lowerRankedInsideViewport],
  viewportResolution.filter,
  { latitude: 39.3, longitude: -120.5, radiusMiles: 50 },
);
assert.strictEqual(viewportEligible.matchedCount, 23);
assert.strictEqual(viewportEligible.geometryMatchedCount, 23);
assert.strictEqual(viewportEligible.centerMatchedCount, 0);
assert.strictEqual(viewportEligible.regionMatchedCount, 0);
const viewportTopTwenty = selectRouteCatalogSearchResults(viewportEligible.records, {
  requestedLimit: 20,
  compareRecords: (left, right) => Number(right.rank ?? 0) - Number(left.rank ?? 0),
});
assert.strictEqual(viewportTopTwenty.records.length, 20);
assert(
  viewportTopTwenty.records.every((record) => String(record.id).startsWith('inside-viewport-')),
  'The complete eligible candidate pool must be bbox-filtered before ranking and top-20 selection.',
);

const regionOnlyViewportMatch = filterRouteCatalogRecordsByViewport([
  {
    ...officialRecord,
    id: 'region-only-match',
    public_id: 'region-only-match',
    center_latitude: 39.3,
    center_longitude: -120.8,
    tags: ['tahoe_nf'],
    route_geometry: {
      type: 'LineString',
      coordinates: [[-120.82, 39.29], [-120.78, 39.31]],
    },
  },
], viewportResolution.filter, { latitude: 39.3, longitude: -120.5, radiusMiles: 50 });
assert.strictEqual(regionOnlyViewportMatch.matchedCount, 1);
assert.strictEqual(regionOnlyViewportMatch.regionMatchedCount, 1);
assert.strictEqual(
  filterRouteCatalogRecordsByViewport([
    {
      ...regionOnlyViewportMatch.records[0],
      center_longitude: -125,
    },
  ], viewportResolution.filter, { latitude: 39.3, longitude: -120.5, radiusMiles: 50 }).matchedCount,
  0,
  'A region tag may mirror the map predicate only while the route center remains within the request radius.',
);

const sourceEligibilityPosition = edgeSource.indexOf('const sourceEligibleRecords =');
const publicEligibilityPosition = edgeSource.indexOf('const publicEligibilityPartition =');
const viewportEligibilityPosition = edgeSource.indexOf('const viewportEligiblePartition =');
const refinementEligibilityPosition = edgeSource.indexOf('const refinementEligibleRecords =');
const resultSelectionPosition = edgeSource.indexOf('const selectedRefinementResults =');
assert(
  sourceEligibilityPosition >= 0 &&
    sourceEligibilityPosition < publicEligibilityPosition &&
    publicEligibilityPosition < viewportEligibilityPosition &&
    viewportEligibilityPosition < refinementEligibilityPosition &&
    refinementEligibilityPosition < resultSelectionPosition,
  'Edge viewport and refinement filters must follow complete public eligibility and precede deterministic selection.',
);
assert(
  edgeSource.includes("from './providerContract.ts'") &&
    edgeSource.includes("'route_catalog_nearby_route_ids'") &&
    edgeSource.includes("'route_catalog_nearby_public_route_page'") &&
    edgeSource.includes("'route_catalog_nearby_public_route_cursor_page'") &&
    edgeSource.includes('p_offset: Math.max(0, Math.floor(args.offset ?? 0))') &&
    edgeSource.includes('p_cursor_route_id: args.continuationCursor?.routeId ?? null') &&
    edgeSource.includes('publicPage: true') &&
    edgeSource.includes('cursorPage: useCursorPage') &&
    edgeSource.includes('continuationCursor: internalContinuationCursor') &&
    edgeSource.includes('while (nearbyLookupCount < ROUTE_CATALOG_MAX_PAGINATION_WINDOW)') &&
    edgeSource.includes('nextRouteCatalogCandidateInspectionBatch(nearbyLookupCount)') &&
    edgeSource.includes('candidates.push(...nearby.records)') &&
    edgeSource.includes('internalNextCursor = nearby.nextCursor') &&
    edgeSource.includes('internalContinuationCursor = await decodeRouteCatalogPageCursor(') &&
    edgeSource.includes("'ROUTE_CATALOG_INVALID_SEARCH_AREA'") &&
    edgeSource.includes("'ROUTE_CATALOG_INVALID_VIEWPORT'") &&
    edgeSource.includes('normalizeRouteCatalogViewportFilter(params)') &&
    edgeSource.includes('filterRouteCatalogRecordsByViewport(') &&
    edgeSource.includes('semanticViewportFilterApplied: viewportFilter != null') &&
    edgeSource.includes('viewportMatchedCount: viewportEligiblePartition.matchedCount') &&
    edgeSource.includes('spatialIndexFilterApplied: hasRadiusCriteria') &&
    edgeSource.includes('coverageDiagnosticsUnavailable = true') &&
    edgeSource.includes('if (!skipCoverageDiagnostics && limitedRecords.length === 0)') &&
    edgeSource.includes('selectRouteCatalogSearchResults(') &&
    edgeSource.includes('requestedLimit: pageSize') &&
    edgeSource.includes('compareRecords: compareDiscoveryRecords') &&
    edgeSource.includes("'route_catalog_total_search_v1'") &&
    edgeSource.includes('nearbyRouteRpcUsed: hasRadiusCriteria') &&
    edgeSource.includes("? 'route_catalog_nearby_public_route_cursor_page'") &&
    edgeSource.includes('fallbackQueryUsed: !hasRadiusCriteria') &&
    edgeSource.includes('annotateIndexedRadiusPage(candidates') &&
    edgeSource.includes('const includeInternalEligibilityGeometry = true') &&
    edgeSource.includes('shapeSearchRecords(') &&
    edgeSource.includes('diagnosticRecords,') &&
    edgeSource.includes('normalizeRouteCatalogPagination(params)') &&
    !edgeSource.includes('sourceMatchedRecords.slice(offset, windowEnd)') &&
    !edgeSource.includes('radiusFiltered.records.slice(offset, windowEnd)') &&
    edgeSource.includes('const qualityDelta =') &&
    edgeSource.includes('cleanText(a.public_id ?? a.publicId).localeCompare(') &&
    edgeSource.includes('totalMatchedCount: matchedCount') &&
    edgeSource.includes('resultLimit: resultSelection.resultLimit') &&
    edgeSource.includes('additionalMatchesAvailable,') &&
    edgeSource.includes('hasMore: false') &&
    edgeSource.includes('nextPage: null') &&
    edgeSource.includes('nextCursor: null') &&
    edgeSource.includes('await routeCatalogCursorFingerprint([') &&
    edgeSource.includes('params.exploreRefinement ?? params.explore_refinement') &&
    edgeSource.includes('filterRouteCatalogRecordsByExploreRefinement(') &&
    edgeSource.includes('partitionRouteCatalogRecordsByPublicEligibility(') &&
    edgeSource.includes('{ includeGeometry, includePreviewGeometry }') &&
    edgeSource.includes('refinementFilterApplied: exploreRefinement != null') &&
    edgeSource.includes('refinementMatchedCount: refinementEligibleRecords.length') &&
    edgeSource.includes('criteria: {') &&
    edgeSource.includes('exploreRefinement,') &&
    providerSource.includes('ROUTE_CATALOG_SEARCH_RESULT_LIMIT = 20') &&
    providerSource.includes('uniqueRankedRecords.slice(0, resultLimit)') &&
    providerSource.includes("crypto.subtle.digest('SHA-256', input)") &&
    providerSource.includes("{ name: 'HMAC', hash: 'SHA-256' }") &&
    providerSource.includes("crypto.subtle.verify("),
  'The Edge contract must keep internal indexed inspection while exposing one deterministic, deduped, policy-filtered result set capped at 20 with no continuation.',
);

const sourceVersionMigration = fs.readFileSync(verifiedRoutesSourceVersionMigrationPath, 'utf8');
assert(
  sourceVersionMigration.includes('verified_routes_set_updated_at') &&
    sourceVersionMigration.includes('before update on public.verified_routes') &&
    sourceVersionMigration.includes('execute function public.set_updated_at()'),
  'Verified route updates must advance the source version used by detail-cache keys and catalog ordering.',
);

async function verifyOpaqueCursorContract() {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: require('crypto').webcrypto,
    });
  }
  const criteria = ['privacy-safe-location-bucket', 500, true, 'full_size_4x4'];
  const fingerprint = await routeCatalogCursorFingerprint(criteria);
  const repeatedFingerprint = await routeCatalogCursorFingerprint(criteria);
  const changedFingerprint = await routeCatalogCursorFingerprint([
    'privacy-safe-location-bucket',
    499,
    true,
    'full_size_4x4',
  ]);
  assert.strictEqual(fingerprint, repeatedFingerprint);
  assert.notStrictEqual(fingerprint, changedFingerprint);
  assert.notStrictEqual(
    await routeCatalogCursorFingerprint([...criteria, 'dayTrip']),
    await routeCatalogCursorFingerprint([...criteria, 'weekendTrip']),
    'Changing the Explore refinement must change the internal cursor/search fingerprint.',
  );
  assert.match(fingerprint, /^[0-9a-f]{32}$/);

  const routeId = '00000000-0000-4000-8000-000000000051';
  const signingSecret = 'unit-test-only-cursor-signing-secret';
  const cursor = await encodeRouteCatalogPageCursor({ routeId }, fingerprint, signingSecret);
  assert.deepStrictEqual(
    await decodeRouteCatalogPageCursor(cursor, fingerprint, signingSecret),
    { routeId },
  );
  assert.strictEqual(
    await decodeRouteCatalogPageCursor(cursor, changedFingerprint, signingSecret),
    null,
  );
  const tamperedCursor = `${cursor.slice(0, -1)}${cursor.endsWith('A') ? 'B' : 'A'}`;
  assert.strictEqual(
    await decodeRouteCatalogPageCursor(tamperedCursor, fingerprint, signingSecret),
    null,
  );

  const decodedPayload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  assert.deepStrictEqual(Object.keys(decodedPayload).sort(), ['f', 'r', 's', 'v']);
  assert.strictEqual(JSON.stringify(decodedPayload).includes('latitude'), false);
  assert.strictEqual(JSON.stringify(decodedPayload).includes('longitude'), false);
  assert.strictEqual(JSON.stringify(decodedPayload).includes('radius'), false);
  const forgedPayload = {
    ...decodedPayload,
    r: '00000000-0000-4000-8000-000000000099',
  };
  const forgedCursor = Buffer.from(JSON.stringify(forgedPayload)).toString('base64url');
  assert.strictEqual(
    await decodeRouteCatalogPageCursor(forgedCursor, fingerprint, signingSecret),
    null,
    'Changing the route continuation without the server-only HMAC must be rejected.',
  );

  console.log('Route catalog search provider contract checks passed.');

  // Keep the radius-first database behavior in the established provider-contract
  // lane so the regression cannot be skipped by running only package scripts.
  require('./test-route-catalog-nearby-route-ids-rpc.js');
}

verifyOpaqueCursorContract().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
