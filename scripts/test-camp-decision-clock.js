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
  buildCampDecisionClockDecisionFromRecommendationSet,
  evaluateCampDecisionClock,
  campDecisionClockUnavailableDecision,
  isCampDecisionClockFeatureEnabled,
} = require(campopsPath);

function candidate(id, name, source = 'route_endpoint_candidate') {
  return {
    id,
    name,
    location: { latitude: 38.2, longitude: -110.4 },
    source,
    sourceConfidence: 'high',
    latestSafeArrivalAt: '2026-06-13T00:30:00.000Z',
  };
}

function endpoint(id, overrides = {}) {
  return {
    id,
    name: id === 'backup' ? 'Backup Basin' : 'Emergency Trailhead',
    latestDivertAt: id === 'backup' ? '2026-06-12T23:10:00.000Z' : null,
    viableUntil: id === 'backup' ? '2026-06-13T00:10:00.000Z' : '2026-06-13T01:05:00.000Z',
    source: { kind: 'manual', validated: true, updatedAt: '2026-06-12T20:30:00.000Z' },
    dataFreshness: 'fresh',
    legalAccessConfidence: 'validated',
    ...overrides,
  };
}

function margin(status, overrides = {}) {
  return {
    status,
    value: status === 'comfortable' ? 80 : status === 'tight' ? 24 : 8,
    unit: 'miles',
    confidence: status === 'unknown' ? 'unknown' : 'medium',
    source: 'manual',
    updatedAt: '2026-06-12T20:45:00.000Z',
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    currentTime: '2026-06-12T21:00:00.000Z',
    routeProgress: {
      driveTimeRemainingMinutes: 90,
      distanceRemainingMiles: 42,
      source: 'manual',
      confidence: 'high',
    },
    eta: {
      plannedArrivalAt: '2026-06-12T22:30:00.000Z',
      confidence: 'medium',
      source: 'manual',
      updatedAt: '2026-06-12T20:45:00.000Z',
    },
    delayScenario: { kind: 'custom', minutes: 30, label: '30 minute delay' },
    daylightWindow: {
      sunsetAt: '2026-06-13T00:50:00.000Z',
      usableLightEndsAt: '2026-06-13T00:20:00.000Z',
    },
    plannedCamp: candidate('planned', 'Planned Ridge Camp'),
    backupEndpoint: endpoint('backup'),
    emergencyEndpoint: endpoint('emergency'),
    margins: {
      fuel: margin('critical'),
      water: margin('comfortable', { unit: 'gallons' }),
      power: margin('comfortable', { unit: 'percent' }),
    },
    routeDifficulty: 'hard',
    weatherRisk: 'adverse',
    legalAccessConfidence: 'validated',
    dataFreshness: 'fresh',
    ...overrides,
  };
}

function traceFactors(decision) {
  return new Set((decision.decisionTrace ?? []).map((item) => item.factor));
}

function assertTraceIncludes(decision, factors, label) {
  const present = traceFactors(decision);
  factors.forEach((factor) => {
    assert.ok(present.has(factor), `${label} should include decision trace factor ${factor}.`);
  });
}

const originalCampDecisionClockGlobal = globalThis.__ECS_CAMP_DECISION_CLOCK__;
const originalExpoCampDecisionClockEnv = process.env.EXPO_PUBLIC_ECS_CAMP_DECISION_CLOCK;
const originalCampDecisionClockEnv = process.env.ECS_CAMP_DECISION_CLOCK;
delete globalThis.__ECS_CAMP_DECISION_CLOCK__;
delete process.env.EXPO_PUBLIC_ECS_CAMP_DECISION_CLOCK;
delete process.env.ECS_CAMP_DECISION_CLOCK;
assert.strictEqual(isCampDecisionClockFeatureEnabled(), false, 'Camp Decision Clock should be off unless a runtime feature flag enables it.');
assert.strictEqual(
  isCampDecisionClockFeatureEnabled({ campDecisionClock: true }),
  true,
  'Explicit Camp Decision Clock feature flag should enable the module.',
);
assert.strictEqual(
  isCampDecisionClockFeatureEnabled({ campDecisionClock: false }),
  false,
  'Explicit disabled feature flag should keep guidance hidden.',
);
globalThis.__ECS_CAMP_DECISION_CLOCK__ = true;
assert.strictEqual(isCampDecisionClockFeatureEnabled(), true, 'Global runtime flag should enable Camp Decision Clock.');
if (originalCampDecisionClockGlobal === undefined) delete globalThis.__ECS_CAMP_DECISION_CLOCK__;
else globalThis.__ECS_CAMP_DECISION_CLOCK__ = originalCampDecisionClockGlobal;
if (originalExpoCampDecisionClockEnv === undefined) delete process.env.EXPO_PUBLIC_ECS_CAMP_DECISION_CLOCK;
else process.env.EXPO_PUBLIC_ECS_CAMP_DECISION_CLOCK = originalExpoCampDecisionClockEnv;
if (originalCampDecisionClockEnv === undefined) delete process.env.ECS_CAMP_DECISION_CLOCK;
else process.env.ECS_CAMP_DECISION_CLOCK = originalCampDecisionClockEnv;

