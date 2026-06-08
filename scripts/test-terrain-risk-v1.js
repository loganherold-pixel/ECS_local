const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function loadWithReactNativeStub(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'test', select: (options) => options?.default ?? null },
      NativeModules: {},
      DeviceEventEmitter: { addListener: () => ({ remove() {} }) },
    };
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

const {
  TERRAIN_RISK_V1_CATEGORIES,
  evaluateTerrainRiskV1,
  evaluateTerrainRiskForActiveTrip,
  terrainRiskV1Label,
} = require(path.join(root, 'lib', 'terrainRiskEngine.ts'));

assert.deepStrictEqual(
  TERRAIN_RISK_V1_CATEGORIES,
  ['low', 'moderate', 'elevated', 'severe', 'unknown'],
  'Terrain Risk v1 category contract must stay stable.',
);
assert.strictEqual(terrainRiskV1Label('unknown'), 'Unknown');

function resultLabels(result) {
  return [
    ...result.riskReasons.map((reason) => reason.label),
    ...result.missingDataReasons.map((reason) => reason.label),
  ];
}

function baseInput(overrides = {}) {
  return {
    route: {
      authorityStatus: 'live_verified_geometry',
      authorityLabel: 'ECS Validated',
      geometryStatus: 'trail_available',
      geometrySource: 'ecs_validated_route_catalog',
      geometryValid: true,
      distanceMiles: 24,
      trailDifficulty: 'moderate',
      ...overrides.route,
    },
    vehicle: {
      status: 'complete',
      label: 'Overlander',
      vehicleType: 'truck',
      rangeMiles: 260,
      ...overrides.vehicle,
    },
    weather: {
      status: 'available',
      label: 'Weather available',
      ...overrides.weather,
    },
    daylight: {
      status: 'available',
      label: 'Daylight available',
      ...overrides.daylight,
    },
    remoteness: {
      status: 'available',
      label: 'Remoteness available',
      ...overrides.remoteness,
    },
    elevation: {
      status: 'available',
      label: 'Elevation/grade available',
      ...overrides.elevation,
    },
  };
}

let approachOnly = evaluateTerrainRiskV1(baseInput({
  route: {
    authorityStatus: 'unknown',
    authorityLabel: 'Unknown Route Authority',
    geometryStatus: 'approach_only',
    geometrySource: 'approach_guidance',
    geometryValid: true,
    trailDifficulty: null,
  },
}));
assert.strictEqual(approachOnly.category, 'unknown');
assert.strictEqual(approachOnly.score, null);
assert.ok(resultLabels(approachOnly).includes('Approach route only. Trail terrain not verified.'));
assert.strictEqual(approachOnly.recommendedAction.id, 'verify_trail_geometry');
assert.notStrictEqual(approachOnly.dataConfidence.state, 'verified');

let trailheadOnly = evaluateTerrainRiskV1(baseInput({
  route: {
    authorityStatus: 'trailhead_guidance',
    geometryStatus: 'trailhead_only',
    geometryValid: false,
  },
}));
assert.strictEqual(trailheadOnly.category, 'unknown');
assert.ok(resultLabels(trailheadOnly).includes('Trailhead guidance only. Trail terrain not available.'));

let missingGeometry = evaluateTerrainRiskV1(baseInput({
  route: {
    authorityStatus: 'live_verified_geometry',
    geometryStatus: 'unknown',
    geometrySource: null,
    geometryValid: false,
  },
}));
assert.strictEqual(missingGeometry.category, 'unknown');
assert.ok(resultLabels(missingGeometry).includes('Route geometry missing.'));

let demoRoute = evaluateTerrainRiskV1(baseInput({
  route: {
    authorityStatus: 'demo_fixture',
    geometryStatus: 'trail_available',
    geometrySource: 'ecs_demo_full_route_fixture',
    geometryValid: true,
  },
}));
assert.strictEqual(demoRoute.category, 'unknown');
assert.notStrictEqual(demoRoute.category, 'low');
assert.strictEqual(demoRoute.dataConfidence.state, 'demo');
assert.ok(resultLabels(demoRoute).includes('Demo route. Terrain risk not verified.'));

let previewRoute = evaluateTerrainRiskV1(baseInput({
  route: {
    authorityStatus: 'preview_geometry',
    geometryStatus: 'trail_available',
    geometrySource: 'preview',
    geometryValid: true,
    trailDifficulty: 'easy',
  },
}));
assert.ok(['unknown', 'moderate'].includes(previewRoute.category));
assert.notStrictEqual(previewRoute.category, 'low');
assert.ok(resultLabels(previewRoute).includes('Preview geometry. Terrain risk limited.'));

