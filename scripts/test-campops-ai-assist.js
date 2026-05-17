const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campopsPath = path.join(root, 'lib', 'campops', 'index.ts');
const promptRegistryPath = path.join(root, 'lib', 'ai', 'expeditionPromptRegistry.ts');

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
  buildCampOpsAiAssistPrompt,
  parseCampOpsAiAssistOutput,
} = require(campopsPath);
const { getExpeditionAgentPrompt } = require(promptRegistryPath);

function candidate(id, name = id) {
  return {
    id,
    name,
    location: { latitude: 39.1, longitude: -119.9 },
    source: 'route_candidate',
    sourceConfidence: 'high',
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
    turnaroundSuitability: 'unknown',
    trailerTurnaroundConfidence: 'unknown',
    deadEndRisk: 'unknown',
    backingRequired: null,
    roadWidthConfidence: 'unknown',
    groupCapacityEstimate: 4,
    groupCapacityConfidence: 'medium',
    etaIso: '2026-04-30T19:00:00.000Z',
    etaMinutesFromNow: 180,
    sunsetMarginMinutes: 70,
    fuelImpact: { value: 85, unit: 'miles', impact: 'neutral', confidence: 'high' },
    waterImpact: { value: 8, unit: 'gallons', impact: 'neutral', confidence: 'high' },
    terrainSlopeEstimate: { value: 82, unit: 'score', confidence: 'medium', source: 'inferred' },
    weatherExposure: 'unknown',
    fireRestrictionStatus: 'unknown',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'medium',
    dataLimitations: ['Weather exposure is missing.'],
    resourceDebt: {
      fuel: {
        category: 'fuel',
        status: 'safe',
        value: 85,
        unit: 'miles',
        reason: 'Fuel margin remains above threshold.',
        missingDataFields: [],
        confidence: 'high',
      },
      water: {
        category: 'water',
        status: 'safe',
        value: 8,
        unit: 'gallons',
        reason: 'Water margin remains above threshold.',
        missingDataFields: [],
        confidence: 'high',
      },
      daylight: {
        category: 'daylight',
        status: 'safe',
        value: 70,
        unit: 'minutes',
        reason: 'ETA leaves daylight margin.',
        missingDataFields: [],
        confidence: 'medium',
      },
      campUncertainty: {
        category: 'campUncertainty',
        status: 'tight',
        value: 64,
        unit: 'score',
        reason: 'Some camp data is inferred.',
        missingDataFields: ['occupancyLikelihood'],
        confidence: 'medium',
      },
    },
    sourceSignals: [
      {
        source: 'offline_dataset',
        confidence: 'medium',
        observedAtIso: '2026-04-29T16:00:00.000Z',
        isStale: true,
        freshnessStatus: 'stale',
        fields: ['weatherExposure'],
        limitation: 'offline_dataset data is stale.',
      },
      {
        source: 'community',
        confidence: 'low',
        observedAtIso: '2026-04-28T16:00:00.000Z',
        isStale: true,
        freshnessStatus: 'stale',
        fields: ['legalStatus', 'legalConfidence'],
        limitation: 'legal source is stale.',
      },
    ],
    sourceResolutions: [
      {
        field: 'closureStatus',
        resolvedValue: 'unknown',
        resolvedConfidence: 'unknown',
        conflictDetected: false,
        conflictSummary: null,
        sourceSummaries: ['No current closure provider returned a usable status.'],
        staleSources: [],
        missingSources: ['closure_provider'],
      },
      {
        field: 'accessAllowed',
        resolvedValue: 'restricted',
        resolvedConfidence: 'medium',
        conflictDetected: true,
        conflictSummary: 'Public access source reports restricted while community report says open.',
        sourceSummaries: ['Official access source has higher confidence than community report.'],
        staleSources: ['community'],
        missingSources: [],
      },
    ],
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    id: 'ctx-campops-ai',
    routeId: 'route-7',
    plannedCampId: 'camp-scenic',
    currentTimeIso: '2026-04-30T16:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-04-30T18:00:00.000Z',
      latestAcceptableIso: '2026-04-30T20:00:00.000Z',
    },
    daylightInfo: {
      sunsetIso: '2026-05-01T02:00:00.000Z',
      source: 'manual',
      confidence: 'medium',
    },
    vehicleProfile: {
      vehicleId: 'vehicle-1',
      label: 'Trail Rig',
      vehicleType: 'truck',
      clearanceInches: 10.4,
      trailerAttached: true,
      confidence: 'medium',
    },
    convoyProfile: {
      groupId: 'group-secret',
      groupLabel: 'Family convoy',
      peopleCount: 3,
      vehicleCount: 2,
      kidCount: 1,
      kidsPresent: true,
      petCount: 1,
      source: 'manual',
      confidence: 'medium',
      medicalOrAccessibilityConstraint: true,
      leastCapableVehicleProfile: {
        vehicleId: 'least-capable-private-id',
        label: 'Narrow Jeep',
        vehicleType: 'suv',
        clearanceInches: 8.5,
        trailerAttached: false,
        confidence: 'medium',
      },
      lowestFuelReserveVehicle: {
        vehicleId: 'fuel-private-id',
        label: 'Blue Truck',
        fuelReserveMiles: 36,
        source: 'manual',
        confidence: 'medium',
      },
    },
    resourceState: {
      fuelReserveMiles: 85,
      waterGallons: 8,
      source: 'manual',
      confidence: 'medium',
    },
    riskTolerance: 'balanced',
    offlineMode: 'online',
    delayEstimateMinutes: 120,
    routeProgress: {
      distanceRemainingMiles: 42,
      driveTimeRemainingMinutes: 180,
      source: 'inferred',
      confidence: 'medium',
    },
    ...overrides,
  };
}

