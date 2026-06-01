const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campopsPath = path.join(root, 'lib', 'campops', 'index.ts');

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

const campops = require(campopsPath);

function makeEngineCandidate(index, overrides = {}) {
  return {
    segmentIndex: index,
    coordinates: [39 + index * 0.01, -121 - index * 0.01],
    distanceMiles: 30 + index * 10,
    avgElevation: 5200,
    elevationGain: 20,
    candidateReason: ['Flat terrain'],
    segmentRange: `${30 + index * 10}-${40 + index * 10} mi`,
    difficulty: 'easy',
    qualityScore: 88 - index,
    suitabilityScore: 10 - index * 0.5,
    rating: 'A',
    score: 88 - index,
    remotenessScore: 80,
    campingSuitabilityScore: 86,
    legalAccessScore: 82,
    terrainScore: 88,
    routeProximityScore: 90,
    ratingFactors: [],
    suitabilityLevel: 'HIGH',
    estimatedArrivalHour: 5 + index,
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

function makeCandidateResult(candidates) {
  return {
    id: 'campops-rollout-result',
    routeIntelligenceId: 'route-rollout',
    routeName: 'CampOps Rollout Route',
    totalDistanceMiles: 120,
    estimatedDriveTimeHours: 8,
    candidates,
    suggestedCampsites: candidates,
    candidateCount: candidates.length,
    totalSegments: 8,
    excludedSegments: 0,
    analyzedAt: '2026-04-30T15:00:00.000Z',
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
    polygonId: null,
  };
}

function integrationContext(overrides = {}) {
  return {
    currentTimeIso: '2026-04-30T15:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-04-30T18:00:00.000Z',
      endIso: '2026-04-30T21:00:00.000Z',
      latestAcceptableIso: '2026-04-30T22:00:00.000Z',
    },
    daylightInfo: {
      sunsetIso: '2026-05-01T02:00:00.000Z',
      source: 'manual',
      confidence: 'medium',
    },
    resourceState: {
      fuelReserveMiles: 90,
      waterGallons: 8,
      source: 'manual',
      confidence: 'medium',
    },
    riskTolerance: 'balanced',
    offlineMode: 'online',
    ...overrides,
  };
}

function endpointCandidate(id, name, latitude, longitude) {
  return {
    id,
    name,
    location: { latitude, longitude },
    source: 'route_candidate',
    sourceConfidence: 'high',
  };
}

function endpointEnrichment(candidateId, etaIso, overrides = {}) {
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

const defaults = campops.resolveCampOpsRecommendationRolloutConfig();
[
  'campopsRecommendationsEnabled',
  'campOpsRecommendationSetEnabled',
  'campopsProviderAdaptersEnabled',
  'campopsAiAssistEnabled',
  'campopsEndpointRecommendationEnabled',
  'campopsDecisionPointsEnabled',
  'campopsDebriefCommunityPublishingEnabled',
  'campopsSourceTransparencyEnabled',
  'campopsProviderValidationShadowModeEnabled',
  'campopsTelemetryEnabled',
].forEach((flag) => {
  assert.strictEqual(defaults[flag], false, `${flag} should default off.`);
});

const nonTesterActivation = campops.resolveCampOpsInternalBetaActivation({
  tester: {
    testerId: 'general-user',
    email: 'general@example.com',
    cohorts: ['public'],
  },
  allowlistedTesterIds: ['internal-tester-1'],
  allowedCohorts: ['campops-internal-beta'],
  requestedFlags: {
    campopsRecommendationsEnabled: true,
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: true,
    campopsSourceTransparencyEnabled: true,
    campopsProviderAdaptersEnabled: true,
    campopsAiAssistEnabled: true,
    campopsDebriefCommunityPublishingEnabled: true,
    campopsTelemetryEnabled: true,
  },
});
assert.strictEqual(nonTesterActivation.enabled, false, 'Non-testers must not enable CampOps internal beta.');
assert.strictEqual(nonTesterActivation.rolloutConfig.campopsRecommendationsEnabled, false);
assert.strictEqual(nonTesterActivation.rolloutConfig.campopsEndpointRecommendationEnabled, false);
assert.strictEqual(nonTesterActivation.rolloutConfig.campopsDecisionPointsEnabled, false);
assert.strictEqual(nonTesterActivation.rolloutConfig.campopsSourceTransparencyEnabled, false);
assert.strictEqual(nonTesterActivation.rolloutConfig.campopsDebriefCommunityPublishingEnabled, false);
assert.strictEqual(nonTesterActivation.rolloutConfig.campopsTelemetryEnabled, false);

const approvedTesterActivation = campops.resolveCampOpsInternalBetaActivation({
  tester: {
    testerId: 'internal-tester-1',
    cohorts: ['campops-internal-beta'],
  },
  allowlistedTesterIds: ['internal-tester-1'],
  requestedFlags: {
    campopsRecommendationsEnabled: true,
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: true,
    campopsSourceTransparencyEnabled: true,
    campopsProviderValidationShadowModeEnabled: true,
    campopsProviderAdaptersEnabled: true,
    campopsAiAssistEnabled: true,
    campopsDebriefCommunityPublishingEnabled: true,
    campopsTelemetryEnabled: true,
  },
});
assert.strictEqual(approvedTesterActivation.enabled, true, 'Approved testers should enable allowed internal beta flags.');
assert.strictEqual(approvedTesterActivation.rolloutConfig.campopsRecommendationsEnabled, true);
assert.strictEqual(approvedTesterActivation.rolloutConfig.campopsEndpointRecommendationEnabled, true);
assert.strictEqual(approvedTesterActivation.rolloutConfig.campopsDecisionPointsEnabled, true);
assert.strictEqual(approvedTesterActivation.rolloutConfig.campopsSourceTransparencyEnabled, true);
assert.strictEqual(approvedTesterActivation.rolloutConfig.campopsProviderValidationShadowModeEnabled, true);
assert.strictEqual(
  approvedTesterActivation.rolloutConfig.campopsProviderAdaptersEnabled,
  false,
  'Provider influence should remain off without explicit provider readiness approval.',
);
assert.strictEqual(
  approvedTesterActivation.rolloutConfig.campopsAiAssistEnabled,
  false,
  'Broad AI assist should remain off without approved real-output review.',
);
assert.strictEqual(approvedTesterActivation.rolloutConfig.campopsDebriefCommunityPublishingEnabled, false);
assert.strictEqual(approvedTesterActivation.rolloutConfig.campopsTelemetryEnabled, false);

const approvedTesterWithNarrowApprovals = campops.resolveCampOpsInternalBetaActivation({
  tester: {
    email: 'tester@example.com',
  },
  allowlistedEmails: ['tester@example.com'],
  providerInfluenceApproved: true,
  aiAssistRealOutputReviewApproved: true,
  requestedFlags: {
    campopsRecommendationsEnabled: true,
    campopsProviderAdaptersEnabled: true,
    campopsAiAssistEnabled: true,
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: true,
    campopsSourceTransparencyEnabled: true,
    campopsDebriefCommunityPublishingEnabled: true,
    campopsTelemetryEnabled: true,
  },
});
assert.strictEqual(approvedTesterWithNarrowApprovals.rolloutConfig.campopsProviderAdaptersEnabled, true);
assert.strictEqual(approvedTesterWithNarrowApprovals.rolloutConfig.campopsAiAssistEnabled, true);
assert.strictEqual(
  approvedTesterWithNarrowApprovals.rolloutConfig.campopsDebriefCommunityPublishingEnabled,
  false,
  'Community publishing remains off even for approved internal beta testers.',
);
assert.strictEqual(
  approvedTesterWithNarrowApprovals.rolloutConfig.campopsTelemetryEnabled,
  false,
  'Telemetry remains off even for approved internal beta testers.',
);

const cohortActivation = campops.resolveCampOpsInternalBetaActivation({
  tester: {
    cohorts: ['CampOps-Internal-Beta'],
  },
  allowedCohorts: ['campops-internal-beta'],
  requestedFlags: {
    campopsRecommendationsEnabled: true,
  },
});
assert.strictEqual(cohortActivation.enabled, true, 'Cohort allowlist should approve matching testers.');

const rollbackActivation = campops.rollbackCampOpsInternalBetaActivation();
assert.strictEqual(rollbackActivation.enabled, false, 'Rollback should disable CampOps internal beta.');
Object.entries(rollbackActivation.rolloutConfig).forEach(([flag, value]) => {
  assert.strictEqual(value, false, `Rollback should disable ${flag}.`);
});

const restrictedRiskOff = campops.resolveCampOpsRiskAcceptedRestrictedFieldTestActivation({
  riskAcceptanceAccepted: false,
  tester: { cohorts: ['campops-restricted-field-test'] },
  approvedCohorts: ['campops-restricted-field-test'],
  buildIdentifier: 'fieldtest-build-001',
  approvedBuildIdentifiers: ['fieldtest-build-001'],
  regionLabel: 'Region 001',
  routeLabel: 'Route Alpha',
  scenarioLabel: 'Two-hour delay',
  approvedRegionLabels: ['Region 001'],
  approvedRouteLabels: ['Route Alpha'],
  approvedScenarioLabels: ['Two-hour delay'],
  requestedFlags: {
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: true,
    campopsProviderAdaptersEnabled: true,
    campopsAiAssistEnabled: true,
    campopsDebriefCommunityPublishingEnabled: true,
    campopsTelemetryEnabled: true,
  },
});
assert.strictEqual(restrictedRiskOff.enabled, false, 'Risk acceptance off should disable restricted field-test activation.');
Object.entries(restrictedRiskOff.rolloutConfig).forEach(([flag, value]) => {
  assert.strictEqual(value, false, `Risk acceptance off should disable ${flag}.`);
});

const restrictedWrongCohort = campops.resolveCampOpsRiskAcceptedRestrictedFieldTestActivation({
  riskAcceptanceAccepted: true,
  tester: { cohorts: ['public'] },
  approvedCohorts: ['campops-restricted-field-test'],
  buildIdentifier: 'fieldtest-build-001',
  approvedBuildIdentifiers: ['fieldtest-build-001'],
  regionLabel: 'Region 001',
  routeLabel: 'Route Alpha',
  scenarioLabel: 'Two-hour delay',
  approvedRegionLabels: ['Region 001'],
  approvedRouteLabels: ['Route Alpha'],
  approvedScenarioLabels: ['Two-hour delay'],
  requestedFlags: {
    campopsEndpointRecommendationEnabled: true,
  },
});
assert.strictEqual(restrictedWrongCohort.enabled, false, 'Wrong cohort should block restricted field-test activation.');
Object.entries(restrictedWrongCohort.rolloutConfig).forEach(([flag, value]) => {
  assert.strictEqual(value, false, `Wrong cohort should disable ${flag}.`);
});

const restrictedWrongBuild = campops.resolveCampOpsRiskAcceptedRestrictedFieldTestActivation({
  riskAcceptanceAccepted: true,
  tester: { cohorts: ['campops-restricted-field-test'] },
  approvedCohorts: ['campops-restricted-field-test'],
  buildIdentifier: 'unapproved-build',
  approvedBuildIdentifiers: ['fieldtest-build-001'],
  regionLabel: 'Region 001',
  routeLabel: 'Route Alpha',
  scenarioLabel: 'Two-hour delay',
  approvedRegionLabels: ['Region 001'],
  approvedRouteLabels: ['Route Alpha'],
  approvedScenarioLabels: ['Two-hour delay'],
  requestedFlags: {
    campopsEndpointRecommendationEnabled: true,
  },
});
assert.strictEqual(restrictedWrongBuild.enabled, false, 'Wrong build should block restricted field-test activation.');
Object.entries(restrictedWrongBuild.rolloutConfig).forEach(([flag, value]) => {
  assert.strictEqual(value, false, `Wrong build should disable ${flag}.`);
});

const restrictedFieldTest = campops.resolveCampOpsRiskAcceptedRestrictedFieldTestActivation({
  riskAcceptanceAccepted: true,
  tester: { cohorts: ['campops-restricted-field-test'] },
  approvedCohorts: ['campops-restricted-field-test'],
  buildIdentifier: 'fieldtest-build-001',
  approvedBuildIdentifiers: ['fieldtest-build-001'],
  regionLabel: 'Region 001',
  routeLabel: 'Route Alpha',
  scenarioLabel: 'Two-hour delay',
  approvedRegionLabels: ['Region 001'],
  approvedRouteLabels: ['Route Alpha'],
  approvedScenarioLabels: ['Two-hour delay'],
  approvedDelayedDayScenarioLabels: ['Two-hour delay'],
  routeProgressSupportsDecisionPointReview: true,
  requestedFlags: {
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: true,
    campopsProviderAdaptersEnabled: true,
    campopsAiAssistEnabled: true,
    campopsDebriefCommunityPublishingEnabled: true,
    campopsTelemetryEnabled: true,
  },
});
assert.strictEqual(restrictedFieldTest.enabled, true, 'Accepted risk posture should enable deterministic field-test surfaces.');
assert.strictEqual(restrictedFieldTest.rolloutConfig.campopsRecommendationsEnabled, true);
assert.strictEqual(restrictedFieldTest.rolloutConfig.campOpsRecommendationSetEnabled, true);
assert.strictEqual(restrictedFieldTest.rolloutConfig.campopsEndpointRecommendationEnabled, true);
assert.strictEqual(restrictedFieldTest.rolloutConfig.campopsDecisionPointsEnabled, true);
assert.strictEqual(restrictedFieldTest.rolloutConfig.campopsSourceTransparencyEnabled, true);
assert.strictEqual(restrictedFieldTest.rolloutConfig.campopsProviderValidationShadowModeEnabled, true);
assert.strictEqual(
  restrictedFieldTest.rolloutConfig.campopsProviderAdaptersEnabled,
  false,
  'Restricted field test must keep provider influence off without exact category/region approval.',
);
assert.strictEqual(
  restrictedFieldTest.rolloutConfig.campopsAiAssistEnabled,
  false,
  'Restricted field test must keep AI assist off without exact model/config approval.',
);
assert.strictEqual(
  restrictedFieldTest.rolloutConfig.campopsTelemetryEnabled,
  false,
  'Restricted field test must keep telemetry off without sink/privacy approval.',
);
assert.strictEqual(
  restrictedFieldTest.rolloutConfig.campopsDebriefCommunityPublishingEnabled,
  false,
  'Restricted field test must keep community publishing off.',
);

const restrictedUnapprovedLabels = campops.resolveCampOpsRiskAcceptedRestrictedFieldTestActivation({
  riskAcceptanceAccepted: true,
  tester: { cohorts: ['campops-restricted-field-test'] },
  approvedCohorts: ['campops-restricted-field-test'],
  buildIdentifier: 'fieldtest-build-001',
  approvedBuildIdentifiers: ['fieldtest-build-001'],
  regionLabel: 'Unapproved Region',
  routeLabel: 'Route Alpha',
  scenarioLabel: 'Two-hour delay',
  approvedRegionLabels: ['Region 001'],
  approvedRouteLabels: ['Route Alpha'],
  approvedScenarioLabels: ['Two-hour delay'],
  requestedFlags: {
    campopsEndpointRecommendationEnabled: true,
  },
});
assert.strictEqual(restrictedUnapprovedLabels.enabled, false, 'Unapproved labels should block restricted field-test activation.');
Object.entries(restrictedUnapprovedLabels.rolloutConfig).forEach(([flag, value]) => {
  assert.strictEqual(value, false, `Unapproved labels should disable ${flag}.`);
});

const restrictedNonDelayedScenario = campops.resolveCampOpsRiskAcceptedRestrictedFieldTestActivation({
  riskAcceptanceAccepted: true,
  tester: { approved: true },
  approvedCohorts: ['campops-restricted-field-test'],
  buildIdentifier: 'fieldtest-build-001',
  approvedBuildIdentifiers: ['fieldtest-build-001'],
  regionLabel: 'Region 001',
  routeLabel: 'Route Alpha',
  scenarioLabel: 'On-time normal route',
  approvedRegionLabels: ['Region 001'],
  approvedRouteLabels: ['Route Alpha'],
  approvedScenarioLabels: ['On-time normal route'],
  approvedDelayedDayScenarioLabels: ['Two-hour delay'],
  routeProgressSupportsDecisionPointReview: true,
  requestedFlags: {
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: true,
  },
});
assert.strictEqual(restrictedNonDelayedScenario.enabled, true);
assert.strictEqual(
  restrictedNonDelayedScenario.rolloutConfig.campopsEndpointRecommendationEnabled,
  false,
  'Endpoint recommendations should stay off for scenarios that are not approved delayed-day scenarios.',
);
assert.strictEqual(
  restrictedNonDelayedScenario.rolloutConfig.campopsDecisionPointsEnabled,
  false,
  'Decision points require an approved delayed-day scenario.',
);

const allEnabled = campops.resolveCampOpsRecommendationRolloutConfig({
  campopsRecommendationsEnabled: true,
  campopsProviderAdaptersEnabled: true,
  campopsAiAssistEnabled: true,
  campopsEndpointRecommendationEnabled: true,
  campopsDecisionPointsEnabled: true,
  campopsDebriefCommunityPublishingEnabled: true,
  campopsSourceTransparencyEnabled: true,
  campopsProviderValidationShadowModeEnabled: true,
  campopsTelemetryEnabled: true,
});
assert.strictEqual(allEnabled.campopsProviderAdaptersEnabled, true);
assert.strictEqual(allEnabled.campopsAiAssistEnabled, true);
assert.strictEqual(allEnabled.campopsEndpointRecommendationEnabled, true);
assert.strictEqual(allEnabled.campopsDecisionPointsEnabled, true);
assert.strictEqual(allEnabled.campopsDebriefCommunityPublishingEnabled, true);
assert.strictEqual(allEnabled.campopsSourceTransparencyEnabled, true);
assert.strictEqual(allEnabled.campopsProviderValidationShadowModeEnabled, true);
assert.strictEqual(allEnabled.campopsTelemetryEnabled, true);

const featureState = campops.getCampOpsFeatureState({
  campopsRecommendationsEnabled: true,
  campopsProviderAdaptersEnabled: true,
  campopsAiAssistEnabled: true,
  campopsEndpointRecommendationEnabled: true,
  campopsDecisionPointsEnabled: true,
  campopsSourceTransparencyEnabled: true,
  campopsTelemetryEnabled: true,
});
assert.strictEqual(featureState.recommendationsEnabled, true);
assert.strictEqual(featureState.providerAdaptersEnabled, true);
assert.strictEqual(featureState.aiAssistEnabled, true);
assert.strictEqual(featureState.endpointRecommendationEnabled, true);
assert.strictEqual(featureState.decisionPointsEnabled, true);
assert.strictEqual(featureState.sourceTransparencyEnabled, true);
assert.strictEqual(featureState.telemetryEnabled, true);
assert.strictEqual(
  campops.assertCampOpsFeatureEnabled(
    { campopsRecommendationsEnabled: true },
    'campopsRecommendationsEnabled',
  ).recommendationsEnabled,
  true,
);
assert.throws(
  () => campops.assertCampOpsFeatureEnabled({}, 'campopsRecommendationsEnabled'),
  /disabled/,
  'Central flag assertion should reject disabled features.',
);

const blockedDependencies = campops.resolveCampOpsRecommendationRolloutConfig({
  campopsProviderAdaptersEnabled: true,
  campopsAiAssistEnabled: true,
  campopsEndpointRecommendationEnabled: true,
  campopsDecisionPointsEnabled: true,
  campopsSourceTransparencyEnabled: true,
});
assert.strictEqual(blockedDependencies.campopsProviderAdaptersEnabled, false, 'Provider adapters require recommendations.');
assert.strictEqual(blockedDependencies.campopsAiAssistEnabled, false, 'AI assist requires recommendations.');
assert.strictEqual(blockedDependencies.campopsEndpointRecommendationEnabled, false, 'Endpoint recommendations require recommendations.');
assert.strictEqual(blockedDependencies.campopsDecisionPointsEnabled, false, 'Decision points require endpoint recommendations.');
assert.strictEqual(blockedDependencies.campopsSourceTransparencyEnabled, false, 'Source transparency requires recommendations.');

const baseResult = makeCandidateResult([
  makeEngineCandidate(0),
  makeEngineCandidate(1, { estimatedArrivalHour: 6, score: 84 }),
]);
const sourceSignalCandidateId = 'generated:route_candidate:0:39.00000,-121.00000';
const sourceSignalsByCandidateId = {
  [sourceSignalCandidateId]: [
    {
      source: 'offline_dataset',
      confidence: 'high',
      observedAtIso: '2026-04-30T14:30:00.000Z',
      staleAfterMinutes: 240,
      closureStatus: 'closed',
      legalStatus: 'prohibited',
      legalConfidence: 'high',
    },
  ],
};

const recommendationsOff = campops.withCampOpsSearchPayload(baseResult, {
  source: 'route',
  rolloutConfig: {
    campopsRecommendationsEnabled: false,
  },
  context: integrationContext(),
});
assert.strictEqual(recommendationsOff, baseResult, 'Recommendations off should preserve the existing result object.');

const legacyShortcutOff = campops.withCampOpsSearchPayload(baseResult, {
  source: 'route',
  enabled: true,
  context: integrationContext(),
});
assert.strictEqual(
  legacyShortcutOff,
  baseResult,
  'Legacy search enabled shortcut should not bypass explicit CampOps rollout flags.',
);

const providersOnRecommendationsOff = campops.withCampOpsSearchPayload(baseResult, {
  source: 'route',
  rolloutConfig: {
    campopsRecommendationsEnabled: false,
    campopsProviderAdaptersEnabled: true,
  },
  context: integrationContext(),
  sourceSignalsByCandidateId,
});
assert.strictEqual(
  providersOnRecommendationsOff,
  baseResult,
  'Provider adapters on must not run or attach payloads when recommendations are off.',
);

const providerAdaptersOff = campops.withCampOpsSearchPayload(baseResult, {
  source: 'route',
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsProviderAdaptersEnabled: false,
  },
  context: integrationContext(),
  sourceSignalsByCandidateId,
});
assert.ok(providerAdaptersOff.campOps, 'Recommendations can still run while provider adapters are off.');
assert.ok(
  !providerAdaptersOff.campOps.recommendationSet.rejectedCandidates.some((item) => item.candidate.id === sourceSignalCandidateId),
  'Provider signals should not affect gates when provider adapters are off.',
);
assert.strictEqual(
  providerAdaptersOff.campOps.recommendationSet.enrichmentsByCandidateId[sourceSignalCandidateId].sourceSignals,
  undefined,
  'Provider source details should not be exposed while provider adapters/source transparency are off.',
);

const sourceTransparencyOff = campops.withCampOpsSearchPayload(baseResult, {
  source: 'route',
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsProviderAdaptersEnabled: true,
    campopsSourceTransparencyEnabled: false,
  },
  context: integrationContext(),
  sourceSignalsByCandidateId,
});
assert.ok(
  sourceTransparencyOff.campOps.recommendationSet.rejectedCandidates.some((item) => item.candidate.id === sourceSignalCandidateId),
  'Provider adapters on should let source signals affect deterministic gates.',
);
assert.strictEqual(
  sourceTransparencyOff.campOps.recommendationSet.enrichmentsByCandidateId[sourceSignalCandidateId].sourceSignals,
  undefined,
  'Source transparency off should strip detailed source signal summaries from the exposed payload.',
);

