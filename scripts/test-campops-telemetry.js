const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campOpsPath = path.join(root, 'lib', 'campops', 'index.ts');

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

const campops = require(campOpsPath);

const FORBIDDEN_KEYS = [
  'campId',
  'campName',
  'candidateId',
  'coordinates',
  'currentLocation',
  'latitude',
  'location',
  'longitude',
  'name',
  'notes',
  'photo',
  'photoRefs',
  'photos',
  'prompt',
  'rawPrompt',
  'routeId',
  'tripId',
  'userId',
  'vehicleId',
  'vehicleProfileId',
];

function assertTelemetryIsPrivacySafe(event, secretValues = []) {
  const payloadText = JSON.stringify(event.payload);
  for (const key of FORBIDDEN_KEYS) {
    assert.ok(!payloadText.includes(`"${key}"`), `Telemetry payload must not include ${key}`);
  }
  for (const value of secretValues) {
    assert.ok(!payloadText.includes(value), `Telemetry payload leaked ${value}`);
  }
}

function context(overrides = {}) {
  return {
    id: 'ctx-telemetry',
    routeId: 'private-route-id',
    tripId: 'private-trip-id',
    plannedCampId: 'private-planned-camp',
    currentTimeIso: '2026-04-30T16:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-04-30T17:00:00.000Z',
      endIso: '2026-04-30T19:00:00.000Z',
      latestAcceptableIso: '2026-04-30T19:30:00.000Z',
    },
    riskTolerance: 'balanced',
    offlineMode: 'degraded',
    delayEstimateMinutes: 120,
    currentLocation: { value: { latitude: 39.1234, longitude: -119.9876 } },
    ...overrides,
  };
}

function candidate(id, name, overrides = {}) {
  return {
    id,
    name,
    location: { latitude: 39.1234, longitude: -119.9876 },
    source: 'manual',
    sourceConfidence: 'high',
    lastVerifiedDate: '2026-04-01T00:00:00.000Z',
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
    groupCapacityEstimate: 4,
    etaIso: '2026-04-30T18:00:00.000Z',
    sunsetMarginMinutes: 80,
    fuelImpact: { value: 80, unit: 'miles', impact: 'neutral', confidence: 'high' },
    waterImpact: { value: 8, unit: 'gallons', impact: 'neutral', confidence: 'high' },
    reliableWaterRefillAvailable: false,
    terrainSlopeEstimate: { value: 2, unit: 'degrees', confidence: 'high', source: 'inferred' },
    weatherExposure: 'neutral',
    fireRestrictionStatus: 'none_known',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'low',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'high',
    resourceDebt: {
      fuel: { category: 'fuel', status: 'safe', value: 80, unit: 'miles', reason: 'Fuel margin available.', missingDataFields: [], confidence: 'high' },
      water: { category: 'water', status: 'tight', value: 3, unit: 'gallons', reason: 'Water margin is tight.', missingDataFields: [], confidence: 'medium' },
      daylight: { category: 'daylight', status: 'after_dark', value: -20, unit: 'minutes', reason: 'Arrival is after dark.', missingDataFields: [], confidence: 'medium' },
      campUncertainty: { category: 'campUncertainty', status: 'unknown', value: null, unit: 'unknown', reason: 'Some source data is missing.', missingDataFields: ['closure'], confidence: 'low' },
    },
    ...overrides,
  };
}