function recommendationSet(overrides = {}) {
  const recommendedCamp = candidate('camp-b', 'Camp B');
  const backupCamp = candidate('camp-c', 'Camp C');
  const emergencyCamp = candidate('camp-e', 'Camp E');
  const rejectedCamp = candidate('camp-scenic', 'Scenic Camp');
  return {
    recommendedCamp,
    backupCamp,
    emergencyCamp,
    weatherFallbackCamp: null,
    resupplyCamp: null,
    trailerSafeCamp: recommendedCamp,
    rejectedCandidates: [
      {
        candidate: rejectedCamp,
        gates: [
          {
            state: 'rejected',
            gateId: 'campops.time.late_arrival_high_risk',
            severity: 'critical',
            reason: 'ETA is beyond safe arrival window and late-arrival risk is high.',
            missingDataFields: [],
          },
        ],
        reasons: ['ETA is beyond safe arrival window and late-arrival risk is high.'],
      },
    ],
    warnings: ['Weather exposure data is missing.'],
    assumptions: ['Fuel and water values are current manual inputs.'],
    confidenceSummary: {
      level: 'medium',
      score: 72,
      reasons: ['Recommended camp has medium CampOps confidence.'],
      missingDataFields: ['weatherExposure'],
    },
    rolesByCandidateId: {
      'camp-b': ['primary', 'trailer_safe'],
      'camp-c': ['backup'],
      'camp-e': ['emergency'],
    },
    scoresByCandidateId: {
      'camp-b': {
        overall: 78,
        legal: 82,
        access: 80,
        time: 76,
        resources: 82,
        terrain: 76,
        weather: 55,
        groupFit: 75,
        trailerFit: 84,
        lateArrival: 74,
        privacy: 60,
        dataConfidence: 68,
      },
    },
    enrichmentsByCandidateId: {
      'camp-b': enrichment('camp-b', { legalConfidence: 'medium' }),
      'camp-c': enrichment('camp-c'),
      'camp-e': enrichment('camp-e'),
      'camp-scenic': enrichment('camp-scenic', {
        legalStatus: 'unknown',
        legalConfidence: 'unknown',
        lateArrivalRisk: 'critical',
      }),
    },
    explanations: {
      whyRecommended: 'Camp B is recommended because it preserves arrival and resource margin.',
      whyBackup: 'Camp C is backup if Camp B is occupied.',
      whyEmergency: 'Camp E is the emergency endpoint.',
      plannedCampDowngrade: 'Scenic Camp was downgraded because arrival would be after the safe window.',
      keyTradeoffs: ['Camp B is less scenic but stronger for trailer access and arrival margin.'],
    },
    decisionPoint: {
      kind: 'before_dark',
      location: null,
      routeMileMarker: 42,
      decisionDeadlineIso: '2026-04-30T18:15:00.000Z',
      reason: 'Delay compresses daylight margin before the final approach.',
      recommendedAction: 'Decide before the final approach whether to divert to Camp B.',
      continueOption: {
        campId: 'camp-scenic',
        label: 'Continue to Scenic Camp',
        etaIso: '2026-04-30T21:20:00.000Z',
        summary: 'Continuing reaches the planned camp after the acceptable window.',
      },
      divertOption: {
        campId: 'camp-b',
        label: 'Divert to Camp B',
        etaIso: '2026-04-30T19:00:00.000Z',
        summary: 'Camp B preserves more daylight and resource margin.',
      },
      riskIfContinues: 'Continuing increases late-arrival and final-approach uncertainty.',
      latestRecommendedTurnoff: {
        label: 'Forest Road 12 junction',
        routeMileMarker: 42,
        distanceMiles: 8,
      },
      confidence: 'medium',
    },
    ...overrides,
  };
}

