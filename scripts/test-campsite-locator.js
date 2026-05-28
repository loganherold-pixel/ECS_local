const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const storage = new Map();

global.__DEV__ = true;
global.ECS_DEBUG_CAMP = true;
global.__ECS_DEBUG_CAMP__ = true;

global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  MAJOR_ROADWAY_EXCLUSION_MILES,
  MAX_CAMPSITE_MARKERS,
  POLYGON_ADJACENT_CAMP_BUFFER_MILES,
  ROUTE_CAMPSITE_BUFFER_MILES,
  ROUTE_CAMPSITE_MIN_CONFIDENCE_SCORE,
  locateCampsitesForPolygon,
  locateCampsitesForRoute,
  locateCampsiteResultForRoute,
  rankAndLimitCampsites,
} = require(path.join(__dirname, '..', 'lib', 'campsites', 'campsiteLocatorService.ts'));
const {
  buildRouteCampsiteLocatorInput,
} = require(path.join(__dirname, '..', 'lib', 'campsites', 'routeCampsiteLocatorAdapter.ts'));

function makeCandidate(id, latitude, longitude, score, overrides = {}) {
  return {
    id,
    latitude,
    longitude,
    score,
    remotenessScore: score,
    ...overrides,
  };
}

function makeLongRouteCoordinates(count = 160) {
  return Array.from({ length: count }, (_, index) => ({
    latitude: 39 + index * 0.012,
    longitude: -121 + index * 0.012,
    ele_m: 1524,
  }));
}

