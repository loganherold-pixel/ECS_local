const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
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
const registry = read('lib/explore/exploreFeatureRegistry.ts');

assertIncludes(registry, "id: 'trip_builder'", 'Explore registry');
assertIncludes(registry, "description: 'Turn a selected route into a day trip, overnight route, or expedition-style plan.'", 'Explore registry');
assertIncludes(registry, "status: 'live'", 'Explore registry');
assertIncludes(registry, "id: 'offline_prep_pack'", 'Explore registry');
assertIncludes(screen, 'testID="trip-builder-screen"', 'Trip Builder screen');
assertIncludes(screen, 'loadTripBuilderRouteHandoff', 'Trip Builder route handoff');
assertIncludes(screen, 'loadExplorePlanningRouteContext', 'Trip Builder should consume active Explorer filter route context.');
assertIncludes(screen, 'loadOpportunitiesWithCompatibility(null)', 'Trip Builder route selection');
assertIncludes(screen, 'testID="trip-builder-selected-route"', 'Trip Builder selected route summary');
assertIncludes(screen, 'testID={`trip-builder-trip-type-${option.value}`}', 'Trip Builder trip type controls');
assertIncludes(screen, 'testID={`trip-builder-time-${option.value}`}', 'Trip Builder time controls');
assertIncludes(screen, 'testID={`trip-builder-group-${option.value}`}', 'Trip Builder group controls');
assertIncludes(screen, 'testID="trip-builder-camping-needed"', 'Trip Builder camping-needed control');
assertIncludes(screen, 'testID="trip-builder-camping-needed-toggle"', 'Trip Builder camping-needed toggle');
assertIncludes(screen, "setCampingNeeded(!priorities.includes('camping'))", 'Trip Builder camping-needed priority wiring');
assertIncludes(screen, 'testID={`trip-builder-priority-${option.value}`}', 'Trip Builder priority controls');
assertIncludes(screen, 'Choose up to 2', 'Trip Builder priority limit copy');
assertIncludes(screen, 'buildTripPlan({', 'Trip Builder planning service call');
assertIncludes(screen, 'testID="trip-builder-generate"', 'Trip Builder generate action');
assertIncludes(screen, 'testID="trip-builder-results"', 'Trip Builder results view');
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
assert(clearPlanCalls === 1, 'Only selecting a different route should clear an already generated Trip Builder result.');
assert(!/const togglePriority =[\s\S]*?setPlan\(null\);[\s\S]*?setPriorities/.test(screen), 'Priority edits should not close an already generated Trip Builder result.');
assert(!/setTimeWindow\(option\.value\);\s*setPlan\(null\);/.test(screen), 'Time window edits should not close an already generated Trip Builder result.');
assert(!/setGroupType\(option\.value\);\s*setPlan\(null\);/.test(screen), 'Group type edits should not close an already generated Trip Builder result.');

assertIncludes(discover, 'saveTripBuilderRouteHandoff(route as any)', 'Explore selected route handoff');
assertIncludes(discover, "pathname: '/explore-trip-builder'", 'Explore selected route navigation');
assertIncludes(discover, 'params: { routeId: route.id }', 'Explore route preselection');
assertIncludes(discover, "case 'trip_builder':", 'Explore Trip Builder tab option');
assertIncludes(discover, 'clearTripBuilderRouteHandoff();', 'Explore top-level Trip Builder reset');
assertIncludes(discover, 'testID="explore-primary-tab-control"', 'Explore should render Trip Builder inside the primary tab control.');
assertIncludes(discover, 'exploreSuggestedRouteOptions', 'Trip Builder tab should use current Suggested Routes filter context.');
assertIncludes(discover, 'saveExplorePlanningRouteContext({', 'Explore should save filtered routes for Trip Builder.');
assertIncludes(discover, 'handleBuildTripFromRoute(selectedOpportunity)', 'Selected route details entry');
assertIncludes(discover, 'handleBuildTripFromRoute(aiPreviewRoute)', 'AI route details entry');
assertIncludes(discover, 'handleBuildTripFromRoute(route);', 'AI route card entry');

assert(!screen.includes('ExpeditionReadinessCard'), 'Trip Builder UI must not duplicate the readiness card component.');
assert(!screen.includes('ExploreReadinessSummary'), 'Trip Builder UI must not duplicate route readiness summary UI.');
assert(!screen.includes('community'), 'Trip Builder UI must not add community content.');

console.log('Trip Builder UI wiring checks passed');
