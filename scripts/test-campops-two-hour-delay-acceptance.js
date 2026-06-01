const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campopsPath = path.join(root, 'lib', 'campops', 'index.ts');
const panelPath = path.join(root, 'components', 'navigate', 'CampsiteCandidatePanel.tsx');

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

const campops = require(campopsPath);

function candidate(id, name, latitude, longitude, overrides = {}) {
  return {
    id,
    name,
    location: { latitude, longitude },
    source: 'route_candidate',
    sourceConfidence: 'high',
    lastVerifiedDate: '2026-04-15T00:00:00.000Z',
    ...overrides,
  };
}

function service(type, distance, confidence = 'medium') {
  return {
    serviceType: type,
    name: `${type} fixture`,
    location: { latitude: 39.2, longitude: -119.8 },
    distanceFromCampMiles: distance,
    routeAwareDistanceMiles: distance,
    confidence,
    freshness: confidence === 'high' ? 'fresh' : 'stale',
    status: confidence === 'high' ? 'open' : 'unknown',
    sourceSummary: `${type} fixture source`,
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
    groupCapacityEstimate: 5,
    groupCapacityConfidence: 'high',
    etaIso,
    etaMinutesFromNow: Math.round((Date.parse(etaIso) - Date.parse('2026-04-30T16:00:00.000Z')) / 60000),
    sunsetMarginMinutes: Math.round((Date.parse('2026-05-01T03:00:00.000Z') - Date.parse(etaIso)) / 60000),
    routeDistanceToCampMiles: 35,
    fuelImpact: { value: 72, unit: 'miles', impact: 'neutral', confidence: 'high' },
    waterImpact: { value: 9, unit: 'gallons', impact: 'neutral', confidence: 'high' },
    reliableWaterRefillAvailable: true,
    nearestFuel: service('fuel', 12, 'high'),
    nearestWater: service('potable_water', 10, 'medium'),
    terrainSlopeEstimate: { value: 3, unit: 'degrees', confidence: 'medium', source: 'inferred' },
    weatherExposure: 'neutral',
    weatherExposureLevel: 'low',
    fireRestrictionStatus: 'restrictions_possible',
    campfireAllowed: 'restricted',
    stoveAllowed: 'yes',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'moderate',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'medium',
    dataLimitations: [],
    ...overrides,
  };
}

function assertTextIncludes(text, pattern, label) {
  assert.ok(pattern.test(text), `${label} should include ${pattern}; got ${text}`);
}

const planned = candidate('planned-scenic-ridge', 'Scenic Ridge Planned Camp', 39.42, -119.91);
const recommended = candidate('lower-valley-endpoint', 'Lower Valley Endpoint', 39.24, -119.82);
const backup = candidate('forest-road-backup', 'Forest Road Backup', 39.28, -119.86);
const emergency = candidate('trailhead-emergency-stop', 'Trailhead Emergency Stop', 39.17, -119.72);

