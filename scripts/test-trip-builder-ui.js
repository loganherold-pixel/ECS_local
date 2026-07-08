const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, needle, label) {
  assert(source.includes(needle), `${label} missing expected source: ${needle}`);
}

const screen = read('app/explore-trip-builder.tsx');
const discover = read('app/(tabs)/discover.tsx');
const rootLayout = read('app/_layout.tsx');
const registry = read('lib/explore/exploreFeatureRegistry.ts');
const itinerarySummary = read('lib/tripBuilder/tripItinerarySummary.ts');
const itineraryReview = read('lib/tripBuilder/tripItineraryReview.ts');

assertIncludes(registry, "id: 'trip_builder'", 'Explore registry');
assertIncludes(registry, "description: 'Turn a selected route into a day trip, overnight route, or expedition-style plan.'", 'Explore registry');
assertIncludes(registry, "status: 'live'", 'Explore registry');
assertIncludes(registry, "id: 'offline_prep_pack'", 'Explore registry');
assertIncludes(screen, 'testID="trip-builder-screen"', 'Trip Builder screen');
assertIncludes(screen, 'ExplorePlanningTabs', 'Trip Builder should keep Explore top tabs available.');
assertIncludes(screen, 'activeTab="trip_builder"', 'Trip Builder should mark the Trip Builder tab active.');
assertIncludes(screen, 'loadTripBuilderRouteHandoff', 'Trip Builder route handoff');
assertIncludes(screen, 'loadExplorePlanningRouteContext', 'Trip Builder should consume active Explorer filter route context.');
assertIncludes(screen, 'loadOpportunitiesWithCompatibility(null)', 'Trip Builder route selection');
assertIncludes(screen, 'InteractionManager.runAfterInteractions', 'Trip Builder route selection should defer route loading until after the screen transition frame.');
assertIncludes(screen, 'routeLoadTask.cancel?.();', 'Trip Builder deferred route loading should cancel cleanly on route changes or unmount.');
assert(!screen.includes('testID="trip-builder-selected-route"'), 'Trip Builder should not render a redundant selected-route summary after route selection.');
assertIncludes(screen, 'Choose Route', 'Trip Builder should present ECS and imported route choices before setup.');
assertIncludes(screen, 'ECS OR IMPORTED', 'Trip Builder route picker should distinguish ECS and imported routes.');
assertIncludes(screen, 'parseGeoFile', 'Trip Builder should parse imported GPX/KML route files.');
assertIncludes(screen, 'getPrimaryRouteCoordinates', 'Trip Builder should extract route coordinates from imported files.');
assertIncludes(screen, 'fsReadFileFromPickerUri', 'Trip Builder should read the selected route file from the picker URI.');
assertIncludes(screen, "import * as DocumentPicker from 'expo-document-picker';", 'Trip Builder should keep the document picker in the main bundle for route imports.');
assert(!screen.includes("await import('expo-document-picker')"), 'Trip Builder route import should not lazy-load the document picker because that can fail before the picker opens.');
assertIncludes(screen, 'TRIP_BUILDER_IMPORT_SELECTABLE_EXTENSIONS', 'Trip Builder should validate import file extensions.');
assertIncludes(screen, 'buildTripBuilderImportedRoute', 'Trip Builder should convert imported files into planning routes.');
assertIncludes(screen, 'testID="trip-builder-import-route"', 'Trip Builder should expose an import route action.');
assertIncludes(screen, 'Import GPX / Route File', 'Trip Builder should label the import route action clearly.');
assertIncludes(screen, 'setSelectedRouteId(importedRoute.id)', 'Trip Builder should select an imported route for setup.');
assert(!screen.includes('testID={`trip-builder-trip-type-${option.value}`}'), 'Selected-route Trip Builder setup should not render Trip Type controls.');
assert(!screen.includes('testID={`trip-builder-group-${option.value}`}'), 'Selected-route Trip Builder setup should not render Group Type controls.');
assert(!screen.includes('testID="trip-builder-camping-needed"'), 'Selected-route Trip Builder setup should not render the old camping toggle.');
assert(!screen.includes('testID="trip-builder-camping-needed-toggle"'), 'Selected-route Trip Builder setup should not render the old camping toggle switch.');
assert(!screen.includes('testID={`trip-builder-priority-${option.value}`}'), 'Selected-route Trip Builder setup should not render priority chips.');
assert(!screen.includes('Choose up to 2'), 'Selected-route Trip Builder setup should not render priority-limit copy.');
assertIncludes(screen, "const DEFAULT_TRIP_BUILDER_TRIP_TYPE: TripType = 'day_trip'", 'Trip Builder should keep a day-trip default for service compatibility.');
assertIncludes(screen, "const DEFAULT_TRIP_BUILDER_GROUP_TYPE: GroupType = 'solo'", 'Trip Builder should keep a solo default for service compatibility.');
assertIncludes(screen, 'Smart Resupply Plan', 'Trip Builder should ask about smart resupply before generating.');
assertIncludes(screen, 'Are you looking to implement a smart resupply plan?', 'Trip Builder should render the smart resupply question.');
assertIncludes(screen, 'Fuel only', 'Trip Builder should offer fuel-only smart resupply.');
assertIncludes(screen, 'Fuel + groceries/supplies', 'Trip Builder should offer fuel and supplies smart resupply.');
assertIncludes(screen, 'Skip smart resupply planning.', 'Trip Builder should offer no smart resupply.');
assertIncludes(screen, 'testID={`trip-builder-resupply-${option.value}`}', 'Trip Builder should expose smart resupply choices.');
assertIncludes(screen, 'SMART_RESUPPLY_FUEL_QUERY', 'Trip Builder should search for fuel along the approach to the selected route start.');
assertIncludes(screen, 'SMART_RESUPPLY_SUPPLY_QUERY', 'Trip Builder should search for groceries and supplies along the approach to the selected route start.');
assertIncludes(screen, 'loadSmartResupplyOptions', 'Trip Builder should load approach-aware smart resupply options from map search.');
assertIncludes(screen, 'resolveRoadDestination', 'Trip Builder should resolve smart resupply suggestions before adding them to a plan.');
assertIncludes(screen, 'hasDieselSupport', 'Trip Builder should mark fuel options with diesel only when place text supports it.');
assertIncludes(screen, 'hasFuelAndGrocerySupport', 'Trip Builder should mark one-stop fuel and grocery options.');
assertIncludes(screen, 'testID="trip-builder-smart-resupply-picker"', 'Trip Builder should render a fuel selection list after smart resupply is enabled.');
assertIncludes(screen, 'Last Fuel Before Trail Entry', 'Trip Builder should label the pre-trail fuel picker around the approach route.');
assertIncludes(screen, 'ECS ranks fuel along your GPS-to-trailhead approach first, then uses trailhead-only fallback if GPS routing is unavailable.', 'Trip Builder should explain approach-aware resupply ranking.');
assertIncludes(screen, 'if (smartResupplyLoading != null) return null;', 'Trip Builder should not show provider-unavailable pre-trail status while live resupply lookup is still loading.');
assertIncludes(screen, 'preTrailStopCandidatesForDraft, smartResupplyLoading, smartResupplyPreference', 'Trip Builder pre-trail status copy should update when smart resupply loading settles.');
assert(!screen.includes('Fuel Near Trailhead'), 'Trip Builder should not label fuel as simple trailhead-nearest lookup.');
assert(!screen.includes('ECS uses the trailhead as ground zero for pre-trail fuel.'), 'Trip Builder should not describe the trailhead as the resupply ground zero.');
assertIncludes(screen, 'PICK 1 OF UP TO 5', 'Trip Builder should constrain route-start fuel choices to a compact list.');
assertIncludes(screen, 'testID="trip-builder-smart-resupply-one-stop"', 'Trip Builder should acknowledge fuel and grocery one-stop selections.');
assertIncludes(screen, 'testID="trip-builder-smart-resupply-supply-step"', 'Trip Builder should render the second grocery/supply step when needed.');
assertIncludes(screen, 'Groceries / Supplies Along Approach', 'Trip Builder should label grocery/supply search as approach-aware.');
assertIncludes(screen, 'ECS keeps supplies on the same approach corridor when possible, then falls back near your selected fuel stop.', 'Trip Builder should explain approach-corridor supply sequencing.');
assertIncludes(screen, 'selectedSmartFuel ? smartResupplyPointForPlan(selectedSmartFuel) : null', 'Trip Builder should pass selected fuel into the planner.');
assertIncludes(screen, "smartResupplyPreference === 'fuel_supplies' && selectedSmartSupply", 'Trip Builder should pass selected groceries into the planner when required.');
assertIncludes(screen, 'Bailout Plan', 'Trip Builder should ask about bailout planning before generating.');
assertIncludes(screen, 'Drop optional reference bailout pins along this route, or skip bailout planning for this trip.', 'Trip Builder should render compact bailout planning copy.');
assertIncludes(screen, 'testID={`trip-builder-bailout-plan-${option.value}`}', 'Trip Builder should expose bailout planning choices.');
assertIncludes(screen, 'Skip', 'Trip Builder should offer a Bailout Plan skip action.');
assertIncludes(screen, 'Open Map', 'Trip Builder should offer a Bailout Plan map action.');
assertIncludes(screen, 'handleOpenBailoutPicker', 'Trip Builder should open bailout planning from the Open Map action.');
assertIncludes(screen, 'BailoutPlanPickerOverlay', 'Trip Builder should provide a pre-guidance bailout map picker.');
assertIncludes(screen, 'testID="trip-builder-bailout-picker-overlay"', 'Trip Builder should render the bailout picker overlay.');
assertIncludes(screen, 'testID="trip-builder-bailout-pin-list"', 'Trip Builder should show operator-dropped bailout pins in setup.');
assertIncludes(screen, 'function bailoutPlanOptionDetail(', 'Bailout plan choices should render saved-pin-aware helper copy.');
assertIncludes(screen, 'bailoutPlanOptionDetail(option.value, bailoutPlanPins.length, !!selectedBailoutPoint)', 'Bailout plan tiles should not keep stale no-pin copy after a pin is saved.');
assert(!screen.includes('testID="trip-builder-bailout-inline-options"'), 'Trip Builder should not render calculated bailout/rendezvous choices in setup.');
assertIncludes(screen, 'BailoutPlanPickerOverlay\n            visible={bailoutPickerVisible}', 'Trip Builder bailout picker should be mounted outside the generated plan modal.');
assertIncludes(screen, 'PRE-GUIDANCE TRAIL VIEW', 'Bailout picker should identify the pre-guidance trail view.');
assertIncludes(screen, 'routePreviewPoints={selectedPreparedRoutePoints}', 'Bailout picker should receive the prepared selected-route preview line.');
assertIncludes(screen, '<MapFallbackSurface', 'Camp and bailout reference pickers should use the lightweight non-WebView route preview surface.');
assertIncludes(screen, 'routeCoords={pickerRouteCoords}', 'Reference pickers should pass simplified route preview coordinates into the lightweight surface.');
assertIncludes(screen, 'statusLabel="Reference preview"', 'Reference pickers should truthfully label the lightweight map surface.');
assertIncludes(screen, "id: 'bailout-route-start'", 'Bailout picker should mark the selected route start.');
assertIncludes(screen, "title: 'Trail entry'", 'Bailout picker should label the selected route start as the trail entry point.');
assertIncludes(screen, "mapChar: 'T'", 'Bailout picker should give the trail entry point a distinct marker label.');
assertIncludes(screen, "id: 'bailout-route-end'", 'Bailout picker should mark the selected route end.');
assertIncludes(screen, 'markers={[...routeEndpointMarkers, ...operatorPinMarkers, ...selectedMarker]}', 'Bailout picker should render route endpoints plus operator bailout pins.');
assert(!screen.includes('loadBailoutPlanOptions'), 'Trip Builder should not load bailout and rendezvous suggestions.');
assertIncludes(screen, "'ecs.routeContextEngine.enableCampCandidates': true", 'Trip Builder should keep route-context CampOps camp candidates enabled for the Explore wizard.');
assert(!screen.includes('BAILOUT_SEARCH_QUERY'), 'Trip Builder should not run road-access bailout search in setup.');
assert(!screen.includes('TRIP_BUILDER_PICKER_MAP_STYLES'), 'Reference pickers should not keep stale Mapbox Day/Satellite style choices.');
assert(!screen.includes('trip-builder-picker-map-style'), 'Reference pickers should not expose a Mapbox style control when using the lightweight surface.');
assert(!screen.includes('pickerMapStyle'), 'Reference pickers should not keep Mapbox style state.');
assertIncludes(screen, 'onMapTap={(coordinate) => onDropPoint(coordinate)}', 'Bailout picker should support operator dropped map points.');
assertIncludes(screen, 'onRemovePin={handleRemoveBailoutPin}', 'Bailout picker should let operators remove dropped bailout pins.');
assertIncludes(screen, 'onClearPins={handleClearBailoutPins}', 'Bailout picker should let operators clear dropped bailout pins.');
assertIncludes(screen, 'appendBailoutStopToPlan', 'Selected bailout should be appended to the suggested itinerary.');
assertIncludes(screen, 'appendBailoutStopsToPlan', 'Multiple operator bailout pins should be appended as reference-only itinerary points.');
assertIncludes(screen, 'This bailout point remains unconnected from the projected guidance line.', 'Bailout stop should explicitly remain unconnected from route guidance.');
assertIncludes(screen, "guidanceRole: 'reference_only'", 'Bailout and camp pins should be marked reference-only for map/guidance separation.');
assertIncludes(screen, 'Camp Plan', 'Trip Builder should include the new Camp Plan section.');
assertIncludes(screen, 'testID="trip-builder-camp-plan"', 'Trip Builder should expose a Camp Plan setup section.');
assertIncludes(screen, 'testID="trip-builder-open-camp-picker"', 'Trip Builder should expose a camp map picker action.');
assertIncludes(screen, 'testID="trip-builder-camp-picker-overlay"', 'Trip Builder should render the camp picker overlay.');
assertIncludes(screen, 'campPlanOptionDetail(', 'Camp plan choices should render saved-pin-aware helper copy.');
assertIncludes(screen, 'Operator-marked potential camp. Legal access, land use, fire restrictions, and posted rules are unknown.', 'Camp pins should use conservative operator-marked copy.');
assertIncludes(screen, 'suggestedEstablishedCampPins', 'Camp picker should receive suggested established camp pins from Route Context.');
assertIncludes(screen, 'buildSuggestedEstablishedCampPins', 'Trip Builder should build up to five route-aware established camp suggestions.');
assertIncludes(screen, 'testID="trip-builder-suggested-established-camps"', 'Camp picker should list suggested established camps separately from operator pins.');
assertIncludes(screen, 'bailoutExitPointForPlan', 'Selected bailout should also become exit access context for the plan.');
assertIncludes(screen, 'buildTripPlan({', 'Trip Builder planning service call');
assertIncludes(screen, 'testID="trip-builder-generate"', 'Trip Builder generate action');
assertIncludes(screen, 'style={styles.fixedContent}', 'Trip Builder screen should use a fixed body instead of page-level scrolling.');
assertIncludes(screen, 'timeWindow: timeWindowForTripType(DEFAULT_TRIP_BUILDER_TRIP_TYPE)', 'Trip Builder should keep a compatible default time window without visible Trip Type controls.');
assertIncludes(screen, 'smartResupplyPreference,', 'Trip Builder should pass the selected resupply preference into the planner.');
assertIncludes(screen, "bailoutPlanRequested: bailoutPlanPreference === 'yes'", 'Trip Builder should pass bailout preference into the planner.');
assertIncludes(screen, 'bailoutPlanReady', 'Trip Builder should require a selected bailout point when bailout planning is enabled.');
assert(!screen.includes('TIME_WINDOW_OPTIONS'), 'Trip Builder should not render the redundant Time Window selector.');
assert(!screen.includes('testID={`trip-builder-time-${option.value}`}'), 'Trip Builder should not expose Time Window chips.');
assert(!screen.includes('setTimeWindow'), 'Trip Builder should not keep separate Time Window UI state.');
assert(!screen.includes('contentContainerStyle={styles.scrollContent}'), 'Trip Builder should not use a page-level ScrollView content container.');
assertIncludes(screen, 'testID="trip-builder-plan-overlay"', 'Trip Builder results should open as an in-shell overlay.');
assertIncludes(screen, 'planModalVisible', 'Trip Builder should keep modal visibility under user control.');
assertIncludes(screen, 'setPlanModalVisible(true)', 'Build Trip Plan should open the trip plan modal.');
assertIncludes(screen, 'lastTripBuilderPlanState', 'Trip Builder should persist an open plan overlay across screen remounts.');
assertIncludes(screen, 'lastTripBuilderPlanState.visible', 'Trip Builder should restore an open plan only when the user has not closed it.');
assertIncludes(screen, 'requestedRouteId === lastTripBuilderPlanState.selectedRouteId', 'Trip Builder should preserve an open plan across remounts for the same selected route.');
assertIncludes(screen, 'testID="trip-builder-results-close"', 'Trip Builder results modal close action');
assertIncludes(screen, 'visible: false', 'Trip Builder close action should be the explicit path for dismissing an open plan.');
assert(!screen.includes('presentationStyle="fullScreen"'), 'Trip Builder plan overlay must not use a native full-screen modal that hides the ECS shell.');
assert(!/import\s*\{[\s\S]*\bModal\b[\s\S]*\}\s*from\s*'react-native'/.test(screen), 'Trip Builder should not import the React Native Modal for generated plan results.');
assertIncludes(screen, 'styles.planOverlayBackdrop', 'Trip Builder plan overlay should keep the ECS background visible instead of flashing a white native modal surface.');
assertIncludes(screen, 'styles.bodyFrame', 'Trip Builder plan overlay should stay inside the Explore body so the lower ECS banner remains visible.');
assertIncludes(screen, 'TRIP_BUILDER_RESULT_BOTTOM_CLEARANCE', 'Trip Builder generated plan results should reserve explicit mobile shell clearance.');
assertIncludes(screen, 'const tripBuilderResultModalContentStyle = useMemo(', 'Trip Builder generated plan results should memoize shell-aware modal content padding.');
assertIncludes(screen, 'paddingBottom: TRIP_BUILDER_RESULT_BOTTOM_CLEARANCE + bottomClearance', 'Trip Builder result content should include the active shell bottom clearance.');
assertIncludes(screen, 'contentContainerStyle={[styles.modalContent, tripBuilderResultModalContentStyle]}', 'Trip Builder result ScrollView should use shell-aware content padding.');
assert(
  /<FlatList<TripBuilderResultSectionKey>[\s\S]*?testID="trip-builder-results"[\s\S]*?removeClippedSubviews/.test(screen),
  'Trip Builder result list should virtualize offscreen review content on Android instead of drawing the full generated plan behind the dock.',
);
const resultScrollSource = screen.match(/<FlatList<TripBuilderResultSectionKey>[\s\S]*?testID="trip-builder-results"[\s\S]*?\/>/)?.[0] ?? '';
assert(resultScrollSource, 'Trip Builder result FlatList source should be inspectable.');
assertIncludes(screen, 'TRIP_BUILDER_RESULT_INITIAL_RENDER_COUNT', 'Trip Builder result list should bound initial rendered sections.');
assertIncludes(screen, 'TRIP_BUILDER_RESULT_BATCH_SIZE', 'Trip Builder result list should batch lower review sections.');
assertIncludes(screen, 'TRIP_BUILDER_RESULT_WINDOW_SIZE', 'Trip Builder result list should use a compact Android render window.');
assertIncludes(resultScrollSource, 'renderItem={renderTripBuilderResultSection}', 'Trip Builder result list should render bounded section items.');
assertIncludes(resultScrollSource, 'initialNumToRender={TRIP_BUILDER_RESULT_INITIAL_RENDER_COUNT}', 'Trip Builder result list should avoid mounting all review sections in the open frame.');
assertIncludes(resultScrollSource, 'maxToRenderPerBatch={TRIP_BUILDER_RESULT_BATCH_SIZE}', 'Trip Builder result list should batch subsequent sections.');
assertIncludes(resultScrollSource, 'windowSize={TRIP_BUILDER_RESULT_WINDOW_SIZE}', 'Trip Builder result list should keep a compact viewport window.');
assertIncludes(screen, 'backgroundColor: ECS.bgPanel', 'Trip Builder result list should provide an opaque modal surface behind clipped section children.');
assertIncludes(screen, "type TripBuilderResultSectionKey =", 'Trip Builder result sections should stay explicit and virtualized.');
assertIncludes(screen, "| 'itinerary_confidence'", 'Trip Builder should render itinerary confidence as its own result section.');
assertIncludes(screen, "| 'itinerary_summary'", 'Trip Builder should render itinerary summary as its own result section.');
assertIncludes(screen, "| 'active_trip'", 'Trip Builder should render Active Trip setup as its own result section.');
assertIncludes(screen, "| 'itinerary_review'", 'Trip Builder should render the heavy itinerary review as its own result section.');
assertIncludes(screen, 'TRIP_BUILDER_ITINERARY_REVIEW_ITEM_PREVIEW_COUNT', 'Trip Builder itinerary review should cap rows mounted per phase before user edits.');
assertIncludes(screen, 'const visibleItems = phase.items.slice(0, TRIP_BUILDER_ITINERARY_REVIEW_ITEM_PREVIEW_COUNT);', 'Trip Builder itinerary review should not mount every phase item during result scrolling.');
assertIncludes(screen, 'trip-builder-review-hidden-count', 'Trip Builder itinerary review should disclose hidden lower-priority rows instead of silently dropping them.');
assert(
  !resultScrollSource.includes('<View style={styles.sectionCard}>'),
  'Trip Builder result list should not wrap the entire generated plan in one giant direct child; Android clipping needs bounded section children.',
);
assertIncludes(screen, 'routeListScroller', 'Trip Builder route selector should be independently scrollable.');
[
  'TRIP_BUILDER_DIRECT_ROUTE_RENDER_LIMIT = TRIP_BUILDER_ROUTE_LIST_INITIAL_RENDER_COUNT',
  'directRoutePickerRoutes',
  'routes.length <= TRIP_BUILDER_DIRECT_ROUTE_RENDER_LIMIT ? routes : []',
  'useDirectRoutePicker',
  'testID="trip-builder-route-list-direct"',
  'directRoutePickerRoutes.map((route, index) => (',
  'accessibilityState={{ selected }}',
  'hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}',
  'FlatList<ExpeditionOpportunity>',
  'TRIP_BUILDER_ROUTE_LIST_INITIAL_RENDER_COUNT',
  'TRIP_BUILDER_ROUTE_LIST_BATCH_SIZE',
  'TRIP_BUILDER_ROUTE_LIST_WINDOW_SIZE',
  'TRIP_BUILDER_ROUTE_LIST_BATCHING_PERIOD_MS',
  'RouteSelectionCard = React.memo',
  'tripBuilderRouteKeyExtractor',
  'renderTripBuilderRouteOption',
  'getTripBuilderRouteItemLayout',
  'initialNumToRender={TRIP_BUILDER_ROUTE_LIST_INITIAL_RENDER_COUNT}',
  'maxToRenderPerBatch={TRIP_BUILDER_ROUTE_LIST_BATCH_SIZE}',
  'windowSize={TRIP_BUILDER_ROUTE_LIST_WINDOW_SIZE}',
  'updateCellsBatchingPeriod={TRIP_BUILDER_ROUTE_LIST_BATCHING_PERIOD_MS}',
  'removeClippedSubviews',
  'testID="trip-builder-route-list-virtualized"',
].forEach((needle) => {
  assertIncludes(screen, needle, `Trip Builder route selector should use direct small-list taps and virtualized overflow rendering: ${needle}`);
});
assert(
  !screen.includes('routes.map((route) => (') && !screen.includes('routes.map((route, index) => ('),
  'Trip Builder route selector should not eagerly render every route row without the small-list direct guard.',
);
assertIncludes(screen, 'routes.length} FILTERED ROUTE', 'Trip Builder route selector should display the actual filtered route count.');
assertIncludes(screen, 'const [tripSetupStarted, setTripSetupStarted] = useState(false)', 'Trip Builder should keep route-picker setup closed for top-level Trip Builder entry.');
assertIncludes(screen, "params.setup === '1'", 'Trip Builder should recognize direct Explore Build Trip handoffs.');
assertIncludes(screen, 'setTripSetupStarted(shouldAutoOpenTripSetup);', 'Direct Explore Build Trip handoff should open Trip Setup immediately.');
assertIncludes(screen, 'setPreparedTripRoutePreview(shouldAutoOpenTripSetup ? buildPreparedTripRoutePreview(autoSetupRoute as ExpeditionOpportunity | null) : null);', 'Direct Explore Build Trip handoff should prepare selected route geometry before live setup searches.');
assertIncludes(screen, 'testID="trip-builder-open-setup"', 'Trip Builder should still expose Open Trip Builder for manual route-picker entry.');
assertIncludes(screen, 'Open Trip Builder', 'Trip Builder should label the manual setup entry action clearly.');
assert(!screen.includes(').slice(0, 8) as ExpeditionOpportunity[]'), 'Trip Builder should not cap the filtered Suggested Routes context before rendering the route selector.');
assertIncludes(screen, 'testID="trip-builder-selected-route-name"', 'Trip Builder setup banner should display the selected route or imported filename.');
assert(!screen.includes('setGroupType(option.value)'), 'Selected-route Trip Builder setup should not expose group-type edits.');
assertIncludes(screen, 'routeStartCoordinateForTrip', 'Trip Builder should resolve route start coordinates without requiring active guidance map geometry.');
assertIncludes(screen, 'routeEndCoordinateForTrip', 'Trip Builder should resolve route end coordinates for bailout and map planning.');
assertIncludes(screen, 'const selectedTrailheadResupplyAnchorCoordinate = selectedRouteStartCoordinate', 'Trip Builder should keep the trailhead endpoint available as the final Smart Resupply fallback.');
assertIncludes(screen, 'PreparedTripRoutePreview', 'Trip Builder should prepare a route preview context when setup opens.');
assertIncludes(screen, 'preparedRoutePreviewMatches(preparedTripRoutePreview, selectedRoute)', 'Trip Builder should keep live setup searches tied to the prepared selected route.');
assertIncludes(screen, 'tripSetupStarted &&', 'Live Trip Builder searches should wait until the user opens setup for the selected route.');
assertIncludes(screen, "import { runAfterShellInteractions, type ShellInteractionTask } from '../lib/shellInteractionScheduler';", 'Trip Builder should use the shared shell interaction scheduler for non-urgent live lookup work.');
assertIncludes(screen, 'TRIP_BUILDER_BACKGROUND_LOOKUP_DELAY_MS', 'Trip Builder should give route/setup UI a short settle window before live provider lookups.');
assertIncludes(screen, 'function scheduleTripBuilderBackgroundLookup(', 'Trip Builder should centralize cancellable post-interaction provider lookup scheduling.');
assertIncludes(screen, 'const routeContextPrefetchTask = scheduleTripBuilderBackgroundLookup(() => {', 'Trip Builder setup should defer Route Context prefetch until after the setup transition settles.');
assertIncludes(screen, 'routeContextPrefetchTask.cancel();', 'Trip Builder setup Route Context prefetch should cancel cleanly.');
assertIncludes(screen, 'const fuelLookupTask = scheduleTripBuilderBackgroundLookup(() => {', 'Trip Builder fuel lookup should defer Mapbox/provider work until after setup renders.');
assertIncludes(screen, 'fuelLookupTask.cancel();', 'Trip Builder fuel lookup should cancel cleanly when setup state changes.');
assertIncludes(screen, 'const supplyLookupTask = scheduleTripBuilderBackgroundLookup(() => {', 'Trip Builder grocery lookup should defer Mapbox/provider work until after setup renders.');
assertIncludes(screen, 'supplyLookupTask.cancel();', 'Trip Builder grocery lookup should cancel cleanly when setup state changes.');
assertIncludes(screen, 'styles.smartResupplyStaticLoaderDot', 'Trip Builder Smart Resupply loading rows should use a static marker instead of an animated spinner during setup entry.');
assert(!/smartResupplyLoading === 'fuel'[\s\S]{0,360}<ActivityIndicator/.test(screen), 'Trip Builder fuel lookup loading row should not mount an animated ActivityIndicator during setup entry.');
assert(!/smartResupplyLoading === 'supplies'[\s\S]{0,360}<ActivityIndicator/.test(screen), 'Trip Builder supply lookup loading row should not mount an animated ActivityIndicator during setup entry.');
assertIncludes(screen, 'latestSelectedPlanningRouteRef', 'Trip Builder should keep the latest tapped route outside rendered state for immediate mobile open taps.');
assertIncludes(screen, 'latestSelectedPlanningRouteRef.current = routeForContext;', 'Route selection should synchronously publish the tapped route for immediate mobile open taps.');
assertIncludes(screen, 'const routeForSetup = selectedRoute ?? latestSelectedPlanningRouteRef.current;', 'Open Trip Builder should use the latest tapped route if React has not rendered selectedRoute yet.');
assertIncludes(screen, 'buildPreparedTripRoutePreview(routeForSetup)', 'Open Trip Builder should prepare geometry from the route actually used for setup.');
{
  const selectRouteStart = screen.indexOf('const selectPlanningRoute = useCallback((routeId: string) => {');
  const selectRouteEnd = screen.indexOf('const handleImportRouteFile = async () => {');
  assert(selectRouteStart > -1 && selectRouteEnd > selectRouteStart, 'Route selection source block should be discoverable.');
  const selectRouteBlock = screen.slice(selectRouteStart, selectRouteEnd);
  assert(
    selectRouteBlock.indexOf('setSelectedRouteId(routeId);') > -1 &&
      !selectRouteBlock.includes('routeContextOrchestrator.prefetchForTrailSelection'),
    'Route selection should commit visible selected route state without starting Route Context prefetch.',
  );
}
assertIncludes(screen, 'SMART_RESUPPLY_SEARCH_LIMIT', 'Trip Builder should request enough nearby resupply candidates before ranking the closest five.');
assertIncludes(screen, 'SMART_RESUPPLY_SEARCH_RADIUS_TIERS_MILES = [10, 20, 35, 60] as const', 'Trip Builder should search the full approach corridor with a wide fallback radius before accepting resupply options.');
assertIncludes(screen, 'SMART_RESUPPLY_PREFERRED_ROUTE_BUFFER_MILES = 10', 'Trip Builder should prefer fuel and supplies within a practical approach-route buffer.');
assertIncludes(screen, 'SMART_RESUPPLY_MAX_ROUTE_DEVIATION_MILES = 20', 'Trip Builder should keep reasonable small-town detours before declaring no usable resupply options.');
assertIncludes(screen, 'smartResupplyOptionsFromRouteContext(', 'RouteContext fuel and grocery candidates should flow through the shared Smart Resupply adapter.');
assertIncludes(screen, 'routeContextSnapshot', 'RouteContext candidates should be merged into Smart Resupply options.');
assertIncludes(screen, 'selectedTrailheadResupplyAnchorCoordinate', 'RouteContext fuel candidates should be measured against the prepared trailhead anchor.');
assertIncludes(screen, 'liveApproachRoutePoints', 'RouteContext fuel candidates should be measured against the approach route.');
assertIncludes(screen, 'selectedPreTrailSupplyAnchorCoordinate', 'RouteContext grocery candidates should be measured with the selected refuel fallback anchor.');
assertIncludes(screen, 'selectedRouteRemoteEntryProgressRatio', 'RouteContext resupply candidates should use the selected route remote-entry boundary.');
assertIncludes(screen, 'buildApproachResupplySearchAnchors', 'Trip Builder should sample approach-route search anchors for Smart Resupply.');
assertIncludes(screen, 'const SMART_RESUPPLY_SEARCH_MAX_ANCHORS = 4', 'Trip Builder Smart Resupply should keep a bounded anchor sample so mobile lookup work cannot run away.');
assertIncludes(screen, 'maxAnchors: SMART_RESUPPLY_SEARCH_MAX_ANCHORS', 'Trip Builder Smart Resupply should use the bounded approach-anchor budget when searching live POIs.');
assertIncludes(screen, 'SMART_RESUPPLY_LOOKUP_TIMEOUT_MS = 8000', 'Trip Builder Smart Resupply should settle slow provider work instead of leaving setup stuck in a loading state.');
assertIncludes(screen, 'SMART_RESUPPLY_SUGGEST_REQUEST_BUDGET', 'Trip Builder Smart Resupply should cap Search Box suggest cycles during setup.');
assertIncludes(screen, 'SMART_RESUPPLY_RETRIEVE_REQUEST_BUDGET', 'Trip Builder Smart Resupply should cap Search Box retrieve cycles during setup.');
assertIncludes(screen, 'rankApproachResupplyOptions', 'Trip Builder should rank Smart Resupply options with approach-route context.');
assertIncludes(screen, 'isSmartResupplyOptionRouteAware', 'RouteContext resupply candidates should also be capped by approach-route readiness.');
assertIncludes(screen, '(left.approachScore ?? Number.NEGATIVE_INFINITY)', 'Fuel and supply options should be ranked by approach score before title tie breakers.');
assertIncludes(screen, 'approachRoute: liveApproachRoutePoints', 'Live fuel search should use the GPS-to-trailhead approach route when available.');
assertIncludes(screen, 'fallbackAnchor: selectedPreTrailSupplyAnchorCoordinate', 'Live grocery search should fall back near the selected refuel stop when approach routing is unavailable.');
assertIncludes(screen, 'const minimumAnchorCoverageCount = searchAnchors.length', 'Smart Resupply should query every approach/trailhead anchor before accepting an empty or early-biased fuel set.');
assertIncludes(screen, 'coveredAnchorKeys.size >= minimumAnchorCoverageCount', 'Smart Resupply should not stop after home-side results before checking the last-fuel corridor.');
assertIncludes(screen, 'const preTrailDraftResolution = useMemo(', 'Trip Builder should derive draft pre-trail POI status from the canonical resolver.');
assert(!screen.includes('bailoutPlanPointsFromRouteContext(routeContextSnapshot)'), 'Trip Builder should not auto-suggest Route Context bailout choices.');
assert(!screen.includes('buildBailoutSearchAnchors(params.routePoints)'), 'Trip Builder should not run bailout search anchors.');
assert(!screen.includes("filter((point) => point.source !== 'mapbox_search')"), 'Trip Builder should not rank bailout choices from generic map results.');
assertIncludes(screen, 'tripSetupScroller', 'Trip Builder setup inputs should remain usable on smaller screens.');
assertIncludes(screen, "import { useFocusEffect } from '@react-navigation/native';", 'Trip Builder hardware Back handling should be registered through the focused screen lifecycle.');
assertIncludes(screen, 'useFocusEffect(', 'Trip Builder hardware Back handling should have screen-focus priority over stack navigation.');
assertIncludes(screen, "BackHandler.addEventListener('hardwareBackPress'", 'Trip Builder should intercept Android hardware Back while picker overlays are open.');
assertIncludes(screen, 'if (bailoutPickerVisible) {', 'Trip Builder hardware Back should close the bailout picker before leaving the screen.');
assertIncludes(screen, 'if (campPickerVisible) {', 'Trip Builder hardware Back should close the camp picker before leaving the screen.');
assertIncludes(screen, 'if (planMapScope) {', 'Trip Builder hardware Back should close scoped trip map overlays before leaving the screen.');
assertIncludes(screen, 'closeTripPlanOverlay();', 'Trip Builder hardware Back should dismiss the generated plan overlay through the explicit close path.');
assertIncludes(screen, 'const tripSetupHasSavedReferencePins = bailoutPlanPins.length > 0 || campPlanPins.length > 0;', 'Trip Builder setup should detect saved reference pins for mobile scroll clearance.');
assertIncludes(screen, 'contentContainerStyle={tripSetupContentStyle}', 'Trip Builder setup ScrollView should use saved-pin-aware content clearance.');
assertIncludes(screen, 'tripSetupScrollerRef.current?.scrollToEnd({ animated: true });', 'Trip Builder setup should reveal the next camp/build controls after a saved reference pin expands the form.');
assertIncludes(screen, 'tripSetupContentWithSavedPins', 'Trip Builder setup should add extra bottom clearance when saved bailout or camp pins expand the form.');
assertIncludes(screen, 'testID="trip-builder-results"', 'Trip Builder results view');
assertIncludes(screen, 'TripPlanMapOverlay', 'Trip Builder results should expose a trip map overlay.');
assertIncludes(screen, 'testID="trip-builder-map-overlay"', 'Trip Builder map overlay test hook');
assertIncludes(screen, 'getTripPlanMapReadyCount(route, plan', 'Trip Builder map button visibility should use lightweight map-ready counts.');
assertIncludes(screen, "tripPlanMapAvailability.itinerary ? () => openPlanMap('itinerary') : undefined", 'Suggested itinerary map button should only appear when itinerary pins exist.');
assertIncludes(screen, "tripPlanMapAvailability.camps ? () => openPlanMap('camps') : undefined", 'Camp candidates map button should only appear when camp pins exist.');
assertIncludes(screen, "tripPlanMapAvailability.exits ? () => openPlanMap('exits') : undefined", 'Exit access map button should only appear when exit pins exist.');
assertIncludes(screen, "tripPlanMapAvailability.resupply ? () => openPlanMap('resupply') : undefined", 'Smart Resupply map button should only appear when resupply pins exist.');
assertIncludes(screen, 'handleStartItineraryEdit', 'Suggested itinerary should expose an edit action.');
assertIncludes(screen, 'testID="trip-builder-itinerary-editor"', 'Trip Builder should render an itinerary edit mode.');
assertIncludes(screen, 'Add itinerary location', 'Trip Builder itinerary edit mode should expose add-location slots.');
assertIncludes(screen, 'Resupply, known camp, waypoint, or address', 'Trip Builder itinerary add slots should use generic location copy.');
assertIncludes(screen, 'testID="trip-builder-itinerary-search-input"', 'Trip Builder itinerary edit mode should expose search input.');
assertIncludes(screen, 'searchRoadDestinations', 'Trip Builder itinerary search should use the Mapbox road search flow.');
assertIncludes(screen, 'resolveRoadDestination', 'Trip Builder itinerary insertion should resolve selected Mapbox suggestions.');
assertIncludes(screen, 'testID="trip-builder-save-itinerary"', 'Trip Builder should save edited itineraries.');
assertIncludes(screen, 'Confidence-Built Itinerary', 'Saved itinerary should be labeled as confidence-built.');
assertIncludes(screen, 'getTripItinerarySummary', 'Trip Builder should derive itinerary summary copy from TripItinerary data.');
assertIncludes(screen, 'getTripItineraryReview', 'Trip Builder should derive phased review rows from TripItinerary data.');
assertIncludes(screen, 'createTripItineraryEditSession', 'Trip Builder should create a TripItinerary edit session instead of mutating source records.');
assertIncludes(screen, 'applyTripItineraryEditSession', 'Trip Builder should apply user edits onto a safe itinerary copy.');
assertIncludes(screen, 'acceptTripItineraryEditItem', 'Trip Builder should let users accept ECS-suggested itinerary items.');
assertIncludes(screen, 'dismissTripItineraryEditItem', 'Trip Builder should track removed ECS suggestions as dismissed.');
assertIncludes(screen, 'addUserItineraryStop', 'Trip Builder should let users add manual itinerary stops.');
assertIncludes(screen, 'addUserTrailWaypoint', 'Trip Builder should let users add manual trail waypoints.');
assertIncludes(screen, 'reorderTripItineraryStop', 'Trip Builder should reorder stops through the phase-safe edit helper.');
assertIncludes(screen, 'selectedTripItinerary', 'Trip Builder should keep a draft TripItinerary available for itinerary summary rendering.');
assertIncludes(screen, 'testID="trip-builder-itinerary-summary"', 'Trip Builder should render a compact itinerary summary in the itinerary result area.');
assertIncludes(screen, 'testID="trip-builder-itinerary-review"', 'Trip Builder should render the Confidence-Built Itinerary review panel.');
assertIncludes(screen, 'testID="trip-builder-itinerary-confidence-summary"', 'Trip Builder itinerary review should show confidence summary.');
assertIncludes(screen, 'testID="trip-builder-itinerary-missing-warnings"', 'Trip Builder itinerary review should show missing-data warnings.');
assertIncludes(screen, 'testID={`trip-builder-itinerary-accept-${item.id}`}', 'Trip Builder itinerary review should expose accept controls per editable item.');
assertIncludes(screen, 'testID={`trip-builder-itinerary-remove-${item.id}`}', 'Trip Builder itinerary review should expose remove controls per editable item.');
assertIncludes(screen, 'testID={`trip-builder-itinerary-move-up-${item.id}`}', 'Trip Builder itinerary review should expose safe reorder controls.');
assertIncludes(screen, 'trip-builder-add-user-stop', 'Trip Builder itinerary review should expose a manual stop add control.');
assertIncludes(screen, 'trip-builder-add-user-waypoint', 'Trip Builder itinerary review should expose a manual waypoint add control.');
assertIncludes(screen, 'testID="trip-builder-itinerary-dismissed-count"', 'Trip Builder itinerary review should report dismissed suggestions separately.');
assertIncludes(screen, 'trip-builder-itinerary-phase-${phase.key}', 'Trip Builder itinerary summary should expose phase-level test hooks.');
assertIncludes(screen, 'trip-builder-review-phase-${phase.key}', 'Trip Builder itinerary review should expose phase-level test hooks.');
assertIncludes(itineraryReview, 'Confidence-Built Itinerary Review', 'Trip Builder review should label the phased itinerary review.');
assertIncludes(itineraryReview, 'Pre-Trail Fuel/Supplies', 'Trip Builder review should show the pre-trail resupply phase.');
assertIncludes(itineraryReview, 'Camp/Scenic/Bailout Points', 'Trip Builder review should show trail waypoint intelligence separately.');
assertIncludes(screen, 'Confidence Summary', 'Trip Builder review should include confidence summary copy.');
assertIncludes(screen, 'Missing Data', 'Trip Builder review should include missing-data warning copy.');
assertIncludes(itinerarySummary, 'ECS will guide you from your current location to the trailhead', 'Trip Builder summary should include full-itinerary copy.');
assertIncludes(itinerarySummary, 'Trail route geometry is not available yet', 'Trip Builder summary should include missing trail geometry copy.');
assertIncludes(itinerarySummary, 'Pre-trail fuel and supply search is not available yet', 'Trip Builder summary should include missing pre-trail POI copy.');
assertIncludes(itinerarySummary, 'Current location is unavailable', 'Trip Builder summary should include missing GPS copy.');
assertIncludes(screen, 'handleToggleItineraryBailout', 'Trip Builder itinerary edit mode should let users mark a stop as a bailout.');
assertIncludes(screen, 'toggleItineraryStopBailout', 'Trip Builder should persist bailout stop metadata when edited.');
assertIncludes(screen, 'testID={`trip-builder-itinerary-bailout-${stop.id}`}', 'Trip Builder should expose a bailout toggle per editable itinerary stop.');
assertIncludes(screen, 'ITINERARY_STANDARD_COLOR', 'Trip Builder standard itinerary markers should share the green itinerary tone.');
assertIncludes(screen, 'ITINERARY_BAILOUT_COLOR', 'Trip Builder bailout itinerary markers should use the red emergency tone.');
assertIncludes(screen, 'formatTripMapLetter(index)', 'Suggested itinerary map should label pins with A/B/C style letters.');
assertIncludes(screen, "pinType: 'itinerary'", 'Suggested itinerary pins should render letter labels instead of category-only icons.');
assertIncludes(screen, 'cameraCommand={model.cameraCommand}', 'Trip Builder map should keep scoped camera commands available.');
assertIncludes(screen, "reason: `trip_builder_${scope}_focus_${focusMarker.id}`", 'Suggested itinerary map should snap immediately to the first itinerary marker.');
assertIncludes(screen, "reason: `trip_builder_${reasonPrefix}_route_preview_bounds`", 'Suggested itinerary map should be able to fit the selected route preview bounds.');
assertIncludes(screen, 'buildTripPlanCameraCommand(scope, focusMarker, points.length)', 'Trip Builder map model should build scoped camera commands.');
assertIncludes(screen, 'nearestCoordinateOnRouteLine', 'Suggested itinerary map should project normal itinerary stops onto the route line.');
assertIncludes(screen, 'routePreviewPoints: TripMapCoordinate[] = []', 'Trip Builder map should accept prepared selected-route preview points.');
assertIncludes(screen, 'const preparedRoutePoints = routePreviewPoints.filter(isValidMapCoordinate)', 'Trip Builder itinerary map should prefer prepared route preview geometry.');
assertIncludes(screen, "const itineraryRouteLinePoints = scope === 'itinerary' && routePoints.length >= 2", 'Suggested itinerary map should render the route preview line instead of independent marker-to-marker lines.');
assertIncludes(screen, 'over the selected route preview', 'Suggested itinerary map copy should explain that itinerary pins sit over the selected route preview.');
assertIncludes(screen, 'connectToRouteLine: isGuidanceConnectedTripPlanStop(stop)', 'Suggested itinerary map should keep reference-only camp and bailout pins unconnected from the projected guidance line.');
assertIncludes(screen, 'interpolateTripRouteCoordinate(routePoints, stop.routeMileMarker)', 'Suggested itinerary map should derive missing stop coordinates from route mile markers.');
assertIncludes(screen, 'coordinateForTripPlanStop(plan, stop', 'Suggested itinerary map should recover route start and finish stop coordinates.');
assertIncludes(screen, 'if (isValidMapCoordinate(stop.coordinate))', 'Suggested itinerary markers should use their exact coordinate before route-mile interpolation.');
assertIncludes(screen, 'routePointsForTripMap(route)', 'Trip Builder should reuse normalized route points instead of recalculating raw route coordinates inline.');
assert(!screen.includes('waypoints={model.markers}'), 'Trip Builder map should avoid duplicate waypoint and pin overlays.');
assertIncludes(screen, 'getOfflinePrepRouteCoordinates', 'Trip Builder trip map should use the Offline Prep route geometry resolver.');
assertIncludes(screen, 'routeForOfflinePrep', 'Trip Builder should enrich Offline Prep handoff with generated plan waypoints.');
assertIncludes(screen, 'resupplyPoints', 'Trip Builder Offline Prep handoff should include Smart Resupply points.');
assertIncludes(screen, 'exitPoints', 'Trip Builder Offline Prep handoff should include bailout/exit points.');
assertIncludes(screen, 'referencePoints', 'Trip Builder Offline Prep handoff should include reference-only camp and bailout pins.');
assertIncludes(screen, 'exitPointFromBailoutStop', 'Trip Builder Offline Prep handoff should convert marked bailout stops into exit points.');
assertIncludes(screen, 'tripBuilderBailoutPointCount', 'Trip Builder Offline Prep route metadata should count marked bailout points.');
assertIncludes(screen, 'styles.stopNote', 'Trip Builder itinerary stop notes');
assertIncludes(screen, 'Turn a selected route into a day trip, overnight route, or expedition-style plan.', 'Trip Builder helper copy');
assertIncludes(screen, 'Build Trip Plan', 'Trip Builder primary action copy');
assertIncludes(screen, 'Camp Check', 'Trip Builder camping result');
assertIncludes(screen, 'No known camp source detected. Verify before departure.', 'Trip Builder unknown camp copy');
assertIncludes(screen, 'Exit data unavailable. Verify before departure.', 'Trip Builder exit unavailable copy');
assertIncludes(screen, 'Smart Resupply Plan', 'Trip Builder Smart Resupply result');
assertIncludes(screen, 'Check fuel, water, supply, repair, medical, and exit access before departure.', 'Trip Builder Smart Resupply helper copy');
assertIncludes(screen, 'DATA UNAVAILABLE', 'Trip Builder unknown data label');
assertIncludes(screen, 'testID="trip-builder-smart-resupply-plan"', 'Trip Builder Smart Resupply test hook');
assertIncludes(screen, 'cycleResupplyOverride', 'Trip Builder should let operators cycle manual support status rows.');
assertIncludes(screen, "RESUPPLY_OVERRIDE_CATEGORIES", 'Trip Builder should constrain manual support overrides to appropriate categories.');
assertIncludes(screen, 'tap this container to change its status', 'Trip Builder tappable support rows should explain that their status can be changed.');
assertIncludes(screen, 'resupplyTitleHint', 'Trip Builder tappable support-row hint should use smaller helper text.');
assertIncludes(screen, 'SUPPLIED', 'Trip Builder should display manually supplied support status.');
assertIncludes(screen, 'NOT REQUIRED', 'Trip Builder should display manually not-required support status.');
assertIncludes(screen, 'testID={`trip-builder-resupply-row-${plan.category}`}', 'Trip Builder should expose tappable resupply rows.');
assertIncludes(screen, 'Fuel', 'Trip Builder Smart Resupply fuel row');
assertIncludes(screen, 'Water', 'Trip Builder Smart Resupply water row');
assertIncludes(screen, 'Food/Supplies', 'Trip Builder Smart Resupply supplies row');
assertIncludes(screen, 'Repair', 'Trip Builder Smart Resupply repair row');
assertIncludes(screen, 'Medical', 'Trip Builder Smart Resupply medical row');
assertIncludes(screen, 'Exit Access', 'Trip Builder Smart Resupply exit row');
assertIncludes(screen, 'testID="trip-builder-empty-state"', 'Trip Builder missing data state');
assertIncludes(screen, 'No routes ready for planning', 'Trip Builder empty state copy');
assertIncludes(screen, "router.push('/explore-offline-prep-pack')", 'Offline Prep Pack CTA navigation');
assertIncludes(screen, 'testID="trip-builder-prepare-offline-pack"', 'Offline Prep Pack CTA');

