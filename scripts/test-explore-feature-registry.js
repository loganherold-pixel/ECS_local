const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

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

const registry = require(path.join(root, 'lib', 'explore', 'exploreFeatureRegistry.ts'));
const routeManifest = require(path.join(root, 'lib', 'routeManifest.ts'));

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const offlinePrepSource = fs.readFileSync(path.join(root, 'app', 'explore-offline-prep-pack.tsx'), 'utf8');
const planningTabsSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExplorePlanningTabs.tsx'),
  'utf8',
);
const layoutSource = fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8');
const authResolverSource = fs.readFileSync(
  path.join(root, 'lib', 'auth', 'distributionEntryResolver.ts'),
  'utf8',
);
const enrichedCardSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'EnrichedRouteCard.tsx'),
  'utf8',
);
const filterSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'DistanceRadiusFilter.tsx'),
  'utf8',
);
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

const features = registry.getExploreFeatureRegistry({
  env: {
    EXPO_PUBLIC_ECS_EXPLORE_OFFLINE_PREP_PACK: undefined,
  },
});

assert.deepStrictEqual(
  features.map((feature) => feature.id),
  ['suggested_routes', 'route_filters', 'offline_prep_pack'],
  'Explore should register trail discovery, its hidden filter utility, and offline trail downloads only.',
);
assert.deepStrictEqual(
  features.map((feature) => feature.order),
  [10, 20, 40],
  'Explore feature ordering should keep trail discovery first and Offline Trails last.',
);

for (const feature of features) {
  assert.ok(feature.title, `${feature.id} should have a display title.`);
  assert.ok(feature.description, `${feature.id} should have a short description.`);
  assert.ok(feature.icon, `${feature.id} should use an existing icon reference.`);
  assert.ok(['routes', 'offline'].includes(feature.category), `${feature.id} should have a supported category.`);
  assert.strictEqual(typeof feature.enabled, 'boolean', `${feature.id} should resolve enabled state.`);
}

assert.strictEqual(
  registry.getExploreFeatureById('suggested_routes').status,
  'live',
  'Suggested trailheads should remain a live Explore feature.',
);
assert.strictEqual(
  registry.getExploreFeatureById('route_filters').status,
  'live',
  'Route filters should remain a live hidden utility.',
);
assert.strictEqual(
  registry.getExploreFeatureById('offline_prep_pack').status,
  'live',
  'Offline Trails should remain a live wired feature.',
);
assert.strictEqual(
  registry.getExploreFeatureById('offline_prep_pack').route,
  '/explore-offline-prep-pack',
  'Offline Trails should route to the canonical offline download screen.',
);
assert.strictEqual(
  registry.getExploreFeatureById('trip_builder'),
  null,
  'Trip Builder must not remain addressable through the mounted Explore feature registry.',
);

assert.ok(registry.EXPLORE_FEATURE_CATEGORY_STYLES.offline, 'Offline category styling should exist.');
assert.strictEqual(
  registry.EXPLORE_FEATURE_CATEGORY_STYLES.offline.label,
  'Offline',
  'Offline trail downloads should use an explicit Offline category.',
);

const disabledOffline = registry.getExploreFeatureRegistry({
  env: {
    EXPO_PUBLIC_ECS_EXPLORE_OFFLINE_PREP_PACK: 'off',
  },
});
assert.strictEqual(
  disabledOffline.find((feature) => feature.id === 'offline_prep_pack').enabled,
  false,
  'Offline Trails should respect the canonical feature visibility policy.',
);
assert.deepStrictEqual(
  registry.getVisibleExploreFeatures({
    env: {
      EXPO_PUBLIC_ECS_EXPLORE_OFFLINE_PREP_PACK: 'disabled',
    },
  }).map((feature) => feature.id),
  ['suggested_routes'],
  'Visible Explore features should hide Route Filters and a disabled Offline Trails capability.',
);
assert.deepStrictEqual(
  registry.getVisibleExploreFeatures().map((feature) => feature.id),
  ['suggested_routes', 'offline_prep_pack'],
  'The mounted Explore selector should expose Find Trails and Offline Trails only.',
);

assertIncludes(discoverSource, 'getVisibleExploreFeatures', 'Explore should consume the canonical visible-feature registry.');
assertIncludes(discoverSource, 'suggestedRoutesFeatureEnabled', 'Explore should resolve Suggested Routes through that registry.');
assertIncludes(discoverSource, "reason: 'feature_disabled'", 'A disabled trail rollout should terminate provider work explicitly.');
assertIncludes(discoverSource, 'testID="explore-suggested-routes-disabled"', 'A disabled trail rollout should render a mounted unavailable state.');
assertIncludes(discoverSource, 'if (!suggestedRoutesFeatureEnabled || !routeCatalogHasSearchArea) return;', 'Retry should not issue provider work without a valid search area.');
assertIncludes(discoverSource, "case 'suggested_routes':", 'Find Trails should keep routing to the existing discovery surface.');
assertIncludes(discoverSource, "case 'offline_prep_pack':", 'Offline Trails should keep routing to the existing download surface.');
assertNotIncludes(discoverSource, "case 'route_filters':", 'Route Filters should remain a utility rather than a primary tab.');
assertIncludes(discoverSource, "offline_prep_pack: 'LIVE'", 'Offline Trails should show its live capability badge.');
assertIncludes(discoverSource, 'testID="explore-offline_prep_pack-tab-panel"', 'Offline Trails should retain an inline selection and import panel.');
assertIncludes(discoverSource, 'testID="explore-open-offline-prep-pack"', 'Offline Trails should expose an explicit handoff action.');
assertIncludes(discoverSource, 'testID="explore-offline-prep-import-route-file"', 'Offline Trails should retain private route-file import.');
assertIncludes(discoverSource, "pathname: '/explore-offline-prep-pack'", 'Explore should hand selected trails to the canonical offline route.');
assertIncludes(discoverSource, "mode: 'trail_download'", 'Explore offline handoffs should request the route-only manifest mode.');

