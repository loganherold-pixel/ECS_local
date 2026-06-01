const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('/discoverEngine') || request.endsWith('\\discoverEngine') || request === '../discoverEngine') {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const {
  catalogRouteToTrailPack,
  getRouteCatalogCoverageState,
  normalizeRouteCatalogDetailResponse,
  verifyRouteCatalogRecord,
} = require(path.join(root, 'lib', 'explore', 'routeCatalog.ts'));
const {
  trailPackToOfflinePrepCatalogInput,
} = require(path.join(root, 'lib', 'explore', 'trailPackOfflineCache.ts'));

const freshNow = '2026-06-01T12:00:00.000Z';

function makeRoute(overrides = {}) {
  return {
    id: 'usfs-verified-loop',
    name: 'USFS Verified Loop',
    description: 'A source-backed loop for catalog testing.',
    routeType: 'loop',
    centerCoordinate: { latitude: 38.5, longitude: -109.5 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.5, 38.5],
        [-109.51, 38.51],
        [-109.52, 38.5],
        [-109.5, 38.5],
      ],
    },
    distanceMiles: 18,
    estimatedDurationMinutes: 240,
    difficulty: 'moderate',
    vehicleFit: ['high_clearance_4x4'],
    officialAccessCoveragePct: 94,
    unknownAccessCoveragePct: 3,
    restrictedAccessCoveragePct: 0,
    activeClosureCount: 0,
    seasonalRestrictionCount: 0,
    vehicleMismatch: false,
    geometryQuality: 'good',
    verificationStatus: 'official_verified',
    reviewStatus: 'approved',
    sourceRecords: [
      {
        providerId: 'usfs_mvum',
        sourceType: 'official',
        label: 'USFS MVUM',
        authority: 'official_access',
        lastVerifiedAt: '2026-05-20T00:00:00.000Z',
        attribution: 'USDA Forest Service',
        license: 'public_domain',
      },
    ],
    communitySignal: {
      positiveReports: 8,
      negativeReports: 0,
      completions: 3,
      independentConfirmations: 2,
      activeGuidance: {
        status: 'ready',
        topologyResolved: true,
        sourceSegmentCount: 2,
        componentCount: 1,
        branchDetected: false,
        joinedSegmentGapCount: 1,
        disjointSegmentGapCount: 0,
        maxJoinGapMeters: 0,
        maxSegmentGapMeters: 0,
        unavailableReason: null,
      },
    },
    tags: ['USFS', 'MVUM'],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-28T00:00:00.000Z',
    ...overrides,
  };
}

const verified = verifyRouteCatalogRecord(makeRoute(), { now: freshNow });
assert.strictEqual(verified.status, 'normal', 'Fresh official coverage should evaluate as Normal');
assert.strictEqual(verified.publicRecommendation, true, 'Fresh official coverage should be recommendable');
assert.strictEqual(verified.sourceLabel, 'Official access verified');
assert(verified.confidenceScore >= 85, 'Verified official coverage should produce high confidence');
assert(
  verified.dataUsed.some((item) => item.providerId === 'usfs_mvum' && item.freshness === 'fresh'),
  'Verification should expose fresh USFS MVUM as data used',
);

const trailPack = catalogRouteToTrailPack(makeRoute(), verified);
assert.strictEqual(trailPack.source, 'ecs_validated');
assert.strictEqual(trailPack.dataState, 'live');
assert.strictEqual(trailPack.reviewStatus, 'approved');
assert.strictEqual(trailPack.confidenceScore, verified.confidenceScore);
assert(
  trailPack.confidenceReasons.includes('Official access verified'),
  'Trail Pack projection should carry the official verification label',
);
assert.strictEqual(
  trailPack.catalogVerification?.sourceLabel,
  'Official access verified',
  'Trail Pack projection should preserve catalog verification metadata',
);
assert.deepStrictEqual(
  trailPack.catalogVerification?.activeGuidance,
  makeRoute().communitySignal.activeGuidance,
  'Trail Pack projection should preserve server-side active guidance topology metadata',
);

const detailedTrailPack = normalizeRouteCatalogDetailResponse({
  record: makeRoute(),
  assessment: {
    status: 'normal',
    why: ['Official access verified through MVUM source coverage.'],
    whatToWatch: ['Seasonal gates still require day-of-trip review.'],
    recommendedAction: 'Use as a route preview and confirm current conditions before departure.',
    toImproveStatus: ['Attach current closure and fire restriction checks.'],
    confidence: 91,
    activeGuidance: makeRoute().communitySignal.activeGuidance,
  },
  offlineCache: {
    cacheable: true,
    lastVerifiedAt: '2026-05-20T00:00:00.000Z',
    staleAt: '2026-08-18T00:00:00.000Z',
  },
});
assert.strictEqual(
  detailedTrailPack?.catalogVerification?.detailAssessment?.recommendedAction,
  'Use as a route preview and confirm current conditions before departure.',
  'Route catalog detail normalization should preserve deterministic assessment recommendations',
);
assert.deepStrictEqual(
  detailedTrailPack?.catalogVerification?.detailAssessment?.whatToWatch,
  ['Seasonal gates still require day-of-trip review.'],
  'Route catalog detail normalization should expose watch items from the detail engine',
);
assert.strictEqual(
  detailedTrailPack?.catalogVerification?.offlineCache?.cacheable,
  true,
  'Route catalog detail normalization should expose offline-cache eligibility',
);
assert.strictEqual(
  detailedTrailPack?.catalogVerification?.detailAssessment?.activeGuidance?.status,
  'ready',
  'Route catalog detail normalization should carry active-guidance metadata from assessment payloads',
);

