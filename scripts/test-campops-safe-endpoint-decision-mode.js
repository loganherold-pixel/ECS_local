const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web', select: (values) => values?.web ?? values?.default } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
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
};

const campops = {
  ...require(path.join(root, 'lib', 'campops', 'campOpsSearchIntegration.ts')),
  ...require(path.join(root, 'lib', 'campops', 'campOpsSafeEndpointDecisionMode.ts')),
  ...require(path.join(root, 'lib', 'campops', 'campOpsRecommendationConfig.ts')),
};

const ENABLED_ROLLOUT = {
  campopsRecommendationsEnabled: true,
  campOpsRecommendationSetEnabled: true,
  campopsEndpointRecommendationEnabled: true,
  campopsDecisionPointsEnabled: true,
  campopsSourceTransparencyEnabled: true,
};

function makeEngineCandidate(index, overrides = {}) {
  return {
    segmentIndex: index,
    coordinates: [39 + index * 0.01, -121 - index * 0.01],
    distanceMiles: 32 + index * 14,
    avgElevation: 5200,
    elevationGain: 20,
    candidateReason: ['Flat terrain', 'Route-linked candidate'],
    segmentRange: `${32 + index * 14}-${38 + index * 14} mi`,
    difficulty: 'easy',
    qualityScore: 94 - index * 3,
    suitabilityScore: 10 - index * 0.3,
    rating: 'A',
    score: 94 - index * 3,
    remotenessScore: 82,
    campingSuitabilityScore: 92 - index * 2,
    legalAccessScore: 92 - index * 2,
    terrainScore: 90 - index,
    routeProximityScore: 92,
    ratingFactors: [],
    suitabilityLevel: 'HIGH',
    estimatedArrivalHour: 4 - index * 1.25,
    scoringBreakdown: {
      flatTerrainBonus: 3,
      remotenessBonus: 3,
      timingBonus: 4,
      elevationPenalty: 0,
      mountainPassPenalty: 0,
      idealTimingBonus: 4,
      tooEarlyPenalty: 0,
      tooLatePenalty: 0,
      shortRouteReduction: 0,
      overnightReduction: 0,
      reasons: [],
    },
    confidence: 'HIGH',
    confidenceReasons: [],
    fallbackStage: 0,
    fallbackMode: 'standard',
    criteriaBroadened: false,
    credibilityTier: 'preferred',
    ...overrides,
  };
}

function makeCandidateResult(candidates = [
  makeEngineCandidate(0, { estimatedArrivalHour: 4.25 }),
  makeEngineCandidate(1, { estimatedArrivalHour: 2.25, distanceMiles: 48 }),
  makeEngineCandidate(2, { estimatedArrivalHour: 1.25, distanceMiles: 25, campingSuitabilityScore: 76, score: 78 }),
]) {
  return {
    id: 'safe-endpoint-result',
    routeIntelligenceId: 'route-1',
    routeName: 'Decision Mode Test Route',
    totalDistanceMiles: 120,
    estimatedDriveTimeHours: 8,
    candidates,
    suggestedCampsites: candidates,
    candidateCount: candidates.length,
    totalSegments: 8,
    excludedSegments: 0,
    analyzedAt: '2026-07-12T22:00:00.000Z',
    scoringApplied: true,
    isShortRoute: false,
    overnightUnlikely: false,
    hasHighConfidence: true,
    bestConfidence: 'HIGH',
    fallbackStage: 0,
    fallbackMode: 'standard',
    criteriaBroadened: false,
    healthyThreshold: 55,
    minimumAcceptableThreshold: 45,
    uiNotice: null,
    analysisSource: 'route',
    source: 'route',
    polygonId: null,
  };
}

