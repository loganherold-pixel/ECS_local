const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const weakPointAnalyzerPath = path.join(root, 'lib', 'readiness', 'expeditionWeakPointAnalyzer.ts');

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
  buildWeakPointAiExplanationPayload,
  buildWeakPointExplanation,
  rankWeakPointCandidates,
  scoreExpeditionWeakPoints,
} = require(weakPointAnalyzerPath);

const now = '2026-06-13T15:00:00.000Z';
const REQUIRED_CATEGORIES = [
  'route_confidence',
  'fuel_margin',
  'water_margin',
  'power_margin',
  'payload_gvwr',
  'camp_endpoint_confidence',
  'offline_readiness',
  'weather_freshness',
  'daylight',
  'recovery_bailout_access',
  'convoy_state',
];

function traceWeightedScore(trace) {
  return Number((
    trace.likelihood.score * 0.40 +
    trace.consequence.score * 0.35 +
    trace.uncertainty.score * 0.15 +
    trace.dataGap.score * 0.10
  ).toFixed(2));
}

function completeSnapshot(overrides = {}) {
  return {
    snapshotId: 'weak-point-fixture-1',
    capturedAt: now,
    routeConfidence: {
      confidence: 'high',
      conditionState: 'normal',
      sourceFactIds: ['route-confidence'],
      updatedAt: now,
    },
    fuelMargin: {
      reserveMiles: 80,
      rangeRemainingMiles: 210,
      routeDistanceRemainingMiles: 120,
      sourceFactIds: ['fuel-margin'],
      updatedAt: now,
    },
    waterMargin: {
      daysRemaining: 3,
      requiredDays: 1,
      sourceFactIds: ['water-margin'],
      updatedAt: now,
    },
    powerMargin: {
      runtimeHoursRemaining: 24,
      requiredRuntimeHours: 8,
      batteryPercent: 82,
      sourceFactIds: ['power-margin'],
      updatedAt: now,
    },
    payloadGvwr: {
      gvwrUsagePct: 72,
      payloadRemainingLbs: 850,
      sourceFactIds: ['payload-margin'],
      updatedAt: now,
    },
    campEndpointConfidence: {
      endpointId: 'camp-a',
      legalAccessConfidence: 'high',
      accessConfidence: 'high',
      etaCreatesLateArrivalRisk: false,
      sourceFactIds: ['camp-access'],
      updatedAt: now,
    },
    offlineReadiness: {
      packageStatus: 'ready',
      routeMatched: true,
      coverage: 'complete',
      freshness: 'fresh',
      sourceFactIds: ['offline-package'],
      updatedAt: now,
    },
    weatherFreshness: {
      riskLevel: 'low',
      freshness: 'fresh',
      severeAlertActive: false,
      sourceFactIds: ['weather'],
      updatedAt: now,
    },
    daylight: {
      minutesRemainingAtArrival: 95,
      arrivalAfterDark: false,
      sourceFactIds: ['daylight'],
      updatedAt: now,
    },
    recoveryBailoutAccess: {
      bailoutRoutesAvailable: true,
      routeBailoutOptionCount: 3,
      nearestExitMiles: 4,
      recoveryAccessConfidence: 'high',
      sourceFactIds: ['recovery'],
      updatedAt: now,
    },
    convoyState: {
      rosterReady: true,
      communicationsReady: true,
      membersAccountedFor: true,
      sourceFactIds: ['convoy'],
      updatedAt: now,
    },
    sourceFacts: [
      { id: 'route-confidence', label: 'Route confidence', value: 'high', updatedAt: now },
      { id: 'fuel-margin', label: 'Fuel margin', value: '80 mi reserve', updatedAt: now },
      { id: 'water-margin', label: 'Water margin', value: '3 days remaining', updatedAt: now },
      { id: 'power-margin', label: 'Power margin', value: '24 hr runtime', updatedAt: now },
      { id: 'payload-margin', label: 'Payload margin', value: '72% GVWR', updatedAt: now },
      { id: 'camp-access', label: 'Camp access confidence', value: 'high', updatedAt: now },
      { id: 'offline-package', label: 'Offline package', value: 'ready', updatedAt: now },
      { id: 'weather', label: 'Weather freshness', value: 'fresh', updatedAt: now },
      { id: 'daylight', label: 'Daylight margin', value: '95 minutes', updatedAt: now },
      { id: 'recovery', label: 'Recovery access', value: '3 bailout routes', updatedAt: now },
      { id: 'convoy', label: 'Convoy roster', value: 'ready', updatedAt: now },
    ],
    ...overrides,
  };
}

