const assert = require('assert');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = require('fs').readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

const {
  composeStitchedRoute,
} = require(path.join(root, 'lib', 'stitchRouteComposer.ts'));

function point(lat, lng) {
  return { lat, lng, ele_m: null, time: null };
}

function run(id, points) {
  return {
    id,
    title: id,
    points,
    waypoints: [],
  };
}

(async () => {
  const touching = await composeStitchedRoute({
    title: 'Touching',
    selectedRuns: [
      run('first', [point(39.0000, -120.0000), point(39.0002, -120.0002)]),
      run('second', [point(39.00021, -120.00021), point(39.0006, -120.0006)]),
    ],
    fetchBridge: async () => {
      throw new Error('Directions should not be called for touching segments.');
    },
  });

  assert.strictEqual(touching.blocked, false);
  assert.strictEqual(touching.transitionLegCount, 0);
  assert.strictEqual(touching.parsed.routePoints.length, 3, 'Touching joins should dedupe the adjacent endpoint.');

  const bridgeGeometry = [
    point(39.0002, -120.0002),
    point(39.0010, -120.0010),
    point(39.0020, -120.0020),
  ];
  let bridgeCalls = 0;
  const bridged = await composeStitchedRoute({
    title: 'Bridged',
    selectedRuns: [
      run('first', [point(39.0000, -120.0000), point(39.0002, -120.0002)]),
      run('second', [point(39.0020, -120.0020), point(39.0024, -120.0024)]),
    ],
    fetchBridge: async () => {
      bridgeCalls += 1;
      return { coordinates: bridgeGeometry, distanceM: 280, sourceLabel: 'mapbox_directions_driving_bridge' };
    },
  });

  assert.strictEqual(bridgeCalls, 1);
  assert.strictEqual(bridged.blocked, false);
  assert.strictEqual(bridged.transitionLegCount, 1);
  assert(
    bridged.parsed.routePoints.some((candidate) => candidate.lat === 39.0010 && candidate.lng === -120.0010),
    'Gap bridge should include returned Mapbox driving geometry, not only a two-point straight connector.',
  );

  const failed = await composeStitchedRoute({
    title: 'Failed',
    selectedRuns: [
      run('first', [point(39.0000, -120.0000), point(39.0002, -120.0002)]),
      run('second', [point(39.0040, -120.0040), point(39.0044, -120.0044)]),
    ],
    fetchBridge: async () => null,
  });

  assert.strictEqual(failed.blocked, true);
  assert.strictEqual(failed.gapsNeedingReview.length, 1);

  const gps = point(39.0100, -120.0100);
  const reversedFirstOnly = await composeStitchedRoute({
    title: 'GPS Reverse',
    selectedRuns: [
      run('first', [point(39.0000, -120.0000), point(39.0101, -120.0101)]),
      run('second', [point(39.0200, -120.0200), point(39.0300, -120.0300)]),
    ],
    currentLocation: gps,
    fetchBridge: async () => ({ coordinates: [point(39.0000, -120.0000), point(39.0200, -120.0200)], distanceM: 2000 }),
  });

  assert.strictEqual(reversedFirstOnly.blocked, false);
  assert.strictEqual(reversedFirstOnly.reversedFirstSegment, true);
  assert.strictEqual(reversedFirstOnly.parsed.routePoints[0].lat, 39.0101);
  assert.strictEqual(
    reversedFirstOnly.segmentOrientations[1],
    'forward',
    'Later segments must preserve selected order and orientation.',
  );

  console.log('Stitch route bridge checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
