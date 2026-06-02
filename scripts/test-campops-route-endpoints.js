const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require('./campops-react-native-test-shim');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('/supabase') || request === './supabase') {
    return { supabase: null };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  CAMP_OPS_ROUTE_ENDPOINT_DEFAULT_SEARCH_CORRIDOR_MILES,
  buildCampOpsRouteEndpointPlan,
  projectCampPointToRoute,
} = require(path.join(root, 'lib', 'campops', 'campOpsRouteEndpoints.ts'));
const {
  withCampOpsSearchPayload,
} = require(path.join(root, 'lib', 'campops', 'campOpsSearchIntegration.ts'));

const routeCoordinates = [
  { latitude: 0, longitude: 0 },
  { latitude: 1, longitude: 0 },
];

function candidate(id, latitude, longitude, score, overrides = {}) {
  return {
    id,
    name: id,
    location: { latitude, longitude },
    source: 'route_endpoint_candidate',
    sourceConfidence: 'high',
    score,
    ...overrides,
  };
}

function enrichment(candidateId, overrides = {}) {
  return {
    candidateId,
    legalStatus: 'allowed',
    legalConfidence: 'high',
    closureStatus: 'open',
    publicAccessStatus: 'public',
    accessDifficulty: 'easy',
    vehicleFit: 'fit',
    trailerSuitability: 'fit',
    turnaroundSuitability: 'fit',
    trailerTurnaroundConfidence: 'high',
    deadEndRisk: 'low',
    backingRequired: false,
    roadWidthConfidence: 'high',
    groupCapacityEstimate: 4,
    groupCapacityConfidence: 'medium',
    etaIso: '2026-06-03T00:00:00.000Z',
    etaMinutesFromNow: 240,
    sunsetMarginMinutes: 90,
    routeDistanceToCampMiles: 34,
    fuelImpact: { value: 80, unit: 'miles', impact: 'neutral', confidence: 'high' },
    waterImpact: { value: 10, unit: 'gallons', impact: 'neutral', confidence: 'high' },
    reliableWaterRefillAvailable: true,
    terrainSlopeEstimate: { value: 4, unit: 'degrees', confidence: 'high', source: 'route_endpoint_candidate' },
    weatherExposure: 'low',
    fireRestrictionStatus: 'none',
    privacyLikelihood: 'high',
    occupancyLikelihood: 'low',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'high',
    dataLimitations: [],
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    id: 'route-endpoint-test-context',
    routeId: 'northbound-route',
    tripId: 'trip-1',
    currentTimeIso: '2026-06-02T18:00:00.000Z',
    riskTolerance: 'conservative',
    offlineMode: 'online',
    desiredArrivalWindow: {
      latestAcceptableIso: '2026-06-03T03:00:00.000Z',
    },
    convoyProfile: {
      peopleCount: 2,
      vehicleCount: 1,
      source: 'manual',
      confidence: 'medium',
    },
    resourceState: {
      fuelRangeMiles: 180,
      waterGallons: 12,
      source: 'manual',
      confidence: 'medium',
    },
    ...overrides,
  };
}

const westProjection = projectCampPointToRoute(
  { latitude: 0.5, longitude: -0.02 },
  routeCoordinates,
);
assert.strictEqual(westProjection.routeSide, 'left', 'West of a northbound route should classify as left.');
assert.strictEqual(
  projectCampPointToRoute({ latitude: 0.5, longitude: 0.02 }, routeCoordinates).routeSide,
  'right',
  'East of a northbound route should classify as right.',
);
assert.ok(
  westProjection.distanceFromRouteMiles > 1 && westProjection.distanceFromRouteMiles < 2,
  'Projection should return candidate distance from the route in miles.',
);
assert.ok(
  westProjection.routeMileMarker > 30 && westProjection.routeMileMarker < 40,
  'Projection should return a route mile marker near the midpoint.',
);