async function main() {
  assert.strictEqual(
    MAJOR_ROADWAY_EXCLUSION_MILES,
    1,
    'Major roadway campsite exclusion must stay at 1 mile.',
  );
  assert.strictEqual(MAX_CAMPSITE_MARKERS, 5, 'Global campsite marker cap must be 5.');
  assert.strictEqual(
    ROUTE_CAMPSITE_BUFFER_MILES,
    0.5,
    'Route campsite discovery should default to a tight 0.5 mile route buffer.',
  );
  assert.strictEqual(
    ROUTE_CAMPSITE_MIN_CONFIDENCE_SCORE,
    55,
    'Route campsite discovery should require at least 55 overall confidence by default.',
  );
  assert.strictEqual(
    POLYGON_ADJACENT_CAMP_BUFFER_MILES,
    0.5,
    'Completed campsite polygons should include a small adjacent search buffer.',
  );

  const manyCandidates = Array.from({ length: 8 }, (_, index) =>
    makeCandidate(`camp-${index}`, 39, -121 + index * 0.001, 70 + index),
  );
  const topFive = rankAndLimitCampsites(manyCandidates, 'route');
  assert.strictEqual(topFive.length, 5, 'More than 5 candidates must return exactly 5.');
  assert.deepStrictEqual(
    topFive.map((candidate) => candidate.id),
    ['camp-7', 'camp-6', 'camp-5', 'camp-4', 'camp-3'],
    'Highest scores must be selected first.',
  );

  const invalidRemoved = rankAndLimitCampsites(
    [
      makeCandidate('valid', 39, -121, 80),
      makeCandidate('invalid-lat', 999, -121, 100),
      makeCandidate('invalid-lng', 39, -999, 90),
    ],
    'route',
  );
  assert.deepStrictEqual(
    invalidRemoved.map((candidate) => candidate.id),
    ['valid'],
    'Invalid coordinates must be removed.',
  );

  const drawAreaPolygon = [
    { latitude: 38.99, longitude: -121.02 },
    { latitude: 39.02, longitude: -121.02 },
    { latitude: 39.02, longitude: -120.98 },
    { latitude: 38.99, longitude: -120.98 },
  ];
  const unknownLegalityShown = await locateCampsitesForPolygon({
    polygonCoordinates: drawAreaPolygon,
    candidates: [
      makeCandidate('unknown-legal-soft-score', 39.001, -121.001, 72, {
        legalityStatus: 'unknown_needs_verification',
        legalAccessScore: 20,
      }),
    ],
  });
  assert.deepStrictEqual(
    unknownLegalityShown.map((candidate) => candidate.id),
    ['unknown-legal-soft-score'],
    'Unknown legality must not automatically remove every draw-area candidate.',
  );
  assert.strictEqual(
    unknownLegalityShown[0].legalityStatus,
    'unknown_needs_verification',
    'Unknown legality should be preserved for caution labeling.',
  );
  assert.ok(
    unknownLegalityShown[0].warnings.some((warning) => warning.includes('verify local rules')),
    'Unknown legality candidates should carry verify-local-rules warning copy.',
  );

  const hardRestrictedRemoved = await locateCampsitesForPolygon({
    polygonCoordinates: drawAreaPolygon,
    candidates: [
      makeCandidate('private-land', 39.001, -121.001, 96, { isPrivateLand: true }),
      makeCandidate('closed-area', 39.002, -121.002, 95, { legalityStatus: 'restricted_or_not_allowed' }),
      makeCandidate('lake-point', 39.004, -121.004, 99, { isWaterBody: true }),
      makeCandidate('building-point', 39.005, -121.005, 99, { nearBuildings: true }),
      makeCandidate('highway-point', 39.006, -121.006, 99, { nearHighway: true }),
      makeCandidate('open-unknown', 39.003, -121.003, 72, { legalityStatus: 'unknown_needs_verification' }),
    ],
  });
  assert.deepStrictEqual(
    hardRestrictedRemoved.map((candidate) => candidate.id),
    ['open-unknown'],
    'Known private/closed/restricted, water, building, and highway locations must remain hard-excluded.',
  );

  const softFallbackCandidates = await locateCampsitesForPolygon({
    polygonCoordinates: drawAreaPolygon,
    candidates: [
      makeCandidate('soft-low-1', 39.004, -121.004, 32, { legalityStatus: 'unknown_needs_verification' }),
      makeCandidate('soft-low-2', 39.005, -121.005, 28, { legalityStatus: 'unknown_needs_verification' }),
    ],
  });
  assert.deepStrictEqual(
    softFallbackCandidates.map((candidate) => candidate.id),
    [],
    'Draw-area scans should not return sub-70 soft fallback candidates.',
  );

  const filterStageLogs = [];
  const filterStageOriginalLog = console.log;
  global.__ECS_CAMP_DEBUG__ = true;
  console.log = (...args) => {
    filterStageLogs.push(args);
  };
  try {
    await locateCampsitesForPolygon({
      polygonCoordinates: drawAreaPolygon,
      candidates: [
        makeCandidate('official-soft', 39.001, -121.001, 32, {
          sourceType: 'official',
          legalityStatus: 'verified_allowed',
        }),
        makeCandidate('private-stage', 39.002, -121.002, 98, { isPrivateLand: true }),
        makeCandidate('restricted-stage', 39.003, -121.003, 97, { legalityStatus: 'restricted_or_not_allowed' }),
        makeCandidate('unsafe-stage', 39.004, -121.004, 96, { unsafeTerrain: true }),
        makeCandidate('outside-stage', 39.5, -121.5, 99),
        makeCandidate('invalid-stage', 999, -121, 100),
      ],
    });
  } finally {
    console.log = filterStageOriginalLog;
    global.__ECS_CAMP_DEBUG__ = false;
  }
  const filterStageLog = filterStageLogs.find(
    (entry) => entry[0] === '[CAMPSITE_CANDIDATE]' && entry[1] === 'filter_stage_counts',
  );
  assert.ok(filterStageLog, 'Campsite filtering should emit dev-only filter_stage_counts diagnostics.');
  assert.strictEqual(filterStageLog[2].rawCandidates, 6);
  assert.strictEqual(filterStageLog[2].validCoordinates, 5);
  assert.strictEqual(filterStageLog[2].insideDrawnPolygon, 4);
  assert.strictEqual(filterStageLog[2].officialCampsitePoiMatches, 1);
  assert.strictEqual(filterStageLog[2].privateLandRemoved, 1);
  assert.strictEqual(filterStageLog[2].legalStatusRemoved, 1);
  assert.strictEqual(filterStageLog[2].slopeTerrainRemoved, 1);
  assert.strictEqual(filterStageLog[2].softFallbackUsed, false);
  assert.strictEqual(filterStageLog[2].finalCandidates, 0);

  const deduped = rankAndLimitCampsites(
    [
      makeCandidate('dup', 39, -121, 80),
      makeCandidate('dup', 39.01, -121.01, 100),
      makeCandidate('coord-a', 39.123456, -121.123456, 70),
      makeCandidate('coord-b', 39.123459, -121.123459, 90),
    ],
    'route',
  );
  assert.strictEqual(deduped.length, 2, 'Duplicate IDs and nearby coordinate duplicates must be removed.');
  assert.ok(deduped.some((candidate) => candidate.id === 'dup'), 'Duplicate-ID group should retain one candidate.');
  assert.ok(deduped.some((candidate) => candidate.id === 'coord-b'), 'Coordinate duplicate group should retain highest-ranked candidate.');

  const routeFiltered = await locateCampsitesForRoute({
    routeId: 'test-route',
    routeCoordinates: [
      { latitude: 39, longitude: -121 },
      { latitude: 39, longitude: -120.8 },
    ],
    routeBufferMiles: 3,
    candidates: [
      makeCandidate('near-route', 39.002, -120.9, 60),
      makeCandidate('far-route', 39.5, -120.9, 100),
    ],
  });
  assert.deepStrictEqual(
    routeFiltered.map((candidate) => candidate.id),
    ['near-route'],
    'Route mode must filter candidates outside the route corridor.',
  );

  const routeRankedByScore = await locateCampsitesForRoute({
    routeId: 'score-route',
    routeCoordinates: [
      { latitude: 39, longitude: -121 },
      { latitude: 39, longitude: -120.8 },
    ],
    routeBufferMiles: 5,
    candidates: [
      makeCandidate('closer-lower-score', 39.001, -120.95, 40, { distanceFromRouteMiles: 0.1 }),
      makeCandidate('farther-higher-score', 39.01, -120.9, 90, { distanceFromRouteMiles: 2.5 }),
      makeCandidate('middle-score', 39.005, -120.85, 60, { distanceFromRouteMiles: 0.3 }),
    ],
  });
  assert.deepStrictEqual(
    routeRankedByScore.map((candidate) => candidate.id),
    ['farther-higher-score', 'middle-score'],
    'Route mode must use score as primary ranking after proximity eligibility and filter below-threshold sites.',
  );
  assert.ok(
    Array.isArray(routeRankedByScore[0].ratingFactors) && routeRankedByScore[0].ratingFactors.length > 0,
    'Route campsite markers must include ratingFactors for marker popups.',
  );
  assert.ok(
    routeRankedByScore[0].ratingFactors.some((factor) => factor.label === 'Camping suitability'),
    'Route campsite marker ratingFactors should include existing campsite suitability scoring detail.',
  );

  const roadwayExcluded = await locateCampsitesForRoute({
    routeId: 'roadway-exclusion-route',
    routeCoordinates: [
      { latitude: 39, longitude: -121 },
      { latitude: 39, longitude: -120.8 },
    ],
    routeSourceType: 'trail',
    routeBufferMiles: 5,
    candidates: [
      makeCandidate('near-highway', 39.005, -120.9, 100, {
        nearestPavedRoadMiles: 0.4,
        roadClass: 'paved road',
      }),
      makeCandidate('forest-road-access', 39.006, -120.91, 83, {
        nearestPavedRoadMiles: 1.6,
        accessType: 'forest road',
      }),
      makeCandidate('plain-remote', 39.007, -120.92, 88, {
        nearestPavedRoadMiles: 2.2,
      }),
    ],
  });
  assert.deepStrictEqual(
    roadwayExcluded.map((candidate) => candidate.id),
    ['forest-road-access', 'plain-remote'],
    'Candidates within 1 mile of major/paved roadways must be excluded, while drivable trail access may rank higher.',
  );
  assert.ok(
    roadwayExcluded[0].explanation.includes('Remote from major roadways') &&
      roadwayExcluded[0].explanation.includes('Near drivable trail access'),
    'Camp reasoning should truthfully include roadway remoteness and drivable trail access when source data supports it.',
  );

  const roadRouteExcluded = rankAndLimitCampsites(
    [
      makeCandidate('road-route-near', 39.001, -120.9, 100, { distanceFromRouteMiles: 0.2 }),
      makeCandidate('road-route-far', 39.04, -120.9, 50, { distanceFromRouteMiles: 1.5 }),
    ],
    'route',
    {
      routeSourceType: 'road',
      routeCoordinates: [
        { latitude: 39, longitude: -121 },
        { latitude: 39, longitude: -120.8 },
      ],
      routeBufferMiles: 5,
    },
  );
  assert.deepStrictEqual(
    roadRouteExcluded.map((candidate) => candidate.id),
    [],
    'Road-sourced routes must not surface camps unless candidate metadata explicitly indicates trail/off-road access.',
  );

  const defaultRouteBuffer = await locateCampsitesForRoute({
    routeId: 'default-buffer-route',
    routeCoordinates: [
      { latitude: 39, longitude: -121 },
      { latitude: 39, longitude: -120.8 },
    ],
    routeSourceType: 'trail',
    candidates: [
      makeCandidate('inside-default-buffer', 39.001, -120.9, 80),
      makeCandidate('outside-default-buffer', 39.02, -120.9, 90),
    ],
  });
  assert.deepStrictEqual(
    defaultRouteBuffer.map((candidate) => candidate.id),
    ['inside-default-buffer'],
    'Route mode must use the default 0.5 mile route buffer when no custom buffer is provided.',
  );

  const trailRouteInput = buildRouteCampsiteLocatorInput({
    routeId: 'mock-route-generation',
    routeName: 'Mock Long Trail Route',
    sourceType: 'trail',
    routeCoordinates: makeLongRouteCoordinates(),
  });
  assert.ok(trailRouteInput, 'Long route geometry should build route-source campsite input.');
  const trailRouteResult = locateCampsiteResultForRoute(trailRouteInput, { publish: false });
  assert.ok(
    trailRouteResult.suggestedCampsites.length > 0,
    'Route-source campsite generation should produce candidates for valid long trail geometry.',
  );
  assert.strictEqual(
    trailRouteResult.routeIntelligenceId,
    trailRouteInput.routeIntelligence.id,
    'Route-source campsite results must preserve the active route intelligence ID.',
  );

  const fallbackRouteCoordinates = [
    { latitude: 39.08, longitude: -120.28 },
    { latitude: 39.095, longitude: -120.255 },
    { latitude: 39.11, longitude: -120.23 },
    { latitude: 39.125, longitude: -120.205 },
    { latitude: 39.14, longitude: -120.18 },
    { latitude: 39.155, longitude: -120.155 },
  ];
  const fallbackRouteIntelligence = {
    id: 'fallback-route-intel',
    sourceId: 'fallback-route',
    routeName: 'Tahoe Forest Loop',
    totalDistanceMiles: 7.2,
    estimatedDriveTimeHours: 1.4,
    elevationGainFeet: 900,
    elevationLossFeet: 200,
    highestElevationFeet: 7200,
    lowestElevationFeet: 6400,
    avgElevationFeet: 6800,
    totalPoints: fallbackRouteCoordinates.length,
    segments: [
      {
        segmentIndex: 0,
        distanceStart: 0,
        distanceEnd: 7.2,
        avgElevation: 6800,
        elevationGain: 900,
        elevationLoss: 200,
        maxElevation: 7200,
        minElevation: 6400,
        coordinates: [39.12, -120.21],
        pointCount: fallbackRouteCoordinates.length,
        avgGradePercent: 8.5,
        maxGradePercent: 14,
        difficulty: 'challenging',
        estimatedDriveTimeHours: 1.4,
      },
    ],
    segmentCount: 1,
    overallDifficulty: 'challenging',
    bounds: {
      minLat: 39.08,
      maxLat: 39.155,
      minLon: -120.28,
      maxLon: -120.155,
    },
    elevationProfile: [],
    analyzedAt: new Date().toISOString(),
    hasElevation: true,
    avgSpeedAssumption: 12,
  };
  const fallbackLogs = [];
  const fallbackOriginalLog = console.log;
  console.log = (...args) => {
    fallbackLogs.push(args);
  };
  let fallbackRouteResult;
  try {
    fallbackRouteResult = locateCampsiteResultForRoute(
      {
        routeId: 'fallback-route',
        routeCoordinates: fallbackRouteCoordinates,
        routeIntelligence: fallbackRouteIntelligence,
        routeSourceType: 'trail',
        routeBufferMiles: 0.5,
      },
      { publish: false },
    );
  } finally {
    console.log = fallbackOriginalLog;
  }
  assert.ok(
    fallbackRouteResult.suggestedCampsites.length > 0,
    'Route coordinates with no analyzed candidate segments should fall back to route-corridor samples.',
  );
  assert.ok(
    fallbackRouteResult.suggestedCampsites.every((candidate) => candidate.source === 'route_corridor_sampling'),
    'Fallback route candidates should be marked with route_corridor_sampling source.',
  );
  assert.ok(
    fallbackRouteResult.suggestedCampsites.every(
      (candidate) => candidate.viabilityTier === 'possible',
    ),
    'Fallback route candidates should remain possible/lower-confidence unless later promoted by real source data.',
  );
  assert.ok(
    fallbackLogs.some(
      (entry) =>
        entry[0] === '[CAMPSITE_CANDIDATE]' &&
        entry[1] === 'route_segments_present_no_candidate_segments',
    ),
    'Fallback route path should log that route segments existed but no candidate segments qualified.',
  );
  assert.ok(
    fallbackLogs.some(
      (entry) =>
        entry[0] === '[CAMPSITE_CANDIDATE]' &&
        entry[1] === 'fallback_corridor_sampling_used' &&
        entry[2]?.sampleCount > 0,
    ),
    'Fallback route path should log corridor sampling usage and sample count.',
  );

  const roadRouteInput = buildRouteCampsiteLocatorInput({
    routeId: 'mock-road-route-generation',
    routeName: 'Mock Long Road Route',
    sourceType: 'road',
    routeCoordinates: makeLongRouteCoordinates(),
  });
  assert.ok(roadRouteInput, 'Long road route geometry should still build locator input.');
  const routeLogs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    routeLogs.push(args);
  };
  let roadRouteResult;
  try {
    roadRouteResult = locateCampsiteResultForRoute(roadRouteInput, { publish: false });
  } finally {
    console.log = originalLog;
  }
  assert.strictEqual(
    roadRouteResult.suggestedCampsites.length,
    0,
    'Road-only route contexts should not infer camps without explicit off-road access metadata.',
  );
  assert.strictEqual(
    roadRouteResult.emptyReason,
    'road_source_requires_explicit_drivable_camp_access',
    'Road-only route empty results should carry a clear intentional empty-state reason.',
  );
  assert.ok(
    routeLogs.some(
      (entry) =>
        entry[0] === '[CAMPSITE_CANDIDATE]' &&
        entry[1] === 'route_locator_summary' &&
        entry[2]?.emptyReason === 'road_source_requires_explicit_drivable_camp_access',
    ),
    'Route-source empty results should log a route_locator_summary with the intentional empty reason.',
  );

  const supportedRoadRouteLogs = [];
  console.log = (...args) => {
    supportedRoadRouteLogs.push(args);
  };
  let supportedRoadRouteResult;
  try {
    supportedRoadRouteResult = locateCampsiteResultForRoute(
      {
        ...roadRouteInput,
        routeMetadata: {
          suggestedCamps: 1,
          terrainType: 'Forest / Mountain',
          highlights: ['High-clearance forest road', 'Dispersed camp access'],
        },
      },
      { publish: false },
    );
  } finally {
    console.log = originalLog;
  }
  assert.ok(
    supportedRoadRouteResult.suggestedCampsites.length > 0,
    'Road-sourced routes with explicit dispersed-camping/forest-road support metadata should produce cautious route-corridor candidates.',
  );
  assert.ok(
    supportedRoadRouteResult.suggestedCampsites.every(
      (candidate) =>
        ['route_analysis', 'route_corridor_sampling'].includes(candidate.source) &&
        candidate.routeCampAccessSupport === true &&
        candidate.legalityStatus === 'likely_allowed_needs_verification',
    ),
    'Supported road-route candidates should carry explicit access-support and legal-verification metadata.',
  );
  assert.ok(
    supportedRoadRouteLogs.some(
      (entry) =>
        entry[0] === '[CAMPSITE_CANDIDATE]' &&
        entry[1] === 'route_locator_summary' &&
        entry[2]?.acceptedCount > 0 &&
        entry[2]?.emptyReason == null,
    ),
    'Supported road-route metadata should be reflected in a non-empty route locator summary.',
  );

  const polygonFiltered = await locateCampsitesForPolygon({
    polygonCoordinates: [
      { latitude: 39, longitude: -121 },
      { latitude: 39, longitude: -120.8 },
      { latitude: 39.2, longitude: -120.8 },
      { latitude: 39.2, longitude: -121 },
    ],
    candidates: [
      makeCandidate('inside', 39.1, -120.9, 70),
      makeCandidate('adjacent', 39.203, -120.9, 80),
      makeCandidate('outside', 39.4, -120.9, 100),
    ],
  });
  assert.deepStrictEqual(
    polygonFiltered.map((candidate) => candidate.id),
    ['inside'],
    'Polygon mode must only include viable candidates geographically inside the drawn polygon.',
  );

  const polygonRankedByRemoteness = await locateCampsitesForPolygon({
    polygonCoordinates: [
      { latitude: 39, longitude: -121 },
      { latitude: 39, longitude: -120.8 },
      { latitude: 39.2, longitude: -120.8 },
      { latitude: 39.2, longitude: -121 },
    ],
    candidates: [
      makeCandidate('remote-low', 39.05, -120.95, undefined, { remotenessScore: 25 }),
      makeCandidate('remote-high', 39.1, -120.9, undefined, { remotenessScore: 95 }),
      makeCandidate('remote-mid', 39.15, -120.85, undefined, { remotenessScore: 55 }),
    ],
  });
  assert.deepStrictEqual(
    polygonRankedByRemoteness.map((candidate) => candidate.id),
    ['remote-high'],
    'Polygon mode must rank by overall confidence score and filter results below the 70 threshold.',
  );
  assert.ok(
    Array.isArray(polygonRankedByRemoteness[0].ratingFactors) && polygonRankedByRemoteness[0].ratingFactors.length > 0,
    'Polygon campsite markers must include ratingFactors for marker popups.',
  );
  assert.ok(
    polygonRankedByRemoteness[0].ratingFactors.some((factor) => factor.label === 'Camping suitability'),
    'Polygon campsite marker ratingFactors should include existing campsite suitability scoring detail.',
  );

  console.log('Campsite locator checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