const baseInput = {
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: true,
    campopsAiAssistEnabled: true,
    campopsSourceTransparencyEnabled: true,
  },
  context: {
    id: 'two-hour-delay-acceptance',
    routeId: 'route-private-not-asserted',
    plannedCampId: planned.id,
    currentTimeIso: '2026-04-30T16:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-04-30T23:30:00.000Z',
      latestAcceptableIso: '2026-05-01T03:00:00.000Z',
    },
    daylightInfo: {
      sunsetIso: '2026-05-01T03:00:00.000Z',
      civilTwilightEndIso: '2026-05-01T03:25:00.000Z',
      source: 'manual',
      confidence: 'medium',
    },
    vehicleProfile: {
      vehicleId: 'private-vehicle-id',
      vehicleType: 'full_size_truck',
      trailerAttached: true,
      clearanceInches: 9,
      confidence: 'medium',
    },
    convoyProfile: {
      vehicleCount: 2,
      peopleCount: 4,
      trailerCount: 1,
      trailerPresent: true,
      source: 'manual',
      confidence: 'medium',
    },
    resourceState: {
      fuelReserveMiles: 92,
      waterGallons: 11,
      source: 'manual',
      confidence: 'medium',
    },
    riskTolerance: 'balanced',
    offlineMode: 'degraded',
    routeProgress: {
      routeMileMarker: 38,
      distanceRemainingMiles: 96,
      driveTimeRemainingMinutes: 300,
      currentSegmentLabel: 'Lower valley approach',
      latestTurnoffLabel: 'Lower Valley turnoff',
      latestTurnoffMileMarker: 50,
      latestTurnoffDistanceMiles: 12,
      latestTurnoffLocation: { latitude: 39.22, longitude: -119.8 },
      lastTrailerTurnaroundLabel: 'Last confirmed trailer turnaround',
      lastTrailerTurnaroundMileMarker: 48,
      lastTrailerTurnaroundDistanceMiles: 10,
      lastTrailerTurnaroundLocation: { latitude: 39.21, longitude: -119.79 },
      source: 'manual',
      confidence: 'medium',
    },
  },
  candidates: [planned, recommended, backup, emergency],
  enrichmentsByCandidateId: {
    [planned.id]: enrichment(planned.id, '2026-05-01T02:20:00.000Z', {
      routeDistanceToCampMiles: 76,
      etaMinutesFromNow: 620,
      sunsetMarginMinutes: 40,
      accessDifficulty: 'technical',
      vehicleFit: 'limited',
      trailerSuitability: 'limited',
      turnaroundSuitability: 'unknown',
      trailerTurnaroundConfidence: 'low',
      deadEndRisk: 'high',
      roadWidthConfidence: 'low',
      fuelImpact: { value: 23, unit: 'miles', impact: 'caution', confidence: 'medium' },
      waterImpact: { value: 5, unit: 'gallons', impact: 'caution', confidence: 'medium' },
      nearestFuel: service('fuel', 31, 'medium'),
      nearestWater: service('potable_water', 28, 'medium'),
      terrainSlopeEstimate: { value: 9, unit: 'degrees', confidence: 'medium', source: 'inferred' },
      weatherExposure: 'watch',
      weatherExposureLevel: 'medium',
      privacyLikelihood: 'high',
      occupancyLikelihood: 'low',
      lateArrivalRisk: 'caution',
      dataConfidence: 'medium',
      dataLimitations: ['Weather source is stale for the scenic ridge approach.'],
      sourceSignals: [
        {
          source: 'offline_dataset',
          confidence: 'medium',
          observedAtIso: '2026-04-01T00:00:00.000Z',
          isStale: true,
          freshnessStatus: 'stale',
          fields: ['weatherExposure', 'closureStatus'],
          limitation: 'Cached route source is stale.',
        },
      ],
    }),
    [recommended.id]: enrichment(recommended.id, '2026-05-01T00:55:00.000Z', {
      routeDistanceToCampMiles: 42,
      legalConfidence: 'high',
      accessDifficulty: 'easy',
      trailerSuitability: 'fit',
      turnaroundSuitability: 'fit',
      trailerTurnaroundConfidence: 'high',
      fuelImpact: { value: 64, unit: 'miles', impact: 'neutral', confidence: 'high' },
      waterImpact: { value: 9, unit: 'gallons', impact: 'neutral', confidence: 'high' },
      nearestFuel: service('fuel', 9, 'high'),
      nearestWater: service('potable_water', 8, 'medium'),
      lateArrivalRisk: 'neutral',
      dataConfidence: 'medium',
      dataLimitations: ['Potable water source has medium confidence.'],
      sourceSignals: [
        {
          source: 'offline_dataset',
          confidence: 'medium',
          observedAtIso: '2026-04-25T00:00:00.000Z',
          isStale: false,
          freshnessStatus: 'fresh',
          fields: ['legalStatus', 'publicAccessStatus'],
          limitation: 'Fixture legal source is medium confidence.',
        },
      ],
    }),
    [backup.id]: enrichment(backup.id, '2026-05-01T01:00:00.000Z', {
      routeDistanceToCampMiles: 46,
      legalConfidence: 'medium',
      accessDifficulty: 'easy',
      trailerSuitability: 'fit',
      turnaroundSuitability: 'fit',
      fuelImpact: { value: 56, unit: 'miles', impact: 'neutral', confidence: 'medium' },
      waterImpact: { value: 8, unit: 'gallons', impact: 'neutral', confidence: 'medium' },
      nearestFuel: service('fuel', 13, 'medium'),
      nearestWater: service('potable_water', 11, 'medium'),
      privacyLikelihood: 'moderate',
      dataConfidence: 'medium',
    }),
    [emergency.id]: enrichment(emergency.id, '2026-04-30T23:30:00.000Z', {
      routeDistanceToCampMiles: 24,
      legalConfidence: 'high',
      accessDifficulty: 'easy',
      trailerSuitability: 'fit',
      turnaroundSuitability: 'fit',
      trailerTurnaroundConfidence: 'high',
      groupCapacityEstimate: 3,
      fuelImpact: { value: 75, unit: 'miles', impact: 'neutral', confidence: 'high' },
      waterImpact: { value: 7, unit: 'gallons', impact: 'neutral', confidence: 'medium' },
      nearestFuel: service('fuel', 5, 'high'),
      nearestWater: service('potable_water', 7, 'medium'),
      terrainSlopeEstimate: { value: 62, unit: 'score', confidence: 'medium', source: 'inferred' },
      privacyLikelihood: 'low',
      occupancyLikelihood: 'moderate',
      lateArrivalRisk: 'neutral',
      dataConfidence: 'high',
    }),
  },
  delayScenario: 'delay_2h',
};