const dayTripPlan = buildCampOpsRouteEndpointPlan({
  routeId: 'day-route',
  tripType: 'day_trip',
  routeCoordinates,
  candidates: [candidate('day-camp', 0.5, -0.02, 96)],
  enrichmentsByCandidateId: { 'day-camp': enrichment('day-camp') },
  context: context(),
});
assert.strictEqual(dayTripPlan.windows.length, 0, 'Day trips should not generate Camp Endpoint windows by default.');
assert.strictEqual(dayTripPlan.endpointCandidates.length, 0, 'Day trips should not surface camp endpoints by default.');

const overnightPlan = buildCampOpsRouteEndpointPlan({
  routeId: 'northbound-route',
  tripId: 'trip-1',
  tripType: 'overnight_camping',
  routeCoordinates,
  candidates: [
    candidate('verified-left', 0.5, -0.02, 96),
    candidate('verified-right', 0.52, 0.02, 91),
    candidate('outside-corridor', 0.5, 0.2, 100),
  ],
  enrichmentsByCandidateId: {
    'verified-left': enrichment('verified-left'),
    'verified-right': enrichment('verified-right'),
    'outside-corridor': enrichment('outside-corridor'),
  },
  context: context(),
});
assert.strictEqual(overnightPlan.windows.length, 1, 'Overnight trips should generate one Camp Endpoint window.');
assert.strictEqual(
  overnightPlan.windows[0].searchCorridorMiles,
  CAMP_OPS_ROUTE_ENDPOINT_DEFAULT_SEARCH_CORRIDOR_MILES,
  'Camp Endpoint windows should use the adaptive corridor default.',
);
assert.deepStrictEqual(
  overnightPlan.endpointCandidates.map((item) => item.candidate.id),
  ['verified-left', 'verified-right'],
  'Route endpoint planning should exclude sourced candidates outside the adaptive corridor.',
);
assert.strictEqual(
  overnightPlan.endpointCandidates.find((item) => item.candidate.id === 'verified-left').routeEndpoint.routeSide,
  'left',
  'Endpoint metadata should preserve left side of route.',
);
assert.strictEqual(
  overnightPlan.endpointCandidates.find((item) => item.candidate.id === 'verified-right').routeEndpoint.routeSide,
  'right',
  'Endpoint metadata should preserve right side of route.',
);
assert.strictEqual(
  overnightPlan.recommendationsByWindow[overnightPlan.windows[0].id].recommendedCamp.id,
  'verified-left',
  'The highest verified candidate should become the primary endpoint.',
);
assert.strictEqual(
  overnightPlan.endpointCandidates.find((item) => item.candidate.id === 'verified-left').role,
  'primary',
  'Primary endpoint candidates should carry primary role metadata.',
);

const unknownOnlyPlan = buildCampOpsRouteEndpointPlan({
  routeId: 'unknown-route',
  tripType: 'overnight_camping',
  routeCoordinates,
  candidates: [candidate('unknown-legal', 0.5, -0.02, 99, { sourceConfidence: 'low' })],
  enrichmentsByCandidateId: {
    'unknown-legal': enrichment('unknown-legal', {
      legalStatus: 'unknown',
      legalConfidence: 'unknown',
      publicAccessStatus: 'unknown',
      dataConfidence: 'low',
      dataLimitations: ['Legal/access source data is missing.'],
    }),
  },
  context: context(),
});
const unknownWindow = unknownOnlyPlan.windows[0].id;
assert.strictEqual(
  unknownOnlyPlan.recommendationsByWindow[unknownWindow].recommendedCamp,
  null,
  'Unknown legal/access candidates must not be promoted to primary endpoint.',
);
assert.strictEqual(
  unknownOnlyPlan.endpointCandidates[0].role,
  'verify',
  'Unknown legal/access candidates should remain verify-before-use candidates.',
);
assert.ok(
  unknownOnlyPlan.warnings.some((warning) => /No verified-first camp endpoint/i.test(warning)),
  'No-primary endpoint plans should explain that verification was insufficient.',
);

