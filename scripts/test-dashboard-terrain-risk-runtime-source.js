const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(process.cwd());

function loadTsModule(relativePath, mocks = {}) {
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

const sourceTruth = loadTsModule('lib/sourceTruth.ts');
const runtimeSource = loadTsModule('lib/terrainRiskDashboardSource.ts', {
  './sourceTruth': sourceTruth,
});
const presentation = loadTsModule('lib/terrainRiskDashboardPresentation.ts', {
  './terrainRiskCommandProfile': {
    downsampleTerrainProfilePreservingExtrema: (profile) => Array.from(profile),
  },
});

const now = Date.parse('2026-07-15T12:00:00.000Z');
const isoDaysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
const baseSource = {
  label: 'Imported GPX elevation samples',
  origin: 'cached',
  confidence: 'medium',
  coverage: 'complete',
  provider: 'GPX import',
  now,
};

assert.strictEqual(
  runtimeSource.isTerrainRiskProfileRouteForProgress({ id: 'route-1' }, 'route-1'),
  true,
  'A guidance snapshot may mount a saved route by its canonical route id.',
);
assert.strictEqual(
  runtimeSource.isTerrainRiskProfileRouteForProgress(
    { id: 'route-1', linked_run_id: 'run-9' },
    'run-9',
  ),
  true,
  'Imported route metadata must remain mounted when Navigate exposes its linked run id.',
);
assert.strictEqual(
  runtimeSource.isTerrainRiskProfileRouteForProgress(
    { id: 'route-1', linked_run_id: 'run-9' },
    'run-other',
  ),
  false,
);

assert.strictEqual(
  runtimeSource.resolveTerrainRiskProfileObservedAt({
    routeSourceFormat: 'gpx',
    routeCapturedAt: isoDaysAgo(40),
    routeCreatedAt: isoDaysAgo(40),
    routeUpdatedAt: isoDaysAgo(1),
  }),
  isoDaysAgo(40),
  'Guidance activation must not make old imported elevation data appear newly observed.',
);
assert.strictEqual(
  runtimeSource.resolveTerrainRiskProfileObservedAt({
    routeSourceFormat: 'custom',
    routeCreatedAt: isoDaysAgo(40),
    routeUpdatedAt: isoDaysAgo(1),
  }),
  isoDaysAgo(1),
  'Manual route freshness follows the last user update.',
);

assert.strictEqual(
  runtimeSource.classifyTerrainRiskProfileSource({ ...baseSource, observedAt: isoDaysAgo(2) }).freshness,
  'live',
);
assert.strictEqual(
  runtimeSource.classifyTerrainRiskProfileSource({ ...baseSource, observedAt: isoDaysAgo(10) }).freshness,
  'recent',
  'Imported geometry is recent only when its timestamp satisfies the ECS route-package policy.',
);
assert.strictEqual(
  runtimeSource.classifyTerrainRiskProfileSource({ ...baseSource, observedAt: isoDaysAgo(40) }).freshness,
  'stale',
);
assert.strictEqual(
  runtimeSource.classifyTerrainRiskProfileSource({ ...baseSource, observedAt: isoDaysAgo(100) }).freshness,
  'expired',
);
assert.strictEqual(
  runtimeSource.classifyTerrainRiskProfileSource({ ...baseSource, observedAt: isoDaysAgo(200) }).freshness,
  'unavailable',
);
assert.strictEqual(
  runtimeSource.classifyTerrainRiskProfileSource({ ...baseSource, observedAt: null }).freshness,
  'unavailable',
  'Missing source time must remain unknown rather than being labeled recent.',
);
assert.strictEqual(
  runtimeSource.classifyTerrainRiskProfileSource({
    ...baseSource,
    origin: 'live',
    label: 'Canonical guidance route elevation samples',
    observedAt: null,
  }).freshness,
  'unavailable',
  'Canonical geometry without a source time must not be labeled live.',
);
assert.strictEqual(
  runtimeSource.classifyTerrainRiskProfileSource({ ...baseSource, observedAt: 'not-a-time' }).freshness,
  'unavailable',
);
assert.strictEqual(
  runtimeSource.classifyTerrainRiskProfileSource({
    ...baseSource,
    origin: 'manual',
    observedAt: isoDaysAgo(100),
  }).freshness,
  'stale',
  'Manual route samples must use the ECS manual-state policy after timestamp validation.',
);

assert.strictEqual(
  runtimeSource.countFiniteTerrainElevationSamples([
    { elevationFeet: 1200 },
    { elevationFeet: null, ele_m: null, ele: null },
    { elevationFeet: Number.NaN, ele_m: 450 },
    { ele: 0 },
    { ele: Number.POSITIVE_INFINITY },
  ]),
  3,
  'Provider result counts must count finite elevations rather than returned coordinate rows.',
);

const truthfulRoute = {
  id: 'route-1',
  name: 'Route 1',
  dataState: 'live-route',
  totalDistanceMiles: 1,
  elevationCoverage: 'complete',
  profile: [
    { distanceMiles: 0, elevationFeet: 4000, riskScore: 10, riskLevel: 'low', hazardKinds: [] },
    { distanceMiles: 1, elevationFeet: 4200, riskScore: 12, riskLevel: 'low', hazardKinds: [] },
  ],
  terrainSegments: [],
};
const unavailableSource = runtimeSource.classifyTerrainRiskProfileSource({
  ...baseSource,
  observedAt: null,
});
const unavailableFreshnessPresentation = presentation.buildTerrainRiskDashboardPresentation({
  active: true,
  route: truthfulRoute,
  source: unavailableSource,
});
assert.strictEqual(unavailableFreshnessPresentation.status, 'degraded');
assert.strictEqual(
  unavailableFreshnessPresentation.missingDataReason,
  'source_freshness_unavailable',
  'A valid graph with unavailable freshness must remain visible but cannot present as ready/live.',
);

console.log('[dashboard-terrain-risk-runtime-source] linked route, timestamp freshness, finite samples, and degraded unavailable source passed');