const sourceTransparencyOn = campops.withCampOpsSearchPayload(baseResult, {
  source: 'route',
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsProviderAdaptersEnabled: true,
    campopsSourceTransparencyEnabled: true,
  },
  context: integrationContext(),
  sourceSignalsByCandidateId,
});
assert.ok(
  sourceTransparencyOn.campOps.recommendationSet.enrichmentsByCandidateId[sourceSignalCandidateId].sourceSignals.length > 0,
  'Source transparency on should expose normalized source signal summaries.',
);

const planned = endpointCandidate('camp-planned', 'Planned Camp', 39.2, -119.8);
const backup = endpointCandidate('camp-backup', 'Backup Camp', 39.1, -119.75);
const endpointInput = {
  context: {
    id: 'rollout-endpoint',
    plannedCampId: planned.id,
    currentTimeIso: '2026-04-30T16:00:00.000Z',
    desiredArrivalWindow: {
      latestAcceptableIso: '2026-05-01T03:30:00.000Z',
    },
    daylightInfo: {
      sunsetIso: '2026-05-01T03:30:00.000Z',
      source: 'manual',
      confidence: 'high',
    },
    riskTolerance: 'balanced',
    offlineMode: 'online',
    routeProgress: {
      routeMileMarker: 42,
      distanceRemainingMiles: 80,
      driveTimeRemainingMinutes: 240,
      currentSegmentLabel: 'Approach',
      latestTurnoffLabel: 'Backup turnoff',
      latestTurnoffMileMarker: 48,
      latestTurnoffDistanceMiles: 12,
      latestTurnoffLocation: { latitude: 39.11, longitude: -119.76 },
      source: 'manual',
      confidence: 'high',
    },
  },
  candidates: [planned, backup],
  enrichmentsByCandidateId: {
    [planned.id]: endpointEnrichment(planned.id, '2026-05-01T02:30:00.000Z', { privacyLikelihood: 'high' }),
    [backup.id]: endpointEnrichment(backup.id, '2026-04-30T23:15:00.000Z'),
  },
  delayScenario: 'delay_2h',
};