for (const removedContract of [
  "'trip_builder'",
  '/explore-trip-builder',
  'explore-tripbuilder',
  'BUILD TRIP',
  'onBuildTrip=',
]) {
  assertNotIncludes(
    discoverSource,
    removedContract,
    `Mounted Explore should not retain the removed planning contract ${removedContract}.`,
  );
}

assertIncludes(discoverSource, 'useThrottledGPS', 'Explore should continue using the existing GPS source.');
assertIncludes(discoverSource, 'hasGPSFix', 'Explore should keep an explicit GPS-fix state.');
assertIncludes(discoverSource, 'DistanceRadiusFilter', 'The basic distance filter should remain mounted.');
assertIncludes(discoverSource, 'applyExploreRefinementFilter', 'The route refinement pipeline should remain wired.');
assertIncludes(discoverSource, 'EnrichedRouteCard', 'Existing trail suggestion cards should remain wired.');
assertIncludes(discoverSource, 'buildExploreRouteReadinessStorePatch', 'Existing route readiness state should remain wired.');
assertIncludes(enrichedCardSource, 'ExploreReadinessSummary', 'Existing route cards should still render readiness summary.');
assertIncludes(
  enrichedCardSource,
  'buildExploreRouteReadinessAssessment',
  'Existing route cards should still use route readiness assessment logic.',
);
assertIncludes(filterSource, 'EXPLORE_DISCOVERY_FILTER_OPTIONS.map', 'Existing route refinement options should still render.');

assertIncludes(offlinePrepSource, 'Offline Prep Pack', 'Offline Trails should retain the established download screen.');
assertIncludes(offlinePrepSource, 'buildOfflinePrepPackManifest(selectedInput)', 'Offline Trails should use the canonical manifest service.');
assertIncludes(offlinePrepSource, 'testID="offline-prep-manifest"', 'Offline Trails should render generated manifests.');
assertIncludes(offlinePrepSource, 'Downloads are marked ready only when confirmed by ECS infrastructure.', 'Offline download status should remain truthful.');
assertIncludes(planningTabsSource, "label: 'Find Trails'", 'Offline navigation should provide a Find Trails return tab.');
assertIncludes(planningTabsSource, "label: 'Offline Trails'", 'Offline navigation should label the download surface clearly.');
assertNotIncludes(planningTabsSource, 'trip_builder', 'Offline navigation tabs should not expose Trip Builder.');
assertNotIncludes(planningTabsSource, '/explore-trip-builder', 'Offline navigation tabs should not link into planning.');

const offlinePrepFeature = registry.getExploreFeatureById('offline_prep_pack');
assert.ok(offlinePrepFeature, 'Offline Trails should be discoverable through the registry API.');
assert.strictEqual(offlinePrepFeature.category, 'offline');
assert.strictEqual(offlinePrepFeature.status, 'live');
assert.strictEqual(offlinePrepFeature.enabled, true);
assert.strictEqual(offlinePrepFeature.route, '/explore-offline-prep-pack');
assert.strictEqual(
  routeManifest.getRouteFeatureRequirement(offlinePrepFeature.route),
  offlinePrepFeature.centralFeatureId,
  'Offline execution should target the route protected by the registered capability.',
);
assertIncludes(layoutSource, 'name="explore-offline-prep-pack"', 'The root stack should register Offline Trails.');
assert.strictEqual(routeManifest.getRouteMetadata('/explore-offline-prep-pack')?.parentSurface, 'explore');
assert.strictEqual(routeManifest.getRouteOwnership('/explore-offline-prep-pack')?.restorableShellRoute, '/discover');
assertIncludes(authResolverSource, 'getRouteMetadata', 'Pre-setup route access should use canonical route metadata.');
assertIncludes(authResolverSource, "metadata.setupRequirement === 'none'", 'Offline Trails should remain reachable before vehicle setup.');

const mountedExploreCopy = [
  registry.getExploreFeatureRegistry().map((feature) => `${feature.title} ${feature.description}`).join(' '),
  discoverSource,
  planningTabsSource,
].join('\n').toLowerCase();

for (const forbidden of [
  'resupply plan',
  'trip builder',
  'printable itinerary',
]) {
  assertNotIncludes(mountedExploreCopy, forbidden, `Mounted Explore should not introduce ${forbidden}.`);
}

assertIncludes(
  packageSource,
  '"test:explore-feature-registry": "node ./scripts/test-explore-feature-registry.js"',
  'package.json should keep the Explore registry regression test.',
);

console.log('Explore feature registry checks passed.');