const campFragile = scoreExpeditionWeakPoints(completeSnapshot({
  snapshotId: 'camp-fragile',
  campEndpointConfidence: {
    endpointId: 'camp-low-confidence',
    legalAccessConfidence: 'low',
    accessConfidence: 'low',
    etaCreatesLateArrivalRisk: true,
    sourceFactIds: ['camp-access'],
    updatedAt: now,
  },
  daylight: {
    minutesRemainingAtArrival: 20,
    arrivalAfterDark: false,
    sourceFactIds: ['daylight'],
    updatedAt: now,
  },
  sourceFacts: [
    { id: 'camp-access', label: 'Camp access confidence', value: 'low legal/access confidence', updatedAt: now },
    { id: 'daylight', label: 'Daylight margin', value: '20 minutes at arrival', updatedAt: now },
  ],
}));

assert.strictEqual(campFragile.maturityLabel, 'Internal beta / restricted field-test');
assert.strictEqual(campFragile.scoreVersion, 'weak-point-beta-v1');
assert.strictEqual(campFragile.sourceSnapshotId, 'camp-fragile');
assert.strictEqual(campFragile.assessmentCompleteness, 'complete');
assert.ok(campFragile.snapshotCoverage, 'Assessment should include snapshot coverage metadata.');
assert.strictEqual(campFragile.snapshotCoverage.generatedAt, now);
assert.deepStrictEqual(
  campFragile.snapshotCoverage.domains.map((domain) => domain.domain),
  REQUIRED_CATEGORIES,
  'Snapshot coverage should include every required weak-point category in stable order.',
);
assert.ok(
  campFragile.snapshotCoverage.domains.every((domain) => (
    ['complete', 'partial', 'missing', 'stale', 'unavailable'].includes(domain.status) &&
    Array.isArray(domain.requiredFactIds) &&
    Array.isArray(domain.availableFactIds) &&
    Array.isArray(domain.missingFactIds) &&
    Array.isArray(domain.staleFactIds) &&
    Array.isArray(domain.unavailableFactIds)
  )),
  'Every coverage domain should expose complete source coverage bookkeeping.',
);
assert.strictEqual(campFragile.rankedWeakPoints[0].category, 'camp_endpoint_confidence');
assert.strictEqual(campFragile.mostFragileAssumption?.category, 'camp_endpoint_confidence');
assert.strictEqual(campFragile.rankedWeakPoints[0].scoreComponents.likelihood, 4);
assert.strictEqual(campFragile.rankedWeakPoints[0].scoreComponents.consequence, 4);
assert.strictEqual(campFragile.rankedWeakPoints[0].scoreComponents.uncertainty, 4);
assert.strictEqual(campFragile.rankedWeakPoints[0].scoreComponents.dataGap, 1);
assert.strictEqual(campFragile.rankedWeakPoints[0].riskScore, 3.7);
assert.ok(
  campFragile.rankedWeakPoints[0].consequenceStatement.toLowerCase().includes('late arrival'),
  'Camp endpoint weak point should explain the late-arrival consequence.',
);
assert.ok(
  campFragile.rankedWeakPoints[0].sourceFactIds.includes('camp-access'),
  'Camp endpoint weak point should preserve source fact ids.',
);
assert.ok(
  campFragile.rankedWeakPoints.every((point) => point.sourceFactIds.length > 0 || point.missingFactIds.length > 0),
  'Every ranked weak-point candidate should reference source or missing facts.',
);
const sourceFactIds = new Set(campFragile.sourceFacts.map((fact) => fact.factId));
const missingFactIds = new Set(campFragile.missingFacts.map((fact) => fact.factId));
campFragile.rankedWeakPoints.forEach((point) => {
  point.sourceFactIds.forEach((factId) => assert.ok(sourceFactIds.has(factId), `${point.category} references unknown source fact ${factId}.`));
  point.missingFactIds.forEach((factId) => assert.ok(missingFactIds.has(factId), `${point.category} references unknown missing fact ${factId}.`));
});
campFragile.sourceFacts.forEach((fact) => {
  assert.ok(fact.factId, 'Source fact should expose factId.');
  assert.ok(fact.sourceSystem, 'Source fact should expose sourceSystem.');
  assert.ok(fact.fieldPath, 'Source fact should expose fieldPath.');
  assert.ok(fact.freshness, 'Source fact should expose freshness.');
  assert.ok(fact.confidence, 'Source fact should expose confidence.');
  assert.ok(fact.observedAt || fact.generatedAt, 'Source fact should preserve a timestamp when available.');
});
assert.strictEqual(campFragile.scoringTrace.length, campFragile.rankedWeakPoints.length);
campFragile.scoringTrace.forEach((trace) => {
  assert.ok(trace.candidateId, 'Trace should identify the candidate.');
  ['likelihood', 'consequence', 'uncertainty', 'dataGap'].forEach((key) => {
    assert.strictEqual(typeof trace[key].score, 'number', `${key} trace should include numeric score.`);
    assert.ok(trace[key].reason, `${key} trace should include deterministic reason.`);
    assert.ok(Array.isArray(trace[key].sourceFactIds), `${key} trace should include source fact references.`);
    assert.ok(Array.isArray(trace[key].missingFactIds), `${key} trace should include missing fact references.`);
  });
  assert.strictEqual(trace.weightedScore, traceWeightedScore(trace), 'Trace weighted score should match formula exactly.');
  assert.strictEqual(trace.scoreVersion, 'weak-point-beta-v1');
  assert.strictEqual(typeof trace.tieBreak.categoryOrder, 'number');
});
const firstAction = campFragile.allowedActions.find((action) => action.actionId === campFragile.easiestFixBeforeDeparture?.actionId);
assert.ok(firstAction, 'Easiest fix should reference a deterministic allowed action.');
assert.ok(firstAction.sourceFactIds.length > 0 || firstAction.missingFactIds.length > 0);
const firstMonitor = campFragile.monitorSignals.find((signal) => signal.signalId === campFragile.monitorDuringTravel?.monitorSignalId);
assert.ok(firstMonitor, 'Monitor during travel should reference a deterministic monitor signal.');
assert.ok(firstMonitor.sourceFactIds.length > 0 || firstMonitor.missingFactIds.length > 0);
assert.ok(
  campFragile.explanation.text.includes('Primary weak point: camp endpoint confidence'),
  'Deterministic explanation should name the primary weak point.',
);
assert.ok(
  !campFragile.explanation.text.toLowerCase().includes('closed'),
  'Explanation must not invent an unprovided closure or access hazard.',
);