const endpointOff = campops.findCampOpsSafeEndPoint({
  ...endpointInput,
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsEndpointRecommendationEnabled: false,
  },
});
assert.strictEqual(endpointOff.enabled, false, 'Endpoint recommendations off should disable the endpoint flow.');
assert.strictEqual(endpointOff.decisionSummary.status, 'disabled');

const endpointLegacyShortcutOff = campops.findCampOpsSafeEndPoint({
  ...endpointInput,
  enabled: true,
});
assert.strictEqual(
  endpointLegacyShortcutOff.enabled,
  false,
  'Legacy safe-endpoint enabled shortcut should not bypass explicit CampOps rollout flags.',
);

const decisionPointsOff = campops.findCampOpsSafeEndPoint({
  ...endpointInput,
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: false,
  },
});
assert.strictEqual(decisionPointsOff.enabled, true);
assert.strictEqual(decisionPointsOff.decisionSummary.decisionPoint, null);
assert.ok(decisionPointsOff.decisionSummary.noDecisionPointReason.includes('disabled'));

const decisionPointsOn = campops.findCampOpsSafeEndPoint({
  ...endpointInput,
  rolloutConfig: {
    campopsRecommendationsEnabled: true,
    campopsEndpointRecommendationEnabled: true,
    campopsDecisionPointsEnabled: true,
  },
});
assert.ok(decisionPointsOn.decisionSummary.decisionPoint, 'Decision point should be present when the flag is on and route data exists.');

