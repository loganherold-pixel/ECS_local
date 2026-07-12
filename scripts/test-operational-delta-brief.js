/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const enginePath = path.join(root, 'lib', 'readiness', 'operationalDeltaBrief.ts');

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
  OPERATIONAL_DELTA_NOISE_THRESHOLDS,
  OPERATIONAL_DELTA_SCHEMA_VERSION,
  buildOperationalDeltaResult,
  guardOperationalDeltaAiSummary,
} = require(enginePath);

const baselineAt = '2026-07-12T17:00:00.000Z';
const currentAt = '2026-07-12T17:20:00.000Z';

function source(overrides = {}) {
  return {
    id: overrides.id ?? 'source-main',
    origin: overrides.origin ?? 'live',
    authority: overrides.authority ?? 'ECS deterministic source',
    provider: overrides.provider ?? null,
    observedAt: Object.prototype.hasOwnProperty.call(overrides, 'observedAt')
      ? overrides.observedAt
      : baselineAt,
    fetchedAt: overrides.fetchedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    confidence: overrides.confidence ?? 'high',
    coverage: overrides.coverage ?? 'complete',
    availability: overrides.availability ?? 'usable',
    conflict: overrides.conflict ?? false,
    warningCodes: overrides.warningCodes ?? [],
  };
}

function fact(overrides = {}) {
  return {
    id: overrides.id ?? 'assessment:score',
    domain: overrides.domain ?? 'assessment',
    label: overrides.label ?? 'Assessment score',
    kind: overrides.kind ?? 'metric',
    value: Object.prototype.hasOwnProperty.call(overrides, 'value') ? overrides.value : 80,
    displayValue: overrides.displayValue ?? null,
    unit: overrides.unit ?? 'points',
    thresholdKey: overrides.thresholdKey ?? 'assessment_score_points',
    direction: overrides.direction ?? 'higher_is_better',
    rank: overrides.rank ?? null,
    required: overrides.required ?? false,
    severityOnWorsen: overrides.severityOnWorsen ?? 'watch',
    severityOnMissing: overrides.severityOnMissing ?? 'caution',
    blockerSeverity: overrides.blockerSeverity ?? 'critical',
    recommendedAction: overrides.recommendedAction ?? null,
    sourceTruth: overrides.sourceTruth ?? source(),
    freshnessPolicyKey: overrides.freshnessPolicyKey ?? 'default',
    dependencies: overrides.dependencies ?? ['Test decision'],
  };
}

function snapshot(capturedAt, facts, overrides = {}) {
  return {
    id: overrides.id ?? `snapshot:${capturedAt}`,
    schemaVersion: OPERATIONAL_DELTA_SCHEMA_VERSION,
    expeditionId: overrides.expeditionId ?? 'trip-alpha',
    routeId: overrides.routeId ?? 'route-alpha',
    capturedAt,
    baselineKind: overrides.baselineKind ?? null,
    label: overrides.label ?? null,
    facts,
  };
}

function compare(previousFacts, currentFacts, overrides = {}) {
  return buildOperationalDeltaResult({
    baseline: snapshot(baselineAt, previousFacts, { baselineKind: 'departure' }),
    current: snapshot(currentAt, currentFacts),
    baselineKind: 'departure',
    suppressedFingerprints: overrides.suppressedFingerprints ?? [],
  });
}

assert.strictEqual(
  OPERATIONAL_DELTA_NOISE_THRESHOLDS.camp_eta_minutes.absolute,
  10,
  'Camp ETA threshold should be centralized at ten minutes.',
);
assert.strictEqual(
  OPERATIONAL_DELTA_NOISE_THRESHOLDS.fuel_margin_miles.absolute,
  5,
  'Fuel margin threshold should be centralized at five miles.',
);

const noChange = compare(
  [fact()],
  [fact({ sourceTruth: source({ observedAt: currentAt }) })],
);
assert.strictEqual(noChange.status, 'ready');
assert.strictEqual(noChange.deltas.length, 0, 'Timestamp-only source refreshes must not emit deltas.');

const jitter = compare(
  [fact({ value: 80 })],
  [fact({ value: 84.9, sourceTruth: source({ observedAt: currentAt }) })],
);
assert.strictEqual(jitter.deltas.length, 0, 'Values below a domain threshold must be suppressed as noise.');

