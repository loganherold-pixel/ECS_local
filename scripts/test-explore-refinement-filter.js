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

const refinement = require(path.join(root, 'lib', 'explore', 'exploreRefinementFilter.ts'));
const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const filterSource = fs.readFileSync(path.join(root, 'components', 'discover', 'DistanceRadiusFilter.tsx'), 'utf8');
const helperSource = fs.readFileSync(path.join(root, 'lib', 'explore', 'exploreRefinementFilter.ts'), 'utf8');

function route(id, overrides = {}) {
  return {
    id,
    name: id,
    remotenessScore: 5,
    popularityScore: 50,
    estimatedDays: 1,
    ...overrides,
  };
}

const routes = [
  route('local-day', { remotenessScore: 4, popularityScore: 70, estimatedDays: 1 }),
  route('remote-day', { remotenessScore: 8, popularityScore: 25, estimatedDays: 1 }),
  route('weekend', { remotenessScore: 6, popularityScore: 35, estimatedDays: 2 }),
  route('expedition', { remotenessScore: 9, popularityScore: 20, estimatedDays: 4 }),
  route('unknown-duration', { remotenessScore: 3, popularityScore: 80, estimatedDays: undefined }),
];

assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, null).map((item) => item.id),
  routes.map((item) => item.id),
  'No refinement should preserve the current radius-filtered result set.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, 'remoteness').map((item) => item.id),
  ['expedition', 'remote-day', 'weekend', 'local-day', 'unknown-duration'],
  'Remoteness should rank the current dataset by remoteness without eliminating usable results.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, 'dayTrip').map((item) => item.id),
  ['local-day', 'remote-day'],
  'Day Trip should include trails estimated at 1 day or less.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, 'weekendTrip').map((item) => item.id),
  ['weekend'],
  'Weekend Trip should include trails over 1 day and up to 2 days.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, 'expedition').map((item) => item.id),
  ['expedition'],
  'Expedition should include trails estimated at 3 or more days.',
);

const counts = refinement.getExploreRefinementCounts(routes);
assert.strictEqual(counts.remoteness, routes.length, 'Remoteness count should preserve the current dataset size.');
assert.strictEqual(counts.dayTrip, 2, 'Day Trip count should be computed from current results.');
assert.strictEqual(counts.weekendTrip, 1, 'Weekend Trip count should be computed from current results.');
assert.strictEqual(counts.expedition, 1, 'Expedition count should be computed from current results.');

const unknownDurationRoutes = [
  route('imported-gpx-one', { estimatedDays: undefined, description: 'Imported trail missing duration metadata.' }),
  route('imported-gpx-two', { estimatedDays: undefined, description: 'Saved route without trip length.' }),
];
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(unknownDurationRoutes, 'dayTrip').map((item) => item.id),
  ['imported-gpx-one', 'imported-gpx-two'],
  'Trip-type filters should not create a false empty state when every route is missing duration metadata.',
);
assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter([
    route('hinted-weekend', { estimatedDays: undefined, description: 'Weekend overnight route.' }),
  ], 'weekendTrip').map((item) => item.id),
  ['hinted-weekend'],
  'Trip-type filters should use text/category hints when duration metadata is unavailable.',
);

assert.ok(
  discoverSource.includes('const [exploreRefinement, setExploreRefinement] = useState<ExploreRefinementFilter | null>(') &&
    discoverSource.includes('initialExploreFilterStateRef.current.refinement') &&
    discoverSource.includes('loadExploreFilterStateSnapshot'),
  'Explore should keep a single selected refinement state and restore it from the Explorer filter snapshot.',
);
assert.ok(
  discoverSource.includes('applyExploreRefinementFilter(canonicalRadiusFilteredRoutes, exploreRefinement)'),
  'Explore should apply refinements after radius and deduped eligibility filters.',
);
assert.ok(
  discoverSource.includes('selectedRefinement={exploreRefinement}'),
  'The filter panel should receive the active refinement.',
);
assert.ok(
  discoverSource.includes('showRefinementEmptyState'),
  'Explore should expose a clear zero-result refinement state.',
);
assert.ok(
  discoverSource.includes('const radiusFilteredAIRoutes = useMemo<AIGeneratedRoute[]>') &&
    discoverSource.includes('() => filterByRadius(aiRoutes, activeDistanceRadius) as AIGeneratedRoute[]') &&
    discoverSource.includes('applyExploreRefinementFilter(radiusFilteredAIRoutes, exploreRefinement)'),
  'ECS Route Ideas should respect the selected radius before applying refinement filters.',
);
assert.ok(
  discoverSource.includes('const [aiRouteIdeaPageIndex, setAiRouteIdeaPageIndex] = useState(0);') &&
    discoverSource.includes('setAiRouteIdeaPageIndex(0);'),
  'Changing Explore filters should reset ECS Route Ideas pagination.',
);
assert.ok(
  discoverSource.includes('actionLabel="Clear Refinement"'),
  'Zero-result refinement state should provide one-tap clearing.',
);
assert.ok(
  !discoverSource.includes('<Text style={s.generateAIBtnTitle}>GET ECS ROUTE IDEAS</Text>'),
  'ECS Route Ideas should appear automatically without the redundant Get ECS Route Ideas CTA.',
);
assert.ok(
  filterSource.includes('label="Filters"'),
  'The distance radius container should present as a general Filters panel.',
);
assert.ok(
  helperSource.includes('Remoteness') &&
    helperSource.includes('Day Trip') &&
    helperSource.includes('Weekend Trip') &&
    helperSource.includes('Expedition') &&
    filterSource.includes('EXPLORE_REFINEMENT_OPTIONS.map'),
  'The filter panel should render all four refinement labels.',
);
assert.ok(
  filterSource.includes('onChangeRefinement(isActive ? null : option.key)'),
  'Selecting a different refinement should replace the previous one and active chips should clear.',
);

console.log('Explore refinement filter checks passed.');