const offlinePrepInput = trailPackToOfflinePrepCatalogInput({
  ...detailedTrailPack,
  distanceFromUserMiles: 12,
  evaluatedConfidence: {
    score: 91,
    band: 'verified',
    reasons: ['Official access verified'],
    warnings: [],
    blockers: [],
    lastEvaluatedAt: freshNow,
  },
});
assert.strictEqual(
  offlinePrepInput.route.routeMetadata.routeCatalogOfflineCache.cacheable,
  true,
  'Trail Pack offline cache handoff should preserve route catalog cacheability metadata',
);
assert.strictEqual(
  offlinePrepInput.route.routeMetadata.routeCatalogSourceTimestamps[0],
  '2026-05-20T00:00:00.000Z',
  'Trail Pack offline cache handoff should preserve source freshness timestamps',
);
assert.strictEqual(
  offlinePrepInput.route.routeMetadata.routeCatalogAttribution[0].attribution,
  'USDA Forest Service',
  'Trail Pack offline cache handoff should preserve source attribution',
);
assert.strictEqual(
  offlinePrepInput.route.routeMetadata.offlinePrepGeometryPointCount,
  4,
  'Trail Pack offline cache handoff should preserve full route geometry for Offline Prep',
);

const partialCommunity = verifyRouteCatalogRecord(
  makeRoute({
    id: 'community-partial',
    sourceRecords: [
      {
        providerId: 'community_submission',
        sourceType: 'community',
        label: 'Community GPX submission',
        authority: 'community_observation',
        lastVerifiedAt: '2026-05-30T00:00:00.000Z',
      },
    ],
    officialAccessCoveragePct: 46,
    unknownAccessCoveragePct: 48,
    verificationStatus: 'partially_verified',
  }),
  { now: freshNow },
);
assert.strictEqual(partialCommunity.publicRecommendation, false);
assert.strictEqual(partialCommunity.sourceLabel, 'Community suggested, partially verified');
assert(
  partialCommunity.blockers.includes('Official legal-access coverage is below recommendation threshold'),
  'Community geometry cannot establish public legal access by itself',
);

const closure = verifyRouteCatalogRecord(
  makeRoute({
    id: 'closed-route',
    activeClosureCount: 1,
    closureSummaries: ['Temporary Forest Order closure'],
  }),
  { now: freshNow },
);
assert.strictEqual(closure.status, 'critical');
assert.strictEqual(closure.publicRecommendation, false);
assert(
  closure.blockers.includes('Route intersects an active official closure'),
  'Active official closures should hard-block public recommendation',
);

const stale = verifyRouteCatalogRecord(
  makeRoute({
    id: 'stale-route',
    sourceRecords: [
      {
        providerId: 'usfs_mvum',
        sourceType: 'official',
        label: 'USFS MVUM',
        authority: 'official_access',
        lastVerifiedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  }),
  { now: freshNow },
);
assert.strictEqual(stale.publicRecommendation, false);
assert.strictEqual(stale.sourceLabel, 'Source stale');
assert(stale.warnings.includes('Official source verification is stale'));

const osmOnly = verifyRouteCatalogRecord(
  makeRoute({
    id: 'osm-only',
    sourceRecords: [
      {
        providerId: 'openstreetmap',
        sourceType: 'osm_supplemental',
        label: 'OpenStreetMap',
        authority: 'supplemental_geometry',
        lastVerifiedAt: '2026-05-25T00:00:00.000Z',
        license: 'ODbL',
      },
    ],
    officialAccessCoveragePct: 0,
    unknownAccessCoveragePct: 100,
    verificationStatus: 'geometry_only',
  }),
  { now: freshNow },
);
assert.strictEqual(osmOnly.publicRecommendation, false);
assert.strictEqual(osmOnly.sourceLabel, 'Geometry only, not recommended');
assert(
  osmOnly.warnings.includes('OpenStreetMap is supplemental geometry and not legal-access authority'),
  'OSM-only data should be labeled supplemental, not authoritative',
);

const bdr = verifyRouteCatalogRecord(
  makeRoute({
    id: 'bdr-unlicensed',
    sourceRecords: [
      {
        providerId: 'bdr',
        sourceType: 'partner_restricted',
        label: 'Backcountry Discovery Routes',
        authority: 'partner_restricted',
        lastVerifiedAt: '2026-05-20T00:00:00.000Z',
        license: 'restricted_partner_terms',
        usePermission: 'not_granted',
      },
    ],
    officialAccessCoveragePct: 92,
  }),
  { now: freshNow },
);
assert.strictEqual(bdr.publicRecommendation, false);
assert(
  bdr.blockers.includes('Partner/licensed route requires permission before publishing'),
  'Restricted partner GPX sources should not be republished without permission',
);

assert.deepStrictEqual(
  getRouteCatalogCoverageState([], { userHasCriteria: true }),
  {
    state: 'no_verified_routes',
    title: 'No verified routes yet in this area',
    message: 'ECS has no source-backed route catalog records matching the current criteria. Try a wider radius or import a GPX as a private pending suggestion.',
  },
  'Empty catalog searches should produce the honest partial-coverage empty state',
);

console.log('Verified route catalog checks passed');