const input = {
  context: context(),
  recommendationSet: recommendationSet(),
  mode: 'planning',
};

const payload = buildCampOpsAiAssistPayload(input);
assert.strictEqual(payload.source, 'campops_recommendation_set');
assert.strictEqual(payload.recommendedCamp.id, 'camp-b', 'AI payload should include CampOps recommended camp.');
assert.strictEqual(payload.backupCamp.id, 'camp-c', 'AI payload should include CampOps backup camp.');
assert.strictEqual(payload.emergencyCamp.id, 'camp-e', 'AI payload should include CampOps emergency camp.');
assert.ok(payload.rejectedCandidates.some((item) => item.campId === 'camp-scenic'), 'AI payload should include rejected candidate reasons.');
assert.ok(payload.hardGateWarnings.some((item) => item.gateId === 'campops.time.late_arrival_high_risk'), 'AI payload should include hard-gate warnings.');
assert.ok(payload.suitabilityScores['camp-b'], 'AI payload should include suitability scores.');
assert.ok(payload.resourceDebtByCandidateId['camp-b'], 'AI payload should include resource debt.');
assert.ok(payload.recommendedCamp.sourceSignals.some((signal) => signal.isStale), 'AI payload should include source freshness summaries.');
assert.ok(payload.sourceConfidence.resolvedSourceConfidence.some((item) => item.includes('accessAllowed')), 'AI payload should include resolved source confidence.');
assert.ok(payload.staleSourceSummaries.some((item) => /legal/i.test(item)), 'Stale legal source should appear in AI payload.');
assert.ok(payload.staleSourceSummaries.some((item) => /weather/i.test(item)), 'Stale weather source should appear in AI payload.');
assert.ok(payload.sourceConflictSummaries.some((item) => item.includes('restricted')), 'Source conflict summary should appear in AI payload.');
assert.ok(payload.missingCriticalSourceData.some((item) => item.includes('closure_provider')), 'Missing closure source should appear as uncertainty.');
assert.ok(payload.resourceDebtSummary.some((item) => item.includes('fuel debt')), 'AI payload should include resource debt summary.');
assert.ok(payload.decisionPointSummary.includes('before_dark'), 'AI payload should include decision point summary.');
assert.strictEqual(payload.recommendedCamp.turnaroundSuitability, 'unknown', 'AI payload should include trailer turnaround suitability.');
assert.strictEqual(payload.recommendedCamp.trailerTurnaroundConfidence, 'unknown', 'AI payload should include trailer turnaround confidence.');
assert.strictEqual(payload.recommendedCamp.groupCapacityConfidence, 'medium', 'AI payload should include group capacity confidence.');
assert.ok(payload.missingData.some((item) => item.includes('legal confidence is medium')), 'Medium/low/unknown legal confidence should become a confidence warning.');
assert.strictEqual(payload.contextSummary.vehicleProfile.vehicleId, undefined, 'AI payload must not include vehicle ids.');
assert.strictEqual(payload.contextSummary.vehicleProfile.label, undefined, 'AI payload must not include vehicle labels.');
assert.strictEqual(payload.contextSummary.vehicleProfile.clearanceInches, 10.4, 'AI payload may include operational vehicle capability.');
assert.strictEqual(payload.contextSummary.convoyProfile.groupId, undefined, 'AI payload must not include group ids.');
assert.strictEqual(payload.contextSummary.convoyProfile.groupLabel, undefined, 'AI payload must not include group labels.');
assert.strictEqual(payload.contextSummary.convoyProfile.medicalOrAccessibilityConstraint, undefined, 'AI payload must not include medical/accessibility flags.');
assert.strictEqual(payload.contextSummary.convoyProfile.leastCapableVehicleProfile.vehicleId, undefined, 'AI payload must redact nested vehicle ids.');
assert.strictEqual(payload.contextSummary.convoyProfile.leastCapableVehicleProfile.label, undefined, 'AI payload must redact nested vehicle labels.');
assert.strictEqual(payload.contextSummary.convoyProfile.lowestFuelReserveVehicle.vehicleId, undefined, 'AI payload must redact convoy resource vehicle ids.');
assert.strictEqual(payload.contextSummary.convoyProfile.lowestFuelReserveVehicle.label, undefined, 'AI payload must redact convoy resource vehicle labels.');

