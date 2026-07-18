const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const moduleCache = new Map();

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;

  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const mod = { exports: {} };
  moduleCache.set(filename, mod);

  function localRequire(request) {
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filename), request);
      const withExtension = path.extname(resolved) ? resolved : `${resolved}.ts`;
      return loadTsModule(path.relative(root, withExtension));
    }
    return require(request);
  }

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, localRequire, mod, filename, path.dirname(filename));
  return mod.exports;
}

const {
  buildGuidanceRouteDistanceIndex,
  findNearestPlausibleRouteProjection,
  getGuidanceOffRouteDistanceMeters,
  getGuidanceRouteDistanceAtProjection,
  projectPointToGuidanceSegment,
  resolveGuidanceRouteProgress,
  resolveGuidanceSnapToleranceMeters,
  scoreGuidanceProjectionContinuity,
  splitGuidanceRouteAtProjection,
} = loadTsModule(path.join('lib', 'navigation', 'guidanceRouteProjection.ts'));

const ORIGIN_LAT = 38;
const ORIGIN_LNG = -121;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((ORIGIN_LAT * Math.PI) / 180);

function point(eastMeters, northMeters) {
  return {
    lat: ORIGIN_LAT + northMeters / M_PER_DEG_LAT,
    lng: ORIGIN_LNG + eastMeters / M_PER_DEG_LNG,
  };
}

