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
const dashboardPresentation = loadTsModule('lib/terrainRiskDashboardPresentation.ts', {
  './terrainRiskCommandProfile': commandProfile,
});
const intelligence = loadTsModule('lib/terrainIntelligencePresentation.ts', {
  './terrainRiskCommandProfile': commandProfile,
});

const source = {
  label: 'Imported GPX elevation samples',
  origin: 'cached',
  freshness: 'recent',
  confidence: 'medium',
  coverage: 'complete',
  observedAt: '2026-07-25T12:00:00.000Z',
  provider: 'GPX import',
};

function buildRoute(id = 'terrain-route') {
  return commandProfile.buildTerrainRiskCommandRoute({
    active: true,
    routeId: id,
    routeName: id,
    totalDistanceMiles: 12,
    sourceLabel: source.label,
    routePoints: [
      { lat: 39, lng: -120, elevationFeet: 4000 },
      { lat: 39, lng: -120, elevationFeet: 4100 },
      { lat: 999, lng: -120, elevationFeet: 9999 },
      { lat: 39.015, lng: -120.015 },
      { lat: 39.03, lng: -120.03, elevationFeet: 7300 },
      { lat: 39.045, lng: -120.045, elevationFeet: 4200 },
    ],
  });
}

function buildPresentation(route, progress, sourceOverride = source) {
  return dashboardPresentation.buildTerrainRiskDashboardPresentation({
    active: true,
    route,
    routeIdentity: {
      id: route.id,
      name: route.name,
      fingerprint: `${route.id}:canonical-geometry`,
    },
    completedDistanceMiles: progress,
    source: sourceOverride,
  });
}

const route = buildRoute();
assert(route, 'Valid route elevation must produce a canonical terrain route.');
assert.strictEqual(route.elevationCoverage, 'partial', 'Missing elevation must remain partial.');
assert(
  route.profile.every((point) => Number.isFinite(point.distanceMiles) && Number.isFinite(point.elevationFeet)),
  'Invalid coordinates and elevations must not enter the profile.',
);
assert(
  route.profile.some((point) => point.elevationFeet === 7300),
  'A major peak must survive canonical profile generation.',
);

const vehicleContext = {
  activeVehicleId: 'vehicle-1',
  hasVehicleContext: true,
  profileSignature: 'vehicle-1:loadout-3',
  spec: { ground_clearance_inches: 10.8 },
  vehicle: null,
  capabilitySnapshot: {
    tireSizeInches: 33,
    suspensionLiftInches: 2,
  },
  weightSnapshot: {
    remainingPayloadLbs: 620,
    isEstimate: true,
    isPartial: false,
    partialDataReasons: [],
  },
  vehicleState: {
    confidence: { score: 84 },
  },
};

intelligence.resetTerrainIntelligenceMemoizationForTests();
const start = intelligence.buildTerrainIntelligenceSnapshot({
  presentation: buildPresentation(route, 0),
  route,
  activeVehicleContext: vehicleContext,
});
const generationAfterStart = intelligence.getTerrainIntelligenceAnalysisGenerationCountForTests();
const middle = intelligence.buildTerrainIntelligenceSnapshot({
  presentation: buildPresentation(route, 6),
  route,
  activeVehicleContext: vehicleContext,
});
const end = intelligence.buildTerrainIntelligenceSnapshot({
  presentation: buildPresentation(route, 12),
  route,
  activeVehicleContext: vehicleContext,
});

assert.strictEqual(start.state, 'partial');
assert.strictEqual(start.routeId, route.id);
assert.strictEqual(start.routeGeometryFingerprint, `${route.id}:canonical-geometry`);
assert.strictEqual(start.currentProgressDistanceMiles, 0);
assert.strictEqual(middle.currentProgressDistanceMiles, 6);
assert.strictEqual(middle.remainingDistanceMiles, 6);
assert.strictEqual(end.currentProgressDistanceMiles, 12);
assert.strictEqual(end.remainingDistanceMiles, 0);
assert.strictEqual(
  intelligence.getTerrainIntelligenceAnalysisGenerationCountForTests(),
  generationAfterStart,
  'Progress-only updates must not regenerate route analysis.',
);
assert.strictEqual(start.fullProfile, middle.fullProfile, 'Progress updates must reuse the canonical profile.');
assert(start.compactProfile.length <= 48);
assert(start.expandedProfile.length <= 180);
assert(start.compactProfile.some((point) => point.elevationFeet === 7300));
assert(start.expandedProfile.some((point) => point.elevationFeet === 7300));
assert(['low', 'moderate', 'high', 'critical'].includes(start.posture));
assert(start.gradeAhead.unit === '%' || start.gradeAhead.value === null);
assert.strictEqual(start.predictiveSideSlope.value, null);
assert.strictEqual(start.predictiveSideSlope.supported, false);
assert.strictEqual(start.surfaceInformation.value, null);
assert.strictEqual(start.roughness.value, null);
assert.strictEqual(start.waterCrossingRisk.value, null);
assert.strictEqual(start.clearanceConcern.value, null);
assert.strictEqual(start.vehicleFit.vehicleId, 'vehicle-1');
assert.strictEqual(start.vehicleFit.confidence, 'medium');
assert.strictEqual(start.vehicleFit.routeFitDetermined, false);
assert(start.sourceTruth.some((ref) => ref.origin === 'cached' && ref.confidence === 'medium'));
assert(
  start.riskSegments.every((segment) =>
    segment.startDistanceMiles <= segment.endDistanceMiles &&
    segment.signalKind === 'terrain' &&
    Array.isArray(segment.reasonCodes)),
  'Risk segments must remain mapped to route mileage with reason codes.',
);

