const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}
require.extensions['.ts'] = compileTypescript;

function mockTypescriptModule(relativePath, exports) {
  const filename = path.join(root, 'lib', relativePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

mockTypescriptModule('discoverCategoryEngine.ts', {
  getHiddenGemRecommendations: () => ({ items: [] }),
  getPopularTrailRecommendations: () => [],
});
mockTypescriptModule('navigationHandoffStore.ts', {
  buildExploreNavigationPayload: (route) => ({ route }),
});
mockTypescriptModule('exploreRoutePreview.ts', {
  getExploreRoutePreviewRoutePoints: (payload) => payload.route.routePoints ?? [],
});
mockTypescriptModule(path.join('explore', 'exploreMapPreviewOptimization.ts'), {
  simplifyRouteGeometryForPreview: (points) => points,
});
mockTypescriptModule(path.join('explore', 'exploreDiscoveryItem.ts'), {
  normalizeExploreDiscoveryItems: (items) => items.map((item) => ({
    route: item.route,
    primarySource: { sourceKind: item.sourceKind, sourceId: item.route.id },
  })),
  routeWithExploreDiscoveryProvenance: (item) => item.route,
});

const { buildExploreRouteOverlaySegmentsFromRoutes } = require(
  path.join(root, 'lib', 'navigateExploreRoutesOverlay.ts'),
);

function route(index, overrides = {}) {
  return {
    id: `overlay-${String(index).padStart(2, '0')}`,
    name: `Overlay route ${index}`,
    region: 'Privacy-safe fixture region',
    regionGroup: 'great-basin',
    distanceMiles: 10,
    terrainType: 'trail',
    remotenessScore: 5,
    estimatedFuelRequired: 1,
    suggestedCamps: 0,
    description: 'Overlay route fixture',
    highlights: [],
    elevationGainFt: 0,
    estimatedDays: 1,
    bestSeason: 'unknown',
    permitRequired: false,
    imageTag: 'trail',
    startLat: 39,
    startLng: -120,
    matchScore: index,
    routePoints: [
      { lat: 39, lng: -120 },
      { lat: 39.01, lng: -120.01 },
    ],
    ...overrides,
  };
}

const validRoutes = Array.from({ length: 51 }, (_, index) => route(index));
const result = buildExploreRouteOverlaySegmentsFromRoutes({
  trailPackRoutes: [
    route(999, { id: 'invalid-geometry', matchScore: 1_000, routePoints: [] }),
    ...validRoutes,
    { ...validRoutes[0], name: 'Duplicate route identity' },
  ],
  maxRenderedRoutes: 51,
});

assert.strictEqual(result.segments.length, 20, 'Map route overlays must clamp oversized result limits to 20.');
assert.strictEqual(new Set(result.segments.map((segment) => segment.route.id)).size, 20);
assert.strictEqual(result.segments[0].route.id, 'overlay-50', 'Ranking must occur before the final map-route slice.');
assert(!result.segments.some((segment) => segment.route.id === 'invalid-geometry'));
assert(result.cappedCount > 0, 'The overlay should report additional valid matches beyond the cap.');

const invalidLimitResult = buildExploreRouteOverlaySegmentsFromRoutes({
  trailPackRoutes: validRoutes,
  maxRenderedRoutes: -2,
});
assert.strictEqual(invalidLimitResult.segments.length, 20, 'Invalid overlay limits must use the safe default of 20.');

console.log('Navigate Explore route-cap checks passed.');
