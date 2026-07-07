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
  'function compareSmartResupplyOptionsByApproach',
  'Smart resupply options should keep the best approach-corridor stops first',
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
  'Fuel resupply search should be signature-gated so the same approach corridor is not searched repeatedly',
);
assertIncludes(
  screen,
  'smartResupplySupplySearchSignatureRef',
  'Supply resupply search should be signature-gated so the same approach corridor is not searched repeatedly',
);
assertIncludes(
  screen,
  'smartResupplyLoading === \'fuel\' && smartResupplyFuelOptions.length === 0',
  'Fuel picker should only show blocking loading state before options exist',
);
assert(
  !screen.includes('Updating nearby fuel options...'),
  'Fuel picker should not show contradictory background-refresh copy once usable options are already visible.',
);
assertIncludes(
  screen,
  'styles.smartResupplyOptionScroll',
  'Fuel picker should keep candidate rows inside a bounded scroll area so later route-context refreshes do not move downstream controls.',
);
assertIncludes(
  screen,
  'smartResupplyLoading === \'supplies\' && smartResupplySupplyOptions.length === 0',
  'Supply picker should only show blocking loading state before options exist',
);
assert(
  !screen.includes('Updating nearby grocery/supply options...'),
  'Supply picker should not show contradictory background-refresh copy once usable options are already visible.',
);
assertIncludes(
  screen,
  'nestedScrollEnabled',
  'Smart Resupply option lists should be independently scrollable on mobile setup screens.',
);
assertIncludes(
  screen,
  'TRIP_SETUP_BUILD_BUTTON_CLEARANCE',
  'Trip Setup scroller should reserve bottom clearance for the fixed Build Trip Plan button on mobile.',
);
assertIncludes(
  screen,
  'paddingBottom: TRIP_SETUP_BUILD_BUTTON_CLEARANCE',
  'Trip Setup scroll content should let camp and bailout controls scroll above the fixed Build Trip Plan button.',
);
assertIncludes(
  screen,
  'tripSetupScroller: { flex: 1, minHeight: 0, overflow: \'hidden\' }',
  'Trip Setup scroll viewport should clip mobile content before the footer instead of painting controls under Build Trip Plan.',
);
assertIncludes(
  screen,
  'style={styles.tripSetupFooter}',
  'Build Trip Plan should live in a dedicated non-scrolling footer so setup content and footer bounds stay separate on mobile.',
);
assertIncludes(
  screen,
  'tripSetupFooter: { flexShrink: 0',
  'Trip Setup footer should not consume the scroll viewport or overlap lower camp controls.',
);
assertIncludes(
  screen,
  'testID="trip-builder-camp-reference-hint"',
  'Camp reference-only copy should be visible in the Camp Plan section before the footer area on mobile.',
);
{
  const campPlanStart = screen.indexOf('testID="trip-builder-camp-plan"');
  const campPlanBlock = screen.slice(campPlanStart, screen.indexOf('{campPlanPins.length > 0 ?', campPlanStart));
  assert(
    campPlanBlock.indexOf('testID="trip-builder-camp-reference-hint"') > -1 &&
      campPlanBlock.indexOf('testID="trip-builder-camp-reference-hint"') < campPlanBlock.indexOf('styles.planningChoiceRow'),
    'Camp reference-only copy should render before the camp action row so it is not clipped behind the setup footer.',
  );
}
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
  'const searchSignature = smartResupplySearchSignature(',
  'Fuel resupply effects should key refreshes to the prepared trailhead anchor and approach geometry',
);
assertIncludes(
  screen,
  'selectedTrailheadResupplyAnchorCoordinate',
  'Fuel resupply effects should include the prepared trailhead anchor in the refresh signature inputs',
);
assertIncludes(
  screen,
  'liveApproachRoutePoints',
  'Supply resupply effects should key refreshes to the live approach route',
);
assertIncludes(
  screen,
  'selectedRouteRemoteEntryProgressRatio',
  'Smart resupply refresh signatures should include the selected route remote-entry boundary',
);
assertIncludes(
  screen,
  'rankApproachResupplyOptions',
  'Smart resupply refreshes should run all candidates through the shared approach-aware ranker',
);

console.log('Trip Builder smart resupply stability checks passed.');