let verifiedModerate = evaluateTerrainRiskV1(baseInput());
assert.strictEqual(verifiedModerate.category, 'moderate');
assert.strictEqual(typeof verifiedModerate.score, 'number');
assert.strictEqual(verifiedModerate.dataConfidence.state, 'verified');
assert.ok(resultLabels(verifiedModerate).includes('Verified trail geometry available.'));
assert.ok(resultLabels(verifiedModerate).includes('Known trail difficulty: moderate.'));

for (const missingDifficulty of [null, undefined, '']) {
  const missingDifficultyResult = evaluateTerrainRiskV1(baseInput({
    route: {
      trailDifficulty: missingDifficulty,
    },
  }));
  const labels = resultLabels(missingDifficultyResult);
  assert.notStrictEqual(missingDifficultyResult.category, 'low');
  assert.ok(labels.includes('Trail difficulty unknown.'));
  assert.ok(!labels.some((label) => /Known trail difficulty:\s*(null|undefined)?\./i.test(label)));
  assert.ok(!labels.some((label) => /\b(null|undefined)\b/i.test(label)));
}

let missingVehicle = evaluateTerrainRiskV1(baseInput({
  vehicle: {
    status: 'missing',
    label: null,
    vehicleType: null,
    rangeMiles: null,
  },
}));
assert.notStrictEqual(missingVehicle.category, 'low');
assert.ok(resultLabels(missingVehicle).includes('Vehicle profile missing.'));
assert.strictEqual(missingVehicle.dataConfidence.state, 'partial');

let weatherUnavailable = evaluateTerrainRiskV1(baseInput({
  weather: {
    status: 'unavailable',
    label: 'Weather unavailable',
  },
}));
assert.notStrictEqual(weatherUnavailable.category, 'low');
assert.ok(resultLabels(weatherUnavailable).includes('Weather unavailable.'));
assert.ok(!resultLabels(weatherUnavailable).some((label) => /safe/i.test(label)));

const activeTripRisk = evaluateTerrainRiskForActiveTrip({
  status: 'active',
  route: {
    authorityStatus: 'unknown',
    authorityLabel: 'Unknown Route Authority',
    geometryStatus: 'approach_only',
    geometrySource: 'approach_guidance',
    geometryValid: true,
    distanceMiles: 1.1,
  },
  vehicle: {
    id: 'rig-1',
    label: 'Overlander',
    vehicleType: 'truck',
    rangeMiles: 480,
  },
  routeConfidence: {
    metadata: { weatherStatus: 'unknown' },
    dataConfidence: { state: 'stale', knownLimitations: [] },
    knownLimitations: ['Route geometry missing'],
  },
  freshness: {
    state: 'stale',
    label: 'Recovered from local snapshot; live context unavailable until refreshed.',
  },
});
assert.strictEqual(activeTripRisk.category, 'unknown');
assert.ok(resultLabels(activeTripRisk).includes('Approach route only. Trail terrain not verified.'));
assert.strictEqual(activeTripRisk.weather.status, 'unknown');
assert.strictEqual(activeTripRisk.vehicle.status, 'complete');

const activeTripSource = fs.readFileSync(path.join(root, 'app', 'active-trip.tsx'), 'utf8');
assert.ok(activeTripSource.includes('evaluateTerrainRiskForActiveTrip'), 'Active Trip screen should evaluate Terrain Risk v1 from the active snapshot.');
assert.ok(activeTripSource.includes('Terrain Risk'), 'Active Trip screen should render Terrain Risk v1.');
assert.ok(activeTripSource.includes('testID="active-trip-terrain-risk"'), 'Active Trip Terrain Risk card needs a stable test id.');

const packetSource = fs.readFileSync(path.join(root, 'app', 'offline-incident-packet.tsx'), 'utf8');
assert.ok(packetSource.includes('evaluateTerrainRiskForOfflineIncidentPacket'), 'Offline packet screen should evaluate Terrain Risk v1 from packet data.');
assert.ok(packetSource.includes('Terrain Risk'), 'Offline packet screen should render Terrain Risk v1.');
assert.ok(packetSource.includes('testID="offline-incident-packet-terrain-risk"'), 'Offline packet Terrain Risk card needs a stable test id.');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(packageJson.scripts['test:terrain-risk-v1'], 'node ./scripts/test-terrain-risk-v1.js');

console.log('Terrain Risk v1 tests passed');