const missingInputs = scoreExpeditionWeakPoints({
  snapshotId: 'missing-route-weather-logistics',
  capturedAt: now,
  sourceFacts: [],
});
assert.ok(['partial', 'source_limited', 'insufficient'].includes(missingInputs.assessmentCompleteness));
assert.deepStrictEqual(
  missingInputs.rankedWeakPoints.map((point) => point.category).sort(),
  REQUIRED_CATEGORIES.slice().sort(),
  'Every required category should produce a scored weak-point or data-gap candidate.',
);
const missingCategories = missingInputs.rankedWeakPoints
  .filter((point) => point.scoreComponents.dataGap === 5)
  .map((point) => point.category);
['route_confidence', 'fuel_margin', 'water_margin', 'weather_freshness', 'convoy_state'].forEach((category) => {
  assert.ok(missingCategories.includes(category), `${category} should be scored as an explicit missing-data weak point.`);
});
assert.ok(
  missingInputs.rankedWeakPoints
    .filter((point) => point.scoreComponents.dataGap === 5)
    .every((point) => point.missingFactIds.length > 0 && point.consequenceStatement.toLowerCase().includes('unknown')),
  'Missing inputs should describe what is unknown instead of inferring a hazard exists.',
);
assert.ok(
  missingInputs.rankedWeakPoints
    .filter((point) => point.scoreComponents.dataGap === 5)
    .every((point) => !/low|empty|failed|unsafe|blocked/i.test(point.consequenceStatement)),
  'Missing inputs should not fabricate concrete low-resource or blocked-route hazards.',
);
assert.ok(
  missingInputs.missingData.some((item) => item.includes('route confidence')),
  'Assessment should aggregate missing data labels.',
);

const noTimestampAssessment = scoreExpeditionWeakPoints(completeSnapshot({
  snapshotId: 'no-freshness-metadata',
  sourceFacts: [
    { id: 'route-confidence', label: 'Route confidence', value: 'high' },
  ],
}));
const routeFact = noTimestampAssessment.sourceFacts.find((fact) => fact.factId === 'route-confidence');
assert.ok(routeFact, 'Normalized source facts should include route confidence.');
assert.strictEqual(routeFact.freshness, 'unavailable');
assert.strictEqual(routeFact.confidence, 'inferred');
assert.ok(
  noTimestampAssessment.snapshotCoverage.domains.some((domain) =>
    domain.domain === 'route_confidence' && domain.status === 'unavailable',
  ),
  'Missing timestamp/freshness metadata should downgrade source coverage.',
);