const prompt = buildCampOpsAiAssistPrompt(input);
assert.ok(prompt.includes('CampOps deterministic outputs are the source of truth'), 'Prompt should make CampOps source of truth.');
assert.ok(prompt.includes('"source":"campops_recommendation_set"'), 'Prompt should contain CampOps recommendation payload.');
assert.ok(prompt.includes('Do not override hard-gate rejections'), 'Prompt should forbid overriding hard gates.');
assert.ok(prompt.includes('sourceConfidenceNote'), 'Prompt schema should require source confidence narration.');
assert.ok(prompt.includes('staleSourceSummaries'), 'Prompt payload should expose stale source summaries.');
assert.ok(prompt.includes('sourceConflictSummaries'), 'Prompt payload should expose source conflicts.');
assert.ok(prompt.includes('missingCriticalSourceData'), 'Prompt payload should expose missing critical source data.');
assert.ok(prompt.includes('decisionPointSummary'), 'Prompt payload should expose decision point summary.');
assert.ok(prompt.includes('trailerTurnaroundConfidence'), 'Prompt payload should expose trailer turnaround confidence.');
assert.ok(prompt.includes('groupCapacityConfidence'), 'Prompt payload should expose group capacity confidence.');
assert.ok(!prompt.includes('Logan'), 'Prompt should not include unrelated user profile data.');
assert.ok(!prompt.includes('vehicle-1'), 'Prompt should not include private vehicle ids.');
assert.ok(!prompt.includes('Trail Rig'), 'Prompt should not include private vehicle labels.');
assert.ok(!prompt.includes('group-secret'), 'Prompt should not include private convoy ids.');
assert.ok(!prompt.includes('Family convoy'), 'Prompt should not include private convoy labels.');
assert.ok(!prompt.includes('medicalOrAccessibilityConstraint'), 'Prompt should not include medical/accessibility constraint fields.');

