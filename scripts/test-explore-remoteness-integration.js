const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
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

const originalModuleLoad = Module._load;
const orchestratorDependencyMocks = {
  '../ai/confidenceEngine': {
    assessExploreRecommendationConfidence: () => ({ score: 80, level: 'high', reasons: [], sources: [] }),
  },
  '../ai/operatorTrustMode': { operatorTrustModeStore: { mode: 'standard' } },
  '../ai/operatorTrustResolvers': {
    trustModeExploreScoreAdjustment: () => 0,
    trustModeExploreVisibility: (visibility) => visibility,
  },
  '../ai/recommendationExplanationEngine': { explainRecommendation: () => null },
  '../ai/trustContract': { buildTrustMetadata: () => null },
  '../ai/scoreStability': { bucketStableScore: (score) => score },
  '../vehicleEcsIntegration': {
    getActiveVehicleSnapshotForEcs: () => null,
    scoreVehicleSuitabilityForEcs: () => ({ level: 'strong', label: 'Strong fit', concerns: [] }),
  },
};
Module._load = function loadExploreOrchestratorWithMocks(request, parent, isMain) {
  if (
    parent?.filename.endsWith('exploreOrchestratorAdapter.ts') &&
    Object.prototype.hasOwnProperty.call(orchestratorDependencyMocks, request)
  ) {
    return orchestratorDependencyMocks[request];
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};
const { orchestrateExploreSectionRoutes } = require(
  path.join(root, 'lib', 'explore', 'exploreOrchestratorAdapter.ts'),
);
Module._load = originalModuleLoad;
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
  ['b'],
  'Remoteness refinement should filter current results to remote routes and rank them by remoteness descending.',
);
assert.strictEqual(
  refinement.applyExploreRefinementFilter(routes, 'remoteness').length,
  1,
  'Remoteness refinement should count only remote matches in the current result set.',
);

function orchestratorRoute(id) {
  return {
    id,
    name: 'Same Orchestrated Route',
    distanceMiles: 10,
    distanceFromUserMiles: 10,
    estimatedDays: 1,
    remotenessScore: 8,
    routeLabel: 'Hidden Gem',
    gemScore: {
      score: 80,
      isGem: true,
      factors: {
        lowPopularity: 80,
        scenicValue: 80,
        remoteness: 80,
        terrainVariety: 80,
        explorationValue: 80,
        freshness: 80,
      },
    },
    riskPreview: { level: 'Low', factors: [] },
    vehicleMatch: { score: 80 },
    recommendationConfidence: { score: 80, level: 'high' },
  };
}

assert.deepStrictEqual(
  orchestrateExploreSectionRoutes({
    section: 'hidden_gem',
    routes: [orchestratorRoute('stable-b'), orchestratorRoute('stable-a')],
    hasGPSFix: true,
  }).surfaced.map((route) => route.id),
  ['stable-a', 'stable-b'],
  'Equal-score, equal-name orchestration results should use stable route identity instead of provider insertion order.',
);

assert.strictEqual(presentation.getExploreRemotenessRating({ remotenessScore: 8 }), 'A');
assert.strictEqual(presentation.getExploreRemotenessRating({ remotenessScore: 6 }), 'B');
assert.strictEqual(presentation.getExploreRemotenessRating({ remotenessScore: 3 }), 'C');
assert.strictEqual(presentation.getExploreRemotenessRating({ remotenessScore: 1 }), 'D');
const confidenceGeometry = Array.from({ length: 20 }, (_, index) => [-121 + index * 0.001, 39 + index * 0.001]);
const recommendationSeedConfidence = presentation.getExploreRouteConfidencePercent({
  recommendationConfidence: { score: 78 },
  distanceMiles: 10,
  geometry: { type: 'LineString', coordinates: confidenceGeometry },
  activeGuidance: { status: 'ready', topologyResolved: true },
});
assert.ok(
  recommendationSeedConfidence > 78 && recommendationSeedConfidence <= 86,
  'Explore card confidence should use existing ECS recommendation confidence as a live seed and adjust it with geometry/readiness evidence.',
);
assert.strictEqual(
  presentation.getExploreRouteConfidencePercent({ confidence: 'good' }),
  58,
  'AI route confidence should map to a numeric percent and still drop when route geometry/readiness evidence is missing.',
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