function assertPoint(actual, expected, message, toleranceM = 0.25) {
  assert(actual, `${message}: missing point`);
  const eastDelta = (actual.lng - expected.lng) * M_PER_DEG_LNG;
  const northDelta = (actual.lat - expected.lat) * M_PER_DEG_LAT;
  assert(
    Math.hypot(eastDelta, northDelta) <= toleranceM,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const straight = [point(0, 0), point(1000, 0)];
const distanceIndex = buildGuidanceRouteDistanceIndex(straight);
assert.strictEqual(
  buildGuidanceRouteDistanceIndex(straight),
  distanceIndex,
  'Repeated progress samples should reuse the prepared distance index for the same immutable route geometry.',
);
assert.strictEqual(distanceIndex.geometry.length, 2);
assert(Math.abs(distanceIndex.totalDistanceM - 1000) < 2, 'Route index should preserve metric distance.');

const directProjection = projectPointToGuidanceSegment({
  position: point(250, 0),
  segmentStart: straight[0],
  segmentEnd: straight[1],
  segmentIndex: 0,
  distanceFromRouteStartM: 0,
});
assertPoint(directProjection.coordinate, point(250, 0), 'Point directly on route should remain on route');
assert(directProjection.distanceFromPositionM < 0.1);
assert(Math.abs(getGuidanceRouteDistanceAtProjection(directProjection) - 250) < 1);
assert(getGuidanceOffRouteDistanceMeters(directProjection) < 0.1);

const near = resolveGuidanceRouteProgress({
  rawPosition: point(250, 12),
  routeGeometry: straight,
  context: 'road',
  accuracyM: 6,
});
assert.strictEqual(near.status, 'snapped');
assertPoint(near.snappedPosition, point(250, 0), 'Near-route GPS should project to canonical route');
assertPoint(near.rawPosition, point(250, 12), 'Raw GPS must remain unchanged');
assert(near.offRouteDistanceM > 11 && near.offRouteDistanceM < 13);

const outside = resolveGuidanceRouteProgress({
  rawPosition: point(250, 120),
  routeGeometry: straight,
  context: 'road',
  accuracyM: 5,
});
assert.strictEqual(outside.status, 'off_route');
assert.strictEqual(outside.snappedPosition, null, 'Off-route GPS must not be falsely snapped.');
assert.deepStrictEqual(outside.completedGeometry, [], 'An off-route first fix must not invent completed progress.');
assert.deepStrictEqual(outside.remainingGeometry, straight, 'Off-route state must retain canonical remaining route.');

const poorAccuracyTolerance = resolveGuidanceSnapToleranceMeters({ context: 'road', accuracyM: 400 });
assert(
  poorAccuracyTolerance <= 60,
  `Poor GPS accuracy must not create an unbounded road snap tolerance, got ${poorAccuracyTolerance}m.`,
);
const poorAccuracyOffRoute = resolveGuidanceRouteProgress({
  rawPosition: point(250, 80),
  routeGeometry: straight,
  context: 'road',
  accuracyM: 400,
});
assert.strictEqual(
  poorAccuracyOffRoute.status,
  'off_route',
  'Poor GPS accuracy must not force a false snap outside the bounded tolerance.',
);

const parallelRoute = [
  point(0, 0),
  point(1000, 0),
  point(1000, 20),
  point(0, 20),
  point(0, 40),
  point(1000, 40),
];
const firstParallelProgress = resolveGuidanceRouteProgress({
  rawPosition: point(100, 0),
  routeGeometry: parallelRoute,
  context: 'road',
  accuracyM: 5,
  headingDeg: 90,
});
const noisyParallelProgress = resolveGuidanceRouteProgress({
  rawPosition: point(120, 13),
  routeGeometry: parallelRoute,
  context: 'road',
  accuracyM: 8,
  headingDeg: 90,
  previousProjection: firstParallelProgress.progressProjection,
  elapsedMs: 1000,
  speedMps: 12,
});
assert.strictEqual(noisyParallelProgress.status, 'snapped');
assert.strictEqual(
  noisyParallelProgress.progressProjection.segmentIndex,
  0,
  'Noise near a parallel return leg must preserve the plausible current segment.',
);
assert(
  noisyParallelProgress.routeDistanceM < 200,
  `Parallel-leg noise must not jump route progress forward, got ${noisyParallelProgress.routeDistanceM}m.`,
);
const exactParallelDrift = resolveGuidanceRouteProgress({
  rawPosition: point(125, 20),
  routeGeometry: parallelRoute,
  context: 'road',
  accuracyM: 20,
  headingDeg: 90,
  previousProjection: firstParallelProgress.progressProjection,
  elapsedMs: 1000,
  speedMps: 12,
});
assert.strictEqual(
  exactParallelDrift.progressProjection.segmentIndex,
  0,
  'A noisy fix exactly on a nearby opposite-direction parallel leg must preserve continuity.',
);

const switchbackRoute = [
  point(0, 0),
  point(200, 0),
  point(200, 12),
  point(20, 12),
  point(20, 24),
  point(200, 24),
];
const switchbackPrevious = resolveGuidanceRouteProgress({
  rawPosition: point(80, 0),
  routeGeometry: switchbackRoute,
  context: 'trail',
  accuracyM: 7,
  headingDeg: 90,
});
const switchbackNoisy = resolveGuidanceRouteProgress({
  rawPosition: point(95, 7),
  routeGeometry: switchbackRoute,
  context: 'trail',
  accuracyM: 8,
  headingDeg: 90,
  previousProjection: switchbackPrevious.progressProjection,
  elapsedMs: 1000,
  speedMps: 5,
});
assert.strictEqual(switchbackNoisy.progressProjection.segmentIndex, 0);

const selfCrossing = [point(-100, -100), point(100, 100), point(-100, 100), point(100, -100)];
const selfCrossingPrevious = resolveGuidanceRouteProgress({
  rawPosition: point(-30, -30),
  routeGeometry: selfCrossing,
  context: 'road',
  headingDeg: 45,
  accuracyM: 5,
});
const selfCrossingCenter = resolveGuidanceRouteProgress({
  rawPosition: point(0, 0),
  routeGeometry: selfCrossing,
  context: 'road',
  headingDeg: 45,
  accuracyM: 5,
  previousProjection: selfCrossingPrevious.progressProjection,
  elapsedMs: 1000,
  speedMps: 8,
});
assert.strictEqual(
  selfCrossingCenter.progressProjection.segmentIndex,
  0,
  'Self-crossing selection should follow prior segment and heading deterministically.',
);

const monotonicPrevious = resolveGuidanceRouteProgress({
  rawPosition: point(800, 0),
  routeGeometry: straight,
  context: 'road',
  accuracyM: 5,
});
const regressedFix = resolveGuidanceRouteProgress({
  rawPosition: point(200, 0),
  routeGeometry: straight,
  context: 'road',
  accuracyM: 5,
  previousProjection: monotonicPrevious.progressProjection,
  elapsedMs: 1000,
  speedMps: 8,
});
assert(
  regressedFix.routeDistanceM >= monotonicPrevious.routeDistanceM - 18,
  'Ordinary GPS regression must not materially move canonical progress backward.',
);

const deliberateBacktrack = resolveGuidanceRouteProgress({
  rawPosition: point(200, 0),
  routeGeometry: straight,
  context: 'road',
  accuracyM: 5,
  headingDeg: 270,
  previousProjection: monotonicPrevious.progressProjection,
  allowBacktracking: true,
});
assert(
  deliberateBacktrack.routeDistanceM > 190 && deliberateBacktrack.routeDistanceM < 210,
  'Confirmed deliberate backtracking should be allowed to move progress backward.',
);

const replacementRoute = [point(0, 100), point(1000, 100)];
const replacementProgress = resolveGuidanceRouteProgress({
  rawPosition: point(10, 100),
  routeGeometry: replacementRoute,
  context: 'road',
  accuracyM: 5,
});
assert(replacementProgress.routeDistanceM < 20, 'Route replacement without prior projection must reset progress.');

const offlineProgress = resolveGuidanceRouteProgress({
  rawPosition: point(400, 5),
  routeGeometry: straight,
  context: 'offline',
  accuracyM: 10,
});
assert.strictEqual(offlineProgress.status, 'snapped');
assertPoint(offlineProgress.snappedPosition, point(400, 0), 'Stored offline canonical geometry should project locally');

const sparse = resolveGuidanceRouteProgress({
  rawPosition: point(0, 0),
  routeGeometry: [point(0, 0)],
  context: 'offline',
  accuracyM: 5,
});
assert.strictEqual(sparse.status, 'degraded');
assert.strictEqual(sparse.progressProjection, null);
assert.deepStrictEqual(sparse.completedGeometry, []);
assert.deepStrictEqual(sparse.remainingGeometry, [point(0, 0)]);

const malformed = resolveGuidanceRouteProgress({
  rawPosition: point(40, 0),
  routeGeometry: [point(0, 0), { lat: 999, lng: -121 }, point(100, 0)],
  context: 'road',
  accuracyM: 5,
});
assert.strictEqual(malformed.status, 'degraded', 'Invalid canonical points should be excluded and reported as degraded.');
assert.strictEqual(malformed.invalidPointCount, 1);
assertPoint(malformed.snappedPosition, point(40, 0), 'Valid geometry should remain usable after excluding a malformed point');

const turnRoute = [point(0, 0), point(100, 0), point(100, 100)];
const turnProgress = resolveGuidanceRouteProgress({
  rawPosition: point(100, 20),
  routeGeometry: turnRoute,
  context: 'road',
  accuracyM: 5,
});
assert.strictEqual(turnProgress.completedGeometry.length, 3);
assertPoint(turnProgress.completedGeometry[1], point(100, 0), 'Completed geometry must preserve the canonical turn vertex');
const split = splitGuidanceRouteAtProjection(turnProgress.geometry, turnProgress.progressProjection);
assertPoint(split.completed.at(-1), split.remaining[0], 'Completed and remaining lines must share an exact split point');
assertPoint(split.completed.at(-1), point(100, 20), 'Split point must lie on canonical route');

const candidates = findNearestPlausibleRouteProjection({
  position: point(120, 13),
  routeIndex: buildGuidanceRouteDistanceIndex(parallelRoute),
  previousProjection: firstParallelProgress.progressProjection,
  headingDeg: 90,
  accuracyM: 8,
  elapsedMs: 1000,
  speedMps: 12,
});
assert.strictEqual(candidates.segmentIndex, 0);
assert(Number.isFinite(scoreGuidanceProjectionContinuity({
  candidate: candidates,
  previousProjection: firstParallelProgress.progressProjection,
  headingDeg: 90,
  elapsedMs: 1000,
  speedMps: 12,
  accuracyM: 8,
})));

assert.strictEqual(
  Number(near.snappedPosition.lng.toFixed(6)),
  Number(point(250, 0).lng.toFixed(6)),
  'Guidance geometry must preserve longitude/latitude ordering.',
);

const longRoute = Array.from({ length: 8001 }, (_, index) => point(index * 5, 500));
const longRouteIndex = buildGuidanceRouteDistanceIndex(longRoute);
let longRoutePrevious = findNearestPlausibleRouteProjection({
  position: point(20000, 500),
  routeIndex: longRouteIndex,
  headingDeg: 90,
  accuracyM: 5,
});
assert(longRoutePrevious, 'Long-route fixture should establish an initial projection.');

for (let step = 1; step <= 24; step += 1) {
  let diagnostics = null;
  const projection = findNearestPlausibleRouteProjection({
    position: point(20000 + step * 5, 502),
    routeIndex: longRouteIndex,
    previousProjection: longRoutePrevious,
    headingDeg: 90,
    accuracyM: 5,
    elapsedMs: 1000,
    speedMps: 5,
    onSearchDiagnostics: (value) => {
      diagnostics = value;
    },
  });
  assert(projection, 'Repeated long-route progress should retain a projection.');
  assert.strictEqual(
    diagnostics?.strategy,
    'local',
    'A plausible follow-up fix should use the bounded local projection search.',
  );
  assert.strictEqual(diagnostics?.fellBackToFullRoute, false);
  assert(
    diagnostics.evaluatedSegmentCount <= 65,
    `Local projection work must remain bounded, evaluated ${diagnostics.evaluatedSegmentCount} segments.`,
  );
  assert(
    diagnostics.evaluatedSegmentCount < diagnostics.totalSegmentCount / 100,
    'Repeated progress must not scan the full canonical route.',
  );
  assertPoint(
    projection.coordinate,
    point(20000 + step * 5, 500),
    'Bounded search should still project onto canonical long-route geometry',
  );
  longRoutePrevious = projection;
}

let teleportDiagnostics = null;
const teleportedProjection = findNearestPlausibleRouteProjection({
  position: point(35000, 500),
  routeIndex: longRouteIndex,
  previousProjection: longRoutePrevious,
  headingDeg: 90,
  accuracyM: 5,
  elapsedMs: 1000,
  speedMps: 5,
  onSearchDiagnostics: (value) => {
    teleportDiagnostics = value;
  },
});
assert.strictEqual(
  teleportDiagnostics?.fellBackToFullRoute,
  true,
  'A teleport beyond the local window must fall back to the full canonical route.',
);
assertPoint(
  teleportedProjection?.coordinate,
  point(35000, 500),
  'Full-route fallback must recover the correct projection after a teleport',
);

let farOffRouteDiagnostics = null;
const farOffRouteProjection = findNearestPlausibleRouteProjection({
  position: point(30000, 5000),
  routeIndex: longRouteIndex,
  previousProjection: longRoutePrevious,
  accuracyM: 5,
  onSearchDiagnostics: (value) => {
    farOffRouteDiagnostics = value;
  },
});
assert.strictEqual(
  farOffRouteDiagnostics?.fellBackToFullRoute,
  true,
  'A fix outside the local acceptance radius must use full-route search for truthful off-route distance.',
);
assert(
  farOffRouteProjection.distanceFromPositionM > 4490 &&
    farOffRouteProjection.distanceFromPositionM < 4530,
  `Full-route fallback should preserve truthful off-route distance, got ${farOffRouteProjection.distanceFromPositionM}m.`,
);

let backtrackDiagnostics = null;
const farBacktrackProjection = findNearestPlausibleRouteProjection({
  position: point(5000, 500),
  routeIndex: longRouteIndex,
  previousProjection: teleportedProjection,
  headingDeg: 270,
  accuracyM: 5,
  allowBacktracking: true,
  onSearchDiagnostics: (value) => {
    backtrackDiagnostics = value;
  },
});
assert.strictEqual(
  backtrackDiagnostics?.fellBackToFullRoute,
  true,
  'Deliberate backtracking beyond the local window must fall back to full-route search.',
);
assertPoint(
  farBacktrackProjection?.coordinate,
  point(5000, 500),
  'Full-route fallback must preserve deliberate backtracking',
);

console.log('guidance route projection tests passed');
