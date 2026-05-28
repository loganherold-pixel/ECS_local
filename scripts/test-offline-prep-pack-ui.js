const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(source, needle, label) {
  assert(source.includes(needle), `${label} missing expected source: ${needle}`);
}

const screen = read('app/explore-offline-prep-pack.tsx');
const tripBuilder = read('app/explore-trip-builder.tsx');
const discover = read('app/(tabs)/discover.tsx');
const handoff = read('lib/offlinePrepPack/offlinePrepPackHandoffStore.ts');
const service = read('lib/offlinePrepPack/offlinePrepPackService.ts');
const registry = read('lib/explore/exploreFeatureRegistry.ts');

assertIncludes(registry, "id: 'offline_prep_pack'", 'Explore registry');
assertIncludes(screen, 'testID="offline-prep-pack-screen"', 'Offline Prep screen');
assertIncludes(screen, 'ExplorePlanningTabs', 'Offline Prep should keep Explore top tabs available.');
assertIncludes(screen, 'activeTab="offline_prep_pack"', 'Offline Prep should mark the Offline Prep tab active.');
assertIncludes(screen, 'loadOfflinePrepPackHandoff', 'Offline Prep handoff load');
assertIncludes(screen, 'loadExplorePlanningRouteContext', 'Offline Prep should consume active Explorer filter route context.');
assertIncludes(screen, 'loadOpportunitiesWithCompatibility(null)', 'Offline Prep route selection');
assertIncludes(screen, 'testID="offline-prep-empty-state"', 'Offline Prep empty state');
assert(!screen.includes('testID="offline-prep-selected-route"'), 'Offline Prep Pack should not render a redundant Selected Route container after route personalization.');
assert(!screen.includes('routeListScroller'), 'Offline Prep Pack should not render the route selector once the prep-pack stage is reached.');
assertIncludes(screen, 'buildOfflinePrepPackManifest(selectedInput)', 'Offline Prep manifest generation');
assertIncludes(screen, 'fetchSharedWeatherForCoordinates(weatherCoordinates', 'Offline Prep should hydrate route weather snapshots.');
assertIncludes(screen, 'buildOfflinePrepWeatherSnapshot', 'Offline Prep should normalize route weather snapshots before marking weather ready.');
assertIncludes(screen, 'testID="offline-prep-manifest"', 'Offline Prep manifest display');
assertIncludes(screen, 'testID={`offline-prep-item-${item.type}`}', 'Offline Prep should render manifest items with type-specific test IDs.');
assertIncludes(screen, 'Download needed', 'Offline Prep pending download state');
assertIncludes(screen, 'Unavailable', 'Offline Prep unavailable state');
assertIncludes(screen, 'Not set', 'Offline Prep optional unset state');
assertIncludes(screen, 'testID="offline-prep-unavailable-state"', 'Offline Prep unavailable recovery');
assertIncludes(screen, 'testID="offline-prep-failed-state"', 'Offline Prep failed state');
assertIncludes(screen, 'testID="offline-prep-prepare"', 'Offline Prep prepare action');
assertIncludes(screen, 'testID="offline-prep-prepare-result"', 'Offline Prep prepare result');
assertIncludes(screen, 'testID="offline-prep-partial-confirm"', 'Offline Prep partial packs should show a continue confirmation.');
assertIncludes(screen, 'testID="offline-prep-continue-partial"', 'Offline Prep partial confirmation should allow continuing.');
assertIncludes(screen, 'shouldConfirmPartialPrepare(manifest)', 'Offline Prep partial route essentials should be reminders instead of hard blockers.');
assertIncludes(screen, 'cacheOfflineRoute({', 'Offline Prep prepare should persist route geometry to the offline route cache.');
assertIncludes(screen, 'listOfflineCachedRoutes()', 'Offline Prep screen should reload prepared packs from the offline route cache.');
assertIncludes(screen, 'runStore.upsert({', 'Offline Prep prepare should save the prepared route to Navigate route storage.');
assertIncludes(screen, 'offlineCachedRouteToRunCacheManifest(updated, run)', 'Offline Prep prepare should attach cache metadata to the saved run.');
assertIncludes(screen, "source: 'offline_prep_tab'", 'Offline Prep prepare should keep the prepared route visible to Explore planning context.');
assertIncludes(screen, 'offlineTileSyncCoordinator', 'Offline Prep prepare should start the shared route sync coordinator.');
assertIncludes(screen, 'Offline Prep Pack download started. Progress will remain visible above the ECS banner while you move through the app.', 'Offline Prep prepare should confirm background download progress.');
assertIncludes(screen, "existingCompleteRegion ? 'complete' : 'downloading'", 'Offline Prep prepare should mark the saved route as downloading while route tiles sync.');
assertIncludes(screen, "job.status === 'complete'", 'Offline Prep prepare should update the saved route when route tiles complete.');
assertIncludes(screen, 'testID="offline-prep-map-queue-state"', 'Offline Prep should render live route-cache queue state.');
assertIncludes(screen, 'testID="offline-prep-retry-map-download"', 'Offline Prep should expose a retry action for failed map preparation.');
assertIncludes(screen, 'resolveOfflinePrepMapQueueState({ manifest, syncSnapshot, regions: tileRegions })', 'Offline Prep should derive map progress from the shared sync queue and tile cache.');
assertIncludes(screen, "manifest.progress.status === 'failed'", 'Offline Prep failed prepare copy');
assertIncludes(screen, 'Retry Manifest', 'Offline Prep retry action');
assertIncludes(screen, 'Save route essentials for low-service travel.', 'Offline Prep helper copy');
assertIncludes(screen, 'Offline pack ready to prepare', 'Offline Prep live default state copy');
assert(!screen.includes('Offline pack staged'), 'Offline Prep Pack should not describe the live feature as staged.');
assertIncludes(screen, 'Unavailable items stay clearly marked.', 'Offline Prep honesty copy');
assertIncludes(service, 'Offline map preparation can start from Explore and will report route-cache progress here.', 'Offline Prep pending map copy');
assertIncludes(service, 'Full-route map download exceeds the automatic offline prep limit.', 'Offline Prep should clearly fail oversized full-route map downloads.');
assertIncludes(service, 'Low-Signal Map Segments', 'Offline Prep should offer low-signal segment downloads when the full map is too large.');
assertIncludes(service, 'remoteness_route_forecast', 'Offline Prep segment fallback should be grounded in ECS remoteness forecasting.');
assertIncludes(screen, 'manifestFullRouteMapTooLarge(manifest)', 'Offline Prep prepare should detect oversized full-route maps.');
assertIncludes(screen, 'criticalOfflineSegmentsFromManifest(manifest)', 'Offline Prep prepare should use manifest low-signal segments.');
assertIncludes(screen, 'Prepared Low-Signal Offline Segments', 'Offline Prep should save segment fallback context.');
assertIncludes(screen, "offlinePrepFallbackFor: 'full_route_map_limit'", 'Offline Prep segment route intent should explain the full-map fallback.');
assert(!service.includes('Route bounds exceed the automatic offline prep limit.'), 'Offline Prep should use field-facing full-map-limit copy.');
assertIncludes(screen, 'Downloads are marked ready only when confirmed by ECS infrastructure.', 'Offline Prep download honesty copy');
assert(!screen.includes('Export GPX'), 'Offline Prep should not show a redundant GPX export button.');
assert(!screen.includes('Save Trip Sheet'), 'Offline Prep should not show a redundant Save Trip Sheet button.');
assert(!screen.includes('is connected to this Offline Prep manifest and will be bundled with the prepared route package.'), 'Offline Prep should not show placeholder secondary action copy.');

