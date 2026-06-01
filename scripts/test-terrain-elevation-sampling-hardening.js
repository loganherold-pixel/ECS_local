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
const widgetRenderersSource = fs.readFileSync(
  path.join(repoRoot, 'components', 'dashboard', 'WidgetRenderers.tsx'),
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
  widgetRenderersSource.includes('terrainRiskSamplingPendingSignature') &&
    widgetRenderersSource.includes('terrainRiskSamplingFallbackSignature') &&
    widgetRenderersSource.includes('const terrainRiskSamplingPending =') &&
    widgetRenderersSource.includes('terrainRiskSamplingFallbackSignature !== terrainRiskSamplingSignature') &&
    widgetRenderersSource.includes('currentElevationFeet: terrainRiskHasGpsAltitude && !terrainRiskSamplingPending ? options.gpsAltitudeFt ?? null : null'),
  'Terrain Risk widget should suppress GPS altitude fallback until elevation sampling has resolved or explicitly failed.',
);

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

  console.log('Terrain elevation sampling hardening checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