const thresholdSnapshot = completeSnapshot({
  snapshotId: 'thresholds',
  fuelMargin: {
    reserveMiles: 8,
    rangeRemainingMiles: 88,
    routeDistanceRemainingMiles: 80,
    sourceFactIds: ['fuel-margin'],
    updatedAt: now,
  },
  waterMargin: {
    daysRemaining: 0.4,
    requiredDays: 1,
    sourceFactIds: ['water-margin'],
    updatedAt: now,
  },
  powerMargin: {
    runtimeHoursRemaining: 4,
    requiredRuntimeHours: 8,
    batteryPercent: 18,
    sourceFactIds: ['power-margin'],
    updatedAt: now,
  },
  payloadGvwr: {
    gvwrUsagePct: 94,
    payloadRemainingLbs: 110,
    sourceFactIds: ['payload-margin'],
    updatedAt: now,
  },
  offlineReadiness: {
    packageStatus: 'partial',
    routeMatched: false,
    coverage: 'partial',
    freshness: 'stale',
    sourceFactIds: ['offline-package'],
    updatedAt: now,
  },
  weatherFreshness: {
    riskLevel: 'critical',
    freshness: 'stale',
    severeAlertActive: true,
    sourceFactIds: ['weather'],
    updatedAt: now,
  },
  recoveryBailoutAccess: {
    bailoutRoutesAvailable: false,
    routeBailoutOptionCount: 0,
    nearestExitMiles: 24,
    recoveryAccessConfidence: 'low',
    sourceFactIds: ['recovery'],
    updatedAt: now,
  },
  convoyState: {
    rosterReady: false,
    communicationsReady: false,
    membersAccountedFor: false,
    sourceFactIds: ['convoy'],
    updatedAt: now,
  },
});
const thresholdAssessment = scoreExpeditionWeakPoints(thresholdSnapshot);
const byCategory = new Map(thresholdAssessment.rankedWeakPoints.map((point) => [point.category, point]));
assert.strictEqual(byCategory.get('fuel_margin')?.scoreComponents.likelihood, 5);
assert.strictEqual(byCategory.get('water_margin')?.scoreComponents.likelihood, 5);
assert.strictEqual(byCategory.get('power_margin')?.scoreComponents.likelihood, 5);
assert.strictEqual(byCategory.get('payload_gvwr')?.scoreComponents.likelihood, 4);
assert.strictEqual(byCategory.get('offline_readiness')?.scoreComponents.dataGap, 3);
assert.strictEqual(byCategory.get('weather_freshness')?.scoreComponents.consequence, 5);
assert.strictEqual(byCategory.get('recovery_bailout_access')?.scoreComponents.likelihood, 5);
assert.strictEqual(byCategory.get('convoy_state')?.scoreComponents.uncertainty, 4);

const tieRanked = rankWeakPointCandidates([
  {
    category: 'power_margin',
    label: 'Power margin',
    scoreComponents: { likelihood: 3, consequence: 3, uncertainty: 2, dataGap: 2 },
  },
  {
    category: 'fuel_margin',
    label: 'Fuel margin',
    scoreComponents: { likelihood: 3, consequence: 3, uncertainty: 2, dataGap: 3 },
  },
  {
    category: 'route_confidence',
    label: 'Route confidence',
    scoreComponents: { likelihood: 3, consequence: 3, uncertainty: 2, dataGap: 3 },
  },
  {
    category: 'camp_endpoint_confidence',
    label: 'Camp endpoint confidence',
    scoreComponents: { likelihood: 4, consequence: 2, uncertainty: 3, dataGap: 1 },
  },
]);
assert.deepStrictEqual(
  tieRanked.map((point) => point.category),
  ['camp_endpoint_confidence', 'route_confidence', 'fuel_margin', 'power_margin'],
  'Tie-break should use likelihood, consequence, data gap, then stable category order.',
);

const deterministicA = scoreExpeditionWeakPoints(thresholdSnapshot);
const deterministicB = scoreExpeditionWeakPoints(thresholdSnapshot);
assert.deepStrictEqual(deterministicA, deterministicB, 'Same snapshot and policy should produce identical ranking.');
const customPolicy = scoreExpeditionWeakPoints(thresholdSnapshot, 'weak-point-beta-v2');
assert.strictEqual(customPolicy.scoreVersion, 'weak-point-beta-v2');
assert.ok(customPolicy.scoringTrace.every((trace) => trace.scoreVersion === 'weak-point-beta-v2'));