assert.strictEqual(
  campops.isCampOpsAiAssistAvailable({
    rolloutConfig: null,
  }),
  false,
  'AI assist should require explicit rollout flags.',
);
assert.strictEqual(
  campops.isCampOpsAiAssistAvailable({
    rolloutConfig: {
      campopsRecommendationsEnabled: true,
      campopsAiAssistEnabled: false,
    },
  }),
  false,
  'AI assist off should be detectable by callers.',
);
assert.strictEqual(
  campops.isCampOpsAiAssistAvailable({
    rolloutConfig: {
      campopsRecommendationsEnabled: true,
      campopsAiAssistEnabled: true,
    },
  }),
  true,
  'AI assist on should be detectable by callers.',
);

const communityDebriefInput = campops.createDefaultCampOpsDebriefInput({
  visibility: 'community_anonymized',
  publishingConsent: {
    publishCommunityAnonymized: true,
    acceptedAtIso: '2026-04-30T18:00:00.000Z',
    consentVersion: 'campops-rollout-test',
  },
  rolloutConfig: {
    campopsDebriefCommunityPublishingEnabled: false,
  },
});
assert.ok(
  campops.validateCampOpsDebriefInput(communityDebriefInput).errors.some((error) => error.includes('disabled')),
  'Community debrief publishing should be blocked when its rollout flag is off.',
);
assert.strictEqual(
  campops.validateCampOpsDebriefInput({
    ...communityDebriefInput,
    rolloutConfig: {
      campopsDebriefCommunityPublishingEnabled: true,
    },
  }).ok,
  true,
  'Community debrief publishing should validate when consent and rollout flag are both present.',
);

