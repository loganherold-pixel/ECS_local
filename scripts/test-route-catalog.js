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
  normalizeRouteCatalogSearchResponse,
  verifyRouteCatalogRecord,
} = require(path.join(root, 'lib', 'explore', 'routeCatalog.ts'));
const {
  trailPackToOfflinePrepCatalogInput,
} = require(path.join(root, 'lib', 'explore', 'trailPackOfflineCache.ts'));
const {
  trailPackToExpeditionOpportunity,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

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
    remotenessScore: 8,
    campabilityScore: 72,
    minimumFuelRangeMiles: 45,
    minimumWaterCapacityGallons: 2,
    routeIntelligence: {
      remotenessBasis: 'official_source_distance_and_context',
      campabilityDataState: 'reviewed',
      resourceMarginBasis: 'estimated_route_distance_with_buffer',
    },
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

const previewGeometryVerification = verifyRouteCatalogRecord(
  makeRoute({
    routeGeometryMode: 'preview_simplified',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-120, 39],
        [-122, 39],
      ],
    },
  }),
  { now: freshNow },
);
assert(
  !previewGeometryVerification.blockers.includes('Route geometry contains impossible jumps'),
  'Search-preview geometry should not create false impossible-jump blockers; full detail geometry remains the authority',
);
assert.strictEqual(
  previewGeometryVerification.publicRecommendation,
  true,
  'Search-preview geometry should preserve public recommendation when official source gates pass',
);

const trailPack = catalogRouteToTrailPack(makeRoute(), verified);
assert.strictEqual(trailPack.source, 'ecs_validated');
assert.strictEqual(trailPack.dataState, 'live');
assert.strictEqual(trailPack.reviewStatus, 'approved');
assert.strictEqual(trailPack.confidenceScore, verified.confidenceScore);
assert.strictEqual(
  trailPack.remotenessScore,
  8,
  'Trail Pack projection should preserve catalog remoteness scores instead of deriving them from confidence',
);
assert.strictEqual(
  trailPack.campabilityScore,
  72,
  'Trail Pack projection should preserve catalog CampOps suitability scores',
);
assert.strictEqual(
  trailPack.minimumFuelRangeMiles,
  45,
  'Trail Pack projection should preserve minimum fuel range requirements',
);
assert.strictEqual(
  trailPack.minimumWaterCapacityGallons,
  2,
  'Trail Pack projection should preserve minimum water capacity requirements',
);
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
assert.deepStrictEqual(
  trailPack.catalogVerification?.operationalCriteria,
  {
    remotenessScore: 8,
    campabilityScore: 72,
    minimumFuelRangeMiles: 45,
    minimumWaterCapacityGallons: 2,
    routeIntelligence: makeRoute().routeIntelligence,
  },
  'Trail Pack projection should expose deterministic operational criteria alongside source/confidence metadata',
);

const searchPreviewTrailPack = catalogRouteToTrailPack(
  makeRoute({ routeGeometryMode: 'preview_simplified' }),
  previewGeometryVerification,
);
assert.strictEqual(
  searchPreviewTrailPack.routeGeometryMode,
  'preview_simplified',
  'Trail Pack projection should preserve whether route geometry came from lightweight search preview or full detail.',
);
assert.strictEqual(
  trailPackToExpeditionOpportunity(searchPreviewTrailPack).routeMetadata.routeGeometryMode,
  'preview_simplified',
  'Expedition opportunity metadata should keep route geometry mode so Explore can require active-guidance detail before calling a preview route ready.',
);