function routeSnapshot(overrides = {}) {
  return {
    sessionId: 'route-1-session',
    lifecycle: 'active',
    source: 'road',
    routeId: 'route-1',
    routeTitle: 'Decision Mode Test Route',
    routeSubtitle: 'Current route',
    statusLabel: 'Route active',
    instruction: 'Continue toward forest junction',
    routePoints: [
      { lat: 39, lng: -121 },
      { lat: 39.4, lng: -121.2 },
      { lat: 39.8, lng: -121.4 },
    ],
    progressPoints: [{ lat: 39, lng: -121 }, { lat: 39.15, lng: -121.08 }],
    currentLocation: {
      latitude: 39.15,
      longitude: -121.08,
      accuracyM: 12,
      timestamp: Date.parse('2026-07-12T22:00:00.000Z'),
    },
    gpsSample: null,
    headingDeg: 40,
    remainingDistanceM: 80 * 1609.344,
    remainingDurationS: 5 * 60 * 60,
    etaIso: '2026-07-13T03:00:00.000Z',
    progressPercent: 25,
    nextInstructionDistanceM: 1200,
    isRerouting: false,
    isOffRoute: false,
    offRouteDistanceM: null,
    routeStatusKind: 'nominal',
    updatedAt: '2026-07-12T22:00:00.000Z',
    ...overrides,
  };
}

function vehicleContext(updatedAt = '2026-07-12T21:55:00.000Z') {
  return {
    activeVehicleId: 'vehicle-1',
    hasActiveVehicleId: true,
    hasVehicleContext: true,
    vehicle: { name: 'Trail Rig', type: 'truck', avg_mpg: 16 },
    spec: { ground_clearance_inches: 10.5, wheelbase_in: 128, overall_width_in: 78 },
    resourceProfile: {
      currentFuelPercent: 62,
      currentFuelGallons: 15,
      fuelTankCapacityGal: 24,
      currentWaterGallons: 9,
      waterCapacityGal: 14,
      tireSizeInches: 35,
      suspensionLiftInches: 2,
    },
    accessorySummary: [{ label: 'Recovery kit', status: 'installed', color: 'amber' }],
    vehicleState: {
      identity: { displayName: 'Trail Rig', vehicleType: 'truck' },
      confidence: { label: 'high' },
      weight: { isEstimate: false, isPartial: false },
      updatedAt,
    },
    weightSnapshot: { estimatedOperatingWeightLbs: 6100, remainingPayloadLbs: 850 },
  };
}

function convoyTracking(overrides = {}) {
  return {
    convoyId: 'convoy-1',
    rawMembers: [
      { id: 'member-1', vehicle_id: 'vehicle-1' },
      { id: 'member-2', vehicle_id: 'vehicle-2' },
    ],
    rawLocations: [],
    members: [
      { memberId: 'member-1', movementStatus: 'moving' },
      { memberId: 'member-2', movementStatus: 'delayed' },
    ],
    activeCount: 2,
    staleCount: 0,
    assistanceCount: 0,
    lead: null,
    sweep: null,
    lastUpdated: '2026-07-12T21:59:00.000Z',
    connectionStatus: 'connected',
    loading: false,
    error: null,
    ...overrides,
  };
}

function powerSnapshot(overrides = {}) {
  return {
    hasPowerData: true,
    batteryPercent: 74,
    providerLabel: 'ECS Power Provider',
    freshness: 'live',
    lastUpdatedAt: Date.parse('2026-07-12T21:59:30.000Z'),
    truth: {
      sourceTruth: 'live_provider',
      providerId: 'generic',
      lastUpdatedAt: Date.parse('2026-07-12T21:59:30.000Z'),
      confidence: 0.9,
      isLive: true,
      isStale: false,
      isManual: false,
      isSimulated: false,
    },
    ...overrides,
  };
}

