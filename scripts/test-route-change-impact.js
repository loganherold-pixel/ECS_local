/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const enginePath = path.join(root, 'lib', 'routeImpact', 'routeChangeImpact.ts');
const adapterPath = path.join(root, 'lib', 'routeImpact', 'routeBuilderImpactAdapter.ts');
const configPath = path.join(root, 'lib', 'routeImpact', 'routeChangeImpactConfig.ts');

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
  ROUTE_IMPACT_THRESHOLDS,
  clearRouteImpactComparisonCache,
  compareRoutePlans,
} = require(enginePath);
const { buildRouteBuilderImpactPreview } = require(adapterPath);
const { isRouteChangeImpactPreviewEnabled } = require(configPath);

const NOW = '2026-07-12T18:00:00.000Z';

function source(overrides = {}) {
  return {
    id: overrides.id ?? 'route-impact-source',
    origin: overrides.origin ?? 'live',
    authority: overrides.authority ?? 'Deterministic test source',
    provider: overrides.provider ?? null,
    observedAt: Object.prototype.hasOwnProperty.call(overrides, 'observedAt')
      ? overrides.observedAt
      : NOW,
    fetchedAt: overrides.fetchedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    confidence: overrides.confidence ?? 'high',
    coverage: overrides.coverage ?? 'complete',
    availability: overrides.availability ?? 'usable',
    conflict: overrides.conflict ?? false,
    warningCodes: overrides.warningCodes ?? [],
  };
}

function measure(value, options = {}) {
  return {
    value,
    displayValue: options.displayValue ?? (value == null ? null : String(value)),
    unit: options.unit ?? null,
    preference: options.preference ?? 'higher_is_better',
    sourceTruth: options.sourceTruth ?? source({ id: options.sourceId }),
    freshnessPolicyKey: options.policyKey ?? 'default',
    missingInputs: options.missingInputs ?? [],
    requiredForSafety: options.requiredForSafety ?? false,
    detail: options.detail ?? null,
  };
}

function plan(id, measures, kind = 'baseline') {
  return {
    id,
    label: id,
    kind,
    geometryFingerprint: `${id}-geometry`,
    measures,
    warnings: [],
  };
}

function compare(baselineMeasures, candidateMeasures) {
  return compareRoutePlans({
    baseline: plan('baseline', baselineMeasures),
    candidate: plan('candidate', candidateMeasures, 'alternate'),
    now: NOW,
  });
}

assert.strictEqual(ROUTE_IMPACT_THRESHOLDS.drive_time.absolute, 300);
assert.strictEqual(ROUTE_IMPACT_THRESHOLDS.fuel_margin.absolute, 5);
assert.strictEqual(ROUTE_IMPACT_THRESHOLDS.offline_coverage.absolute, 5);

const improvesEtaFuel = compare(
  {
    drive_time: measure(3600, { displayValue: '1 hr', preference: 'lower_is_better' }),
    fuel_margin: measure(20, { displayValue: '20 mi', requiredForSafety: true }),
  },
  {
    drive_time: measure(3000, { displayValue: '50 min', preference: 'lower_is_better' }),
    fuel_margin: measure(30, { displayValue: '30 mi', requiredForSafety: true }),
  },
);
assert.strictEqual(improvesEtaFuel.outcome, 'improves');
assert.deepStrictEqual(
  improvesEtaFuel.materialCategories.filter((item) => item.category !== 'source_quality').map((item) => item.direction),
  ['improves', 'improves'],
);
assert.strictEqual(improvesEtaFuel.mutationAllowed, false);

const exactBoundary = compare(
  { drive_time: measure(3600, { preference: 'lower_is_better' }) },
  { drive_time: measure(3300, { preference: 'lower_is_better' }) },
);
assert.strictEqual(exactBoundary.categories.find((item) => item.category === 'drive_time').materiality, 'material');

const belowBoundary = compare(
  { drive_time: measure(3600, { preference: 'lower_is_better' }) },
  { drive_time: measure(3301, { preference: 'lower_is_better' }) },
);
assert.strictEqual(belowBoundary.categories.find((item) => item.category === 'drive_time').direction, 'unchanged');

const mixed = compare(
  {
    drive_time: measure(3600, { preference: 'lower_is_better' }),
    fuel_margin: measure(30),
  },
  {
    drive_time: measure(3000, { preference: 'lower_is_better' }),
    fuel_margin: measure(20),
  },
);
assert.strictEqual(mixed.outcome, 'mixed');