const resurrected = parseCampOpsAiAssistOutput(
  {
    headline: 'Scenic Camp is best',
    primaryRecommendation: {
      campId: 'camp-scenic',
      status: 'recommended',
      summary: 'Use Scenic Camp.',
    },
    why: ['It looks nice.'],
    tradeoffs: [],
    risks: [],
    requiredActions: ['Go there.'],
    backupPlan: null,
    emergencyPlan: null,
    confidenceNote: 'High.',
    convoyMessage: null,
  },
  input,
);
assert.strictEqual(resurrected.output.primaryRecommendation.status, 'not_recommended', 'Parser must not allow AI to resurrect rejected camps.');
assert.ok(resurrected.issues.some((issue) => issue.includes('rejected camp')), 'Parser should report rejected-camp resurrection.');
assert.ok(resurrected.output.risks.some((risk) => risk.includes('ETA is beyond')), 'Hard-gate warning should remain visible after rejected-camp parse.');

const overconfident = parseCampOpsAiAssistOutput(
  {
    headline: 'Camp B is definitely legal and guaranteed open',
    primaryRecommendation: {
      campId: 'camp-b',
      status: 'recommended',
      summary: 'Camp B is safe for the convoy.',
    },
    why: ['It is definitely legal and always accessible.'],
    tradeoffs: ['You can definitely camp here.'],
    risks: ['No risk.'],
    requiredActions: ['Go now because this is guaranteed open.'],
    backupPlan: null,
    emergencyPlan: null,
    confidenceNote: 'Guaranteed open.',
    convoyMessage: null,
  },
  input,
);
assert.ok(overconfident.issues.some((issue) => issue.includes('overconfident wording')), 'Parser should flag overconfident wording.');
const overconfidentJson = JSON.stringify(overconfident.output);
assert.ok(
  !/definitely legal|guaranteed open|\bsafe\b|no risk|always accessible|you can definitely camp here/i.test(overconfidentJson),
  'Parser should soften forbidden CampOps wording.',
);
assert.ok(overconfident.output.staleDataWarnings.some((warning) => /legal/i.test(warning)), 'Stale legal source should appear in parsed AI output.');
assert.ok(overconfident.output.staleDataWarnings.some((warning) => /weather/i.test(warning)), 'Stale weather source should appear in parsed AI output.');
assert.ok(overconfident.output.conflictWarnings.some((warning) => warning.includes('restricted')), 'Conflict summary should appear in parsed AI output.');
assert.ok(overconfident.output.missingDataWarnings.some((warning) => warning.includes('closure_provider')), 'Missing closure source should remain an uncertainty warning.');
assert.ok(overconfident.output.decisionPointSummary.includes('Decide before the final approach'), 'Decision point should be summarized in parsed AI output.');

function hostileOutput(overrides = {}) {
  return {
    headline: 'Camp B is the answer',
    primaryRecommendation: {
      campId: 'camp-b',
      status: 'recommended',
      summary: 'Camp B is recommended.',
    },
    why: ['It preserves arrival margin.'],
    tradeoffs: [],
    risks: [],
    requiredActions: ['Verify current field conditions.'],
    backupPlan: null,
    emergencyPlan: null,
    confidenceNote: 'Medium confidence.',
    sourceConfidenceNote: 'Medium source confidence.',
    staleDataWarnings: [],
    missingDataWarnings: [],
    conflictWarnings: [],
    decisionPointSummary: null,
    convoyMessage: null,
    ...overrides,
  };
}

