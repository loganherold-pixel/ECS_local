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
const discover = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const planningTabs = fs.readFileSync(path.join(root, 'components', 'discover', 'ExplorePlanningTabs.tsx'), 'utf8');

const suggestedTrailheads = registry.getExploreFeatureById('suggested_routes');
assert.ok(suggestedTrailheads, 'Suggested Trailheads should be discoverable through the Explore registry API.');
assert.strictEqual(suggestedTrailheads.title, 'Suggested Trailheads', 'The registered section name is a stable UI contract.');
assert.strictEqual(suggestedTrailheads.category, 'routes');
assert.strictEqual(suggestedTrailheads.status, 'live');
assert.strictEqual(suggestedTrailheads.enabled, true);
assert.ok(suggestedTrailheads.description.trim().length > 0, 'The registry should provide non-empty capability guidance.');
assert.ok(
  registry.getVisibleExploreFeatures().some((feature) => feature.id === suggestedTrailheads.id),
  'The enabled Suggested Trailheads feature should be returned by the visible registry query.',
);

assert.ok(
  planningTabs.includes('testID="explore-planning-tabs"') &&
    planningTabs.includes("key: 'suggested_routes'") &&
    planningTabs.includes("suggested_routes: '/discover'") &&
    planningTabs.includes('pushSingleFlight(EXPLORE_PLANNING_TAB_ROUTES[key])'),
  'The semantic planning-tab section should navigate Suggested Trailheads through the supported Explore route.',
);

assert.ok(
  discover.includes('testID={`explore-planning-route-option-${route.id}`}') &&
    discover.includes('accessibilityRole="button"') &&
    discover.includes('accessibilityLabel={`Select ${route.name}`}') &&
    discover.includes('setExplorePlanningSelectedRouteId(String(route.id))'),
  'Suggested Trailhead items should expose a stable semantic ID, accessible selection action, and observable selection result.',
);
assert.ok(
  discover.includes('testID="explore-suggested-routes-disabled"'),
  'Unavailable Suggested Trailheads should render a stable semantic disabled-state surface.',
);
assert.ok(
  !discover.includes('ready from Suggested Routes'),
  'Legacy wording must not reappear as a substitute for the Suggested Trailheads contract.',
);

console.log('Explore Suggested Trailheads semantic UI checks passed.');
