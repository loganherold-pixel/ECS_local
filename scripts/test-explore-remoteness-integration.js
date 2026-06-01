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
const presentation = require(path.join(root, 'lib', 'explore', 'exploreRemotenessPresentation.ts'));
const enrichedCardSource = fs.readFileSync(path.join(root, 'components', 'discover', 'EnrichedRouteCard.tsx'), 'utf8');
const aiCardSource = fs.readFileSync(path.join(root, 'components', 'discover', 'AIRouteCard.tsx'), 'utf8');
const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');

const routes = [
  { id: 'a', name: 'Town Loop', remotenessScore: 2, popularityScore: 80 },
  { id: 'b', name: 'Backcountry Ridge', remotenessScore: 8, popularityScore: 22 },
  { id: 'c', name: 'Forest Spur', remotenessScore: 5, popularityScore: 44 },
];

assert.deepStrictEqual(
  refinement.applyExploreRefinementFilter(routes, 'remoteness').map((route) => route.id),
  ['b', 'c', 'a'],
  'Remoteness refinement should sort current results by remoteness descending.',
);
assert.strictEqual(
  refinement.applyExploreRefinementFilter(routes, 'remoteness').length,
  routes.length,
  'Remoteness refinement should not aggressively zero out results.',
);

assert.strictEqual(presentation.getExploreRemotenessRating({ remotenessScore: 8 }), 'A');
assert.strictEqual(presentation.getExploreRemotenessRating({ remotenessScore: 6 }), 'B');
assert.strictEqual(presentation.getExploreRemotenessRating({ remotenessScore: 3 }), 'C');
assert.strictEqual(presentation.getExploreRemotenessRating({ remotenessScore: 1 }), 'D');
assert.strictEqual(
  presentation.getExploreRouteConfidencePercent({
    recommendationConfidence: { score: 78 },
  }),
  78,
  'Explore card confidence should prefer existing ECS recommendation confidence score.',
);
assert.strictEqual(
  presentation.getExploreRouteConfidencePercent({ confidence: 'good' }),
  76,
  'AI route confidence should map to a numeric percent when no ECS score is present.',
);

for (const source of [enrichedCardSource, aiCardSource]) {
  assert.ok(
    source.includes('getExploreRemotenessRating') &&
      source.includes('getExploreRouteConfidencePercent'),
    'Explore cards should use the shared remoteness presentation helpers.',
  );
  assert.ok(
    source.includes('Remote: {remotenessRating}') &&
      source.includes('Confidence: {routeConfidencePercent}%'),
    'Explore cards should render Remote A-D and Confidence percent labels.',
  );
  assert.ok(
    source.includes('remoteDecisionRow'),
    'Explore card additions should use a compact row that keeps card sizing uniform.',
  );
}

assert.ok(
  discoverSource.includes('EXPLORE_CATEGORY_PAGE_SIZE = 10') &&
    !discoverSource.includes('NEXT 5'),
  'Explore pagination should allow up to 10 items at a time without reverting to 5-item panels.',
);
assert.ok(
  discoverSource.includes('getHiddenGemRecommendations(') &&
    discoverSource.includes('orchestrateExploreSectionRoutes'),
  'Hidden Gems pipeline should remain connected to the existing orchestration path.',
);

console.log('Explore remoteness integration checks passed.');