const staleCurrentSet = recommendationSet({
  enrichmentsByCandidateId: {
    ...input.recommendationSet.enrichmentsByCandidateId,
    'camp-b': enrichment('camp-b', {
      legalConfidence: 'low',
      sourceSignals: [
        {
          source: 'offline_dataset',
          confidence: 'medium',
          observedAtIso: '2026-04-27T16:00:00.000Z',
          isStale: true,
          freshnessStatus: 'stale',
          fields: ['closureStatus'],
          limitation: 'closure source is stale.',
        },
        {
          source: 'offline_dataset',
          confidence: 'medium',
          observedAtIso: '2026-04-27T16:00:00.000Z',
          isStale: true,
          freshnessStatus: 'stale',
          fields: ['weatherExposure'],
          limitation: 'weather source is stale.',
        },
      ],
    }),
  },
});
const staleCurrent = parseCampOpsAiAssistOutput(
  hostileOutput({
    headline: 'Current closure data confirmed open and current weather both look good',
    primaryRecommendation: {
      campId: 'camp-b',
      status: 'recommended',
      summary: 'Current closure data says closure status is open and current weather is fine.',
    },
    why: ['High legal confidence.', 'Confirmed access is open.'],
    risks: [],
  }),
  { ...input, recommendationSet: staleCurrentSet },
);
assert.ok(staleCurrent.issues.some((issue) => issue.includes('current data')), 'Parser should flag stale closure/weather described as current.');
assert.ok(!/current closure|current weather/i.test(JSON.stringify(staleCurrent.output)), 'Parser should not leave stale closure/weather described as current.');
assert.ok(staleCurrent.issues.some((issue) => issue.includes('closure/access data as open')), 'Parser should flag stale or uncertain closure/access described as open.');
assert.ok(staleCurrent.issues.some((issue) => issue.includes('confirmed wording')), 'Parser should flag confirmed wording without sufficient confidence.');
assert.ok(!/confirmed open|closure status is open|access is open/i.test(JSON.stringify(staleCurrent.output)), 'Parser should not leave stale or uncertain closure/access described as open.');
assert.ok(staleCurrent.output.staleDataWarnings.some((warning) => /closure/i.test(warning)), 'Stale closure warning should be restored.');
assert.ok(staleCurrent.output.staleDataWarnings.some((warning) => /weather/i.test(warning)), 'Stale weather warning should be restored.');
assert.ok(!/high legal confidence|legal confidence is high/i.test(JSON.stringify(staleCurrent.output)), 'Low legal confidence should not be overstated as high.');
assert.ok(staleCurrent.issues.some((issue) => issue.includes('legal confidence')), 'Parser should flag overstated legal confidence.');

const unknownFireOmitted = parseCampOpsAiAssistOutput(
  hostileOutput({
    missingDataWarnings: [],
    risks: [],
  }),
  input,
);
assert.ok(
  unknownFireOmitted.output.missingDataWarnings.some((warning) => /fire restriction status is unknown/i.test(warning)),
  'Parser should restore unknown fire restriction warnings when the model omits them.',
);

const prohibitedCampfire = parseCampOpsAiAssistOutput(
  hostileOutput({
    headline: 'Camp B is recommended',
    primaryRecommendation: {
      campId: 'camp-b',
      status: 'recommended',
      summary: 'Campfires are not recommended, but camping is still fine.',
    },
    why: ['Campfires should be avoided.'],
  }),
  {
    ...input,
    recommendationSet: recommendationSet({
      enrichmentsByCandidateId: {
        ...input.recommendationSet.enrichmentsByCandidateId,
        'camp-b': enrichment('camp-b', {
          fireRestrictionStatus: 'fire_ban',
          campfireAllowed: 'no',
          stoveAllowed: 'restricted',
        }),
      },
    }),
  },
);
assert.ok(prohibitedCampfire.issues.some((issue) => issue.includes('campfire')), 'Parser should flag softened campfire prohibition.');
assert.ok(/Campfires are prohibited/i.test(JSON.stringify(prohibitedCampfire.output)), 'Parser should preserve prohibited campfire wording.');
assert.ok(!/Campfires are not recommended|Campfires should be avoided/i.test(JSON.stringify(prohibitedCampfire.output)), 'Parser should not soften a prohibition into advice.');