function buildSet() {
  const ctx = context();
  const planned = candidate('private-planned-camp', 'Secret Planned Camp');
  const better = candidate('private-backup-camp', 'Secret Better Camp');
  const candidates = [planned, better];
  const enrichmentsByCandidateId = {
    'private-planned-camp': enrichment('private-planned-camp', {
      etaIso: '2026-04-30T20:30:00.000Z',
      sunsetMarginMinutes: -40,
      lateArrivalRisk: 'critical',
      privacyLikelihood: 'high',
      sourceSignals: [
        {
          source: 'manual',
          confidence: 'low',
          observedAtIso: '2026-03-01T00:00:00.000Z',
          isStale: true,
          freshnessStatus: 'stale',
          fields: ['legalStatus', 'closureStatus'],
          limitation: 'Fixture source is stale.',
        },
      ],
      sourceResolutions: [
        {
          field: 'legalStatus',
          resolvedValue: 'unknown',
          resolvedConfidence: 'low',
          conflictDetected: true,
          conflictSummary: 'Fixture providers conflict.',
          sourceSummaries: ['official source unavailable', 'user source stale'],
          staleSources: ['stale-user-source'],
          missingSources: ['official-closure-source'],
        },
      ],
    }),
    'private-backup-camp': enrichment('private-backup-camp', {
      etaIso: '2026-04-30T18:10:00.000Z',
      sunsetMarginMinutes: 90,
      lateArrivalRisk: 'neutral',
    }),
  };
  const hardGateEvaluationsByCandidateId = {};
  const suitabilityScoresByCandidateId = {};
  for (const camp of candidates) {
    hardGateEvaluationsByCandidateId[camp.id] = campops.evaluateCampCandidateHardGates({
      context: ctx,
      candidate: camp,
      enrichment: enrichmentsByCandidateId[camp.id],
    });
    suitabilityScoresByCandidateId[camp.id] = campops.scoreCampSuitability({
      context: ctx,
      candidate: camp,
      enrichment: enrichmentsByCandidateId[camp.id],
      hardGateEvaluation: hardGateEvaluationsByCandidateId[camp.id],
    });
  }
  const recommendationSet = campops.generateCampRecommendationSet({
    context: ctx,
    candidates,
    enrichmentsByCandidateId,
    hardGateEvaluationsByCandidateId,
    suitabilityScoresByCandidateId,
  });
  return { ctx, recommendationSet };
}