assertIncludes(service, 'Campsites and Emergency Points', 'Offline Prep manifest should merge campsites and emergency points.');
assertIncludes(service, 'Camp candidates and optional emergency points. Either can be saved with the pack or have not been set for this pack.', 'Offline Prep merged campsite/emergency copy.');
assert(!service.includes("source: 'emergency_support_points'"), 'Emergency support points should not remain an independent Offline Prep manifest source.');
assertIncludes(service, 'Trip sheet manifest is available from the generated Trip Builder plan and Offline Prep manifest.', 'Trip sheet item should be wired to the Offline Prep manifest.');

assertIncludes(handoff, 'saveOfflinePrepPackHandoff', 'Offline Prep handoff save');
assertIncludes(handoff, 'loadOfflinePrepPackHandoff', 'Offline Prep handoff load');
assertIncludes(handoff, 'clearOfflinePrepPackHandoff', 'Offline Prep handoff clear');

assertIncludes(tripBuilder, 'saveOfflinePrepPackHandoff({', 'Trip Builder Offline Prep CTA handoff');
assertIncludes(tripBuilder, "}, 'trip_builder')", 'Trip Builder Offline Prep CTA source');
assertIncludes(tripBuilder, "router.push('/explore-offline-prep-pack')", 'Trip Builder Offline Prep navigation');
assertIncludes(tripBuilder, 'testID="trip-builder-prepare-offline-pack"', 'Trip Builder Offline Prep CTA');
assertIncludes(tripBuilder, "offlinePrepGeometrySource: routePoints.length >= 2", 'Trip Builder Offline Prep handoff should mark selected route preview geometry.');
assertIncludes(tripBuilder, 'selectedPreparedRoutePoints.length >= 2', 'Trip Builder Offline Prep handoff should use prepared route preview points.');

assertIncludes(discover, 'handlePrepareOfflineFromRoute', 'Selected route Offline Prep handler');
assertIncludes(discover, 'testID="explore-primary-tab-control"', 'Offline Prep should be reachable through the Explorer primary tab control.');
assertIncludes(discover, 'exploreSuggestedRouteOptions', 'Offline Prep tab should use current Suggested Routes filter context.');
assertIncludes(discover, "}, 'route_details')", 'Selected route Offline Prep handoff source');
assertIncludes(discover, "pathname: '/explore-offline-prep-pack'", 'Selected route Offline Prep navigation');
assertIncludes(discover, 'testID="selected-route-prepare-offline-pack"', 'Selected route Offline Prep action');
assertIncludes(discover, 'clearOfflinePrepPackHandoff();', 'Explore top-level Offline Prep reset');

assert(!screen.includes('community'), 'Offline Prep Pack UI must not add community content.');
assert(!screen.includes('No fake download success'), 'Offline Prep Pack UI should use field-facing copy instead of implementation jargon.');
assert(screen.includes('Downloads are marked ready only when confirmed by ECS infrastructure.'), 'Offline Prep Pack must keep download readiness honest.');

console.log('Offline Prep Pack UI wiring checks passed');