const inventedLogistics = parseCampOpsAiAssistOutput(
  hostileOutput({
    primaryRecommendation: {
      campId: 'camp-b',
      status: 'recommended',
      summary: 'Fuel available open now and water refill available 24/7.',
    },
    why: ['Fuel is confirmed nearby.', 'Water refill is confirmed nearby.'],
    requiredActions: ['Use the known operating hours.'],
  }),
  input,
);
const inventedLogisticsJson = JSON.stringify(inventedLogistics.output);
assert.ok(inventedLogistics.issues.some((issue) => issue.includes('fuel service')), 'Parser should flag invented fuel service availability.');
assert.ok(inventedLogistics.issues.some((issue) => issue.includes('water service')), 'Parser should flag invented water service availability.');
assert.ok(inventedLogistics.issues.some((issue) => issue.includes('operating status')), 'Parser should flag invented operating status.');
assert.ok(!/Fuel available|Water refill available|24\/7|open now|known operating hours/i.test(inventedLogisticsJson), 'Parser should remove invented fuel/water/service certainty.');

const inventedTrailerTurnaround = parseCampOpsAiAssistOutput(
  hostileOutput({
    primaryRecommendation: {
      campId: 'camp-b',
      status: 'recommended',
      summary: 'Trailer turnaround is confirmed and road width is adequate.',
    },
    tradeoffs: ['Turnaround is guaranteed.'],
  }),
  input,
);
const inventedTrailerJson = JSON.stringify(inventedTrailerTurnaround.output);
assert.ok(inventedTrailerTurnaround.issues.some((issue) => issue.includes('trailer turnaround')), 'Parser should flag invented trailer turnaround confidence.');
assert.ok(!/turnaround is confirmed|turnaround is guaranteed/i.test(inventedTrailerJson), 'Parser should remove invented trailer turnaround certainty.');

const emergencyAsPrimary = parseCampOpsAiAssistOutput(
  hostileOutput({
    primaryRecommendation: {
      campId: 'camp-e',
      status: 'recommended',
      summary: 'Camp E is a comfortable primary recommendation.',
    },
    why: ['It is comfortable.'],
  }),
  {
    ...input,
    recommendationSet: recommendationSet({
      recommendedCamp: null,
    }),
  },
);
assert.notStrictEqual(emergencyAsPrimary.output.primaryRecommendation.status, 'recommended', 'Emergency fallback should not become a primary recommendation without CampOps selecting it.');
assert.ok(!/comfortable primary recommendation/i.test(JSON.stringify(emergencyAsPrimary.output)), 'Parser should not describe emergency fallback as comfortable primary.');

const unknownLegalAllowed = parseCampOpsAiAssistOutput(
  {
    headline: 'Camp B legal allowed',
    primaryRecommendation: {
      campId: 'camp-b',
      status: 'recommended',
      summary: 'Legal status allowed even with unknown source data.',
    },
    why: ['Legal allowed.'],
    tradeoffs: [],
    risks: [],
    requiredActions: ['Proceed.'],
    backupPlan: null,
    emergencyPlan: null,
    confidenceNote: 'Legal allowed.',
    sourceConfidenceNote: '',
    staleDataWarnings: [],
    missingDataWarnings: [],
    conflictWarnings: [],
    decisionPointSummary: null,
    convoyMessage: null,
  },
  {
    ...input,
    recommendationSet: recommendationSet({
      enrichmentsByCandidateId: {
        'camp-b': enrichment('camp-b', { legalStatus: 'unknown', legalConfidence: 'unknown' }),
      },
    }),
  },
);
assert.ok(unknownLegalAllowed.issues.some((issue) => issue.includes('unknown legal status')), 'Parser should flag unknown legal status narrated as allowed.');
assert.ok(!/legal[^.]{0,80}\ballowed\b|\ballowed\b[^.]{0,80}legal/i.test(JSON.stringify(unknownLegalAllowed.output)), 'Parser should not allow unknown legal status to be called allowed.');

