const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, needle, label) {
  assert(source.includes(needle), `${label} missing expected source: ${needle}`);
}

assertIncludes(
  screen,
  'function smartResupplyOptionStableKey',
  'Smart resupply options should dedupe with stable semantic keys instead of array position',
);
assertIncludes(
  screen,
  'function compareSmartResupplyOptionsByDistance',
  'Smart resupply options should keep the closest trailhead stops first',
);
assertIncludes(
  screen,
  'function mergeSmartResupplyOptions(',
  'Smart resupply should merge route context, live search, and previous list state',
);
assertIncludes(
  screen,
  'previous: SmartResupplyPoi[] = []',
  'Smart resupply merge should accept the previous visible list for non-jumpy refreshes',
);
assertIncludes(
  screen,
  'function applySmartResupplyOptionRefresh',
  'Smart resupply refreshes should preserve existing card identity when the visible list is unchanged',
);
assertIncludes(
  screen,
  'smartResupplyFuelOptionsRef',
  'Fuel resupply effect should read the current visible list without adding a render-loop dependency',
);
assertIncludes(
  screen,
  'smartResupplySupplyOptionsRef',
  'Supply resupply effect should read the current visible list without adding a render-loop dependency',
);
assertIncludes(
  screen,
  'smartResupplyFuelSearchSignatureRef',
  'Fuel resupply search should be signature-gated so the same trailhead is not searched repeatedly',
);
assertIncludes(
  screen,
  'smartResupplySupplySearchSignatureRef',
  'Supply resupply search should be signature-gated so the same trailhead is not searched repeatedly',
);
assertIncludes(
  screen,
  'smartResupplyLoading === \'fuel\' && smartResupplyFuelOptions.length === 0',
  'Fuel picker should only show blocking loading state before options exist',
);
assertIncludes(
  screen,
  'Updating nearby fuel options...',
  'Fuel picker should show background refresh copy instead of making cards disappear',
);
assertIncludes(
  screen,
  'smartResupplyLoading === \'supplies\' && smartResupplySupplyOptions.length === 0',
  'Supply picker should only show blocking loading state before options exist',
);
assertIncludes(
  screen,
  'Updating nearby grocery/supply options...',
  'Supply picker should show background refresh copy instead of making cards disappear',
);
assertIncludes(
  screen,
  'mergeSmartResupplyOptions(routeContextFuelOptions, options, smartResupplyFuelOptionsRef.current)',
  'Fuel picker should merge new discoveries into the current list instead of replacing it',
);
assertIncludes(
  screen,
  'mergeSmartResupplyOptions(routeContextSupplyOptions, options, smartResupplySupplyOptionsRef.current)',
  'Supply picker should merge new discoveries into the current list instead of replacing it',
);
assertIncludes(
  screen,
  'smartResupplySearchSignature(selectedTrailheadResupplyAnchorCoordinate,',
  'Fuel resupply effects should key refreshes to the prepared trailhead anchor',
);
assertIncludes(
  screen,
  'selectedPreTrailSupplyAnchorCoordinate,',
  'Supply resupply effects should key refreshes to the selected refuel anchor',
);

console.log('Trip Builder smart resupply stability checks passed.');
