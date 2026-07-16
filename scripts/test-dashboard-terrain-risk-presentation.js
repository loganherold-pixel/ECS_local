const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

const elevationEngine = loadTsModule('lib/terrainElevationRouteEngine.ts');
const commandProfile = loadTsModule('lib/terrainRiskCommandProfile.ts', {
  './terrainElevationRouteEngine': elevationEngine,
});
const presentationModel = loadTsModule('lib/terrainRiskDashboardPresentation.ts', {
  './terrainRiskCommandProfile': commandProfile,
});
const catalogGuidanceGeometry = loadTsModule('lib/navigationCatalogGuidanceGeometry.ts');

function buildRoute({
  id = 'route-alpha',
  name = 'Route Alpha',
  points,
  totalDistanceMiles = 6,
  currentElevationFeet = null,
  sourceLabel = 'Imported GPX elevation samples',
}) {
  return commandProfile.buildTerrainRiskCommandRoute({
    active: true,
    routeId: id,
    routeName: name,
    routePoints: points,
    totalDistanceMiles,
    currentElevationFeet,
    sourceLabel,
  });
}

const completeLiveSource = {
  label: 'Canonical guidance route elevation samples',
  origin: 'live',
  freshness: 'live',
  confidence: 'medium',
  coverage: 'complete',
  observedAt: '2026-07-15T12:00:00.000Z',
  provider: 'Navigate trail guidance',
};

const sampledRoutePreferred = elevationEngine.analyzeTerrainElevationRoute({
  totalDistanceMiles: 4,
  sourceLabel: 'Mapbox terrain contour estimate',
  routeSegments: [{
    points: [
      { lat: 39, lon: -120, ele: null },
      { lat: 39.02, lon: -120.02, ele: null },
      { lat: 39.04, lon: -120.04, ele: null },
    ],
  }],
  routePoints: [
    { lat: 39, lng: -120, elevationFeet: 4200 },
    { lat: 39.02, lng: -120.02, elevationFeet: 4860 },
    { lat: 39.04, lng: -120.04, elevationFeet: 4380 },
  ],
});

assert(
  sampledRoutePreferred,
  'Elevation-backed sampled route points must not be discarded merely because saved route segments contain geometry without elevation.',
);
assert.deepStrictEqual(
  sampledRoutePreferred.samples.map((sample) => sample.elevationFeet),
  [4200, 4860, 4380],
  'The rendered terrain profile must correspond to the elevation samples selected for the active route.',
);

const catalogElevationGeometry = catalogGuidanceGeometry.normalizeNavigationGuidanceGeometry({
  type: 'LineString',
  coordinates: [
    [-120, 39, 1280],
    [-120.02, 39.02, 1482],
  ],
});
assert.strictEqual(catalogElevationGeometry.status, 'ready');
assert.strictEqual(catalogElevationGeometry.points[0].ele_m, 1280);
assert.strictEqual(catalogElevationGeometry.points[1].ele_m, 1482);
assert.strictEqual(
  catalogElevationGeometry.points[1].elevationFeet,
  undefined,
  'GeoJSON Z must retain its meter semantics rather than being mislabeled as feet.',
);

const validElevationRoute = buildRoute({
  points: [
    { lat: 39, lng: -120, elevationFeet: 4200 },
    { lat: 39.02, lng: -120.02, elevationFeet: 4860 },
    { lat: 39.04, lng: -120.04, elevationFeet: 4380 },
  ],
});
assert(validElevationRoute, 'A route with valid elevation samples must produce a deterministic terrain route.');
assert.deepStrictEqual(
  validElevationRoute.profile.map((point) => point.elevationFeet),
  [4200, 4860, 4380],
  'Presentation graph elevations must be the selected route elevation samples, not a decorative curve.',
);
assert.strictEqual(validElevationRoute.elevationCoverage, 'complete');

const flatRoute = buildRoute({
  id: 'flat-route',
  points: [
    { lat: 32, lng: -117, elevationFeet: 120 },
    { lat: 32.01, lng: -117.01, elevationFeet: 120 },
    { lat: 32.02, lng: -117.02, elevationFeet: 120 },
  ],
});
assert(flatRoute, 'A truthful flat route with elevation samples is valid data and must render.');
assert(flatRoute.profile.every((point) => point.elevationFeet === 120));

const partialElevationRoute = buildRoute({
  id: 'partial-route',
  points: [
    { lat: 38, lng: -119, elevationFeet: 6100 },
    { lat: 38.01, lng: -119.01 },
    { lat: 38.02, lng: -119.02, elevationFeet: 6550 },
  ],
});
assert(partialElevationRoute, 'Two real samples may support a visibly degraded partial profile.');
assert.strictEqual(partialElevationRoute.elevationCoverage, 'partial');
assert.strictEqual(partialElevationRoute.elevationPointCount, 2);
assert.strictEqual(partialElevationRoute.validPointCount, 3);

