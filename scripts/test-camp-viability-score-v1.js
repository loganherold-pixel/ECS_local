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
  CAMP_VIABILITY_V1_CATEGORIES,
  campViabilityV1Label,
  evaluateCampViabilityV1,
  evaluateCampViabilityForActiveTrip,
  evaluateCampViabilityForOfflineIncidentPacket,
} = require(path.join(root, 'lib', 'campViabilityEngine.ts'));

assert.deepStrictEqual(
  CAMP_VIABILITY_V1_CATEGORIES,
  ['strong_candidate', 'reasonable_candidate', 'caution', 'poor_candidate', 'unknown'],
  'Camp Viability v1 category contract must stay stable.',
);
assert.strictEqual(campViabilityV1Label('strong_candidate'), 'Strong Candidate');
assert.strictEqual(campViabilityV1Label('unknown'), 'Unknown');

function resultLabels(result) {
  return [
    ...result.missingDataReasons.map((reason) => reason.label),
    ...result.cautionReasons.map((reason) => reason.label),
    ...result.positiveReasons.map((reason) => reason.label),
  ];
}

function assertNoOverclaim(labels) {
  const joined = labels.join(' ');
  assert.ok(!/\b(legal campsite|public campsite|verified camp|safe camp|permitted camp|safe to camp)\b/i.test(joined));
}

function baseInput(overrides = {}) {
  const hasOverride = (key) => Object.prototype.hasOwnProperty.call(overrides, key);
  return {
    camp: hasOverride('camp') && overrides.camp == null ? null : {
      id: 'camp-1',
      name: 'Pinyon Bench Camp',
      coordinate: { latitude: 38.1, longitude: -110.2 },
      source: 'route_context_engine',
      sourceStatus: 'available',
      legalStatus: 'allowed',
      legalConfidence: 'high',
      accessConfidence: 'high',
      distanceFromRouteMiles: 0.4,
      ...overrides.camp,
    },
    route: {
      authorityStatus: 'live_verified_geometry',
      authorityLabel: 'Live verified trail geometry',
      geometryStatus: 'trail_route',
      geometryValid: true,
      ...overrides.route,
    },
    vehicle: {
      status: 'complete',
      label: 'QA Tacoma',
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
      score: 35,
      label: 'Remoteness available',
      ...overrides.remoteness,
    },
    terrainRisk: {
      category: 'moderate',
      label: 'Moderate',
      score: 42,
      ...overrides.terrainRisk,
    },
    bailout: {
      status: 'available',
      label: 'Bailout available',
      source: 'trip_plan',
      ...overrides.bailout,
    },
    dataState: overrides.dataState,
  };
}

const noCamp = evaluateCampViabilityV1(baseInput({ camp: null }));
assert.strictEqual(noCamp.category, 'unknown');
assert.strictEqual(noCamp.score, null);
assert.ok(resultLabels(noCamp).includes('No camp selected.'));
assertNoOverclaim(resultLabels(noCamp));

const unknownLegal = evaluateCampViabilityV1(baseInput({
  camp: {
    sourceStatus: 'unknown',
    legalStatus: null,
    legalConfidence: 'unknown',
  },
}));
assert.notStrictEqual(unknownLegal.category, 'strong_candidate');
assert.ok(resultLabels(unknownLegal).includes('Camp source/legal status unknown.'));
assertNoOverclaim(resultLabels(unknownLegal));

for (const sourceStatus of ['demo', 'mock', 'preview']) {
  const fixtureCamp = evaluateCampViabilityV1(baseInput({
    camp: {
      sourceStatus,
      source: `${sourceStatus}_camp_fixture`,
      legalStatus: null,
      legalConfidence: 'unknown',
    },
  }));
  assert.notStrictEqual(fixtureCamp.dataConfidence.state, 'verified');
  assert.ok(resultLabels(fixtureCamp).includes('Camp candidate not verified.'));
  assertNoOverclaim(resultLabels(fixtureCamp));
}

const missingCoordinates = evaluateCampViabilityV1(baseInput({
  camp: {
    coordinate: null,
  },
}));
assert.ok(['unknown', 'caution'].includes(missingCoordinates.category));
assert.ok(resultLabels(missingCoordinates).includes('Camp coordinates unavailable.'));

const approachOnly = evaluateCampViabilityV1(baseInput({
  route: {
    authorityStatus: 'trailhead_guidance',
    geometryStatus: 'approach_only',
    geometryValid: false,
  },
}));
assert.notStrictEqual(approachOnly.category, 'strong_candidate');
assert.ok(resultLabels(approachOnly).includes('Trail context limited.'));

const weatherUnavailable = evaluateCampViabilityV1(baseInput({
  weather: {
    status: 'unavailable',
    label: 'Weather unavailable',
  },
}));
assert.notStrictEqual(weatherUnavailable.category, 'strong_candidate');
assert.ok(resultLabels(weatherUnavailable).includes('Weather unavailable.'));