const opportunity = trailPackToExpeditionOpportunity(trailPack);
assert.strictEqual(
  opportunity.remotenessScore,
  8,
  'Expedition opportunity projection should use the catalog remoteness score when available',
);
assert.strictEqual(
  opportunity.routeMetadata.routeCatalogOperationalCriteria.minimumFuelRangeMiles,
  45,
  'Expedition opportunity metadata should preserve catalog fuel margin requirements for downstream planning',
);
assert.strictEqual(
  opportunity.routeMetadata.routeCatalogOperationalCriteria.minimumWaterCapacityGallons,
  2,
  'Expedition opportunity metadata should preserve catalog water margin requirements for downstream planning',
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
    currentCondition: {
      status: 'watch',
      label: 'Current conditions require trip-date review',
      currentlyOpenStatus: 'requires_review',
      passabilityStatus: 'requires_review',
      activeClosureCount: 0,
      seasonalRestrictionCount: 1,
      warnings: ['Seasonal restrictions require trip-date review.'],
      blockers: [],
      lastEvaluatedAt: freshNow,
    },
  },
  offlineCache: {
    cacheable: true,
    lastVerifiedAt: '2026-05-20T00:00:00.000Z',
    staleAt: '2026-08-18T00:00:00.000Z',
    sourceTimestamps: ['2026-05-20T00:00:00.000Z'],
    sourceAttribution: [
      {
        providerId: 'usfs_mvum',
        label: 'USFS MVUM',
        attribution: 'USDA Forest Service',
        license: 'public_domain',
      },
    ],
    currentCondition: {
      status: 'watch',
      label: 'Current conditions require trip-date review',
      currentlyOpenStatus: 'requires_review',
      passabilityStatus: 'requires_review',
      activeClosureCount: 0,
      seasonalRestrictionCount: 1,
      warnings: ['Seasonal restrictions require trip-date review.'],
      blockers: [],
      lastEvaluatedAt: freshNow,
    },
    freshnessWarnings: ['USFS MVUM source freshness is fresh.'],
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
assert.deepStrictEqual(
  detailedTrailPack?.catalogVerification?.offlineCache?.sourceTimestamps,
  ['2026-05-20T00:00:00.000Z'],
  'Route catalog detail normalization should preserve server-provided offline-cache source timestamps',
);
assert.strictEqual(
  detailedTrailPack?.catalogVerification?.offlineCache?.sourceAttribution?.[0]?.attribution,
  'USDA Forest Service',
  'Route catalog detail normalization should preserve server-provided offline-cache attribution',
);
assert.deepStrictEqual(
  detailedTrailPack?.catalogVerification?.offlineCache?.freshnessWarnings,
  ['USFS MVUM source freshness is fresh.'],
  'Route catalog detail normalization should preserve server-provided offline-cache freshness warnings',
);
assert.strictEqual(
  detailedTrailPack?.catalogVerification?.detailAssessment?.activeGuidance?.status,
  'ready',
  'Route catalog detail normalization should carry active-guidance metadata from assessment payloads',
);
assert.strictEqual(
  detailedTrailPack?.catalogVerification?.currentCondition?.status,
  'watch',
  'Route catalog detail normalization should preserve the server current-condition overlay separately from access verification',
);
assert.strictEqual(
  detailedTrailPack?.catalogVerification?.offlineCache?.currentCondition?.currentlyOpenStatus,
  'requires_review',
  'Offline cache metadata should preserve the selected route current-condition/open-status overlay',
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
assert.deepStrictEqual(
  offlinePrepInput.route.routeMetadata.routeCatalogFreshnessWarnings,
  ['USFS MVUM source freshness is fresh.'],
  'Trail Pack offline cache handoff should prefer server-provided route catalog freshness warnings',
);
assert.strictEqual(
  offlinePrepInput.route.routeMetadata.routeCatalogCurrentCondition.currentlyOpenStatus,
  'requires_review',
  'Trail Pack offline cache handoff should preserve route catalog current-condition overlays',
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
assert.strictEqual(
  closure.sourceLabel,
  'Official access verified',
  'Active current-condition closures must not erase the legal-access verification label',
);
assert.strictEqual(
  closure.currentCondition?.status,
  'blocked',
  'Active current-condition closures should surface a separate blocked current-condition overlay',
);
assert.strictEqual(
  closure.currentCondition?.currentlyOpenStatus,
  'closed',
  'Current-condition overlays should separate current open/closed posture from verified access posture',
);
assert.strictEqual(
  closure.currentCondition?.passabilityStatus,
  'not_assessed',
  'Closure overlays should not invent passability even when official access is verified',
);
assert(
  closure.blockers.includes('Route intersects an active official closure'),
  'Active official closures should hard-block public recommendation',
);

const tripDateReview = verifyRouteCatalogRecord(
  makeRoute({
    id: 'trip-date-review-route',
    seasonalRestrictionCount: 1,
    communitySignal: {
      ...makeRoute().communitySignal,
      currentConditions: {
        sourceCount: 1,
        activeClosureCount: 0,
        watchClosureCount: 1,
        checkedAt: ['2026-05-31T00:00:00.000Z'],
        caveat: 'Official current-condition overlays can block recommendation but do not prove open access, passability, or safety.',
      },
    },
  }),
  { now: freshNow },
);
assert.strictEqual(
  tripDateReview.sourceLabel,
  'Official access verified',
  'Verified access should stay visible when current-condition review is required',
);
assert.strictEqual(
  tripDateReview.publicRecommendation,
  true,
  'Non-blocking current-condition warnings should not erase source-backed recommendation eligibility',
);
assert.strictEqual(
  tripDateReview.currentCondition?.status,
  'watch',
  'Non-blocking current-condition notices should create a watch overlay',
);
assert.strictEqual(
  tripDateReview.currentCondition?.currentlyOpenStatus,
  'requires_review',
  'Trip-date seasonal/current-condition caveats should not be labeled open',
);
assert(
  tripDateReview.currentCondition?.warnings.some((warning) => /trip-date|seasonal|current-condition/i.test(warning)),
  'Current-condition watch overlays should carry trip-date review warnings',
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

const curationOnlySearch = normalizeRouteCatalogSearchResponse({
  records: [],
  coverageState: {
    state: 'lower_confidence_nearby',
    title: 'Source-backed routes in curation',
    message: 'ECS found official or source-backed route records nearby, but none are verified enough for public recommendation under the current criteria.',
  },
  meta: {
    candidateCount: 0,
    radiusMatchedCount: 0,
    curationCandidateCount: 7,
    anySourceBackedCandidateCount: 7,
    radiusFilterApplied: true,
  },
});
assert.strictEqual(curationOnlySearch.trailPacks.length, 0);
assert.strictEqual(curationOnlySearch.coverageState.state, 'lower_confidence_nearby');
assert.strictEqual(curationOnlySearch.searchMeta.curationCandidateCount, 7);
assert.strictEqual(curationOnlySearch.searchMeta.anySourceBackedCandidateCount, 7);

console.log('Verified route catalog checks passed');