const result = makeCandidateResult();
const normalized = campops.buildCampOpsSearchInputs(result, {
  source: 'route',
  rolloutConfig: ENABLED_ROLLOUT,
  context: { currentTimeIso: '2026-07-12T22:00:00.000Z' },
});
const plannedCampId = normalized.candidates[0].id;
result.campOps = {
  enabled: true,
  recommendationSet: {
    enrichmentsByCandidateId: Object.fromEntries(
      Object.entries(normalized.enrichmentsByCandidateId).map(([candidateId, enrichment]) => [
        candidateId,
        {
          ...enrichment,
          closureStatus: 'open',
          groupCapacityEstimate: 6,
          groupCapacityConfidence: 'high',
          weatherExposure: 'neutral',
          weatherExposureLevel: 'low',
          stormRisk: 'low',
          precipitationRisk: 'low',
        },
      ]),
    ),
  },
};

function build(overrides = {}) {
  return campops.buildCampOpsSafeEndpointDecisionViewModel({
    rolloutConfig: ENABLED_ROLLOUT,
    routeAvailable: true,
    routeId: 'route-1',
    routeLabel: 'Decision Mode Test Route',
    tripId: 'trip-1',
    candidateResult: result,
    candidateStatus: 'ready',
    navigateRoute: routeSnapshot(),
    vehicleContext: vehicleContext(),
    convoyContext: {
      convoyId: 'convoy-1',
      memberId: 'member-1',
      role: 'lead',
      callsign: 'LEAD',
      storedAt: '2026-07-12T21:58:00.000Z',
    },
    convoyTracking: convoyTracking(),
    powerSnapshot: powerSnapshot(),
    weather: {
      source: 'live',
      provider: 'ECS Weather Pipeline',
      observedAt: '2026-07-12T21:45:00.000Z',
      hasData: true,
      stale: false,
      confidence: 'medium',
    },
    connectivityStatus: 'online',
    plannedCampId,
    delayScenario: 'delay_2h',
    beforeSunset: true,
    nowIso: '2026-07-12T22:00:00.000Z',
    ...overrides,
  });
}

const disabled = build({ rolloutConfig: {} });
assert.strictEqual(disabled.status, 'disabled', 'Rollout-disabled builds must not compute or expose an endpoint.');
assert.strictEqual(disabled.result, null);

const noRoute = build({ routeAvailable: false, candidateResult: null, navigateRoute: null });
assert.strictEqual(noRoute.status, 'no_route');
assert.strictEqual(noRoute.decisionPoint.available, false);
assert.match(noRoute.decisionPoint.reason, /route is required/i);

const noCandidates = build({
  candidateResult: makeCandidateResult([]),
  candidateStatus: 'empty',
});
assert.strictEqual(noCandidates.status, 'no_candidates');
assert.strictEqual(noCandidates.canStageRoute, false);

const providerOnlyCandidate = {
  id: 'established:provider-only',
  name: 'Provider Campground',
  location: { latitude: 39.2, longitude: -121.1 },
  source: 'established_campground',
  sourceConfidence: 'high',
  candidateClass: 'established',
  recommendationVisibility: 'operational',
  score: 86,
};
const providerOnly = build({
  candidateResult: null,
  candidateStatus: 'empty',
  plannedCampId: null,
  additionalCandidates: [providerOnlyCandidate],
  additionalEnrichmentsByCandidateId: {
    [providerOnlyCandidate.id]: {
      candidateId: providerOnlyCandidate.id,
      legalStatus: 'allowed',
      legalConfidence: 'high',
      closureStatus: 'open',
      publicAccessStatus: 'public',
      accessDifficulty: 'easy',
      vehicleFit: 'fit',
      trailerSuitability: 'fit',
      turnaroundSuitability: 'fit',
      groupCapacityEstimate: 12,
      groupCapacityConfidence: 'high',
      etaIso: '2026-07-13T00:00:00.000Z',
      routeDistanceToCampMiles: 10,
      fuelImpact: { value: 90, unit: 'miles', impact: 'positive', confidence: 'high' },
      waterImpact: { value: 10, unit: 'gallons', impact: 'positive', confidence: 'high' },
      reliableWaterRefillAvailable: false,
      weatherExposure: 'neutral',
      fireRestrictionStatus: 'none_known',
      privacyLikelihood: 'moderate',
      occupancyLikelihood: 'low',
      lateArrivalRisk: 'neutral',
      dataConfidence: 'high',
    },
  },
});
assert.notStrictEqual(providerOnly.status, 'no_candidates');
assert.ok(providerOnly.result, 'Route-linked provider candidates should use the canonical safe-endpoint engine.');
assert.ok(providerOnly.endpoints.some((endpoint) => endpoint.candidate.id === providerOnlyCandidate.id));

