const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');

function loadTsModule(relativePath, mocks = {}) {
  const filename = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => (mocks[request] ? mocks[request] : originalRequire(request));
  mod._compile(outputText, filename);
  return mod.exports;
}

const sampling = loadTsModule('lib/terrainElevationSampling.ts');
const elevationEngine = loadTsModule('lib/terrainElevationRouteEngine.ts');
const widgetRenderersSource = fs.readFileSync(
  path.join(repoRoot, 'components', 'dashboard', 'WidgetRenderers.tsx'),
  'utf8',
);
const terrainRiskRuntimeSource = fs.readFileSync(
  path.join(repoRoot, 'lib', 'useTerrainRiskDashboardRuntime.ts'),
  'utf8',
);

assert.strictEqual(
  sampling.routeNeedsTerrainElevationSampling(true, [
    { lat: 39, lng: -120, ele_m: 0 },
    { lat: 39.02, lng: -120.02, ele_m: 0 },
    { lat: 39.04, lng: -120.04, ele_m: 0 },
  ]),
  true,
  'Zero-only active route elevation should be treated as placeholder data and sampled before GPS altitude fallback.',
);

assert.strictEqual(
  sampling.routeNeedsTerrainElevationSampling(true, [
    { lat: 39, lng: -120 },
    { lat: 39.02, lng: -120.02, ele_m: 1440 },
    { lat: 39.04, lng: -120.04 },
  ]),
  true,
  'Partial active route elevation should still request terrain sampling instead of jumping to GPS altitude.',
);

assert.strictEqual(
  sampling.routeNeedsTerrainElevationSampling(true, [
    { lat: 39, lng: -120, ele_m: 1440 },
    { lat: 39.02, lng: -120.02, ele_m: 1468 },
    { lat: 39.04, lng: -120.04, ele_m: 1485 },
  ]),
  false,
  'Usable route elevation should not be replaced by contour sampling.',
);

assert(
  terrainRiskRuntimeSource.includes('createECSAsyncSurfaceState') &&
    terrainRiskRuntimeSource.includes('beginECSAsyncSurfaceRequest') &&
    terrainRiskRuntimeSource.includes('settleECSAsyncSurfaceRequest') &&
    terrainRiskRuntimeSource.includes('const samplingPending =') &&
    terrainRiskRuntimeSource.includes('TERRAIN_ELEVATION_TIMEOUT') &&
    terrainRiskRuntimeSource.includes('currentElevationFeet: null') &&
    terrainRiskRuntimeSource.includes('currentGpsElevation: {') &&
    terrainRiskRuntimeSource.includes('invalidateTerrainElevationSamplingCache()') &&
    widgetRenderersSource.includes('useTerrainRiskDashboardRuntime({'),
  'Terrain Risk widget should use a terminal async sampling model, keep GPS altitude separate, and issue a real retry.',
);

const signatureA = sampling.terrainElevationRouteSignature('same-route', [
  { lat: 39, lng: -120, elevationFeet: 4000 },
  { lat: 39.01, lng: -120.01, elevationFeet: 4500 },
  { lat: 39.02, lng: -120.02, elevationFeet: 4200 },
]);
const signatureChangedInterior = sampling.terrainElevationRouteSignature('same-route', [
  { lat: 39, lng: -120, elevationFeet: 4000 },
  { lat: 39.015, lng: -120.03, elevationFeet: 4500 },
  { lat: 39.02, lng: -120.02, elevationFeet: 4200 },
]);
const signatureChangedElevation = sampling.terrainElevationRouteSignature('same-route', [
  { lat: 39, lng: -120, elevationFeet: 4000 },
  { lat: 39.01, lng: -120.01, elevationFeet: 4700 },
  { lat: 39.02, lng: -120.02, elevationFeet: 4200 },
]);
assert.notStrictEqual(signatureA, signatureChangedInterior, 'Interior route changes must supersede stale elevation work.');
assert.notStrictEqual(signatureA, signatureChangedElevation, 'Elevation enrichment must invalidate the prior route fingerprint.');
assert(signatureA.length < 128, 'Diagnostic route signatures must remain bounded and omit raw coordinate payloads.');

