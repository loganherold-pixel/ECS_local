const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const memoryStorage = new Map();

global.localStorage = {
  getItem(key) {
    return memoryStorage.has(key) ? memoryStorage.get(key) : null;
  },
  setItem(key, value) {
    memoryStorage.set(key, String(value));
  },
  removeItem(key) {
    memoryStorage.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const tripStorePath = path.join(root, 'lib', 'expedition', 'expeditionTripRecordStore.ts');
const {
  expeditionTripRecordStore,
  trackExpeditionTripFromGuidanceSnapshot,
} = require(tripStorePath);

function makeSnapshot(overrides) {
  return {
    sessionId: 'guidance-recording-session',
    lifecycle: 'active',
    source: 'road',
    routeId: 'planned-route-id',
    routeTitle: 'Actual Driven Trace Route',
    routeSubtitle: 'Regression route',
    statusLabel: 'Guidance active',
    instruction: 'Continue',
    routePoints: [
      { lat: 40.0, lng: -105.0, elevationFeet: 1000 },
      { lat: 41.0, lng: -106.0, elevationFeet: 9000 },
    ],
    progressPoints: [],
    currentLocation: {
      latitude: 39.0,
      longitude: -104.0,
      altitudeFt: 5000,
      speedMph: 12,
      headingDeg: 45,
      accuracyM: 8,
      timestamp: Date.parse('2026-05-03T10:00:00.000Z'),
    },
    gpsSample: null,
    headingDeg: 45,
    remainingDistanceM: 40000,
    remainingDurationS: 3600,
    etaIso: '2026-05-03T11:00:00.000Z',
    progressPercent: 0,
    nextInstructionDistanceM: 1000,
    isRerouting: false,
    isOffRoute: false,
    offRouteDistanceM: null,
    routeStatusKind: 'nominal',
    updatedAt: '2026-05-03T10:00:00.000Z',
    ...overrides,
  };
}

async function main() {
  await expeditionTripRecordStore.clearAllForTests();

  await trackExpeditionTripFromGuidanceSnapshot(makeSnapshot());
  await trackExpeditionTripFromGuidanceSnapshot(makeSnapshot({
    currentLocation: {
      latitude: 39.05,
      longitude: -104.05,
      altitudeFt: 6200,
      speedMph: 24,
      headingDeg: 45,
      accuracyM: 7,
      timestamp: Date.parse('2026-05-03T10:10:00.000Z'),
    },
    remainingDistanceM: 30000,
    progressPercent: 40,
    updatedAt: '2026-05-03T10:10:00.000Z',
  }));
  await trackExpeditionTripFromGuidanceSnapshot(makeSnapshot({
    lifecycle: 'arrived',
    statusLabel: 'Guidance complete',
    currentLocation: {
      latitude: 39.1,
      longitude: -104.1,
      altitudeFt: 6500,
      speedMph: 3,
      headingDeg: 45,
      accuracyM: 6,
      timestamp: Date.parse('2026-05-03T10:25:00.000Z'),
    },
    remainingDistanceM: 0,
    progressPercent: 100,
    updatedAt: '2026-05-03T10:25:00.000Z',
  }));

  const completed = await expeditionTripRecordStore.getCompleted();
  assert.strictEqual(completed.length, 1, 'Active guidance should auto-create and complete one expedition record.');

  const trip = completed[0];
  assert.strictEqual(trip.routeGeometry.length, 3, 'The recorded route should contain live GPS samples.');
  assert.strictEqual(trip.routeGeometry[0].lat, 39);
  assert.strictEqual(trip.routeGeometry[0].lng, -104);
  assert.strictEqual(trip.routeGeometry[trip.routeGeometry.length - 1].lat, 39.1);
  assert.strictEqual(trip.routeGeometry[trip.routeGeometry.length - 1].lng, -104.1);
  assert.notStrictEqual(trip.routeGeometry[0].lat, 40, 'Planned route geometry must not replace the driven recap trace.');
  assert.strictEqual(trip.minElevationFt, 5000);
  assert.strictEqual(trip.maxElevationFt, 6500);
  assert.strictEqual(trip.totalElevationGainFt, 1500);
  assert.strictEqual(trip.totalDurationSeconds, 25 * 60);
  assert(trip.totalDistanceMiles > 8, 'Recorded distance should come from the live trace.');
  assert(trip.totalDistanceMiles < 10, 'Recorded distance should not come from the unrelated planned route.');

  const startMoment = trip.notableMoments.find((moment) => moment.type === 'guidance_started');
  const completedMoment = trip.notableMoments.find((moment) => moment.type === 'guidance_completed');
  assert(startMoment?.coordinate, 'Guidance start moment should have the first live GPS coordinate.');
  assert(completedMoment?.coordinate, 'Guidance completion moment should have the last live GPS coordinate.');
  assert.notDeepStrictEqual(
    {
      lat: startMoment.coordinate.lat,
      lng: startMoment.coordinate.lng,
    },
    {
      lat: completedMoment.coordinate.lat,
      lng: completedMoment.coordinate.lng,
    },
    'Guidance start and completion moments should not collapse onto the same coordinate after movement.',
  );

  console.log('Expedition guidance recording checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