for (const [scenario, expected] of [['delay_30m', 30], ['delay_1h', 60], ['delay_2h', 120]]) {
  const model = build({ delayScenario: scenario });
  assert.strictEqual(model.delayMinutes, expected, `${scenario} should preserve the exact engine delay.`);
  assert.strictEqual(model.result.decisionSummary.delayEstimateMinutes, expected);
}

const noDelay = build({ delayScenario: 'no_delay' });
assert.strictEqual(noDelay.plannedCampStatus, 'viable', 'The linked planned endpoint should remain viable in the on-time fixture.');
assert.strictEqual(noDelay.result.context.vehicleProfile.widthInches, 78);
assert.strictEqual(noDelay.result.context.vehicleProfile.wheelbaseInches, 128);

const trailerVehicle = vehicleContext();
trailerVehicle.loadoutItems = [{ name: 'Trailer hitch' }];
const trailerContext = build({ vehicleContext: trailerVehicle, delayScenario: 'no_delay' });
assert.strictEqual(trailerContext.result.context.vehicleProfile.trailerAttached, true);

const downgradedResult = JSON.parse(JSON.stringify(result));
Object.assign(
  downgradedResult.campOps.recommendationSet.enrichmentsByCandidateId[plannedCampId],
  {
    weatherExposure: 'caution',
    weatherExposureLevel: 'high',
    stormRisk: 'moderate',
    precipitationRisk: 'moderate',
    dataConfidence: 'medium',
    privacyLikelihood: 'low',
  },
);
const downgraded = build({
  candidateResult: downgradedResult,
  delayScenario: 'no_delay',
});
assert.strictEqual(downgraded.plannedCampStatus, 'downgraded');
assert.match(downgraded.plannedCampDowngradeReason, /downgraded from primary/i);
assert.notStrictEqual(downgraded.recommendedEndpoint.candidate.id, plannedCampId);

const rejectedResult = makeCandidateResult([
  makeEngineCandidate(0, { distanceMiles: 100, estimatedArrivalHour: 8 }),
  makeEngineCandidate(1, { distanceMiles: 25, estimatedArrivalHour: 1 }),
  makeEngineCandidate(2, { distanceMiles: 20, estimatedArrivalHour: 0.5, campingSuitabilityScore: 76, score: 78 }),
]);
rejectedResult.campOps = result.campOps;
const rejected = build({
  candidateResult: rejectedResult,
  delayScenario: 'delay_2h',
});
assert.strictEqual(rejected.plannedCampStatus, 'rejected');
assert.ok(rejected.plannedCampGateResults.some((gate) => /safe-arrival window/i.test(gate)));

const delayed = build({ delayScenario: 'delay_2h' });
assert.strictEqual(delayed.status, 'recommended');
assert.ok(delayed.recommendedEndpoint, 'A deterministic recommended endpoint should be presented.');
assert.ok(delayed.backupEndpoint, 'A backup endpoint should remain visible.');
assert.ok(delayed.emergencyEndpoint, 'An emergency endpoint should remain visible when the engine provides one.');
assert.notStrictEqual(delayed.plannedCampStatus, 'not_linked');
assert.strictEqual(delayed.explanationSource, 'deterministic_campops', 'AI must not own endpoint selection or explanation authority.');
assert.ok(
  delayed.recommendedEndpoint.risks.some((risk) => risk.id === 'late_arrival'),
  'Late-arrival risk must be visible for the selected endpoint.',
);
assert.notStrictEqual(delayed.decisionDeadlineText, 'Unknown', 'Before-sunset mode should expose the computed deadline when daylight is available.');
assert.strictEqual(delayed.decisionPoint.available, true, 'Current route position and progress should support a decision point.');

