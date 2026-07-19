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
  'buildApproachResupplyRouteFingerprint(points)',
  'Smart resupply request identity should include the full canonical approach geometry rather than sampled vertices',
);
assertIncludes(
  screen,
  'loadSmartResupplyOptionsSingleFlight(searchSignature, {',
  'Identical concurrent provider lookups should share one in-flight execution',
);
assertIncludes(
  screen,
  'smartResupplyFuelTerminalRef',
  'A same-fingerprint rerender should preserve the truthful fuel terminal result instead of inferring success from retained cards',
);
assertIncludes(
  screen,
  'smartResupplyFuelProviderRef',
  'Fuel provider results should stay separate from Route Context evidence and keyed to the active request fingerprint',
);
assertIncludes(
  screen,
  'smartResupplySupplyProviderRef',
  'Supply provider results should stay separate from Route Context evidence and keyed to the active request fingerprint',
);
assertIncludes(
  screen,
  'smartResupplyFuelProviderRef.current = null;',
  'Fuel errors and invalidations should clear stale provider results instead of preserving a false ready list',
);
assertIncludes(
  screen,
  'smartResupplySupplyProviderRef.current = null;',
  'Supply errors and invalidations should clear stale provider results instead of preserving a false ready list',
);
assertIncludes(
  screen,
  'Prior results are read-only until this request finishes.',
  'A retry with last-good cards should label them as read-only until the terminal response arrives',
);
assertIncludes(
  screen,
  'if (smartResupplyPending) return false;',
  'Trip finalization should remain disabled while retained provider evidence is being refreshed',
);
assert(
  !screen.includes('setSmartResupplyFuelRequest((current) => ({ ...current, error: null }))') &&
    !screen.includes('setSmartResupplySupplyRequest((current) => ({ ...current, error: null }))'),
  'Selecting a fallback option must not erase the provider error or partial-coverage explanation.',
);
assertIncludes(
  screen,
  'setLiveApproachRouteRetryGeneration((generation) => generation + 1);',
  'Retry should reissue failed canonical approach preparation before falling back to trailhead-only ranking',
);
assertIncludes(
  screen,
  "smartResupplyFuelRequest.status === 'loading' && smartResupplyFuelOptions.length === 0",
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
  'const SMART_RESUPPLY_OPTION_LIST_HEIGHT = 56;',
  'Loaded Smart Resupply candidates should use a compact nested viewport so Camp Plan controls stay reachable above the setup footer on mobile.',
);
assertIncludes(
  screen,
  'const SmartResupplyOptionCard = React.memo',
  'Smart Resupply option rows should be memoized so refreshes only redraw changed rows.',
);
assertIncludes(
  screen,
  'onSelect: (option: SmartResupplyPoi) => void;',
  'Smart Resupply option rows should receive stable selection handlers instead of parent-created per-row closures.',
);
assertIncludes(
  screen,
  'onSelect={handleSelectSmartFuel}',
  'Fuel Smart Resupply rows should reuse the stable fuel selection callback.',
);
assertIncludes(
  screen,
  'onSelect={handleSelectSmartSupply}',
  'Supply Smart Resupply rows should reuse the stable supply selection callback.',
);
assertIncludes(
  screen,
  "smartResupplySupplyRequest.status === 'loading' && smartResupplySupplyOptions.length === 0",
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
assertIncludes(
  screen,
  'const TRIP_SETUP_DEFERRED_GROUP_DELAY_MS',
  'Trip Setup should stage lower planning groups after the setup transition frame.',
);
assertIncludes(
  screen,
  'const [tripSetupDeferredGroupsReady, setTripSetupDeferredGroupsReady] = useState(false);',
  'Trip Setup should track when deferred planning groups are safe to mount.',
);
assertIncludes(
  screen,
  'const tripSetupDeferredGroupsTask = runAfterShellInteractions(() => {',
  'Trip Setup lower planning groups should mount after shell interactions, not in the open-setup tap frame.',
);
assertIncludes(
  screen,
  'setTripSetupDeferredGroupsReady(true);',
  'Trip Setup deferred groups should become visible after the staged mount task.',
);
assertIncludes(
  screen,
  'tripSetupDeferredGroupsTask.cancel();',
  'Trip Setup deferred group mount should be cancellable when the route/setup state changes.',
);
assertIncludes(
  screen,
  '{tripSetupDeferredGroupsReady ? (',
  'Trip Setup bailout and camp groups should be gated behind deferred readiness.',
);
assertIncludes(
  screen,
  'testID="trip-builder-setup-deferred-groups-placeholder"',
  'Trip Setup should reserve bounded scroll space while lower planning groups are deferred.',
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
  'mergeAndRankSmartResupplyOptions({',
  'Fuel and supply discoveries should be merged and reranked through the canonical approach model',
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
  'selectedRouteRemoteEntry',
  'Smart resupply refresh signatures should include the selected route remote-entry boundary',
);
assertIncludes(
  screen,
  "smartResupplyFuelRequest.status === 'deferred' && liveApproachRouteStatus === 'loading'",
  'Fuel discovery should wait for an initializing canonical approach instead of issuing a trailhead-only request first',
);
assertIncludes(
  screen,
  "onPress={() => handleRetrySmartResupply('fuel')}",
  'Fuel provider errors should expose an actual retry action',
);
assertIncludes(
  screen,
  "onPress={() => handleRetrySmartResupply('supplies')}",
  'Supply provider errors should expose an actual retry action',
);
assertIncludes(
  screen,
  'rankApproachResupplyOptions',
  'Smart resupply refreshes should run all candidates through the shared approach-aware ranker',
);
assertIncludes(
  screen,
  'const SMART_RESUPPLY_LOOKUP_TIMEOUT_MS = 20000;',
  'Smart resupply lookup should have a bounded wall-clock budget so setup does not spin for many seconds.',
);
assertIncludes(
  screen,
  'const SMART_RESUPPLY_SUGGEST_REQUEST_BUDGET = 48;',
  'Smart resupply lookup should cover every bounded corridor window with each configured category variant.',
);
assertIncludes(
  screen,
  'const SMART_RESUPPLY_RETRIEVE_REQUEST_BUDGET = 32;',
  'Smart resupply lookup should leave enough detail capacity for the provider-supported final-approach result windows.',
);
assertIncludes(
  screen,
  'Live pre-trail POI lookup is taking too long; itinerary continuity is preserved with manual verification.',
  'Smart resupply timeout copy should be truthful and preserve manual verification rather than inventing stops.',
);
assertIncludes(
  screen,
  'if (suggestRequestCount >= SMART_RESUPPLY_SUGGEST_REQUEST_BUDGET) break;',
  'Smart resupply suggest loop should stop before it burns repeated Mapbox sessions.',
);
assertIncludes(
  screen,
  'if (retrieveRequestCount >= SMART_RESUPPLY_RETRIEVE_REQUEST_BUDGET) break;',
  'Smart resupply retrieve loop should stop before it burns repeated Mapbox sessions.',
);
assertIncludes(
  screen,
  'forwardGeocodeFallback: false',
  'Smart resupply background lookup should stay inside explicit approach search windows.',
);
assertIncludes(
  screen,
  'retrieveTimeoutMs: SMART_RESUPPLY_RETRIEVE_TIMEOUT_MS',
  'Smart resupply retrieves should use a shorter timeout than interactive destination selection.',
);
assertIncludes(
  screen,
  'function smartResupplyAnchorSearchOrder',
  'Smart resupply lookup should make fallback radius anchor ordering explicit.',
);
assertIncludes(
  screen,
  '(right.anchor.progressRatio ?? Number.NEGATIVE_INFINITY)',
  'Smart resupply lookup should search the final approach before earlier windows.',
);
assertIncludes(
  screen,
  'assessApproachResupplySearchCoverage({',
  'Smart resupply should explicitly assess whether provider windows cover the complete driving approach.',
);
assertIncludes(
  screen,
  'prioritizeApproachSearchResults({',
  'Provider detail requests should reserve capacity for exact-entry and final-approach candidates.',
);
assert(
  /for \(const query of params\.queries\.slice\(1\)\) \{\s*for \(const anchorIndex of anchorOrder\)/.test(screen),
  'Every configured fuel/supply query variant should cover every bounded approach window, not just the last two anchors.',
);
assertIncludes(
  screen,
  'reservedPerFinalAnchor: SMART_RESUPPLY_SEARCH_LIMIT',
  'The entire provider-supported exact-entry result window should be prioritized for place-detail retrieval.',
);
assertIncludes(
  screen,
  'for (let offset = 0; offset < options.length; offset += SMART_RESUPPLY_ACCESS_VALIDATION_CONCURRENCY)',
  'Routed access validation should exhaust the discovered geometric inventory in bounded batches.',
);
assertIncludes(
  screen,
  'limit: options.length',
  'Geometric prefiltering must not truncate candidates before routed access validation.',
);
assert(
  !screen.includes('SMART_RESUPPLY_ACCESS_VALIDATION_LIMIT'),
  'Smart Resupply must not silently discard the ninth or later on-corridor candidate before routing.',
);
assertIncludes(
  screen,
  'sameSmartResupplyPhysicalPlace(current, option)',
  'Cross-source results should deduplicate by normalized physical-place evidence, not provider key alone.',
);
assert(
  !screen.includes("if (option.fallbackState === 'trailhead_only') return true;"),
  'Trailhead-only Smart Resupply fallbacks with known huge off-approach distances should not bypass the route-deviation cap.',
);
assertIncludes(
  screen,
  "option.accessStatus !== 'inaccessible'",
  'Smart Resupply route-awareness filtering should reject known inaccessible candidates before ranking.',
);
assertIncludes(
  screen,
  'const TRIP_BUILDER_RESULT_INITIAL_RENDER_COUNT = 2;',
  'Trip Plan result sheet should avoid rendering the heavy confidence panel in the same native batch as the header cards.',
);
assertIncludes(
  screen,
  'const TRIP_BUILDER_RESULT_BATCH_SIZE = 1;',
  'Trip Plan result sheet should render one additional section per batch to reduce Android draw-command spikes while scrolling.',
);
assertIncludes(
  screen,
  'const TRIP_BUILDER_RESULT_WINDOW_SIZE = 3;',
  'Trip Plan result sheet should keep a small Android window so offscreen confidence/review sections do not stay mounted under the dock.',
);
assertIncludes(
  screen,
  'const TRIP_BUILDER_RESULT_BATCHING_PERIOD_MS = 80;',
  'Trip Plan result sheet should space section batches enough for the UI thread to recover between draw passes.',
);
assertIncludes(
  screen,
  'const tripBuilderResultModalContainerStyle = useMemo',
  'Trip Plan result sheet should reserve dock-aware viewport space before content reaches the fixed CommandDock.',
);
assertIncludes(
  screen,
  'paddingBottom: bottomClearance',
  'Trip Plan modal viewport should end above the CommandDock instead of relying only on scroll content padding.',
);
assertIncludes(
  screen,
  'style={[styles.modalContainer, tripBuilderResultModalContainerStyle]}',
  'Trip Plan modal container should apply the dock-aware viewport padding on mobile.',
);
assertIncludes(
  screen,
  '{!planModalVisible ? (\n                      <View style={styles.tripSetupFooter}>',
  'Trip Setup footer should unmount while the Trip Plan overlay is visible so it cannot paint behind the mobile result sheet.',
);

console.log('Trip Builder smart resupply stability checks passed.');