const exactBoundary = compare(
  [fact({ value: 80 })],
  [fact({ value: 85, sourceTruth: source({ observedAt: currentAt }) })],
);
assert.strictEqual(exactBoundary.deltas.length, 1, 'The exact threshold boundary must be material.');

const newBlocker = compare(
  [],
  [fact({
    id: 'blocker:route-closure',
    domain: 'route',
    label: 'Official route closure',
    kind: 'blocker',
    value: true,
    thresholdKey: null,
    blockerSeverity: 'critical',
    freshnessPolicyKey: 'condition_closure_advisory',
  })],
);
assert.strictEqual(newBlocker.deltas.length, 1);
assert.strictEqual(newBlocker.deltas[0].category, 'new_blocker');
assert.strictEqual(newBlocker.deltas[0].severity, 'critical');

const fuelImproved = compare(
  [fact({
    id: 'fuel:margin', domain: 'fuel', label: 'Fuel margin', value: 18,
    thresholdKey: 'fuel_margin_miles', unit: 'mi', freshnessPolicyKey: 'vehicle_telemetry',
  })],
  [fact({
    id: 'fuel:margin', domain: 'fuel', label: 'Fuel margin', value: 26,
    thresholdKey: 'fuel_margin_miles', unit: 'mi', freshnessPolicyKey: 'vehicle_telemetry',
    sourceTruth: source({ observedAt: currentAt }),
  })],
);
assert.strictEqual(fuelImproved.deltas[0].category, 'improved_condition');
assert.ok(fuelImproved.deltas[0].summary.includes('18 mi'));
assert.ok(fuelImproved.deltas[0].summary.includes('26 mi'));

const baselineEtaMinutes = Date.parse('2026-07-12T20:00:00.000Z') / 60_000;
const campEtaWorse = compare(
  [fact({
    id: 'camp:eta', domain: 'camp', label: 'Camp ETA', value: baselineEtaMinutes,
    displayValue: '1:00 PM', unit: 'min epoch', thresholdKey: 'camp_eta_minutes',
    direction: 'lower_is_better', severityOnWorsen: 'caution',
  })],
  [fact({
    id: 'camp:eta', domain: 'camp', label: 'Camp ETA', value: baselineEtaMinutes + 10,
    displayValue: '1:10 PM', unit: 'min epoch', thresholdKey: 'camp_eta_minutes',
    direction: 'lower_is_better', severityOnWorsen: 'caution',
    sourceTruth: source({ observedAt: currentAt }),
  })],
);
assert.strictEqual(campEtaWorse.deltas[0].category, 'worsened_condition');
assert.strictEqual(campEtaWorse.deltas[0].severity, 'caution');

const convoyObservedAt = '2026-07-12T16:59:00.000Z';
const staleConvoy = buildOperationalDeltaResult({
  baseline: snapshot(baselineAt, [fact({
    id: 'convoy:tail-location', domain: 'convoy', label: 'Tail vehicle location', kind: 'identity',
    value: 'tracking', thresholdKey: null, freshnessPolicyKey: 'convoy_member_location', required: true,
    sourceTruth: source({ id: 'tail-location', observedAt: convoyObservedAt }),
  })]),
  current: snapshot('2026-07-12T17:12:00.000Z', [fact({
    id: 'convoy:tail-location', domain: 'convoy', label: 'Tail vehicle location', kind: 'identity',
    value: 'tracking', thresholdKey: null, freshnessPolicyKey: 'convoy_member_location', required: true,
    sourceTruth: source({ id: 'tail-location', observedAt: convoyObservedAt }),
  })]),
  baselineKind: 'departure',
});
assert.strictEqual(staleConvoy.deltas.length, 1);
assert.strictEqual(staleConvoy.deltas[0].category, 'newly_stale');
assert.ok(staleConvoy.deltas[0].summary.includes('origin is unchanged'));