const noDecisionPoint = build({
  navigateRoute: null,
  delayScenario: 'delay_1h',
});
assert.strictEqual(noDecisionPoint.decisionPoint.available, false);
assert.match(noDecisionPoint.decisionPoint.reason, /route geometry or progress data/i);

const staleManual = build({
  nowIso: '2026-07-12T22:12:00.000Z',
  navigateRoute: routeSnapshot({
    updatedAt: '2026-07-12T22:00:00.000Z',
    currentLocation: {
      latitude: 39.15,
      longitude: -121.08,
      accuracyM: 18,
      timestamp: Date.parse('2026-07-12T22:00:00.000Z'),
    },
  }),
  vehicleContext: vehicleContext('2026-07-12T21:55:00.000Z'),
  convoyTracking: convoyTracking({
    connectionStatus: 'degraded',
    staleCount: 1,
    lastUpdated: '2026-07-12T22:00:00.000Z',
  }),
  weather: {
    source: 'cache_stale',
    provider: 'ECS Weather Cache',
    observedAt: '2026-07-12T12:00:00.000Z',
    hasData: true,
    stale: true,
    confidence: 'low',
  },
  connectivityStatus: 'offline',
});
const inputStates = Object.fromEntries(staleManual.inputTruth.map((item) => [item.id, item.stateLabel]));
assert.strictEqual(inputStates.location, 'STALE', 'Stale route positions must remain visibly stale.');
assert.strictEqual(inputStates.convoy, 'STALE', 'Stale convoy state must remain visibly stale.');
assert.strictEqual(inputStates.weather, 'STALE', 'Cached stale weather must remain visibly stale.');
assert.ok(['MANUAL', 'RECENT'].includes(inputStates.fuel), 'Manual fuel state must not be relabeled live.');
assert.ok(['MANUAL', 'RECENT'].includes(inputStates.water), 'Manual water state must not be relabeled live.');

const selected = delayed.recommendedEndpoint;
const frozenBefore = JSON.stringify(selected);
Object.freeze(selected);
const previewIntent = campops.buildCampOpsSafeEndpointMapPreviewIntent(selected);
assert.ok(previewIntent, 'Map preview should produce a read-only coordinate intent.');
assert.strictEqual(JSON.stringify(selected), frozenBefore, 'Building a map preview must not mutate the endpoint or recommendation.');
assert.deepStrictEqual(Object.keys(previewIntent).sort(), ['candidateId', 'coordinate', 'title']);

const stageIntent = campops.buildCampOpsSafeEndpointRouteStageIntent(selected);
assert.ok(stageIntent);
assert.deepStrictEqual(
  Object.keys(stageIntent.raw).sort(),
  ['campOpsCandidateId', 'campOpsRole', 'decisionMode', 'source', 'sourceConfidence'],
  'Route staging metadata must remain bounded and exclude provider payloads or secrets.',
);

delete global.__ENABLE_CAMPOPS_INTERNAL_BETA__;
assert.strictEqual(campops.isCampOpsSafeEndpointDecisionModeEnabled(), false, 'The user-facing mode must default off.');
global.__ENABLE_CAMPOPS_INTERNAL_BETA__ = true;
assert.strictEqual(campops.isCampOpsSafeEndpointDecisionModeEnabled(), true, 'The existing internal beta gate may enable the mode.');
const betaConfig = campops.getCampOpsSafeEndpointRolloutConfig();
assert.strictEqual(betaConfig.campopsEndpointRecommendationEnabled, true);
assert.strictEqual(betaConfig.campopsDecisionPointsEnabled, true);
delete global.__ENABLE_CAMPOPS_INTERNAL_BETA__;

console.log('CampOps Safe Endpoint Decision Mode checks passed.');