delete global.__ENABLE_CAMPOPS_INTERNAL_BETA__;
delete global.__ECS_CAMPOPS_INTERNAL_BETA__;
delete global.__ECS_CAMPOPS_ROUTE_PINS__;
delete process.env.ENABLE_CAMPOPS_INTERNAL_BETA;
delete process.env.EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA;
delete process.env.ECS_CAMPOPS_INTERNAL_BETA;
delete process.env.EXPO_PUBLIC_ECS_CAMPOPS_INTERNAL_BETA;
delete process.env.ECS_CAMPOPS_ROUTE_PINS;
delete process.env.EXPO_PUBLIC_ECS_CAMPOPS_ROUTE_PINS;
assert.strictEqual(
  campops.isCampOpsInternalBetaFeatureEnabled(),
  false,
  'CampOps internal beta should remain disabled unless the explicit internal beta flag is set.',
);
assert.strictEqual(
  campops.isCampOpsRoutePinsFeatureEnabled(),
  false,
  'CampOps route pins should remain disabled unless the explicit internal beta flag is set.',
);
global.__ECS_CAMPOPS_ROUTE_PINS__ = true;
assert.strictEqual(
  campops.isCampOpsRoutePinsFeatureEnabled(),
  false,
  'Legacy route-pin flags must not bypass the internal beta gate.',
);
assert.ok(
  campops.getCampOpsInternalBetaStatusLine().includes('disabled'),
  'Dev diagnostics should report the disabled internal beta posture.',
);
global.__ENABLE_CAMPOPS_INTERNAL_BETA__ = true;
assert.strictEqual(
  campops.isCampOpsInternalBetaFeatureEnabled(),
  true,
  'CampOps internal beta should be enabled by the explicit internal beta flag.',
);
assert.strictEqual(
  campops.isCampOpsRoutePinsFeatureEnabled(),
  true,
  'CampOps route pins should be enabled by the explicit internal beta flag.',
);
assert.ok(
  campops.getCampOpsInternalBetaStatusLine().includes('enabled'),
  'Dev diagnostics should report the enabled internal beta posture.',
);
assert.deepStrictEqual(
  campops.getCampOpsRoutePinsRolloutConfig(),
  {
    campopsRecommendationsEnabled: true,
    campOpsRecommendationSetEnabled: true,
    campopsSourceTransparencyEnabled: true,
  },
  'CampOps route pins should enable only deterministic internal beta recommendation-set surfaces.',
);
delete global.__ENABLE_CAMPOPS_INTERNAL_BETA__;
delete global.__ECS_CAMPOPS_ROUTE_PINS__;

console.log('CampOps rollout flag checks passed.');
