const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  prepareSmartResupplyEvaluationInput,
  resolveSmartResupplyEvaluationOrigin,
  SMART_RESUPPLY_PROVIDER_POLICY,
  SMART_RESUPPLY_QUERY_VARIANTS,
  smartResupplySelectionDisabledReason,
} = require(path.join(root, 'lib', 'tripBuilder', 'smartResupplyEvaluationInput.ts'));
const {
  buildTripBuilderSuggestedRouteHandoff,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderSuggestedRouteHandoff.ts'));

const explorerOrigin = { latitude: 37.81, longitude: -110.31, accuracyMeters: 14 };
const currentGpsOrigin = { latitude: 37.82, longitude: -110.32, accuracyMeters: 11 };
const preparedTrailheadStart = { latitude: 38.1, longitude: -110.05 };
const approachGeometry = [
  explorerOrigin,
  { latitude: 37.95, longitude: -110.17 },
  preparedTrailheadStart,
];

const deferredHandoff = buildTripBuilderSuggestedRouteHandoff({
  id: 'summary-route',
  name: 'Summary route',
  startLat: preparedTrailheadStart.latitude,
  startLng: preparedTrailheadStart.longitude,
}, {
  deferItineraryBuild: true,
  userLocation: explorerOrigin,
  createdAt: '2026-07-19T12:00:00.000Z',
});

assert.strictEqual(deferredHandoff.draftItinerary, null);
assert.deepStrictEqual(
  deferredHandoff.userLocation,
  explorerOrigin,
  'Deferred Explorer handoff must preserve its GPS origin without fetching or embedding detail geometry.',
);

assert.deepStrictEqual(
  resolveSmartResupplyEvaluationOrigin({
    handoffOrigin: deferredHandoff.userLocation,
    currentGpsOrigin,
  }),
  explorerOrigin,
  'The captured logical-search origin must remain stable instead of being replaced by later GPS jitter.',
);

const appInput = prepareSmartResupplyEvaluationInput({
  routeId: deferredHandoff.route.id,
  category: 'fuel',
  handoffOrigin: deferredHandoff.userLocation,
  currentGpsOrigin: null,
  preparedTrailheadStart,
  approachGeometry,
  fullTrailGeometry: [
    preparedTrailheadStart,
    { latitude: 39, longitude: -109 },
  ],
});
const harnessInput = prepareSmartResupplyEvaluationInput({
  routeId: deferredHandoff.route.id,
  category: 'fuel',
  currentGpsOrigin: explorerOrigin,
  preparedTrailheadStart,
  approachGeometry,
});

assert.strictEqual(appInput.status, 'ready');
assert.strictEqual(harnessInput.status, 'ready');
assert.deepStrictEqual(appInput.origin, explorerOrigin);
assert.deepStrictEqual(appInput.trailheadStart, preparedTrailheadStart);
assert.deepStrictEqual(appInput.approachGeometry, approachGeometry);
assert.strictEqual(appInput.endpointFingerprint, harnessInput.endpointFingerprint);
assert.strictEqual(appInput.approachGeometryFingerprint, harnessInput.approachGeometryFingerprint);
assert.deepStrictEqual(appInput.queryVariants, SMART_RESUPPLY_QUERY_VARIANTS.fuel);
assert.strictEqual(appInput.policy, SMART_RESUPPLY_PROVIDER_POLICY);
assert.strictEqual(appInput.policy.searchBoxLimit, 10);
assert.strictEqual(appInput.policy.searchRadiusMiles, 10);
assert.strictEqual(appInput.policy.maxApproachWindows, 12);
assert.strictEqual(appInput.policy.retrieveRequestBudget, 32);
assert.strictEqual(appInput.policy.optionLimit, 3);
assert.strictEqual(appInput.policy.directionsProfile, 'driving-traffic');

const supplyInput = prepareSmartResupplyEvaluationInput({
  routeId: deferredHandoff.route.id,
  category: 'food_supplies',
  handoffOrigin: deferredHandoff.userLocation,
  preparedTrailheadStart,
  approachGeometry,
});
assert.strictEqual(supplyInput.endpointFingerprint, appInput.endpointFingerprint);
assert.strictEqual(supplyInput.approachGeometryFingerprint, appInput.approachGeometryFingerprint);
assert.deepStrictEqual(supplyInput.queryVariants, SMART_RESUPPLY_QUERY_VARIANTS.food_supplies);

const hydratedSameApproach = prepareSmartResupplyEvaluationInput({
  routeId: deferredHandoff.route.id,
  category: 'fuel',
  handoffOrigin: deferredHandoff.userLocation,
  preparedTrailheadStart,
  approachGeometry: approachGeometry.map((point) => ({ ...point })),
});
assert.strictEqual(
  hydratedSameApproach.approachGeometryFingerprint,
  appInput.approachGeometryFingerprint,
  'Route-detail hydration must preserve a current result when the prepared approach identity is unchanged.',
);

assert.strictEqual(
  prepareSmartResupplyEvaluationInput({
    routeId: 'missing-origin',
    category: 'fuel',
    preparedTrailheadStart,
    approachGeometry,
  }).status,
  'missing_origin',
);
assert.strictEqual(
  prepareSmartResupplyEvaluationInput({
    routeId: 'missing-entry',
    category: 'fuel',
    currentGpsOrigin: explorerOrigin,
    approachGeometry,
  }).status,
  'missing_prepared_entry',
);
assert.strictEqual(
  prepareSmartResupplyEvaluationInput({
    routeId: 'waiting-approach',
    category: 'fuel',
    currentGpsOrigin: explorerOrigin,
    preparedTrailheadStart,
  }).status,
  'awaiting_approach',
);

assert.strictEqual(
  smartResupplySelectionDisabledReason({
    preference: 'fuel_only',
    pending: false,
    missingCategories: ['fuel'],
  }),
  'Select a fuel stop or choose No for Smart Resupply.',
);
assert.strictEqual(
  smartResupplySelectionDisabledReason({
    preference: 'fuel_only',
    pending: false,
    missingCategories: [],
  }),
  null,
  'Selecting a valid fuel option must satisfy the Smart Resupply prerequisite.',
);
assert.strictEqual(
  smartResupplySelectionDisabledReason({
    preference: 'no',
    pending: false,
    missingCategories: ['fuel'],
  }),
  null,
  'The supported No path must keep Smart Resupply optional when the operator selects it.',
);

console.log('Trip Builder Smart Resupply release input checks passed.');