const trailerGroupNarration = parseCampOpsAiAssistOutput(
  {
    headline: 'Camp B is recommended',
    primaryRecommendation: {
      campId: 'camp-b',
      status: 'recommended',
      summary: 'Camp B is recommended, but trailer turnaround confidence is unknown and group capacity confidence is medium.',
    },
    why: ['It preserves arrival margin.'],
    tradeoffs: ['Trailer turnaround confidence is unknown.', 'Group capacity confidence is medium.'],
    risks: [],
    requiredActions: ['Verify turnaround and group fit before committing.'],
    backupPlan: null,
    emergencyPlan: null,
    confidenceNote: 'Medium CampOps confidence.',
    sourceConfidenceNote: 'Medium source confidence.',
    staleDataWarnings: [],
    missingDataWarnings: [],
    conflictWarnings: [],
    decisionPointSummary: null,
    convoyMessage: 'Trailer/group limitation should be verified without assuming road width.',
  },
  input,
);
const trailerGroupJson = JSON.stringify(trailerGroupNarration.output);
assert.ok(trailerGroupJson.includes('turnaround confidence is unknown'), 'AI should be able to explain trailer limitation.');
assert.ok(trailerGroupJson.includes('Group capacity confidence is medium'), 'AI should be able to explain group-capacity confidence.');
assert.ok(!/road width is adequate|turnaround is guaranteed/i.test(trailerGroupJson), 'AI should not overclaim road width or turnaround data.');

const fieldPrompt = buildCampOpsAiAssistPrompt({
  ...input,
  mode: 'field',
});
assert.ok(fieldPrompt.includes('Field mode: keep the headline'), 'Field-mode prompt should require concise output.');
assert.ok(fieldPrompt.includes('concise and conservative'), 'Field-mode prompt should be conservative.');
const fieldParsed = parseCampOpsAiAssistOutput(
  hostileOutput({
    headline: 'Use Camp B',
    why: ['Arrival margin holds.'],
    tradeoffs: ['Legal confidence is medium.'],
    risks: ['Weather data is stale.'],
    requiredActions: ['Verify access.'],
  }),
  { ...input, mode: 'field' },
);
assert.ok(fieldParsed.output.why.length <= 3, 'Field-mode parsed output should remain compact when concise model output is supplied.');

const planningPrompt = buildCampOpsAiAssistPrompt({
  ...input,
  mode: 'planning',
});
assert.ok(planningPrompt.includes('Planning mode: explain the tradeoffs'), 'Planning-mode prompt should request fuller explanation.');
const planningParsed = parseCampOpsAiAssistOutput(
  hostileOutput({
    why: ['Camp B preserves arrival margin.', 'Camp B has better trailer posture.', 'Camp B preserves resource margin.'],
    tradeoffs: ['Less privacy than Scenic Camp.', 'Source confidence is medium.', 'Weather source is stale.'],
    risks: ['Fire restrictions unknown.', 'Closure source missing.'],
  }),
  { ...input, mode: 'planning' },
);
assert.ok(planningParsed.output.tradeoffs.length >= 3, 'Planning-mode parsed output should retain fuller tradeoff explanation.');

const campPrompt = getExpeditionAgentPrompt('camp_logistics').prompt;
[
  'CampOps narrator and assistant',
  'Do not independently choose a camp',
  'rejected candidate reasons',
  'resource debt',
  'Do not invent legal status',
  'fallback only',
].forEach((needle) => {
  assert.ok(campPrompt.includes(needle), `Camp logistics prompt should include CampOps rule: ${needle}`);
});

console.log('CampOps AI assist checks passed.');