const conservative = evaluateCampDecisionClock(baseInput());
assert.strictEqual(conservative.readiness, 'feature_flagged');
assert.strictEqual(conservative.state, 'continue');
assert.strictEqual(conservative.continueUntil, '2026-06-12T21:35:00.000Z');
assert.strictEqual(conservative.backupEndpointId, 'backup');
assert.strictEqual(conservative.emergencyViableUntil, '2026-06-13T01:05:00.000Z');
assert.ok(conservative.mainRisk.includes('fuel'), 'Main risk should identify the low resource margin that set the earliest cutoff.');
assert.ok(Array.isArray(conservative.decisionTrace), 'Decision Clock should expose deterministic decisionTrace proof.');
assert.strictEqual(conservative.winningConstraint.factor, 'fuel_margin');
assertTraceIncludes(conservative, [
  'planned_camp_arrival',
  'backup_endpoint_viability',
  'emergency_endpoint_viability',
  'usable_light',
  'setup_buffer',
  'delay_scenario',
  'route_difficulty',
  'weather_risk',
  'fuel_margin',
  'water_margin',
  'power_margin',
  'camp_confidence',
  'legal_access_confidence',
  'data_freshness',
  'provider_validation',
  'input_validation',
], 'Conservative decision');

const daylightSetupWinner = evaluateCampDecisionClock(baseInput({
  delayScenario: 'no_delay',
  daylightWindow: {
    sunsetAt: '2026-06-13T01:00:00.000Z',
    usableLightEndsAt: '2026-06-12T23:00:00.000Z',
  },
  eta: {
    plannedArrivalAt: '2026-06-12T22:30:00.000Z',
    latestSafeArrivalAt: '2026-06-13T02:00:00.000Z',
    confidence: 'medium',
    source: 'manual',
    updatedAt: '2026-06-12T20:45:00.000Z',
  },
  backupEndpoint: endpoint('backup', { latestDivertAt: '2026-06-13T01:30:00.000Z' }),
  margins: {
    fuel: margin('comfortable'),
    water: margin('comfortable', { unit: 'gallons' }),
    power: margin('comfortable', { unit: 'percent' }),
  },
  routeDifficulty: 'easy',
  weatherRisk: 'clear',
}));
assert.strictEqual(daylightSetupWinner.continueUntil, '2026-06-12T21:00:00.000Z');
assert.strictEqual(daylightSetupWinner.winningConstraint.factor, 'usable_light');

const backupWinner = evaluateCampDecisionClock(baseInput({
  delayScenario: 'no_delay',
  backupEndpoint: endpoint('backup', { latestDivertAt: '2026-06-12T21:20:00.000Z' }),
  margins: {
    fuel: margin('comfortable'),
    water: margin('comfortable', { unit: 'gallons' }),
    power: margin('comfortable', { unit: 'percent' }),
  },
  routeDifficulty: 'easy',
  weatherRisk: 'clear',
}));
assert.strictEqual(backupWinner.continueUntil, '2026-06-12T21:20:00.000Z');
assert.strictEqual(backupWinner.winningConstraint.factor, 'backup_endpoint_viability');

const freshBaseline = evaluateCampDecisionClock(baseInput({
  margins: {
    fuel: margin('comfortable'),
    water: margin('comfortable', { unit: 'gallons' }),
    power: margin('comfortable', { unit: 'percent' }),
  },
  routeDifficulty: 'easy',
  weatherRisk: 'clear',
}));
const staleUnvalidated = evaluateCampDecisionClock(baseInput({
  margins: {
    fuel: margin('comfortable'),
    water: margin('comfortable', { unit: 'gallons' }),
    power: margin('comfortable', { unit: 'percent' }),
  },
  routeDifficulty: 'easy',
  weatherRisk: 'clear',
  dataFreshness: 'stale',
  legalAccessConfidence: 'uncertain',
}));
assert.ok(
  Date.parse(staleUnvalidated.continueUntil) < Date.parse(freshBaseline.continueUntil),
  'Stale or unvalidated camp data should shorten the continue window.',
);
assert.ok(
  staleUnvalidated.warnings.some((warning) => warning.includes('stale')),
  'Stale camp data should remain visible in warnings.',
);
assert.ok(
  staleUnvalidated.warnings.some((warning) => warning.includes('Legal/access confidence is uncertain')),
  'Unvalidated legal/access confidence should be explicit.',
);
assert.ok(
  ![staleUnvalidated.mainRisk, ...staleUnvalidated.warnings].join(' ').toLowerCase().includes('legal campsite'),
  'Clock output must not present camp legality as certain.',
);
assert.strictEqual(staleUnvalidated.winningConstraint.factor, 'legal_access_confidence');
assertTraceIncludes(staleUnvalidated, ['legal_access_confidence', 'data_freshness'], 'Stale/unvalidated decision');