const duplicateBoundaryAnalysis = elevationEngine.analyzeTerrainElevationRoute({
  routePoints: [
    { lat: 38.5, lng: -119.5 },
    { lat: 38.5, lng: -119.5, elevationFeet: 6200 },
    { lat: 38.52, lng: -119.52, elevationFeet: 6400 },
  ],
  totalDistanceMiles: 2,
});
assert(duplicateBoundaryAnalysis, 'Duplicate segment boundaries must retain later elevation enrichment.');
assert.deepStrictEqual(
  duplicateBoundaryAnalysis.samples.map((sample) => sample.elevationFeet),
  [6200, 6400],
);

const middlePresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: validElevationRoute,
  routeIdentity: { id: validElevationRoute.id, name: validElevationRoute.name },
  completedDistanceMiles: 3,
  currentGpsElevation: { elevationFeet: 4725, freshness: 'live' },
  source: completeLiveSource,
  requestStatus: 'ready',
});
assert.strictEqual(middlePresentation.status, 'ready');
assert.strictEqual(middlePresentation.routeIdentity.id, 'route-alpha');
assert.strictEqual(middlePresentation.currentProgressDistanceMiles, 3);
assert.strictEqual(middlePresentation.currentElevationFeet, 4725);
assert.strictEqual(middlePresentation.currentElevationSource, 'gps');
assert.strictEqual(
  middlePresentation.completedProfile[middlePresentation.completedProfile.length - 1].distanceMiles,
  3,
  'Completed profile must end at the exact projected progress boundary.',
);
assert.strictEqual(
  middlePresentation.remainingProfile[0].distanceMiles,
  3,
  'Remaining profile must begin at the exact projected progress boundary.',
);
assert(middlePresentation.upcomingHighPoint, 'The remaining route must expose an upcoming high point.');
assert(Number.isFinite(middlePresentation.elevationGainRemainingFeet));
assert(
  middlePresentation.technicalDifficultyCaveat.includes('do not establish'),
  'Elevation must not be equated automatically with technical trail difficulty.',
);

const startPresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: validElevationRoute,
  completedDistanceMiles: 0,
  currentGpsElevation: { elevationFeet: 9999, freshness: 'stale' },
  source: completeLiveSource,
});
assert.strictEqual(startPresentation.completedProfile.length, 1);
assert.strictEqual(startPresentation.currentElevationSource, 'route_profile');
assert.strictEqual(startPresentation.currentElevationFeet, 4200, 'Stale GPS elevation must not override the route profile.');

const endPresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: validElevationRoute,
  completedDistanceMiles: 999,
  source: completeLiveSource,
});
assert.strictEqual(endPresentation.currentProgressDistanceMiles, validElevationRoute.totalDistanceMiles);
assert.strictEqual(endPresentation.remainingProfile.length, 1);

const partialPresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: partialElevationRoute,
  completedDistanceMiles: 0,
  source: { ...completeLiveSource, coverage: 'partial', confidence: 'low' },
});
assert.strictEqual(partialPresentation.status, 'degraded');
assert.strictEqual(partialPresentation.missingDataReason, 'partial_elevation_profile');
assert.strictEqual(partialPresentation.confidence, 'low');

const stalePresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: validElevationRoute,
  completedDistanceMiles: 1,
  source: { ...completeLiveSource, freshness: 'stale', origin: 'cached' },
});
assert.strictEqual(stalePresentation.status, 'stale');
assert.strictEqual(stalePresentation.missingDataReason, 'route_analysis_stale');

const unavailableFreshnessPresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: validElevationRoute,
  completedDistanceMiles: 1,
  source: {
    ...completeLiveSource,
    origin: 'cached',
    freshness: 'unavailable',
    observedAt: null,
    confidence: 'unknown',
  },
});
assert.strictEqual(
  unavailableFreshnessPresentation.status,
  'degraded',
  'A valid profile with unknown source freshness must not be presented as ready/live.',
);

const offlineImportedPresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: validElevationRoute,
  completedDistanceMiles: 1,
  source: {
    ...completeLiveSource,
    label: 'Imported GPX elevation samples',
    origin: 'cached',
    freshness: 'recent',
    provider: 'GPX import',
  },
});
assert.strictEqual(offlineImportedPresentation.status, 'ready');
assert.strictEqual(offlineImportedPresentation.source.origin, 'cached');
assert.strictEqual(offlineImportedPresentation.source.label, 'Imported GPX elevation samples');

const noActiveRoutePresentation = presentationModel.buildTerrainRiskDashboardPresentation({ active: false });
assert.strictEqual(noActiveRoutePresentation.status, 'idle');
assert.strictEqual(noActiveRoutePresentation.missingDataReason, 'no_active_route');
assert.deepStrictEqual(noActiveRoutePresentation.profile, []);

const activeNoElevationPresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  routeIdentity: { id: 'geometry-only', name: 'Geometry Only' },
  route: null,
  requestStatus: 'error',
  missingDataReason: 'provider_error',
});
assert.strictEqual(activeNoElevationPresentation.status, 'error');
assert.strictEqual(activeNoElevationPresentation.missingDataReason, 'provider_error');
assert.deepStrictEqual(activeNoElevationPresentation.profile, []);

