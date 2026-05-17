const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campopsPath = path.join(root, 'lib', 'campops', 'index.ts');

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
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  buildCampOpsAiAssistPayload,
  findCampOpsSafeEndPoint,
  findCampOpsSafeEndPointScenarios,
} = require(campopsPath);

function candidate(id, name, latitude, longitude) {
  return {
    id,
    name,
    location: { latitude, longitude },
    source: 'route_candidate',
    sourceConfidence: 'high',
  };
}

function enrichment(candidateId, etaIso, overrides = {}) {
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
    groupCapacityConfidence: 'high',
    etaIso,
    etaMinutesFromNow: Math.round((Date.parse(etaIso) - Date.parse('2026-04-30T16:00:00.000Z')) / 60000),
    sunsetMarginMinutes: Math.round((Date.parse('2026-05-01T03:30:00.000Z') - Date.parse(etaIso)) / 60000),
    fuelImpact: { value: 80, unit: 'miles', impact: 'neutral', confidence: 'high' },
    waterImpact: { value: 8, unit: 'gallons', impact: 'neutral', confidence: 'high' },
    reliableWaterRefillAvailable: false,
    terrainSlopeEstimate: { value: 82, unit: 'score', confidence: 'high', source: 'inferred' },
    weatherExposure: 'neutral',
    fireRestrictionStatus: 'none_known',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'low',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'high',
    ...overrides,
  };
}

const planned = candidate('camp-planned', 'Scenic Planned Camp', 39.2, -119.8);
const safe = candidate('camp-safe', 'Lower Valley Camp', 39.1, -119.75);
const backup = candidate('camp-backup', 'Forest Road Backup', 39.12, -119.78);
const emergency = candidate('camp-emergency', 'Trailhead Emergency Stop', 39.05, -119.7);

const baseInput = {
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: true,
  },
  context: {
    id: 'safe-endpoint-test',
    routeId: 'route-delay',
    plannedCampId: planned.id,
    currentTimeIso: '2026-04-30T16:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-04-30T17:00:00.000Z',
      latestAcceptableIso: '2026-05-01T03:30:00.000Z',
    },
    daylightInfo: {
      sunsetIso: '2026-05-01T03:30:00.000Z',
      source: 'manual',
      confidence: 'high',
    },
    vehicleProfile: {
      vehicleId: 'vehicle-1',
      label: 'Trail Rig',
      vehicleType: 'truck',
      trailerAttached: true,
      confidence: 'high',
    },
    convoyProfile: {
      peopleCount: 3,
      vehicleCount: 2,
      trailerCount: 1,
      source: 'manual',
      confidence: 'high',
    },
    resourceState: {
      fuelReserveMiles: 80,
      waterGallons: 8,
      source: 'manual',
      confidence: 'high',
    },
    riskTolerance: 'balanced',
    offlineMode: 'online',
  },
  candidates: [planned, safe, backup, emergency],
  enrichmentsByCandidateId: {
    [planned.id]: enrichment(planned.id, '2026-05-01T02:30:00.000Z', {
      privacyLikelihood: 'high',
      terrainSlopeEstimate: { value: 90, unit: 'score', confidence: 'high', source: 'inferred' },
    }),
    [safe.id]: enrichment(safe.id, '2026-04-30T23:15:00.000Z', {
      trailerSuitability: 'fit',
      privacyLikelihood: 'moderate',
    }),
    [backup.id]: enrichment(backup.id, '2026-04-30T23:45:00.000Z', {
      trailerSuitability: 'fit',
      dataConfidence: 'medium',
    }),
    [emergency.id]: enrichment(emergency.id, '2026-04-30T22:45:00.000Z', {
      privacyLikelihood: 'low',
      terrainSlopeEstimate: { value: 65, unit: 'score', confidence: 'medium', source: 'inferred' },
    }),
  },
};

const disabled = findCampOpsSafeEndPoint({
  ...baseInput,
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsEndpointRecommendationEnabled: false,
    campopsDecisionPointsEnabled: true,
  },
  delayScenario: 'delay_2h',
});
assert.strictEqual(disabled.enabled, false, 'Safe endpoint flow should be disabled unless the feature flag is enabled.');
assert.strictEqual(disabled.decisionSummary.status, 'disabled');
assert.strictEqual(disabled.recommendationSet.recommendedCamp, null);

