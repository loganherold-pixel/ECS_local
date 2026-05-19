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
const registry = read('lib/explore/exploreFeatureRegistry.ts');

assertIncludes(registry, "id: 'offline_prep_pack'", 'Explore registry');
assertIncludes(screen, 'testID="offline-prep-pack-screen"', 'Offline Prep screen');
assertIncludes(screen, 'loadOfflinePrepPackHandoff', 'Offline Prep handoff load');
assertIncludes(screen, 'loadExplorePlanningRouteContext', 'Offline Prep should consume active Explorer filter route context.');
assertIncludes(screen, 'loadOpportunitiesWithCompatibility(null)', 'Offline Prep route selection');
assertIncludes(screen, 'testID="offline-prep-empty-state"', 'Offline Prep empty state');
assertIncludes(screen, 'testID="offline-prep-selected-route"', 'Offline Prep selected route');
assertIncludes(screen, 'buildOfflinePrepPackManifest(selectedInput)', 'Offline Prep manifest generation');
assertIncludes(screen, 'testID="offline-prep-manifest"', 'Offline Prep manifest display');
assertIncludes(screen, "type === 'offline_map'", 'Offline map item display');
assertIncludes(screen, 'Download needed', 'Offline Prep pending download state');
assertIncludes(screen, 'Unavailable', 'Offline Prep unavailable state');
assertIncludes(screen, 'testID="offline-prep-unavailable-state"', 'Offline Prep unavailable recovery');
assertIncludes(screen, 'testID="offline-prep-failed-state"', 'Offline Prep failed state');
assertIncludes(screen, 'testID="offline-prep-prepare"', 'Offline Prep prepare action');
assertIncludes(screen, 'testID="offline-prep-prepare-result"', 'Offline Prep prepare result');
assertIncludes(screen, "manifest.progress.status === 'failed'", 'Offline Prep failed prepare copy');
assertIncludes(screen, 'Retry Manifest', 'Offline Prep retry action');
assertIncludes(screen, 'Save route essentials for low-service travel.', 'Offline Prep helper copy');
assertIncludes(screen, 'Unavailable items stay clearly marked.', 'Offline Prep honesty copy');
assertIncludes(screen, 'Offline map download is not available yet', 'Offline Prep unavailable map copy');
assertIncludes(screen, 'Downloads are marked ready only when confirmed by ECS infrastructure.', 'Offline Prep download honesty copy');
assertIncludes(screen, 'Export GPX', 'Offline Prep GPX action');
assertIncludes(screen, 'Save Trip Sheet', 'Offline Prep trip sheet action');

assertIncludes(handoff, 'saveOfflinePrepPackHandoff', 'Offline Prep handoff save');
assertIncludes(handoff, 'loadOfflinePrepPackHandoff', 'Offline Prep handoff load');
assertIncludes(handoff, 'clearOfflinePrepPackHandoff', 'Offline Prep handoff clear');

assertIncludes(tripBuilder, 'saveOfflinePrepPackHandoff({', 'Trip Builder Offline Prep CTA handoff');
assertIncludes(tripBuilder, "}, 'trip_builder')", 'Trip Builder Offline Prep CTA source');
assertIncludes(tripBuilder, "router.push('/explore-offline-prep-pack')", 'Trip Builder Offline Prep navigation');
assertIncludes(tripBuilder, 'testID="trip-builder-prepare-offline-pack"', 'Trip Builder Offline Prep CTA');

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