const missingWeather = compare(
  { weather_exposure: measure(4, { displayValue: 'clear', requiredForSafety: true, policyKey: 'weather_forecast' }) },
  { weather_exposure: measure(null, {
    displayValue: 'Unknown',
    requiredForSafety: true,
    policyKey: 'weather_forecast',
    missingInputs: ['candidate weather corridor'],
    sourceTruth: source({ origin: 'unavailable', availability: 'unavailable', confidence: 'unknown' }),
  }) },
);
assert.strictEqual(missingWeather.outcome, 'unknown');
assert.ok(missingWeather.requiredUnknownCategories.includes('weather_exposure'));
assert.ok(missingWeather.categories.find((item) => item.category === 'weather_exposure').reason.includes('candidate weather corridor'));

const missingLegal = compare(
  { legal_access: measure(3, { requiredForSafety: true, policyKey: 'route_legal_access_evidence' }) },
  { legal_access: measure(null, {
    requiredForSafety: true,
    policyKey: 'route_legal_access_evidence',
    missingInputs: ['candidate legal/access evidence'],
    sourceTruth: source({ origin: 'unavailable', availability: 'unavailable', confidence: 'unknown' }),
  }) },
);
assert.strictEqual(missingLegal.outcome, 'unknown');
assert.ok(missingLegal.requiredUnknownCategories.includes('legal_access'));

const staleClosure = compare(
  { current_conditions: measure(3, {
    displayValue: 'No known closure',
    requiredForSafety: true,
    policyKey: 'condition_closure_advisory',
  }) },
  { current_conditions: measure(3, {
    displayValue: 'No known closure',
    requiredForSafety: true,
    policyKey: 'condition_closure_advisory',
    sourceTruth: source({ observedAt: '2026-07-10T18:00:00.000Z', origin: 'cached' }),
  }) },
);
const closureCategory = staleClosure.categories.find((item) => item.category === 'current_conditions');
assert.strictEqual(closureCategory.direction, 'unknown');
assert.ok(['stale', 'expired'].includes(closureCategory.sourceTruth.candidate.freshness));
assert.strictEqual(staleClosure.outcome, 'unknown');

const offlineRegression = compare(
  { offline_coverage: measure(100, { displayValue: 'Ready', requiredForSafety: true, policyKey: 'offline_map_route_package', sourceTruth: source({ origin: 'cached' }) }) },
  { offline_coverage: measure(80, { displayValue: '80% cached', requiredForSafety: true, policyKey: 'offline_map_route_package', sourceTruth: source({ origin: 'cached', coverage: 'partial' }) }) },
);
assert.strictEqual(offlineRegression.outcome, 'worsens');
assert.strictEqual(offlineRegression.categories.find((item) => item.category === 'offline_coverage').direction, 'worsens');

const campNonviable = compare(
  { camp_viability: measure(4, { displayValue: 'Primary', requiredForSafety: true }) },
  { camp_viability: measure(2, { displayValue: 'Emergency only', requiredForSafety: true }) },
);
assert.strictEqual(campNonviable.outcome, 'worsens');

const vehicleWorsens = compare(
  { vehicle_fit: measure(4, { displayValue: 'Good', requiredForSafety: true, policyKey: 'vehicle_profile' }) },
  { vehicle_fit: measure(2, { displayValue: 'Limited', requiredForSafety: true, policyKey: 'vehicle_profile' }) },
);
assert.strictEqual(vehicleWorsens.outcome, 'worsens');

const trailerWorsens = compare(
  { trailer_fit: measure(4, { displayValue: 'Supported', requiredForSafety: true, policyKey: 'vehicle_profile' }) },
  { trailer_fit: measure(1, { displayValue: 'Constraint exceeded', requiredForSafety: true, policyKey: 'vehicle_profile' }) },
);
assert.strictEqual(trailerWorsens.outcome, 'worsens');
assert.strictEqual(trailerWorsens.categories.find((item) => item.category === 'trailer_fit').direction, 'worsens');

const bailoutImproves = compare(
  { bailout_access: measure(1, { displayValue: 'Limited', requiredForSafety: true }) },
  { bailout_access: measure(3, { displayValue: 'Multiple routed exits', requiredForSafety: true }) },
);
assert.strictEqual(bailoutImproves.outcome, 'improves');

const conflict = compare(
  { legal_access: measure(3, { requiredForSafety: true, policyKey: 'route_legal_access_evidence' }) },
  { legal_access: measure(4, {
    requiredForSafety: true,
    policyKey: 'route_legal_access_evidence',
    sourceTruth: source({ conflict: true, warningCodes: ['provider_conflict'] }),
  }) },
);
assert.strictEqual(conflict.outcome, 'unknown');
assert.strictEqual(conflict.categories.find((item) => item.category === 'legal_access').sourceTruth.candidate.conflict, true);

