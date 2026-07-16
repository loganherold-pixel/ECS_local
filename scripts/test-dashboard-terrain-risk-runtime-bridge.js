const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(process.cwd());
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

function loadTsModule(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(read(relativePath), {
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
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    mod._compile(outputText, filename);
  } finally {
    Module._load = originalLoad;
  }
  return mod.exports;
}

const widgetRenderersSource = read('components/dashboard/WidgetRenderers.tsx');
const runtimeSource = read('lib/useTerrainRiskDashboardRuntime.ts');
const elevationEngine = loadTsModule('lib/terrainElevationRouteEngine.ts');
const commandProfile = loadTsModule('lib/terrainRiskCommandProfile.ts', {
  './terrainElevationRouteEngine': elevationEngine,
});
const presentationModel = loadTsModule('lib/terrainRiskDashboardPresentation.ts', {
  './terrainRiskCommandProfile': commandProfile,
});

assert(
  widgetRenderersSource.includes("case 'terrain-risk': return <StandaloneTerrainRiskRuntimeWidget data={data} options={options} />;") &&
    widgetRenderersSource.includes("case 'terrain-risk': return <StandaloneTerrainRiskRuntimeWidget data={data} options={options} detailMode />;"),
  'Both the registered Terrain Risk card and detail route must mount the authoritative runtime bridge.',
);
assert(
  !widgetRenderersSource.includes("case 'terrain-risk': return options?.compact ? <TerrainRiskCompact /> : <TerrainRiskCard />;") &&
    !widgetRenderersSource.includes("case 'terrain-risk': return <TerrainRiskDetailView />;"),
  'The registered runtime path must not mount the legacy prop-less Terrain Risk implementation.',
);
assert(
  /function StandaloneTerrainRiskRuntimeWidget[\s\S]*?useRouteProgressCommandSnapshot\(options\)[\s\S]*?useTerrainRiskDashboardRuntime\(\{[\s\S]*?<AttitudeCommandTerrainRiskPreview/.test(widgetRenderersSource),
  'The standalone mounted component must subscribe to route progress, build the shared runtime model, and pass it to the real graph presentation.',
);
assert.strictEqual(
  (widgetRenderersSource.match(/useTerrainRiskDashboardRuntime\(\{/g) || []).length,
  2,
  'Attitude Command and standalone Terrain Risk must consume the same runtime hook.',
);
assert(
  runtimeSource.includes('sampleRouteElevationFromMapboxTerrainContours') &&
    !widgetRenderersSource.includes('sampleRouteElevationFromMapboxTerrainContours'),
  'Provider-backed elevation sampling must have one implementation boundary shared by both consumers.',
);

const route = commandProfile.buildTerrainRiskCommandRoute({
  active: true,
  routeId: 'canonical-route-7',
  routeName: 'Canonical Ridge Route',
  totalDistanceMiles: 6,
  sourceLabel: 'Canonical guidance route elevation samples',
  routePoints: [
    { lat: 39, lng: -120, elevationFeet: 4200 },
    { lat: 39.02, lng: -120.02, elevationFeet: 5150 },
    { lat: 39.04, lng: -120.04, elevationFeet: 6200 },
    { lat: 39.06, lng: -120.06, elevationFeet: 4550 },
  ],
});
assert(route && route.dataState === 'live-route', 'Canonical route elevation samples must build a truthful live-route profile.');

const presentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  routeIdentity: {
    id: 'canonical-route-7',
    name: 'Canonical Ridge Route',
    fingerprint: 'route-7:4:fixture',
  },
  route,
  completedDistanceMiles: 3,
  currentGpsElevation: { elevationFeet: 5125, freshness: 'live' },
  source: {
    label: 'Canonical guidance route elevation samples',
    origin: 'live',
    freshness: 'live',
    confidence: 'medium',
    coverage: 'complete',
    observedAt: '2026-07-16T12:00:00.000Z',
    provider: 'Navigate trail guidance',
  },
});
assert.strictEqual(presentation.status, 'ready');
assert.strictEqual(presentation.routeIdentity.id, 'canonical-route-7');
assert.strictEqual(presentation.currentProgressDistanceMiles, 3);
assert.strictEqual(presentation.currentElevationFeet, 5125);
assert(presentation.profile.length >= 2, 'The mounted graph model must contain real route profile points.');
assert(
  presentation.profile.some((point) => point.elevationFeet === 6200),
  'The graph model must preserve the deterministic route high point rather than fabricate a mountain shape.',
);
assert(presentation.completedProfile.length >= 2 && presentation.remainingProfile.length >= 2);

const noElevationPresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  routeIdentity: { id: 'geometry-only', name: 'Geometry Only' },
  route: null,
  requestStatus: 'empty',
  missingDataReason: 'elevation_samples_unavailable',
});
assert.strictEqual(noElevationPresentation.status, 'empty');
assert.deepStrictEqual(noElevationPresentation.profile, []);
assert.strictEqual(noElevationPresentation.missingDataReason, 'elevation_samples_unavailable');

console.log('[dashboard-terrain-risk-runtime-bridge] canonical mounted bridge, graph profile, progress, and truthful unavailable state passed');
