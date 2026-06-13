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

const conservative = evaluateCampDecisionClock(baseInput());
assert.strictEqual(conservative.readiness, 'feature_flagged');
assert.strictEqual(conservative.state, 'continue');
assert.strictEqual(conservative.continueUntil, '2026-06-12T21:35:00.000Z');
assert.strictEqual(conservative.backupEndpointId, 'backup');
assert.strictEqual(conservative.emergencyViableUntil, '2026-06-13T01:05:00.000Z');
assert.ok(conservative.mainRisk.includes('fuel'), 'Main risk should identify the low resource margin that set the earliest cutoff.');

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

const missingBackup = evaluateCampDecisionClock(baseInput({ backupEndpoint: undefined }));
assert.strictEqual(missingBackup.state, 'emergency_only');
assert.strictEqual(missingBackup.continueUntil, undefined);
assert.strictEqual(missingBackup.emergencyViableUntil, '2026-06-13T01:05:00.000Z');
assert.ok(missingBackup.warnings.some((warning) => warning.includes('Backup endpoint data is missing')));

const pastCutoff = evaluateCampDecisionClock(baseInput({
  currentTime: '2026-06-12T21:40:00.000Z',
}));
assert.strictEqual(pastCutoff.state, 'divert_now');
assert.strictEqual(pastCutoff.continueUntil, '2026-06-12T21:35:00.000Z');

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

console.log('Camp Decision Clock checks passed.');