const weatherExpiresAt = '2026-07-12T17:10:00.000Z';
const expiredCachedWeather = buildOperationalDeltaResult({
  baseline: snapshot(baselineAt, [fact({
    id: 'weather:last-good', domain: 'weather', label: 'Weather forecast', kind: 'identity',
    value: 'last good forecast', thresholdKey: null, freshnessPolicyKey: 'weather_forecast', required: true,
    sourceTruth: source({
      id: 'weather-last-good', origin: 'cached', observedAt: baselineAt,
      expiresAt: weatherExpiresAt, availability: 'usable',
    }),
  })]),
  current: snapshot(currentAt, [fact({
    id: 'weather:last-good', domain: 'weather', label: 'Weather forecast', kind: 'identity',
    value: 'last good forecast', thresholdKey: null, freshnessPolicyKey: 'weather_forecast', required: true,
    sourceTruth: source({
      id: 'weather-last-good', origin: 'cached', observedAt: baselineAt,
      expiresAt: weatherExpiresAt, availability: 'usable',
    }),
  })]),
  baselineKind: 'departure',
});
assert.strictEqual(expiredCachedWeather.deltas[0].category, 'newly_stale');
assert.strictEqual(expiredCachedWeather.deltas[0].evidence.current.origin, 'cached');
assert.strictEqual(expiredCachedWeather.deltas[0].evidence.current.freshness, 'expired');
assert.strictEqual(expiredCachedWeather.deltas[0].evidence.current.availability, 'degraded');

const dedupedWeatherSource = buildOperationalDeltaResult({
  baseline: snapshot(baselineAt, ['risk', 'wind'].map((id) => fact({
    id: `weather:${id}`,
    domain: 'weather',
    label: `Weather ${id}`,
    kind: 'identity',
    value: 'unchanged',
    thresholdKey: null,
    freshnessPolicyKey: 'weather_forecast',
    sourceTruth: source({ id: 'shared-weather-source', origin: 'cached', observedAt: baselineAt, expiresAt: weatherExpiresAt }),
  }))),
  current: snapshot(currentAt, ['risk', 'wind'].map((id) => fact({
    id: `weather:${id}`,
    domain: 'weather',
    label: `Weather ${id}`,
    kind: 'identity',
    value: 'unchanged',
    thresholdKey: null,
    freshnessPolicyKey: 'weather_forecast',
    sourceTruth: source({ id: 'shared-weather-source', origin: 'cached', observedAt: baselineAt, expiresAt: weatherExpiresAt }),
  }))),
  baselineKind: 'departure',
});
assert.strictEqual(
  dedupedWeatherSource.deltas.filter((delta) => delta.category === 'newly_stale').length,
  1,
  'Multiple facts backed by one source should emit one source-quality transition.',
);

const offlineIncomplete = compare(
  [fact({
    id: 'offline:coverage', domain: 'offline', label: 'Offline package completeness', value: 100,
    unit: '%', thresholdKey: 'offline_coverage_percent', freshnessPolicyKey: 'offline_map_route_package',
  })],
  [fact({
    id: 'offline:coverage', domain: 'offline', label: 'Offline package completeness', value: 90,
    unit: '%', thresholdKey: 'offline_coverage_percent', freshnessPolicyKey: 'offline_map_route_package',
    sourceTruth: source({ origin: 'cached', observedAt: currentAt, coverage: 'partial', availability: 'degraded' }),
  })],
);
assert.ok(
  offlineIncomplete.deltas.some((delta) => delta.category === 'worsened_condition'),
  'Offline package regression should be visible as worsened.',
);

const conflictBegins = compare(
  [fact({ id: 'route:access', domain: 'route', label: 'Route access evidence', kind: 'identity', value: 'open', thresholdKey: null,
    freshnessPolicyKey: 'route_legal_access_evidence', sourceTruth: source({ id: 'route-access' }) })],
  [fact({ id: 'route:access', domain: 'route', label: 'Route access evidence', kind: 'identity', value: 'open', thresholdKey: null,
    freshnessPolicyKey: 'route_legal_access_evidence', sourceTruth: source({ id: 'route-access', observedAt: currentAt, conflict: true, warningCodes: ['official_conflict'] }) })],
);
assert.strictEqual(conflictBegins.deltas[0].category, 'worsened_condition');
assert.ok(conflictBegins.deltas[0].summary.includes('conflicting source evidence'));