const unvalidatedProviderBackup = evaluateCampDecisionClock(baseInput({
  backupEndpoint: endpoint('backup', {
    latestDivertAt: '2026-06-13T01:00:00.000Z',
    source: { kind: 'provider', providerId: 'sample-provider', validated: false, updatedAt: '2026-06-12T20:45:00.000Z' },
    legalAccessConfidence: 'uncertain',
  }),
}));
assert.strictEqual(
  unvalidatedProviderBackup.state,
  'emergency_only',
  'Unvalidated provider-backed backup data must not improve the continue window.',
);
assert.strictEqual(unvalidatedProviderBackup.continueUntil, undefined);
assert.ok(
  unvalidatedProviderBackup.warnings.some((warning) => warning.includes('unvalidated provider')),
  'Provider validation limitation should be visible.',
);
assert.strictEqual(unvalidatedProviderBackup.winningConstraint.factor, 'backup_endpoint_viability');
assert.ok(
  unvalidatedProviderBackup.decisionTrace.some((item) => item.factor === 'provider_validation' && item.severity === 'critical'),
  'Unvalidated provider rejection should be visible in trace.',
);

const missingBackup = evaluateCampDecisionClock(baseInput({ backupEndpoint: undefined }));
assert.strictEqual(missingBackup.state, 'emergency_only');
assert.strictEqual(missingBackup.continueUntil, undefined);
assert.strictEqual(missingBackup.emergencyViableUntil, '2026-06-13T01:05:00.000Z');
assert.ok(missingBackup.warnings.some((warning) => warning.includes('Backup endpoint data is missing')));
assert.strictEqual(missingBackup.winningConstraint.factor, 'backup_endpoint_viability');

const missingEmergency = evaluateCampDecisionClock(baseInput({ emergencyEndpoint: undefined }));
assert.strictEqual(missingEmergency.emergencyViableUntil, undefined);
assert.ok(
  missingEmergency.warnings.some((warning) => warning.includes('Emergency endpoint data is missing')),
  'Missing emergency endpoint should be explicit.',
);

const expiredEmergency = evaluateCampDecisionClock(baseInput({
  emergencyEndpoint: endpoint('emergency', { viableUntil: '2026-06-12T21:00:00.000Z' }),
}));
assert.strictEqual(expiredEmergency.state, 'unavailable');
assert.strictEqual(expiredEmergency.continueUntil, undefined);
assert.strictEqual(expiredEmergency.emergencyViableUntil, undefined);
assert.strictEqual(expiredEmergency.winningConstraint.factor, 'emergency_endpoint_viability');
assert.ok(
  expiredEmergency.warnings.some((warning) => warning.includes('Emergency endpoint viability has expired')),
  'Expired emergency endpoint should not remain active.',
);

const pastCutoff = evaluateCampDecisionClock(baseInput({
  currentTime: '2026-06-12T21:40:00.000Z',
}));
assert.strictEqual(pastCutoff.state, 'divert_now');
assert.strictEqual(pastCutoff.continueUntil, '2026-06-12T21:35:00.000Z');

const atCutoff = evaluateCampDecisionClock(baseInput({
  currentTime: '2026-06-12T21:35:00.000Z',
}));
assert.strictEqual(atCutoff.state, 'divert_now', 'At continueUntil the clock should transition to divert-now.');

const invalidTimestamps = evaluateCampDecisionClock(baseInput({
  currentTime: 'not-a-date',
  daylightWindow: {
    sunsetAt: 'not-a-sunset',
    usableLightEndsAt: 'not-a-light-window',
  },
  eta: {
    plannedArrivalAt: 'bad-eta',
    latestSafeArrivalAt: 'bad-safe-arrival',
    travelTimeRemainingMinutes: null,
    confidence: 'unknown',
    source: 'manual',
  },
  routeProgress: {
    driveTimeRemainingMinutes: null,
    source: 'manual',
    confidence: 'unknown',
  },
  emergencyEndpoint: endpoint('emergency', { viableUntil: 'not-an-emergency-window' }),
}));
assert.strictEqual(invalidTimestamps.state, 'unavailable');
assert.strictEqual(invalidTimestamps.continueUntil, undefined);
assert.ok(
  invalidTimestamps.decisionTrace.some((item) => item.factor === 'input_validation' && item.severity === 'critical'),
  'Invalid timestamps should degrade safely with input validation trace.',
);