clearRouteImpactComparisonCache();
const first = compare(
  { distance: measure(20_000, { preference: 'lower_is_better' }) },
  { distance: measure(15_000, { preference: 'lower_is_better' }) },
);
const second = compare(
  { distance: measure(20_000, { preference: 'lower_is_better' }) },
  { distance: measure(15_000, { preference: 'lower_is_better' }) },
);
assert.strictEqual(second, first, 'Identical semantic comparisons should reuse the memoized result.');
assert.strictEqual(second.fingerprint, first.fingerprint);

const baselineSnapshot = {
  sessionId: 'session-1',
  lifecycle: 'active',
  source: 'road',
  routeId: 'active-route',
  routeTitle: 'Active Route',
  routeSubtitle: null,
  statusLabel: 'Active',
  instruction: null,
  routePoints: [
    { lat: 40, lng: -105 },
    { lat: 40, lng: -104.9 },
  ],
  progressPoints: [],
  currentLocation: { latitude: 40, longitude: -105 },
  headingDeg: null,
  remainingDistanceM: 12_000,
  remainingDurationS: 1800,
  etaIso: '2026-07-12T18:30:00.000Z',
  progressPercent: 0,
  nextInstructionDistanceM: null,
  isRerouting: false,
  isOffRoute: false,
  offRouteDistanceM: null,
  routeStatusKind: 'nominal',
  updatedAt: NOW,
};

const adapterResult = buildRouteBuilderImpactPreview({
  baseline: baselineSnapshot,
  candidate: {
    label: 'Short alternate',
    segments: [{
      id: 'segment-1',
      coordinates: [[-105, 40], [-104.95, 40], [-104.9, 40]],
      snapConfidence: 'high',
      snapStatus: 'snapped',
      snapProvider: 'ecs_route_geometry',
      buildSource: { kind: 'ecs_route_geometry', sourceLabel: 'Local route geometry', confidence: 'high' },
    }],
  },
  vehicle: {
    activeVehicleId: 'vehicle-1',
    currentFuelGallons: 10,
    averageMpg: 15,
    updatedAt: NOW,
    confidence: 'high',
    vehicleFitLabel: 'Good',
    trailerAttached: false,
  },
  weather: { source: 'cache_fresh', observedAt: NOW, hasData: true, worstHazard: 'clear' },
  offline: { routeSyncHydrated: true, downloadedRoutes: [], tileRegions: [], tileSyncJobs: [] },
  now: NOW,
});
assert.strictEqual(adapterResult.activeGuidanceProtected, true);
assert.strictEqual(adapterResult.routeEndpointsComparable, true);
assert.strictEqual(adapterResult.result.mutationAllowed, false);
assert.strictEqual(
  adapterResult.result.categories.find((item) => item.category === 'distance').direction,
  'improves',
);
assert.strictEqual(
  adapterResult.result.outcome,
  'unknown',
  'Candidate corridor safety gaps must prevent a shorter route from being labeled safer.',
);
assert.ok(adapterResult.activeGuidanceMessage.includes('replacement confirmation'));

const extensionResult = buildRouteBuilderImpactPreview({
  baseline: baselineSnapshot,
  candidate: {
    label: 'Route extension',
    activeGuidanceExtension: true,
    segments: [{
      id: 'extension-1',
      coordinates: [[-104.9, 40], [-104.8, 40]],
      snapConfidence: 'high',
      snapStatus: 'snapped',
      snapProvider: 'ecs_route_geometry',
    }],
  },
  now: NOW,
});
assert.strictEqual(extensionResult.routeEndpointsComparable, true);
assert.strictEqual(
  extensionResult.result.categories.find((item) => item.category === 'distance').direction,
  'worsens',
);

assert.strictEqual(isRouteChangeImpactPreviewEnabled({ routeChangeImpactPreviewEnabled: false }), false);
assert.strictEqual(isRouteChangeImpactPreviewEnabled({ routeChangeImpactPreviewEnabled: true }), true);

const engineSource = fs.readFileSync(enginePath, 'utf8');
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
for (const sourceText of [engineSource, adapterSource]) {
  assert.ok(!sourceText.includes('routeStore'));
  assert.ok(!sourceText.includes('navigateRouteSessionStore.'));
  assert.ok(!sourceText.includes('saveNavigationHandoffPayload'));
  assert.ok(!sourceText.includes('fetch('), 'Comparator and adapter must not call providers.');
}
assert.ok(!/openai|anthropic|aiOrchestrator|useECSAI/i.test(engineSource), 'AI must not own route impact outcomes.');

console.log('Route Change Impact comparator and adapter tests passed.');
