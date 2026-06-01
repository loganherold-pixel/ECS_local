const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

global.__DEV__ = false;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad.call(this, request, parent, isMain);
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

function loadTsModule(relPath) {
  const filename = path.join(root, relPath);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  require.extensions['.ts'](mod, filename);
  return mod.exports;
}

const { extractExploreRouteCampMarkers } = loadTsModule(path.join('lib', 'exploreRouteCampHandoff.ts'));
const { buildExploreNavigationPayload } = loadTsModule(path.join('lib', 'navigationHandoffStore.ts'));

function route(overrides = {}) {
  return {
    id: 'bowman-lake-road',
    name: 'Bowman Lake Road',
    region: 'Regression Range',
    regionGroup: 'great-basin',
    distanceMiles: 12,
    terrainType: 'forest road',
    remotenessScore: 6,
    estimatedFuelRequired: 2,
    suggestedCamps: 3,
    description: 'Drivable Explore route regression fixture.',
    highlights: ['Camp-aware route'],
    elevationGainFt: 900,
    estimatedDays: 1,
    bestSeason: 'summer',
    permitRequired: false,
    imageTag: 'regression',
    startLat: 39.1,
    startLng: -111.1,
    routeGeometry: [
      { lat: 39.1, lng: -111.1 },
      { lat: 39.2, lng: -111.2 },
    ],
    ...overrides,
  };
}

const summaryOnly = route({ suggestedCamps: 4 });
assert.deepStrictEqual(
  extractExploreRouteCampMarkers(summaryOnly),
  [],
  'suggestedCamps is a count only and must not create fake camp pins.',
);

const coordinateBacked = route({
  routeMetadata: {
    campCandidates: [
      {
        id: 'camp-a',
        title: 'Forest Pullout Camp',
        coordinate: { latitude: 39.18, longitude: -111.18 },
        suitabilityScore: 86,
      },
      {
        id: 'camp-b',
        coordinates: [-111.19, 39.19],
        status: 'rejected_access',
      },
      {
        id: 'camp-c',
        geometry: { coordinates: [-111.2, 39.2] },
        confidenceScore: 72,
      },
    ],
  },
});
const markers = extractExploreRouteCampMarkers(coordinateBacked);
assert.strictEqual(markers.length, 2, 'Only viable coordinate-backed camp candidates should become markers.');
assert.strictEqual(markers[0].title, 'Forest Pullout Camp');
assert.strictEqual(markers[0].rating, 'A');
assert.strictEqual(markers[1].rankLabel, 'C2');

const payload = buildExploreNavigationPayload(coordinateBacked);
assert.strictEqual(payload.campMarkers.length, 2, 'Explore navigation payload should carry camp marker handoff data.');
assert.strictEqual(
  payload.routeMetadata.routeCampMarkerCount,
  2,
  'Payload metadata should expose the real coordinate-backed camp count.',
);

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
assert.ok(
  discoverSource.includes('campsActionAvailable={selectedOpportunityCampMarkers.length > 0}') &&
    discoverSource.includes('handleViewRouteCamps'),
  'Explorer Expedition Data should only make Camps actionable when camp markers exist.',
);

const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
assert.ok(
  navigateSource.includes('exploreRouteCampMarkers') &&
    navigateSource.includes("markerKind: 'explore_route_camp'") &&
    navigateSource.includes("reason: 'explore_route_camps'"),
  'Navigate should render and fit Explorer route camp markers from the handoff payload.',
);

console.log('Explore camp handoff checks passed.');