const contradictoryDaylight = evaluateCampDecisionClock(baseInput({
  daylightWindow: {
    sunsetAt: '2026-06-12T23:00:00.000Z',
    usableLightEndsAt: '2026-06-13T00:00:00.000Z',
  },
}));
assert.ok(
  contradictoryDaylight.warnings.some((warning) => warning.includes('Usable light window extends after sunset')),
  'Contradictory daylight windows should be visible.',
);

const recommendationClock = buildCampDecisionClockDecisionFromRecommendationSet({
  recommendedCamp: candidate('planned', 'Planned Ridge Camp'),
  backupCamp: candidate('backup', 'Backup Basin'),
  emergencyCamp: candidate('emergency', 'Emergency Trailhead'),
  rejectedCandidates: [],
  warnings: ['Decision point came from CampOps Safe End Point.'],
  assumptions: [],
  enrichmentsByCandidateId: {
    emergency: {
      etaIso: '2026-06-12T23:00:00.000Z',
    },
  },
  confidenceSummary: {
    level: 'medium',
    score: 74,
    reasons: [],
    missingDataFields: [],
  },
  decisionPoint: {
    kind: 'before_dark',
    decisionDeadlineIso: '2026-06-12T22:15:00.000Z',
    reason: 'Delay and arrival window make the last reasonable camp before dark the decision point.',
    recommendedAction: 'Diversion recommended toward Backup Basin; verify access before committing.',
    continueOption: {
      campId: 'planned',
      label: 'Planned Ridge Camp',
      etaIso: '2026-06-12T23:30:00.000Z',
      summary: 'Planned camp remains the continue option.',
    },
    divertOption: {
      campId: 'backup',
      label: 'Backup Basin',
      etaIso: '2026-06-12T23:00:00.000Z',
      summary: 'Backup Basin is the divert option.',
    },
    riskIfContinues: 'Continuing can push final approach after the recommended arrival window.',
    latestRecommendedTurnoff: null,
    confidence: 'medium',
  },
}, '2026-06-12T21:30:00.000Z');
assert.strictEqual(recommendationClock.state, 'continue');
assert.strictEqual(recommendationClock.continueUntil, '2026-06-12T22:15:00.000Z');
assert.strictEqual(recommendationClock.backupEndpointId, 'backup');
assert.strictEqual(recommendationClock.emergencyViableUntil, '2026-06-12T23:00:00.000Z');
assert.ok(recommendationClock.warnings.some((warning) => warning.includes('Safe End Point')));
assert.strictEqual(recommendationClock.winningConstraint.factor, 'backup_endpoint_viability');
assertTraceIncludes(recommendationClock, ['backup_endpoint_viability', 'emergency_endpoint_viability'], 'CampOps recommendation decision');

const recommendationClockPast = buildCampDecisionClockDecisionFromRecommendationSet({
  recommendedCamp: candidate('planned', 'Planned Ridge Camp'),
  backupCamp: candidate('backup', 'Backup Basin'),
  emergencyCamp: null,
  rejectedCandidates: [],
  warnings: [],
  assumptions: [],
  confidenceSummary: {
    level: 'medium',
    score: 74,
    reasons: [],
    missingDataFields: [],
  },
  decisionPoint: {
    kind: 'before_dark',
    decisionDeadlineIso: '2026-06-12T22:15:00.000Z',
    reason: 'Delay and arrival window make the last reasonable camp before dark the decision point.',
    recommendedAction: 'Diversion recommended toward Backup Basin; verify access before committing.',
    continueOption: null,
    divertOption: { campId: 'backup', label: 'Backup Basin', summary: 'Backup Basin is the divert option.' },
    riskIfContinues: 'Continuing can push final approach after the recommended arrival window.',
    latestRecommendedTurnoff: null,
    confidence: 'medium',
  },
}, '2026-06-12T22:16:00.000Z');
assert.strictEqual(recommendationClockPast.state, 'divert_now');
assert.strictEqual(recommendationClockPast.continueUntil, '2026-06-12T22:15:00.000Z');

const unavailable = campDecisionClockUnavailableDecision('No Safe End Point result is attached to Command Brief.');
assert.strictEqual(unavailable.state, 'unavailable');
assert.strictEqual(unavailable.readiness, 'feature_flagged');
assert.ok(unavailable.warnings[0].includes('No Safe End Point result'));
assert.strictEqual(unavailable.winningConstraint.factor, 'input_validation');
assert.ok(unavailable.decisionTrace.some((item) => item.factor === 'input_validation'));

console.log('Camp Decision Clock checks passed.');
