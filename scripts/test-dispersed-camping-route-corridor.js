const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(outputText, filename);
};

const {
  DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
  findDispersedCampingRegionsNearRoute,
} = loadTsModule('lib/map/dispersedCampingRouteSearch.ts');
const {
  buildDispersedCampingCampScoutCandidates,
} = loadTsModule('lib/campops/campCandidateScoring.ts');

function region(id, centerLat, centerLng) {
  const span = 0.004;
  return {
    id,
    name: id,
    landManager: 'BLM',
    confidence: 'high',
    eligibilityLabel: 'Likely eligible',
    basis: ['test fixture'],
    restrictions: [],
    requiresVerification: true,
    closureKnown: false,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [centerLng - span, centerLat - span],
        [centerLng + span, centerLat - span],
        [centerLng + span, centerLat + span],
        [centerLng - span, centerLat + span],
        [centerLng - span, centerLat - span],
      ]],
    },
  };
}

function rectangleRegion(id, minLat, maxLat, minLng, maxLng) {
  return {
    id,
    name: id,
    landManager: 'BLM',
    confidence: 'high',
    eligibilityLabel: 'Likely eligible',
    basis: ['test fixture'],
    restrictions: [],
    requiresVerification: true,
    closureKnown: false,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ]],
    },
  };
}

const routeCoordinates = [
  { latitude: 39, longitude: -120 },
  { latitude: 39, longitude: -119.8 },
];

assert.strictEqual(DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES, 3);

const nearRegion = region('near-three-mile-corridor', 39.025, -119.9);
const outsideRegion = region('outside-three-mile-corridor', 39.06, -119.9);
const nearbyResults = findDispersedCampingRegionsNearRoute({
  regions: [nearRegion, outsideRegion],
  routeCoordinates,
  maxResults: 10,
});

assert.deepStrictEqual(
  nearbyResults.map((result) => result.regionId),
  ['near-three-mile-corridor'],
  'Default dispersed camping route search should include only regions inside the 3-mile route corridor.',
);

const tenRouteRegions = Array.from({ length: 10 }, (_, index) => (
  region(`route-candidate-${index + 1}`, 39.01 + index * 0.001, -119.99 + index * 0.015)
));
const tenNearbyResults = findDispersedCampingRegionsNearRoute({
  regions: tenRouteRegions,
  routeCoordinates,
  maxResults: 10,
});
const generated = buildDispersedCampingCampScoutCandidates({
  regions: tenRouteRegions,
  routeNearbyRegions: tenNearbyResults,
  routeCoordinates,
  maxRouteDistanceMiles: DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
  maxCandidates: 10,
  includeVerifyCandidates: true,
});

assert.strictEqual(
  generated.candidates.length,
  10,
  'Route-corridor dispersed camping scout should allow up to 10 viable camp candidates.',
);
assert(
  generated.candidates.every((candidate) => (candidate.routeDistanceMiles ?? 99) <= 3),
  'Generated route-corridor camp candidates should remain within the 3-mile route corridor.',
);
assert(
  generated.candidates.every((candidate) => candidate.verificationWarning?.includes('projection only')),
  'Generated route-corridor camp candidates should clearly identify ECS-inferred projections.',
);

const routeIntersectingButWideRegion = rectangleRegion('wide-region', 39.0, 39.12, -119.95, -119.85);
const wideNearbyResults = findDispersedCampingRegionsNearRoute({
  regions: [routeIntersectingButWideRegion],
  routeCoordinates,
  maxResults: 10,
});
const wideGenerated = buildDispersedCampingCampScoutCandidates({
  regions: [routeIntersectingButWideRegion],
  routeNearbyRegions: wideNearbyResults,
  routeCoordinates,
  maxRouteDistanceMiles: DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
  maxCandidates: 10,
  includeVerifyCandidates: true,
});

assert.strictEqual(
  wideGenerated.candidates.length,
  0,
  'Route-corridor scout pins should not use eligibility-region centroids that fall outside the 3-mile guidance corridor.',
);

console.log('[dispersed-camping-route-corridor] 3-mile corridor and 10-pin route scout checks passed');