const emptySourcedPlan = buildCampOpsRouteEndpointPlan({
  routeId: 'empty-route',
  tripType: 'overnight_camping',
  routeCoordinates,
  candidates: [],
  enrichmentsByCandidateId: {},
  context: context(),
});
assert.strictEqual(emptySourcedPlan.windows.length, 1, 'Missing candidates should still produce a planning window.');
assert.strictEqual(
  emptySourcedPlan.endpointCandidates.length,
  0,
  'CampOps must not generate centerline pseudo-camps when no sourced candidates exist.',
);
assert.strictEqual(
  emptySourcedPlan.recommendationsByWindow[emptySourcedPlan.windows[0].id].recommendedCamp,
  null,
  'Empty sourced plans should have no primary endpoint.',
);

const staleManualPlan = buildCampOpsRouteEndpointPlan({
  routeId: 'stale-manual-route',
  tripType: 'overnight_camping',
  routeCoordinates,
  candidates: [
    candidate('stale-manual', 0.5, -0.02, 94, {
      source: 'manual',
      sourceConfidence: 'medium',
    }),
  ],
  enrichmentsByCandidateId: {
    'stale-manual': enrichment('stale-manual', {
      dataConfidence: 'medium',
      dataLimitations: ['Operator-entered camp endpoint; verify before use.'],
      sourceSignals: [
        {
          source: 'offline_dataset',
          confidence: 'medium',
          fields: ['legalStatus'],
          isStale: true,
          cachedAt: '2026-05-01T00:00:00.000Z',
          freshnessStatus: 'stale',
          limitation: 'Offline legal/access cache is stale.',
        },
      ],
    }),
  },
  context: context({ offlineMode: 'degraded' }),
});
assert.ok(
  staleManualPlan.warnings.some((warning) => /manual/i.test(warning)) &&
    staleManualPlan.warnings.some((warning) => /stale/i.test(warning)) &&
    staleManualPlan.warnings.some((warning) => /cached|cache/i.test(warning)),
  'Manual, stale, and cached data paths should be visible in endpoint plan warnings.',
);

const searchPayloadResult = withCampOpsSearchPayload({
  routeIntelligenceId: 'northbound-route',
  routeName: 'Northbound test route',
  totalDistanceMiles: 69,
  estimatedDriveTimeHours: 5,
  elevationGainFeet: 0,
  elevationLossFeet: 0,
  highestElevationFeet: 0,
  lowestElevationFeet: 0,
  avgElevationFeet: 0,
  totalPoints: 2,
  segments: [],
  segmentCount: 0,
  overallDifficulty: 'easy',
  bounds: { north: 1, south: 0, east: 0.05, west: -0.05 },
  elevationProfile: [],
  analyzedAt: '2026-06-02T18:00:00.000Z',
  hasElevation: false,
  avgSpeedAssumption: 15,
  candidates: [{
    segmentIndex: 0,
    coordinates: [0.5, -0.02],
    distanceMiles: 34,
    avgElevation: 4200,
    elevationGain: 20,
    candidateReason: ['Flat route corridor'],
    segmentRange: '30-40 mi',
    difficulty: 'easy',
    qualityScore: 96,
    suitabilityScore: 12,
    score: 96,
    remotenessScore: 92,
    campingSuitabilityScore: 94,
    legalAccessScore: 92,
    terrainScore: 94,
    routeProximityScore: 98,
    ratingFactors: [],
    suitabilityLevel: 'HIGH',
    estimatedArrivalHour: 4,
    scoringBreakdown: {},
    confidence: 'HIGH',
  }],
  suggestedCampsites: [],
  candidateCount: 1,
  excludedSegments: 0,
  scoringApplied: true,
}, {
  source: 'route',
  routeCoordinates,
  tripType: 'overnight_camping',
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
  },
  context: context(),
});
assert.ok(
  searchPayloadResult.campOps.routeEndpointPlan,
  'Route CampOps search payloads should include a route camp endpoint plan when trip type needs camping.',
);
assert.strictEqual(
  searchPayloadResult.campOps.routeEndpointPlan.endpointCandidates[0].routeEndpoint.routeSide,
  'left',
  'Route search payload endpoint plans should preserve route-side metadata.',
);

console.log('CampOps route endpoint planner checks passed.');