const result = campops.findCampOpsSafeEndPoint(baseInput);
const set = result.recommendationSet;

assert.strictEqual(result.enabled, true);
assert.strictEqual(result.decisionSummary.delayEstimateMinutes, 120);
assert.strictEqual(set.recommendedCamp.id, recommended.id, 'The closer accessible endpoint should be primary.');
assert.ok(set.backupCamp, 'A backup endpoint should be present.');
assert.ok(set.emergencyCamp, 'An emergency fallback should be present.');
assert.notStrictEqual(set.recommendedCamp.id, planned.id, 'The delayed planned camp should not remain primary.');

const plannedRejection = set.rejectedCandidates.find((item) => item.candidate.id === planned.id);
assert.ok(plannedRejection, 'The planned scenic camp should be downgraded or rejected.');
assert.ok(
  plannedRejection.gates.some((gate) => gate.gateId === 'campops.time.late_arrival'),
  'The planned scenic camp should fail the late-arrival hard gate.',
);
assert.ok(
  set.warnings.some((warning) => /trailer|turnaround|dead-end/i.test(warning)),
  'Trailer/large vehicle context should remain visible as a CampOps warning.',
);

const downgradeReason = set.explanations.plannedCampDowngrade || '';
assertTextIncludes(downgradeReason, /Scenic Ridge Planned Camp/i, 'Downgrade reason');
assertTextIncludes(downgradeReason, /ETA|arrival|late/i, 'Downgrade reason');

const recommendedEnrichment = set.enrichmentsByCandidateId[recommended.id];
assert.strictEqual(recommendedEnrichment.legalConfidence, 'high');
assert.strictEqual(recommendedEnrichment.accessDifficulty, 'easy');
assert.ok(recommendedEnrichment.resourceDebt, 'Recommended endpoint should include resource debt.');
assert.ok(['safe', 'tight'].includes(recommendedEnrichment.resourceDebt.fuel.status), 'Fuel margin should remain acceptable.');
assert.ok(['safe', 'tight'].includes(recommendedEnrichment.resourceDebt.water.status), 'Water margin should remain acceptable.');
assert.ok(
  recommendedEnrichment.resourceDebt.margins.fuelAfterCamp &&
    recommendedEnrichment.resourceDebt.margins.waterAfterCamp,
  'Resource margin summary should include after-camp fuel and water margins.',
);