const daylightLimited = evaluateCampViabilityV1(baseInput({
  daylight: {
    status: 'limited',
    label: 'Limited daylight',
  },
}));
assert.ok(resultLabels(daylightLimited).includes('Daylight limited.'));
assert.notStrictEqual(daylightLimited.category, 'strong_candidate');

const terrainUnknown = evaluateCampViabilityV1(baseInput({
  terrainRisk: {
    category: 'unknown',
    label: 'Unknown',
    score: null,
  },
}));
assert.ok(resultLabels(terrainUnknown).includes('Terrain risk unknown.'));
assert.notStrictEqual(terrainUnknown.category, 'strong_candidate');

const terrainElevated = evaluateCampViabilityV1(baseInput({
  terrainRisk: {
    category: 'elevated',
    label: 'Elevated',
    score: 58,
  },
}));
assert.ok(resultLabels(terrainElevated).includes('Terrain risk elevated.'));
assert.notStrictEqual(terrainElevated.category, 'strong_candidate');

const supportedCamp = evaluateCampViabilityV1(baseInput());
assert.ok(['strong_candidate', 'reasonable_candidate'].includes(supportedCamp.category));
assert.ok(typeof supportedCamp.score === 'number');
assert.ok(resultLabels(supportedCamp).includes('Camp candidate selected.'));
assert.ok(resultLabels(supportedCamp).includes('Camp coordinates available.'));
assert.ok(resultLabels(supportedCamp).includes('Camp source/legal status supported by existing metadata.'));
assertNoOverclaim(resultLabels(supportedCamp));

const activeTripSnapshot = {
  status: 'active',
  route: baseInput().route,
  vehicle: {
    id: 'veh-1',
    label: 'QA Tacoma',
    vehicleType: 'midsize_4x4',
    rangeMiles: 260,
  },
  logistics: {
    camp: { status: 'available', label: 'Available', source: 'trip_plan', updatedAt: null, warnings: [] },
    bailout: { status: 'available', label: 'Available', source: 'trip_plan', updatedAt: null, warnings: [] },
  },
  campCandidate: baseInput().camp,
  freshness: { state: 'stale' },
};
const terrainRiskSummary = {
  ...baseInput().terrainRisk,
  weather: baseInput().weather,
  daylight: baseInput().daylight,
  remoteness: baseInput().remoteness,
};
const activeTripCamp = evaluateCampViabilityForActiveTrip(activeTripSnapshot, terrainRiskSummary);
assert.ok(['strong_candidate', 'reasonable_candidate'].includes(activeTripCamp.category));
assert.strictEqual(activeTripCamp.camp.name, 'Pinyon Bench Camp');

const activeTripWithoutCamp = evaluateCampViabilityForActiveTrip({
  ...activeTripSnapshot,
  campCandidate: null,
  logistics: {
    ...activeTripSnapshot.logistics,
    camp: { status: 'unknown', label: 'Unknown', source: 'not_enough_data', updatedAt: null, warnings: [] },
  },
}, terrainRiskSummary);
assert.strictEqual(activeTripWithoutCamp.category, 'unknown');
assert.ok(resultLabels(activeTripWithoutCamp).includes('No camp selected.'));

const packetCamp = evaluateCampViabilityForOfflineIncidentPacket({
  route: baseInput().route,
  vehicle: activeTripSnapshot.vehicle,
  logistics: activeTripSnapshot.logistics,
  campCandidate: baseInput().camp,
  dataFreshness: { state: 'stale' },
}, terrainRiskSummary);
assert.ok(resultLabels(packetCamp).includes('Offline packet is local-only.'));
assert.strictEqual(packetCamp.dataConfidence.state, 'stale');

const engineSource = fs.readFileSync(path.join(root, 'lib', 'campViabilityEngine.ts'), 'utf8');
assert.ok(!/fetch\s*\(|axios|supabase\.from|provider API/i.test(engineSource), 'Camp Viability v1 must not fetch new provider data.');

const activeTripSource = fs.readFileSync(path.join(root, 'app', 'active-trip.tsx'), 'utf8');
assert.ok(activeTripSource.includes('evaluateCampViabilityForActiveTrip'), 'Active Trip should evaluate Camp Viability v1 from the snapshot.');
assert.ok(activeTripSource.includes('Camp Viability'), 'Active Trip should render Camp Viability v1.');
assert.ok(activeTripSource.includes('testID="active-trip-camp-viability"'), 'Active Trip Camp Viability card needs a stable test id.');

const packetSource = fs.readFileSync(path.join(root, 'app', 'offline-incident-packet.tsx'), 'utf8');
assert.ok(packetSource.includes('evaluateCampViabilityForOfflineIncidentPacket'), 'Offline packet should evaluate Camp Viability v1 from local packet data.');
assert.ok(packetSource.includes('Camp Viability'), 'Offline packet should render Camp Viability v1.');
assert.ok(packetSource.includes('testID="offline-incident-packet-camp-viability"'), 'Offline packet Camp Viability card needs a stable test id.');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(packageJson.scripts['test:camp-viability-score-v1'], 'node ./scripts/test-camp-viability-score-v1.js');

console.log('Camp Viability Score v1 tests passed');