const clearPlanCalls = (screen.match(/setPlan\(null\)/g) || []).length;
assert(clearPlanCalls === 2, 'Only selecting a different route or importing a replacement route should clear an already generated Trip Builder result.');
assert(!/const togglePriority =[\s\S]*?setPlan\(null\);[\s\S]*?setPriorities/.test(screen), 'Priority edits should not close an already generated Trip Builder result.');
assert(!/setGroupType\(option\.value\);\s*setPlan\(null\);/.test(screen), 'Group type edits should not close an already generated Trip Builder result.');

assertIncludes(discover, 'stageTripBuilderItineraryHandoff(route);', 'Explore selected route handoff');
assertIncludes(discover, 'userLocation: tripBuilderHandoffUserLocation', 'Explore selected route GPS itinerary handoff');
assertIncludes(discover, "pathname: '/explore-trip-builder'", 'Explore selected route navigation');
assertIncludes(discover, "params: { routeId: routeForHandoff.id, setup: '1' }", 'Explore route preselection should open Trip Setup directly');
assertIncludes(discover, "case 'trip_builder':", 'Explore Trip Builder tab option');
assertIncludes(discover, 'clearTripBuilderRouteHandoff();', 'Explore top-level Trip Builder reset');
assertIncludes(discover, "router.push('/explore-trip-builder')", 'Explore Trip Builder tab should open the real Trip Builder route picker directly.');
assert(!discover.includes('testID="explore-open-trip-builder"'), 'Explore should not render a redundant Open Trip Builder staging page.');
assertIncludes(discover, 'testID="explore-tripbuilder-wizard-surface"', 'Explore should render the direct route-first TripBuilder wizard surface.');
assertIncludes(discover, 'EXPLORE TRIP BUILDER', 'Explore Trip Builder hero eyebrow should render readable spaced copy on mobile.');
assert(!discover.includes('EXPLORE TRIPBUILDER'), 'Explore Trip Builder hero eyebrow should not use compressed compound copy.');
assertIncludes(discover, 'const handleOpenExploreTripBuilderFromHero = useCallback(() => {', 'Explore TripBuilder hero should use a dedicated press handler.');
assertIncludes(discover, 'accessibilityLabel="Open Explore Trip Builder"', 'Explore TripBuilder hero should expose a mobile accessibility label.');
assertIncludes(discover, 'accessibilityRole="button"', 'Explore TripBuilder hero should be announced as a tappable control.');
assert(
  /<TouchableOpacity[\s\S]*?testID="explore-tripbuilder-wizard-surface"[\s\S]*?onPress=\{handleOpenExploreTripBuilderFromHero\}/.test(discover),
  'Explore TripBuilder hero should be a tappable surface that opens the real Trip Builder route picker.',
);
assert(!discover.includes('testID="explore-primary-tab-control"'), 'Explore should not render the legacy primary tab control.');
assertIncludes(discover, 'ExploreTripBuilderWizardRouteCard', 'Explore should expose Build Trip directly on guidance-ready route cards.');
assertIncludes(discover, 'handleBuildTripFromExploreWizardCandidate', 'Explore wizard cards should save and route into Trip Builder.');
assertIncludes(discover, 'exploreSuggestedRouteOptions', 'Trip Builder tab should use current Suggested Routes filter context.');
assertIncludes(discover, 'saveExplorePlanningRouteContext({', 'Explore should save filtered routes for Trip Builder.');
assertIncludes(discover, 'handleBuildTripFromRoute(selectedOpportunity)', 'Selected route details entry');
assertIncludes(discover, 'stageTripBuilderItineraryHandoff(op);', 'Selected route analysis should prepare a Trip Builder itinerary draft');
assertIncludes(discover, 'handleBuildTripFromRoute(aiPreviewRoute)', 'AI route details entry');
assertIncludes(discover, 'handleBuildTripFromRoute(route);', 'AI route card entry');
assertIncludes(rootLayout, 'name="explore-trip-builder"', 'Root protected stack should register the direct Trip Builder route for mobile handoff.');
assertIncludes(rootLayout, 'name="explore-offline-prep-pack"', 'Root protected stack should register the Explore Offline Prep route for sibling planning handoff.');

assert(!screen.includes('ExpeditionReadinessCard'), 'Trip Builder UI must not duplicate the readiness card component.');
assert(!screen.includes('ExploreReadinessSummary'), 'Trip Builder UI must not duplicate route readiness summary UI.');
assert(!screen.includes('community'), 'Trip Builder UI must not add community content.');

console.log('Trip Builder UI wiring checks passed');