const estimatedGpsRoute = buildRoute({
  id: 'gps-only-route',
  points: [
    { lat: 37, lng: -118 },
    { lat: 37.01, lng: -118.01 },
    { lat: 37.02, lng: -118.02 },
  ],
  currentElevationFeet: 7000,
  sourceLabel: 'Live GPS altitude estimate',
});
assert(estimatedGpsRoute && estimatedGpsRoute.dataState === 'estimated-route');
const suppressedGpsGraph = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: estimatedGpsRoute,
  requestStatus: 'error',
});
assert.deepStrictEqual(
  suppressedGpsGraph.profile,
  [],
  'Active guidance plus one GPS altitude must never fabricate a full route elevation graph.',
);

const highRiskRoute = buildRoute({
  id: 'high-risk-route',
  totalDistanceMiles: 1,
  points: [
    { lat: 39, lng: -120, elevationFeet: 4000 },
    { lat: 39.001, lng: -120.001, elevationFeet: 5100 },
    { lat: 39.002, lng: -120.002, elevationFeet: 4050 },
  ],
});
assert(highRiskRoute && highRiskRoute.terrainSegments.length > 0);
const riskPresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: highRiskRoute,
  completedDistanceMiles: 0,
  source: completeLiveSource,
});
assert(riskPresentation.riskSegments.length > 0, 'Deterministic high-risk segments must be exposed for graph markers.');
assert(riskPresentation.nextMaterialTerrainRiskEvent, 'The next material deterministic terrain event must be exposed.');

const replacedRoute = buildRoute({
  id: 'route-beta',
  name: 'Route Beta',
  points: [
    { lat: 40, lng: -121, elevationFeet: 3000 },
    { lat: 40.01, lng: -121.01, elevationFeet: 3200 },
  ],
});
const replacedPresentation = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: replacedRoute,
  source: completeLiveSource,
});
assert.strictEqual(replacedPresentation.routeIdentity.id, 'route-beta');
assert.notStrictEqual(replacedPresentation.profile, middlePresentation.profile);

const sameRouteGpsUpdate = presentationModel.buildTerrainRiskDashboardPresentation({
  active: true,
  route: validElevationRoute,
  completedDistanceMiles: 3.1,
  currentGpsElevation: { elevationFeet: 4740, freshness: 'live' },
  source: completeLiveSource,
});
assert.strictEqual(
  sameRouteGpsUpdate.profile,
  middlePresentation.profile,
  'A GPS-only progress update must reuse the unchanged processed route profile.',
);

const largeProfile = Array.from({ length: 501 }, (_, index) => ({
  distanceMiles: index / 10,
  elevationFeet: index === 173 ? 9100 : index === 377 ? 900 : 4000 + Math.sin(index / 15) * 300,
  riskScore: 20,
  riskLevel: 'low',
}));
const downsampled = presentationModel.buildTerrainRiskChartSeries(largeProfile, 24);
assert(downsampled.length <= 24, 'Large profiles must be bounded before SVG presentation.');
assert.strictEqual(downsampled[0], largeProfile[0]);
assert.strictEqual(downsampled[downsampled.length - 1], largeProfile[largeProfile.length - 1]);
assert(downsampled.includes(largeProfile[173]), 'Peak-preserving downsampling must retain the route high point.');
assert(downsampled.includes(largeProfile[377]), 'Peak-preserving downsampling must retain the route low point.');
assert(
  downsampled.every((point) => largeProfile.includes(point)),
  'Chart points must be actual route samples; downsampling must not invent elevations.',
);

const materialRiskProfile = Array.from({ length: 101 }, (_, index) => ({
  distanceMiles: index / 10,
  elevationFeet: 4000 + (index % 7) * 100,
  riskScore: 18,
  riskLevel: 'low',
  hazardKinds: [],
}));
materialRiskProfile[53] = {
  ...materialRiskProfile[53],
  elevationFeet: 4250,
  riskScore: 92,
  riskLevel: 'high',
  hazardKinds: ['tipover_watch'],
};
const materialRiskDownsampled = commandProfile.downsampleTerrainProfilePreservingExtrema(materialRiskProfile, 12);
assert(materialRiskDownsampled.length <= 12, 'Risk-aware profile downsampling must remain bounded.');
assert(
  materialRiskDownsampled.includes(materialRiskProfile[53]),
  'A material deterministic risk point must not be discarded merely because it is not an elevation extremum.',
);

const sideProfileSource = fs.readFileSync(path.join(root, 'components/dashboard/TerrainRiskSideProfile.tsx'), 'utf8');
assert(sideProfileSource.includes('width="100%"') && sideProfileSource.includes('height="100%"'));
assert(sideProfileSource.includes("preserveAspectRatio={interactive ? 'none' : 'xMidYMid meet'}"));
assert(sideProfileSource.includes('completedProfileLinePath'), 'The visual must distinguish completed and remaining profile geometry.');

console.log('[dashboard-terrain-risk-presentation] deterministic route profile, source truth, progress, risk, and downsampling passed');