const warningText = set.warnings.join(' | ');
assertTextIncludes(warningText, /stale|medium confidence|offline|degraded/i, 'Recommendation warnings');
assert.ok(result.decisionSummary.decisionPoint, 'Route progress should produce a decision point.');
assert.ok(set.decisionPoint, 'Recommendation set should carry the decision point for UI/AI consumers.');
assert.ok(
  ['before_dark', 'trailer_turnaround'].includes(result.decisionSummary.decisionPoint.kind),
  'Decision point should be tied to darkness or trailer handling.',
);
assertTextIncludes(
  result.decisionSummary.decisionPoint.recommendedAction,
  /Diversion recommended|continue not recommended/i,
  'Decision point action',
);

const payload = campops.buildCampOpsAiAssistPayload({
  context: result.context,
  recommendationSet: set,
  mode: 'field',
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsAiAssistEnabled: true,
  },
});
assert.strictEqual(payload.recommendedCamp.id, recommended.id);
assert.ok(payload.resourceDebtSummary.length > 0, 'AI payload should include resource debt summary.');
assert.ok(payload.staleSourceSummaries.length > 0, 'AI payload should include stale source summaries.');
assert.ok(payload.decisionPointSummary, 'AI payload should include the decision point summary.');

const parsed = campops.parseCampOpsAiAssistOutput(
  {
    headline: 'Lower Valley Endpoint is recommended',
    primaryRecommendation: {
      campId: recommended.id,
      status: 'recommended',
      summary: 'Lower Valley Endpoint is recommended because it preserves arrival, access, fuel, and water margin.',
    },
    why: [
      'Planned scenic camp is downgraded because arrival moves after sunset and late-arrival risk is high.',
      'Lower Valley Endpoint has stronger legal/access confidence and acceptable fuel and water margin.',
    ],
    tradeoffs: ['Emergency stop has lower comfort but stronger access certainty.'],
    risks: ['Some source data is stale or medium confidence.'],
    requiredActions: ['Use the decision point before passing the lower valley turnoff.'],
    backupPlan: 'Use Forest Road Backup if the primary endpoint is occupied or conditions change.',
    emergencyPlan: 'Use Trailhead Emergency Stop as fallback only if continuing raises risk.',
    confidenceNote: 'Medium CampOps confidence because some source data is stale.',
    sourceConfidenceNote: 'Legal/access confidence is high for the primary endpoint; some service data is medium confidence.',
    staleDataWarnings: ['Weather source is stale for the scenic ridge approach.'],
    missingDataWarnings: [],
    conflictWarnings: [],
    decisionPointSummary: payload.decisionPointSummary,
    convoyMessage: 'Recommendation accounts for trailer and full-size vehicle handling.',
  },
  {
    context: result.context,
    recommendationSet: set,
    mode: 'field',
  },
);
assert.strictEqual(parsed.output.primaryRecommendation.status, 'recommended');
assert.strictEqual(parsed.output.primaryRecommendation.campId, recommended.id);
const aiText = JSON.stringify(parsed.output);
assert.ok(!/guaranteed|definitely legal|\bsafe\b/i.test(aiText), 'AI output should avoid overconfident wording.');
assert.ok(parsed.output.staleDataWarnings.length > 0, 'AI output should retain stale data warnings.');
assert.ok(parsed.output.decisionPointSummary, 'AI output should summarize the decision point.');

const panelSource = fs.readFileSync(panelPath, 'utf8');
for (const required of [
  'CampOpsRecommendationCards',
  'result.campOps?.enabled',
  'Recommended Camp',
  'Backup Camp',
  'Emergency Camp',
  'Resource debt',
  'Decision point',
  'Why this recommendation?',
]) {
  assert.ok(panelSource.includes(required), `UI card contract should include ${required}.`);
}

const uiResult = {
  campOps: {
    enabled: true,
    recommendationSet: set,
  },
  candidates: [],
  suggestedCampsites: [],
  candidateCount: 0,
};
assert.doesNotThrow(() => JSON.stringify(uiResult), 'CampOps UI payload should be serializable for card rendering.');

console.log('CampOps two-hour delay acceptance checks passed.');