const conflictResolves = compare(
  [fact({ id: 'route:access', domain: 'route', label: 'Route access evidence', kind: 'identity', value: 'open', thresholdKey: null,
    freshnessPolicyKey: 'route_legal_access_evidence', sourceTruth: source({ id: 'route-access', conflict: true }) })],
  [fact({ id: 'route:access', domain: 'route', label: 'Route access evidence', kind: 'identity', value: 'open', thresholdKey: null,
    freshnessPolicyKey: 'route_legal_access_evidence', sourceTruth: source({ id: 'route-access', observedAt: currentAt, conflict: false }) })],
);
assert.strictEqual(conflictResolves.deltas[0].category, 'restored_source');

const manualChange = compare(
  [fact({
    id: 'water:manual', domain: 'water', label: 'Manual water state', value: 8,
    unit: 'gal', thresholdKey: 'water_gallons', freshnessPolicyKey: 'manual_user_state',
    sourceTruth: source({ id: 'manual-water', origin: 'manual', observedAt: baselineAt, confidence: 'medium' }),
  })],
  [fact({
    id: 'water:manual', domain: 'water', label: 'Manual water state', value: 10,
    unit: 'gal', thresholdKey: 'water_gallons', freshnessPolicyKey: 'manual_user_state',
    sourceTruth: source({ id: 'manual-water', origin: 'manual', observedAt: currentAt, confidence: 'medium' }),
  })],
);
assert.strictEqual(manualChange.deltas[0].category, 'improved_condition');
assert.strictEqual(manualChange.deltas[0].evidence.current.origin, 'manual');

const missingBaseline = buildOperationalDeltaResult({
  baseline: null,
  current: snapshot(currentAt, [fact()]),
  baselineKind: 'last_stop',
});
assert.strictEqual(missingBaseline.status, 'no_baseline');
assert.ok(missingBaseline.summary.includes('last stop'));

const suppressible = exactBoundary.deltas[0].fingerprint;
const suppressed = compare(
  [fact({ value: 80 })],
  [fact({ value: 85, sourceTruth: source({ observedAt: currentAt }) })],
  { suppressedFingerprints: [suppressible] },
);
assert.strictEqual(suppressed.allDeltas.length, 1);
assert.strictEqual(suppressed.deltas.length, 0);
assert.strictEqual(suppressed.suppressedCount, 1, 'Stable fingerprints should suppress exact duplicate state.');

const aiInventsExtra = guardOperationalDeltaAiSummary(fuelImproved, {
  summary: 'Fuel improved and a route closure appeared.',
  orderedFingerprints: [...fuelImproved.deltas.map((delta) => delta.fingerprint), 'opdelta:invented'],
});
assert.strictEqual(aiInventsExtra.accepted, false);
assert.strictEqual(aiInventsExtra.summary, fuelImproved.summary);

const aiInventsTextWithKnownIds = guardOperationalDeltaAiSummary(fuelImproved, {
  summary: 'Fuel improved, and the route is legally open.',
  orderedFingerprints: fuelImproved.deltas.map((delta) => delta.fingerprint),
});
assert.strictEqual(
  aiInventsTextWithKnownIds.accepted,
  false,
  'Known delta IDs must not authorize invented free-form claims.',
);

const exactDeterministicSummary = guardOperationalDeltaAiSummary(fuelImproved, {
  summary: fuelImproved.summary,
  orderedFingerprints: fuelImproved.deltas.map((delta) => delta.fingerprint),
});
assert.strictEqual(exactDeterministicSummary.accepted, true);

const aiSafetyOverride = guardOperationalDeltaAiSummary(newBlocker, {
  summary: 'Everything is fine.',
  orderedFingerprints: newBlocker.deltas.map((delta) => delta.fingerprint),
});
assert.strictEqual(aiSafetyOverride.accepted, false, 'AI summaries must be rejected for safety-critical deltas.');

const rerun = compare(
  [fact({ value: 80 })],
  [fact({ value: 85, sourceTruth: source({ observedAt: currentAt }) })],
);
assert.strictEqual(
  rerun.deltas[0].fingerprint,
  exactBoundary.deltas[0].fingerprint,
  'Equivalent comparisons should produce stable fingerprints across runs.',
);

console.log('Operational Delta Brief engine tests passed.');
