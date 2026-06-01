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
const badgeStorePath = path.join(root, 'lib', 'expedition', 'expeditionBadgeStore.ts');

const {
  createNewActiveTripRecord,
  expeditionTripRecordStore,
  finalizeCompletedTrip,
  trackExpeditionTripFromGuidanceSnapshot,
} = require(tripStorePath);
const {
  clearAllBadgesForTests,
  getBadgeProgress,
  getUnlockedBadges,
} = require(badgeStorePath);

function makeSnapshot(overrides) {
  return {
    sessionId: 'session-integrity',
    lifecycle: 'active',
    source: 'road',
    routeId: 'route-integrity',
    routeTitle: 'Pipeline Integrity Route',
    routeSubtitle: 'Regression route',
    statusLabel: 'Road guidance active',
    instruction: 'Continue',
    routePoints: [
      { lat: 39.0, lng: -104.0, elevationFeet: 5200 },
      { lat: 39.35, lng: -104.4, elevationFeet: 6800 },
    ],
    progressPoints: [{ lat: 39.0, lng: -104.0, elevationFeet: 5200 }],
    currentLocation: { latitude: 39.0, longitude: -104.0 },
    headingDeg: null,
    remainingDistanceM: 80467.2,
    remainingDurationS: 3600,
    etaIso: '2026-05-01T18:00:00.000Z',
    progressPercent: 0,
    nextInstructionDistanceM: 1000,
    isRerouting: false,
    isOffRoute: false,
    offRouteDistanceM: null,
    routeStatusKind: 'nominal',
    updatedAt: '2026-05-01T17:00:00.000Z',
    ...overrides,
  };
}

async function main() {
  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();

  await trackExpeditionTripFromGuidanceSnapshot(makeSnapshot());
  await trackExpeditionTripFromGuidanceSnapshot(makeSnapshot({
    lifecycle: 'inactive',
    statusLabel: 'No active route',
    updatedAt: '2026-05-01T17:05:00.000Z',
  }));

  const afterManualEndCompleted = await expeditionTripRecordStore.getCompleted();
  assert.strictEqual(
    afterManualEndCompleted.length,
    0,
    'Manual end before arrival must not count as a completed expedition.',
  );
  const cancelledRecords = await expeditionTripRecordStore.getAll();
  assert.strictEqual(cancelledRecords.length, 1, 'Manual end should preserve one audit record.');
  assert.strictEqual(cancelledRecords[0].status, 'cancelled', 'Manual end should be stored as cancelled/incomplete.');
  assert.strictEqual(cancelledRecords[0].completedAt, null, 'Cancelled guidance should not have a completedAt timestamp.');
  assert(
    cancelledRecords[0].notableMoments.some((moment) => moment.type === 'guidance_cancelled'),
    'Cancelled guidance should keep an explicit non-completion moment.',
  );

  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();

  const active = createNewActiveTripRecord({
    id: 'completed-without-queue',
    title: 'Completed Without Queue',
    startedAt: '2026-05-02T10:00:00.000Z',
    routeGeometry: [
      { lat: 39, lng: -104, elevationFt: 5200 },
      { lat: 39.5, lng: -104.55, elevationFt: 8600 },
    ],
  });
  const completed = finalizeCompletedTrip(active, {
    completedAt: '2026-05-02T18:00:00.000Z',
    totalDistanceMiles: 75,
    totalDurationSeconds: 8 * 3600,
    endCoordinate: { lat: 39.5, lng: -104.55, elevationFt: 8600 },
  });
  await expeditionTripRecordStore.save(completed);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await clearAllBadgesForTests();

  const unlocked = await getUnlockedBadges();
  const unlockedIds = unlocked.map((badge) => badge.id);
  assert(unlockedIds.includes('first-expedition'), 'Badge reads should recover First Expedition from completed trips.');
  assert(unlockedIds.includes('miles-50'), 'Badge reads should recover 50 Miles Explored from completed trips.');
  assert(unlockedIds.includes('highest-point-yet'), 'Badge reads should recover elevation-backed records.');

  const progress = await getBadgeProgress();
  assert(
    !progress.some((badge) => !badge.unlockedAt && badge.progressTarget != null && (badge.progressCurrent ?? 0) >= badge.progressTarget),
    'Badge progress must not show locked milestones that have already been exceeded.',
  );

  console.log('Expedition Hub pipeline integrity checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