async function main() {
  campops.resetCampOpsTelemetryForTest();
  campops.emitCampOpsTelemetryEvent('campops_recommendation_accepted', {
    acceptedRole: 'primary',
  });
  assert.strictEqual(campops.getCampOpsTelemetryEventsForTest().length, 0, 'Telemetry must be disabled by default.');

  campops.configureCampOpsTelemetry({
    campopsTelemetryEnabled: true,
    consoleDebug: false,
    sink: null,
    campopsTelemetrySinkApproved: true,
  });
  campops.emitCampOpsTelemetryEvent('campops_recommendation_accepted', {
    acceptedRole: 'primary',
  });
  assert.strictEqual(campops.getCampOpsTelemetryEventsForTest().length, 0, 'Missing sink must prevent telemetry emit.');

  const unapprovedSinkEvents = [];
  campops.configureCampOpsTelemetry({
    campopsTelemetryEnabled: true,
    sink: (event) => unapprovedSinkEvents.push(event),
    campopsTelemetrySinkApproved: false,
  });
  campops.emitCampOpsTelemetryEvent('campops_recommendation_accepted', {
    acceptedRole: 'primary',
  });
  assert.strictEqual(campops.getCampOpsTelemetryEventsForTest().length, 0, 'Missing sink approval must prevent telemetry emit.');
  assert.strictEqual(unapprovedSinkEvents.length, 0, 'Unapproved sink should not receive events.');

  const sinkEvents = [];
  campops.configureCampOpsTelemetry({
    campopsTelemetryEnabled: true,
    campopsTelemetrySinkApproved: true,
    consoleDebug: false,
    sink: (event) => sinkEvents.push(event),
  });
  const { ctx, recommendationSet } = buildSet();
  const events = campops.getCampOpsTelemetryEventsForTest();
  assert.ok(events.some((event) => event.name === 'campops_recommendation_generated'));
  assert.ok(events.some((event) => event.name === 'campops_planned_camp_downgraded'));
  assert.ok(events.some((event) => event.name === 'campops_provider_stale_data_detected'));
  assert.ok(events.some((event) => event.name === 'campops_source_conflict_detected'));
  assert.strictEqual(sinkEvents.length, events.length);

  const generated = events.find((event) => event.name === 'campops_recommendation_generated');
  assert.strictEqual(generated.payload.featureEnabled, true);
  assert.strictEqual(generated.payload.offlineMode, 'degraded');
  assert.strictEqual(generated.payload.delayBand, 'long');
  assert.strictEqual(generated.payload.plannedCampDowngraded, true);
  assert.ok(generated.payload.roleCounts.primary >= 1);
  assert.ok(generated.payload.sourceConflictCount >= 1);
  assert.ok(generated.payload.staleSourceCount >= 1);
  assertTelemetryIsPrivacySafe(generated, [
    'Secret Planned Camp',
    'Secret Better Camp',
    'private-planned-camp',
    'private-backup-camp',
    'private-route-id',
    'private-trip-id',
    '39.1234',
    '-119.9876',
  ]);

  campops.buildCampOpsAiAssistPayload({
    context: ctx,
    recommendationSet,
    mode: 'field',
  });
  assert.ok(
    !campops.getCampOpsTelemetryEventsForTest().some((event) => event.name === 'campops_ai_summary_generated'),
    'AI summary telemetry should not emit without the explicit AI assist rollout flag.',
  );

  campops.buildCampOpsAiAssistPayload({
    context: ctx,
    recommendationSet,
    mode: 'field',
    rolloutConfig: {
      campopsRecommendationsEnabled: true,
      campopsAiAssistEnabled: true,
    },
  });
  const aiEvent = campops.getCampOpsTelemetryEventsForTest().find((event) => event.name === 'campops_ai_summary_generated');
  assert.ok(aiEvent);
  assert.strictEqual(aiEvent.payload.aiMode, 'field');
  assertTelemetryIsPrivacySafe(aiEvent, ['Secret Planned Camp', 'private-planned-camp']);

  const beforeInvalidRawPayloadCount = campops.getCampOpsTelemetryEventsForTest().length;
  const invalidRawEvent = campops.emitCampOpsTelemetryEvent('campops_recommendation_accepted', {
    acceptedRole: 'primary',
    latitude: 39.1234,
    longitude: -119.9876,
    campName: 'Do Not Log This',
    userId: 'private-user',
    rawPrompt: 'do not log prompt',
  });
  assert.strictEqual(invalidRawEvent, null, 'Raw payloads with sensitive keys should be rejected before sanitization.');
  assert.strictEqual(
    campops.getCampOpsTelemetryEventsForTest().length,
    beforeInvalidRawPayloadCount,
    'Rejected raw payloads should not be stored or sent to the sink.',
  );

  const beforeCachedSourcePayloadCount = campops.getCampOpsTelemetryEventsForTest().length;
  const cachedSourceEvent = campops.emitCampOpsTelemetryEvent('campops_provider_stale_data_detected', {
    sourceFreshnessBands: { stale: 1 },
    cachedSourceData: {
      sourceSummary: 'Cached provider note from user:abc123 near 39.1234,-119.9876.',
      sourceSignals: [
        {
          location: { latitude: 39.1234, longitude: -119.9876 },
          rawProviderStatus: { userId: 'private-user', vehicleId: 'private-vehicle' },
        },
      ],
    },
  });
  assert.strictEqual(
    cachedSourceEvent,
    null,
    'Telemetry must reject raw cached source/provider data before sanitization.',
  );
  assert.strictEqual(
    campops.getCampOpsTelemetryEventsForTest().length,
    beforeCachedSourcePayloadCount,
    'Rejected cached source telemetry should not be stored or sent to the sink.',
  );

  campops.emitCampOpsTelemetryEvent('campops_recommendation_accepted', {
    acceptedRole: 'primary',
    confidenceBand: 'medium',
    sourceConflictCount: 1,
  });
  const acceptedEvent = campops.getCampOpsTelemetryEventsForTest().find((event) => event.name === 'campops_recommendation_accepted');
  assert.ok(acceptedEvent, 'Privacy-safe payload should be allowed when telemetry and sink approval are enabled.');
  assert.strictEqual(acceptedEvent.payload.acceptedRole, 'primary');
  assert.strictEqual(acceptedEvent.payload.confidenceBand, 'medium');
  assertTelemetryIsPrivacySafe(acceptedEvent, ['Do Not Log This', 'private-user', 'do not log prompt']);

  const service = new campops.CampOpsDebriefService(new campops.MemoryCampOpsDebriefBackend());
  const debriefResult = await service.captureDebrief(campops.createDefaultCampOpsDebriefInput({
    campId: 'private-camp-id',
    campName: 'Private Debrief Camp',
    userId: 'private-user',
    vehicleProfileId: 'private-vehicle',
    location: { latitude: 39.1234, longitude: -119.9876 },
    visitedAtIso: '2026-04-30T18:00:00.000Z',
    source: 'manual',
    notes: 'Private note should not be logged.',
    structured: {
      ...campops.DEFAULT_CAMP_OPS_DEBRIEF_STRUCTURED_FIELDS,
      hazards: ['low branches', 'soft shoulder'],
    },
  }));
  assert.strictEqual(debriefResult.ok, true);
  const debriefEvent = campops.getCampOpsTelemetryEventsForTest().find((event) => event.name === 'campops_debrief_created');
  assert.ok(debriefEvent);
  assert.strictEqual(debriefEvent.payload.debriefVisibility, 'private');
  assert.strictEqual(debriefEvent.payload.debriefHazardCount, 2);
  assertTelemetryIsPrivacySafe(debriefEvent, [
    'private-camp-id',
    'Private Debrief Camp',
    'private-user',
    'private-vehicle',
    'Private note',
  ]);

  console.log('CampOps telemetry privacy tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
