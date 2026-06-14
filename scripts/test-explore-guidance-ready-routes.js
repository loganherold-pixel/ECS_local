const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const discoverPath = path.join(root, 'app', '(tabs)', 'discover.tsx');
const catalogPath = path.join(root, 'lib', 'explore', 'routeCatalog.ts');

global.__DEV__ = false;

const discover = fs.readFileSync(discoverPath, 'utf8');
const catalog = fs.readFileSync(catalogPath, 'utf8');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

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

const {
  buildExploreGuidanceReadyInventory,
  defaultExploreReadyRouteEligibility,
} = require(path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'));

function makeRoute(id, overrides = {}) {
  return {
    id,
    name: `Remote Ready ${id}`,
    region: 'Regression Range',
    regionGroup: 'great-basin',
    distanceMiles: 42,
    terrainType: 'remote two-track',
    remotenessScore: 8,
    estimatedDays: 1,
    startLat: 38,
    startLng: -110,
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110, 38],
        [-109.95, 38.05],
        [-109.9, 38.1],
      ],
    },
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      confidenceScore: 90,
    },
    ...overrides,
  };
}

assert(
  discover.includes('Guidance Ready Routes') &&
    discover.includes('guidanceReadyRouteOptions') &&
    discover.includes('routePassesExploreMapLength') &&
    discover.includes('MIN_DISCOVERY_ROUTE_MILES'),
  'Explore should expose a Guidance Ready route set while preserving the 5+ mile minimum.',
);
assert(
  discover.includes('hasGuidanceReadyGeometry') &&
    discover.includes('activeGuidance') &&
    discover.includes('routeGeometryMode'),
  'Explore guidance-ready filtering should require usable stitched/full route geometry metadata.',
);
assert(
  discover.includes('source-backed') &&
    discover.includes('confidence') &&
    discover.includes('data state'),
  'Explore guidance-ready copy should keep source, confidence, and data-state visibility.',
);
assert(
  catalog.includes("activeGuidance?: ECSTrailPackActiveGuidance") &&
    catalog.includes("routeGeometryMode?: 'full' | 'preview_simplified' | 'omitted'"),
  'Route catalog types should expose active guidance and route geometry mode for guidance-ready filtering.',
);

assert(
  discover.includes('buildExploreGuidanceReadyInventory') &&
    discover.includes('exploreGuidanceReadyInventory.refinementCounts') &&
    discover.includes('exploreGuidanceReadyInventory.candidateSet.candidates.length'),
  'Discover should drive filter chips and Guidance Ready Routes from the shared ready-route inventory.',
);
assert(
  !discover.includes('visibleTrailPacks\n        .map((trailPack) => trailPackToExpeditionOpportunity(trailPack))') &&
    !discover.includes('visibleAIRoutes\n          .filter(routePassesExploreMapLength)'),
  'TripBuilder ready counts must not be built from page-sized visible Trail Pack or AI route windows.',
);

const remoteReadyRoutes = Array.from({ length: 9 }, (_, index) => makeRoute(`remote-ready-${index + 1}`));
const previewOnlyRoute = makeRoute('preview-only', {
  routeGeometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [-110, 38],
        [-109.98, 38.02],
      ],
      [
        [-109.9, 38.1],
        [-109.86, 38.14],
      ],
    ],
  },
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'preview_simplified',
  },
});
const shortRoute = makeRoute('too-short', { distanceMiles: 3 });
const privateRoute = makeRoute('private-route', {
  routeMetadata: { routeTypeStatus: 'private', routeGeometryMode: 'full' },
});
const inventory = buildExploreGuidanceReadyInventory({
  trailPacks: remoteReadyRoutes.slice(0, 5),
  hiddenGemRoutes: remoteReadyRoutes.slice(5, 7),
  ecsRouteIdeas: remoteReadyRoutes.slice(7),
  favoriteRoutes: [previewOnlyRoute, shortRoute, privateRoute],
  selectedRefinement: 'remoteness',
});

assert.strictEqual(
  inventory.refinementCounts.remoteness,
  9,
  'Remoteness chip count should equal the guidance-ready filtered route count.',
);
assert.strictEqual(
  inventory.candidateSet.candidates.length,
  9,
  'Guidance Ready Routes count should use the same ready inventory as the active refinement count.',
);
assert.strictEqual(inventory.readyCount, 9, 'Ready count should ignore pagination-sized source windows.');
assert.strictEqual(inventory.hiddenTotal, 3, 'Routes hidden for geometry/public/length gates should be tracked separately.');
assert.strictEqual(
  defaultExploreReadyRouteEligibility(previewOnlyRoute).eligible,
  false,
  'Preview-only split geometry must not be treated as active-guidance-ready.',
);

console.log('Explore guidance-ready routes checks passed.');