const degrees = intelligence.gradePercentToDegrees(100);
assert(Math.abs(degrees - 45) < 0.000001);
assert.strictEqual(intelligence.gradePercentToDegrees(0), 0);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(start, 'rollDeg') || Object.prototype.hasOwnProperty.call(start, 'pitchDeg'),
  false,
  'Live attitude must not enter the predictive terrain snapshot.',
);

const stale = intelligence.buildTerrainIntelligenceSnapshot({
  presentation: buildPresentation(route, 2, { ...source, freshness: 'stale' }),
  route,
});
assert.strictEqual(stale.state, 'stale');
assert.strictEqual(intelligence.selectCompactTerrainIntelligence(stale).sourceState, 'stale');

intelligence.resetTerrainIntelligenceMemoizationForTests();
const compactOnly = intelligence.buildTerrainIntelligenceSnapshot({
  presentation: buildPresentation(route, 4),
  route,
  profileDensity: 'compact',
});
const compactProjection = intelligence.selectCompactTerrainIntelligence(compactOnly);
assert(compactProjection.compactProfile.length >= 2 && compactProjection.compactProfile.length <= 48);
assert.deepStrictEqual(compactOnly.fullProfile, [], 'Compact runtime must not expose the complete profile.');
assert.deepStrictEqual(compactOnly.expandedProfile, [], 'Compact runtime must not generate the expanded profile.');
assert.strictEqual(compactProjection.sourceState, 'partial');
assert.strictEqual(
  intelligence.getTerrainIntelligenceAnalysisGenerationCountForTests(),
  1,
  'Compact profile generation must be memoized independently of progress.',
);
intelligence.buildTerrainIntelligenceSnapshot({
  presentation: buildPresentation(route, 8),
  route,
  profileDensity: 'compact',
});
assert.strictEqual(
  intelligence.getTerrainIntelligenceAnalysisGenerationCountForTests(),
  1,
  'A compact progress update must only move presentation progress.',
);

const falselyLiveSource = { ...source, origin: 'cached', freshness: 'live', coverage: 'complete' };
const falselyLive = intelligence.buildTerrainIntelligenceSnapshot({
  presentation: buildPresentation(route, 1, falselyLiveSource),
  route,
  profileDensity: 'compact',
});
assert.notStrictEqual(
  intelligence.selectCompactTerrainIntelligence(falselyLive).sourceState,
  'live',
  'Active guidance or a live timestamp must not make a cached source live.',
);

const replacement = buildRoute('replacement-route');
intelligence.buildTerrainIntelligenceSnapshot({
  presentation: buildPresentation(replacement, 0),
  route: replacement,
});
assert.strictEqual(
  intelligence.getTerrainIntelligenceAnalysisGenerationCountForTests(),
  generationAfterStart + 1,
  'Route replacement must regenerate route analysis.',
);

const noElevationPresentation = dashboardPresentation.buildTerrainRiskDashboardPresentation({
  active: true,
  routeIdentity: { id: 'geometry-only', name: 'Geometry only', fingerprint: 'geometry-only:1' },
  route: null,
  requestStatus: 'error',
  missingDataReason: 'elevation_samples_unavailable',
});
const noElevation = intelligence.buildTerrainIntelligenceSnapshot({
  presentation: noElevationPresentation,
  route: null,
});
assert.strictEqual(noElevation.state, 'error');
assert.deepStrictEqual(noElevation.fullProfile, []);

const idlePresentation = dashboardPresentation.buildTerrainRiskDashboardPresentation({ active: false });
const idle = intelligence.buildTerrainIntelligenceSnapshot({
  presentation: idlePresentation,
  route: null,
});
assert.strictEqual(idle.state, 'idle');
assert.strictEqual(idle.routeId, null);
assert.deepStrictEqual(idle.compactProfile, []);

console.log('[terrain-intelligence-presentation] canonical profile, progress, risk, vehicle, truth, and unsupported fields passed');