const explanationPayload = buildWeakPointAiExplanationPayload(campFragile);
assert.deepStrictEqual(
  Object.keys(explanationPayload).sort(),
  ['allowedActions', 'missingFacts', 'monitorSignals', 'rankedCandidates', 'scoringTrace', 'sourceFactIds', 'sourceFacts'],
);
assert.deepStrictEqual(
  explanationPayload.rankedCandidates.map((point) => point.category),
  campFragile.rankedWeakPoints.map((point) => point.category),
  'AI payload should preserve the deterministic order only.',
);
assert.ok(explanationPayload.sourceFacts.every((fact) => sourceFactIds.has(fact.factId)), 'AI payload source facts should be normalized assessment facts only.');

const validDraft = buildWeakPointExplanation(campFragile, {
  text: 'Primary weak point: camp endpoint confidence. Confirm access or pick a backup before departure.',
  rankedCategoryOrder: campFragile.rankedWeakPoints.map((point) => point.category),
  sourceFactIds: ['camp-access'],
  recommendations: [campFragile.easiestFixBeforeDeparture.easiestPreDepartureFix],
  referencedCategories: ['camp_endpoint_confidence'],
});
assert.strictEqual(validDraft.source, 'validated_ai');

[
  {
    name: 'reordered ranking',
    draft: {
      text: 'Primary weak point: fuel margin.',
      rankedCategoryOrder: campFragile.rankedWeakPoints.map((point) => point.category).reverse(),
      sourceFactIds: ['camp-access'],
      recommendations: [campFragile.easiestFixBeforeDeparture.easiestPreDepartureFix],
      referencedCategories: ['camp_endpoint_confidence'],
    },
  },
  {
    name: 'added source fact',
    draft: {
      text: 'Primary weak point: camp endpoint confidence due to a new road report.',
      rankedCategoryOrder: campFragile.rankedWeakPoints.map((point) => point.category),
      sourceFactIds: ['unprovided-road-report'],
      recommendations: [campFragile.easiestFixBeforeDeparture.easiestPreDepartureFix],
      referencedCategories: ['camp_endpoint_confidence'],
    },
  },
  {
    name: 'unsupported recommendation',
    draft: {
      text: 'Primary weak point: camp endpoint confidence. Ignore the backup endpoint.',
      rankedCategoryOrder: campFragile.rankedWeakPoints.map((point) => point.category),
      sourceFactIds: ['camp-access'],
      recommendations: ['Ignore the backup endpoint.'],
      referencedCategories: ['camp_endpoint_confidence'],
    },
  },
  {
    name: 'added category',
    draft: {
      text: 'Primary weak point: camp endpoint confidence, plus tire pressure.',
      rankedCategoryOrder: campFragile.rankedWeakPoints.map((point) => point.category),
      sourceFactIds: ['camp-access'],
      recommendations: [campFragile.easiestFixBeforeDeparture.easiestPreDepartureFix],
      referencedCategories: ['camp_endpoint_confidence', 'tire_pressure'],
    },
  },
  {
    name: 'go/no-go posture',
    draft: {
      text: 'Departure blocked. Go/no-go: no-go.',
      rankedCategoryOrder: campFragile.rankedWeakPoints.map((point) => point.category),
      sourceFactIds: ['camp-access'],
      recommendations: [campFragile.easiestFixBeforeDeparture.easiestPreDepartureFix],
      referencedCategories: ['camp_endpoint_confidence'],
    },
  },
  {
    name: 'hidden missing data',
    draft: {
      text: 'Primary weak point: camp endpoint confidence. No missing data remains.',
      rankedCategoryOrder: campFragile.rankedWeakPoints.map((point) => point.category),
      sourceFactIds: ['camp-access'],
      recommendations: [campFragile.easiestFixBeforeDeparture.easiestPreDepartureFix],
      referencedCategories: ['camp_endpoint_confidence'],
    },
  },
  {
    name: 'confirmed hazard from missing data',
    draft: {
      text: 'Water supply is low and hazard confirmed.',
      rankedCategoryOrder: missingInputs.rankedWeakPoints.map((point) => point.category),
      sourceFactIds: [],
      recommendations: [missingInputs.easiestFixBeforeDeparture.easiestPreDepartureFix],
      referencedCategories: ['water_margin'],
    },
    assessment: missingInputs,
  },
].forEach(({ name, draft, assessment = campFragile }) => {
  const guarded = buildWeakPointExplanation(assessment, draft);
  assert.strictEqual(guarded.source, 'deterministic_template', `Guardrail should reject ${name}.`);
  assert.ok(guarded.validationWarnings.length > 0, `Guardrail should explain rejection for ${name}.`);
});

console.log('Expedition weak-point analyzer checks passed.');