const legacyShortcutIgnored = findCampOpsSafeEndPoint({
  ...baseInput,
  rolloutConfig: undefined,
  enabled: true,
  delayScenario: 'delay_2h',
});
assert.strictEqual(
  legacyShortcutIgnored.enabled,
  false,
  'Legacy enabled shortcut must not bypass explicit CampOps endpoint rollout flags.',
);

const noDelay = findCampOpsSafeEndPoint({
  ...baseInput,
  delayScenario: 'no_delay',
});
assert.strictEqual(noDelay.enabled, true);
assert.strictEqual(
  noDelay.recommendationSet.recommendedCamp.id,
  planned.id,
  'Without delay, the planned camp should remain recommended when it stays before sunset.',
);

const twoHourDelay = findCampOpsSafeEndPoint({
  ...baseInput,
  delayScenario: 'delay_2h',
});
assert.strictEqual(twoHourDelay.enabled, true);
assert.strictEqual(twoHourDelay.decisionSummary.delayEstimateMinutes, 120);
assert.strictEqual(
  twoHourDelay.recommendationSet.recommendedCamp.id,
  safe.id,
  'With a two-hour delay, CampOps should recommend the safer accessible camp.',
);
assert.notStrictEqual(
  twoHourDelay.recommendationSet.recommendedCamp.id,
  planned.id,
  'Delayed planned camp should not remain the primary recommendation.',
);
assert.ok(
  twoHourDelay.recommendationSet.rejectedCandidates.some((item) => item.candidate.id === planned.id),
  'Planned camp should be rejected/downgraded after ETA moves past sunset.',
);
assert.ok(
  String(twoHourDelay.decisionSummary.plannedCampDowngradeReason).includes('Planned camp'),
  'Decision summary should explain planned camp downgrade.',
);
assert.strictEqual(twoHourDelay.decisionSummary.recommendedSafeEndpoint.id, safe.id);
assert.ok(twoHourDelay.decisionSummary.backupEndpoint, 'Safe endpoint summary should include backup endpoint when available.');
assert.ok(twoHourDelay.decisionSummary.emergencyEndpoint, 'Safe endpoint summary should include emergency endpoint when available.');
assert.ok(twoHourDelay.decisionSummary.nextAction.includes(safe.name), 'Next action should reference the recommended endpoint.');
assert.strictEqual(twoHourDelay.decisionSummary.decisionPoint, null, 'Missing route geometry should not invent a decision point.');
assert.ok(twoHourDelay.decisionSummary.noDecisionPointReason.includes('Route geometry'));

const routeProgress = {
  routeMileMarker: 42,
  distanceRemainingMiles: 80,
  driveTimeRemainingMinutes: 240,
  currentSegmentLabel: 'Approach to ridge road',
  latestTurnoffLabel: 'Lower Valley turnoff',
  latestTurnoffMileMarker: 48,
  latestTurnoffDistanceMiles: 12,
  latestTurnoffLocation: { latitude: 39.11, longitude: -119.76 },
  source: 'manual',
  confidence: 'high',
};

const delayedWithRoute = findCampOpsSafeEndPoint({
  ...baseInput,
  context: {
    ...baseInput.context,
    vehicleProfile: { ...baseInput.context.vehicleProfile, trailerAttached: false },
    convoyProfile: { ...baseInput.context.convoyProfile, trailerCount: 0 },
    routeProgress,
  },
  delayScenario: 'delay_2h',
});
assert.strictEqual(delayedWithRoute.decisionSummary.decisionPoint.kind, 'before_dark');
assert.strictEqual(delayedWithRoute.decisionSummary.decisionPoint.latestRecommendedTurnoff.label, 'Lower Valley turnoff');
assert.strictEqual(delayedWithRoute.decisionSummary.decisionPoint.routeMileMarker, 48);
assert.strictEqual(
  delayedWithRoute.decisionSummary.decisionDeadlineIso,
  '2026-04-30T16:36:00.000Z',
  'Decision deadline should be based on reaching the latest practical turnoff before the final arrival deadline.',
);
assert.ok(delayedWithRoute.recommendationSet.decisionPoint, 'Recommendation set should carry the decision point for AI/UI consumers.');