(async () => {
  const requestedUrls = [];
  const sampledTerrain = await sampling.sampleRouteElevationFromMapboxTerrainContours({
    accessToken: 'pk.test-token',
    maxSamples: 2,
    routePoints: [
      { lat: 39, lng: -120 },
      { lat: 39.02, lng: -120.02 },
    ],
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      const radius = Number(new URL(url).searchParams.get('radius'));
      return {
        ok: true,
        json: async () => ({
          features: radius >= 1200
            ? [{ properties: { ele: requestedUrls.length === 2 ? 1435 : 1480, tilequery: { distance: 780 } } }]
            : [],
        }),
      };
    },
  });

  assert(sampledTerrain, 'Terrain contour sampling should retry wider radii before falling back to GPS altitude.');
  assert.strictEqual(sampledTerrain.length, 2);
  assert(requestedUrls.some((url) => url.includes('radius=1200')), 'Terrain contour sampling should try a larger radius when the first contour query misses.');

  sampling.invalidateTerrainElevationSamplingCache();
  const partiallySampledTerrain = await sampling.sampleRouteElevationFromMapboxTerrainContours({
    accessToken: 'pk.partial-token',
    routePoints: [
      { lat: 41, lng: -122 },
      { lat: 41.01, lng: -122.01 },
      { lat: 41.02, lng: -122.02 },
      { lat: 41.03, lng: -122.03 },
    ],
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => ({
        features:
          url.includes('/-122,41.json') || url.includes('/-122.03,41.03.json')
            ? [{ properties: { ele: url.includes('/-122,41.json') ? 1200 : 1500 } }]
            : [],
      }),
    }),
  });
  assert(partiallySampledTerrain, 'Two valid provider samples should retain a degraded partial profile.');
  assert.strictEqual(
    partiallySampledTerrain.length,
    4,
    'Provider misses must remain represented so coverage and distance are not falsely reported as complete.',
  );
  const partialAnalysis = elevationEngine.analyzeTerrainElevationRoute({
    routePoints: partiallySampledTerrain,
    totalDistanceMiles: 3,
    sourceLabel: 'Partial provider samples',
  });
  assert(partialAnalysis);
  assert.strictEqual(partialAnalysis.validPointCount, 4);
  assert.strictEqual(partialAnalysis.elevationPointCount, 2);
  assert.strictEqual(partialAnalysis.elevationCoverage, 'partial');
  assert.strictEqual(partialAnalysis.elevationCoverageRatio, 0.5);
  assert.deepStrictEqual(
    partialAnalysis.samples.map((sample) => sample.distanceMiles),
    [0, 3],
    'Successful endpoint samples must retain their positions across the full route geometry.',
  );

  sampling.invalidateTerrainElevationSamplingCache();
  let sharedProviderCalls = 0;
  const sharedPoints = [
    { lat: 40, lng: -121 },
    { lat: 40.01, lng: -121.01 },
  ];
  const sharedFetch = async () => {
    sharedProviderCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      ok: true,
      json: async () => ({ features: [{ properties: { ele: 1600 } }] }),
    };
  };
  const [firstConsumer, secondConsumer] = await Promise.all([
    sampling.sampleRouteElevationFromMapboxTerrainContours({
      accessToken: 'pk.shared-token',
      routePoints: sharedPoints,
      fetchImpl: sharedFetch,
    }),
    sampling.sampleRouteElevationFromMapboxTerrainContours({
      accessToken: 'pk.shared-token',
      routePoints: sharedPoints,
      fetchImpl: sharedFetch,
    }),
  ]);
  assert(firstConsumer && secondConsumer);
  assert.strictEqual(sharedProviderCalls, 2, 'Equivalent concurrent consumers should share one provider execution per sampled point.');

  sampling.invalidateTerrainElevationSamplingCache();
  const failed = await sampling.sampleRouteElevationFromMapboxTerrainContours({
    accessToken: 'pk.retry-token',
    routePoints: sharedPoints,
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
  });
  assert.strictEqual(failed, null);
  sampling.invalidateTerrainElevationSamplingCache();
  let retryProviderCalls = 0;
  const retried = await sampling.sampleRouteElevationFromMapboxTerrainContours({
    accessToken: 'pk.retry-token',
    routePoints: sharedPoints,
    fetchImpl: async () => {
      retryProviderCalls += 1;
      return {
        ok: true,
        json: async () => ({ features: [{ properties: { ele: 1650 } }] }),
      };
    },
  });
  assert(retried, 'Explicit cache invalidation should allow retry after a provider failure.');
  assert.strictEqual(retryProviderCalls, 2, 'Retry must issue fresh provider requests for the sampled points.');

  console.log('Terrain elevation sampling hardening checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
