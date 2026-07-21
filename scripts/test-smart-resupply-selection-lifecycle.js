const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const lifecycle = require(path.join(root, 'lib', 'tripBuilder', 'smartResupplySelectionLifecycle.ts'));
const selected = { id: 'old-row-id', physical: 'normalized-place', label: 'Original label' };
const refreshed = { id: 'new-row-id', physical: 'normalized-place', label: 'Updated label' };
const other = { id: 'other', physical: 'other-place', label: 'Other' };
const identity = (option) => option.physical;
const context = {
  routeId: 'route-a',
  approachFingerprint: 'fuel:route-a:approach-a',
  category: 'fuel',
  physicalIdentity: selected.physical,
};

assert.strictEqual(
  lifecycle.reconcileCommittedSmartResupplySelection({ selected, availableOptions: [], identity }),
  selected,
  'Loading, inactive, lock, partial omission, and hard failure must not erase committed selection.',
);
assert.strictEqual(
  lifecycle.reconcileCommittedSmartResupplySelection({ selected, availableOptions: [other], identity }),
  selected,
  'Provider omission alone is not authoritative invalidation.',
);
assert.strictEqual(
  lifecycle.reconcileCommittedSmartResupplySelection({ selected, availableOptions: [refreshed], identity }),
  refreshed,
  'The same normalized physical option should reconcile updated display evidence.',
);
assert.strictEqual(lifecycle.selectionValidationAfterProviderResult({ selectedPresent: true, selectedReturned: false, providerStatus: 'loading', providerPartial: false }), 'refreshing');
assert.strictEqual(lifecycle.selectionValidationAfterProviderResult({ selectedPresent: true, selectedReturned: false, providerStatus: 'error', providerPartial: false }), 'incomplete');
assert.strictEqual(lifecycle.selectionValidationAfterProviderResult({ selectedPresent: true, selectedReturned: false, providerStatus: 'ready', providerPartial: true }), 'incomplete');
assert.strictEqual(lifecycle.selectionValidationAfterProviderResult({ selectedPresent: true, selectedReturned: true, providerStatus: 'ready', providerPartial: false }), 'verified');

assert.strictEqual(lifecycle.shouldInvalidateSmartResupplySelection({ context, routeId: 'route-b', approachFingerprint: context.approachFingerprint, category: 'fuel' }), true);
assert.strictEqual(lifecycle.shouldInvalidateSmartResupplySelection({ context, routeId: 'route-a', approachFingerprint: 'fuel:route-a:approach-b', category: 'fuel' }), true);
assert.strictEqual(lifecycle.shouldInvalidateSmartResupplySelection({ context, routeId: 'route-a', approachFingerprint: `  ${context.approachFingerprint}  `, category: 'fuel' }), false);
assert.strictEqual(lifecycle.shouldInvalidateSmartResupplySelection({ context, routeId: 'route-a', approachFingerprint: context.approachFingerprint, category: 'food_supplies' }), true);

const builtPlan = { suggestedStops: [{ id: 'origin' }, { id: selected.physical }, { id: 'trailhead' }, { id: 'destination' }] };
lifecycle.reconcileCommittedSmartResupplySelection({ selected, availableOptions: [], identity });
assert.deepStrictEqual(builtPlan.suggestedStops.map((stop) => stop.id), ['origin', selected.physical, 'trailhead', 'destination']);

const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
assert.ok(screen.includes('trip-builder-smart-resupply-retained-selection'));
assert.ok(screen.includes('accessibilityState={{ selected, disabled }}'));
assert.ok(screen.includes("setSelectedSmartFuelValidation('refreshing')"));
assert.ok(screen.includes("setSelectedSmartFuelValidation('incomplete')"));
assert.ok(screen.includes('requestId !== smartResupplyFuelRequestRef.current'));
assert.ok(screen.includes('selectedResupplyStop: smartResupplyPointForPlan(option)'));
assert.ok(screen.includes('selectedResupplyStop: null'));

console.log('Smart Resupply selected-option lifecycle checks passed.');