const trailerDecision = findCampOpsSafeEndPoint({
  ...baseInput,
  context: {
    ...baseInput.context,
    routeProgress: {
      ...routeProgress,
      lastTrailerTurnaroundLabel: 'Last trailer turnaround',
      lastTrailerTurnaroundMileMarker: 46,
      lastTrailerTurnaroundDistanceMiles: 8,
      lastTrailerTurnaroundLocation: { latitude: 39.09, longitude: -119.74 },
    },
  },
  enrichmentsByCandidateId: {
    ...baseInput.enrichmentsByCandidateId,
    [planned.id]: enrichment(planned.id, '2026-05-01T02:30:00.000Z', {
      trailerSuitability: 'not_fit',
      turnaroundSuitability: 'not_fit',
    }),
  },
  delayScenario: 'no_delay',
});
assert.strictEqual(trailerDecision.decisionSummary.decisionPoint.kind, 'trailer_turnaround');
assert.ok(trailerDecision.decisionSummary.decisionPoint.riskIfContinues.includes('trailer'));

const lowFuelDecision = findCampOpsSafeEndPoint({
  ...baseInput,
  context: {
    ...baseInput.context,
    vehicleProfile: { ...baseInput.context.vehicleProfile, trailerAttached: false },
    convoyProfile: { ...baseInput.context.convoyProfile, trailerCount: 0 },
    resourceState: { ...baseInput.context.resourceState, fuelReserveMiles: 28 },
    routeProgress: {
      ...routeProgress,
      nextResupplyLabel: 'Last fuel before dirt',
      nextResupplyMileMarker: 45,
      nextResupplyDistanceMiles: 6,
      nextResupplyLocation: { latitude: 39.08, longitude: -119.73 },
    },
  },
  enrichmentsByCandidateId: {
    ...baseInput.enrichmentsByCandidateId,
    [safe.id]: enrichment(safe.id, '2026-04-30T23:15:00.000Z', {
      fuelImpact: { value: 18, unit: 'miles', impact: 'critical', confidence: 'high' },
    }),
  },
  delayScenario: 'no_delay',
});
assert.strictEqual(lowFuelDecision.decisionSummary.decisionPoint.kind, 'resupply');
assert.ok(lowFuelDecision.decisionSummary.decisionPoint.riskIfContinues.includes('fuel'));

const lateArrivalDecision = findCampOpsSafeEndPoint({
  ...baseInput,
  context: {
    ...baseInput.context,
    vehicleProfile: { ...baseInput.context.vehicleProfile, trailerAttached: false },
    convoyProfile: { ...baseInput.context.convoyProfile, trailerCount: 0 },
    routeProgress,
  },
  delayScenario: 'delay_2h',
});
assert.strictEqual(lateArrivalDecision.decisionSummary.decisionPoint.kind, 'before_dark');
assert.ok(lateArrivalDecision.decisionSummary.decisionPoint.riskIfContinues.includes('arrival window'));

const aiPayload = buildCampOpsAiAssistPayload({
  context: delayedWithRoute.context,
  recommendationSet: delayedWithRoute.recommendationSet,
  mode: 'field',
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsAiAssistEnabled: true,
  },
});
assert.strictEqual(aiPayload.decisionPoint.kind, 'before_dark');
assert.ok(aiPayload.decisionPoint.recommendedAction.includes('Diversion recommended'));

const scenarios = findCampOpsSafeEndPointScenarios(baseInput);
assert.deepStrictEqual(
  scenarios.map((result) => result.decisionSummary.delayEstimateMinutes),
  [0, 30, 60, 120],
  'Safe endpoint scenario helper should support no delay, 30m, 1h, and 2h presets.',
);

const custom = findCampOpsSafeEndPoint({
  ...baseInput,
  delayScenario: { kind: 'custom', minutes: 45, label: 'custom 45m' },
});
assert.strictEqual(custom.decisionSummary.delayEstimateMinutes, 45, 'Safe endpoint flow should support custom delay minutes.');

console.log('CampOps safe endpoint checks passed.');
