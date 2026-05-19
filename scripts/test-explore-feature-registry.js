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

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const placeholderSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExploreFeaturePlaceholderScreen.tsx'),
  'utf8',
);
const tripBuilderSource = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
const offlinePrepSource = fs.readFileSync(path.join(root, 'app', 'explore-offline-prep-pack.tsx'), 'utf8');
const layoutSource = fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8');
const enrichedCardSource = fs.readFileSync(path.join(root, 'components', 'discover', 'EnrichedRouteCard.tsx'), 'utf8');
const filterSource = fs.readFileSync(path.join(root, 'components', 'discover', 'DistanceRadiusFilter.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

const features = registry.getExploreFeatureRegistry({
  env: {
    EXPO_PUBLIC_ECS_EXPLORE_TRIP_BUILDER: undefined,
    EXPO_PUBLIC_ECS_EXPLORE_OFFLINE_PREP_PACK: undefined,
  },
});

assert.deepStrictEqual(
  features.map((feature) => feature.id),
  ['suggested_routes', 'route_filters', 'trip_builder', 'offline_prep_pack'],
  'Explore feature registry should expose the four top-level Explore options in display order.',
);
assert.deepStrictEqual(
  features.map((feature) => feature.order),
  [10, 20, 30, 40],
  'Explore feature registry order values should keep Suggested Routes and Route Filters first.',
);

for (const feature of features) {
  assert.ok(feature.title, `${feature.id} should have a display title.`);
  assert.ok(feature.description, `${feature.id} should have a short description.`);
  assert.ok(feature.icon, `${feature.id} should use an existing icon reference.`);
  assert.ok(['routes', 'planning'].includes(feature.category), `${feature.id} should have a supported category.`);
  assert.strictEqual(typeof feature.enabled, 'boolean', `${feature.id} should resolve enabled state.`);
}

assert.strictEqual(
  registry.getExploreFeatureById('suggested_routes').status,
  'live',
  'Suggested Routes should remain a live Explore feature.',
);
assert.strictEqual(
  registry.getExploreFeatureById('route_filters').status,
  'live',
  'Route Filters should remain a live Explore feature.',
);
assert.strictEqual(
  registry.getExploreFeatureById('trip_builder').status,
  'live',
  'Trip Builder should be registered as a live wired Explore feature.',
);
assert.strictEqual(
  registry.getExploreFeatureById('offline_prep_pack').status,
  'live',
  'Offline Prep Pack should be registered as a live wired Explore feature.',
);
assert.strictEqual(
  registry.getExploreFeatureById('trip_builder').route,
  '/explore-trip-builder',
  'Trip Builder should route to the Trip Builder flow.',
);
assert.strictEqual(
  registry.getExploreFeatureById('offline_prep_pack').route,
  '/explore-offline-prep-pack',
  'Offline Prep Pack should route to the Offline Prep Pack flow.',
);

assert.ok(registry.EXPLORE_FEATURE_CATEGORY_STYLES.planning, 'Planning category styling should exist.');
assert.strictEqual(
  registry.EXPLORE_FEATURE_CATEGORY_STYLES.planning.label,
  'Planning',
  'Planning category should be available for Explore planning features.',
);

const disabledTripBuilder = registry.getExploreFeatureRegistry({
  env: {
    EXPO_PUBLIC_ECS_EXPLORE_TRIP_BUILDER: '0',
    EXPO_PUBLIC_ECS_EXPLORE_OFFLINE_PREP_PACK: 'true',
  },
});
assert.strictEqual(
  disabledTripBuilder.find((feature) => feature.id === 'trip_builder').enabled,
  false,
  'Trip Builder should respect its disable feature flag.',
);
assert.strictEqual(
  disabledTripBuilder.find((feature) => feature.id === 'offline_prep_pack').enabled,
  true,
  'Offline Prep Pack should respect its enable feature flag.',
);
assert.deepStrictEqual(
  registry.getVisibleExploreFeatures({
    env: {
      EXPO_PUBLIC_ECS_EXPLORE_TRIP_BUILDER: 'disabled',
      EXPO_PUBLIC_ECS_EXPLORE_OFFLINE_PREP_PACK: 'off',
    },
  }).map((feature) => feature.id),
  ['suggested_routes'],
  'Visible Explore features should hide internal Route Filters and filter disabled planning features.',
);
assert.deepStrictEqual(
  registry.getVisibleExploreFeatures().map((feature) => feature.id),
  ['suggested_routes', 'trip_builder', 'offline_prep_pack'],
  'Visible Explore features should drive the three Explorer primary tabs.',
);

assertIncludes(discoverSource, 'getVisibleExploreFeatures', 'Explore tab should consume the visible three-tab feature registry.');
assertIncludes(discoverSource, 'testID="explore-primary-tab-control"', 'Explore tab should render the segmented primary tab control.');
assertIncludes(discoverSource, 'ECSSegmentedControl', 'Explore tab should use the existing ECS segmented tab control.');
assertIncludes(discoverSource, "case 'suggested_routes':", 'Suggested Routes tab should keep routing to existing suggestions.');
assertNotIncludes(discoverSource, "case 'route_filters':", 'Route Filters should no longer be a primary Explore tab action.');
assertIncludes(discoverSource, 'activeExplorePrimaryTab === \'suggested_routes\'', 'Suggested Routes should be the face-page tab.');
assertIncludes(discoverSource, 'testID={`explore-${activeExplorePrimaryTab}-tab-panel`}', 'Planning tabs should render inline tab panels.');
assertIncludes(discoverSource, 'event: \'explore_feature_selected\'', 'Explore feature selections should log a placeholder analytics-style event.');

assertIncludes(discoverSource, 'DistanceRadiusFilter', 'Existing Route Filters component should remain wired.');
assertIncludes(discoverSource, 'applyExploreRefinementFilter', 'Existing route refinement pipeline should remain wired.');
assertIncludes(discoverSource, 'EnrichedRouteCard', 'Existing route suggestion cards should remain wired.');
assertIncludes(discoverSource, 'buildExploreRouteReadinessStorePatch', 'Existing route readiness store patching should remain wired.');
assertIncludes(enrichedCardSource, 'ExploreReadinessSummary', 'Existing route cards should still render readiness summary.');
assertIncludes(
  enrichedCardSource,
  'buildExploreRouteReadinessAssessment',
  'Existing route cards should still use the route readiness assessment logic.',
);
assertIncludes(filterSource, 'EXPLORE_REFINEMENT_OPTIONS.map', 'Existing route filter options should still render.');

assertIncludes(tripBuilderSource, 'Trip Builder', 'Trip Builder screen should be clearly labeled.');
assertIncludes(
  tripBuilderSource,
  'Turn a selected route into a day trip, overnight route, or expedition-style plan.',
  'Trip Builder should use concise field-oriented helper copy.',
);
assertIncludes(tripBuilderSource, 'buildTripPlan({', 'Trip Builder screen should use the planning service.');
assertIncludes(tripBuilderSource, 'testID="trip-builder-results"', 'Trip Builder screen should render generated results.');
assertIncludes(offlinePrepSource, 'Offline Prep Pack', 'Offline Prep Pack screen should be clearly labeled.');
assertIncludes(
  offlinePrepSource,
  'Save route essentials for low-service travel.',
  'Offline Prep Pack should use concise field-oriented helper copy.',
);
assertIncludes(offlinePrepSource, 'buildOfflinePrepPackManifest(selectedInput)', 'Offline Prep Pack screen should use the manifest service.');
assertIncludes(offlinePrepSource, 'testID="offline-prep-manifest"', 'Offline Prep Pack screen should render generated manifests.');
assertIncludes(offlinePrepSource, 'Downloads are marked ready only when confirmed by ECS infrastructure.', 'Offline Prep Pack should keep unavailable downloads honest.');
assertIncludes(placeholderSource, 'registered as a placeholder', 'Placeholder screens should not claim unfinished functionality.');
assertIncludes(placeholderSource, 'Route suggestions and filters remain available', 'Placeholder screens should preserve current Explore behavior.');
assertIncludes(layoutSource, "normalized === '/explore-trip-builder'", 'Trip Builder should restore to the Explore shell route.');
assertIncludes(layoutSource, "normalized === '/explore-offline-prep-pack'", 'Offline Prep Pack should restore to the Explore shell route.');

const combinedNewSurface = [
  registry.getExploreFeatureRegistry().map((feature) => `${feature.title} ${feature.description}`).join(' '),
  placeholderSource,
  tripBuilderSource,
  offlinePrepSource,
].join('\n').toLowerCase();

for (const forbidden of ['comment', 'public submission', 'moderation', 'community report']) {
  assertNotIncludes(combinedNewSurface, forbidden, `Explore planning wiring should not introduce ${forbidden}.`);
}

assertIncludes(
  packageSource,
  '"test:explore-feature-registry": "node ./scripts/test-explore-feature-registry.js"',
  'package.json should expose the Explore feature registry regression test.',
);

console.log('Explore feature registry checks passed.');
