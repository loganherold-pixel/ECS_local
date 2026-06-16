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

const dashboardSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx'), 'utf8');
const materializerPath = path.join(root, 'lib', 'expedition', 'completedGuidanceSummaryMaterializer.ts');

const {
  expeditionTripRecordStore,
} = require(path.join(root, 'lib', 'expedition', 'expeditionTripRecordStore.ts'));
const {
  clearAllBadgesForTests,
  getBadgesForTrip,
  getUnlockedBadges,
} = require(path.join(root, 'lib', 'expedition', 'expeditionBadgeStore.ts'));
const {
  materializeCompletedGuidanceSummary,
} = require(materializerPath);

async function main() {
  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();

  const summary = {
    id: 'virtual-guidance-complete-route',
    state: 'complete',
    expeditionName: 'Virtual Guidance Completion',
    destination: 'Trail End',
    totalDistanceMiles: 76,
    completedMiles: 76,
    durationSeconds: 8 * 3600,
    maxElevationFt: 7420,
    updatedAt: '2026-06-15T18:00:00.000Z',
    routeGeometry: [
      { lat: 39.0, lng: -120.0, elevationFt: 5100 },
      { lat: 39.55, lng: -120.55, elevationFt: 7420 },
    ],
  };

  const materialized = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: summary,
    routeCompleted: true,
    routeLabel: 'Fallback Route Label',
    gpsElevationFt: 7400,
  });

  assert.strictEqual(materialized.created, true, 'Virtual completed guidance should create one archived trip record.');
  assert.strictEqual(materialized.trip?.id, summary.id, 'Materialized trip should preserve the completed guidance id.');
  assert(materialized.badges.length > 0, 'Materialized completed guidance should immediately return newly earned badges.');

  const completedTrips = await expeditionTripRecordStore.getCompleted();
  assert.strictEqual(completedTrips.length, 1, 'Completed guidance materialization should persist exactly one completed trip.');
  assert.strictEqual(completedTrips[0].title, 'Virtual Guidance Completion');
  assert.strictEqual(completedTrips[0].totalDistanceMiles, 76);
  assert.strictEqual(completedTrips[0].maxElevationFt, 7420);

  const unlockedIds = (await getUnlockedBadges()).map((badge) => badge.id);
  assert(unlockedIds.includes('first-expedition'), 'Materialized completed guidance should unlock First Expedition.');
  assert(unlockedIds.includes('miles-50'), 'Materialized completed guidance should unlock distance badges.');
  assert(unlockedIds.includes('highest-point-yet'), 'Materialized completed guidance should unlock elevation-backed badges.');

  const tripBadges = await getBadgesForTrip(summary.id);
  assert(tripBadges.length > 0, 'Badges should be associated with the materialized guidance trip.');

  const repeated = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: summary,
    routeCompleted: true,
    routeLabel: 'Fallback Route Label',
    gpsElevationFt: 7400,
  });
  assert.strictEqual(repeated.created, false, 'Repeated Hub refresh should not duplicate the completed trip.');
  assert.strictEqual((await expeditionTripRecordStore.getCompleted()).length, 1);

  assert(
    dashboardSource.includes('materializeCompletedGuidanceSummary') &&
      dashboardSource.includes('setNewBadgeUnlocks') &&
      dashboardSource.includes('BadgeUnlockSummary') &&
      dashboardSource.includes('badgeAchievementNotice'),
    'Expedition Hub should materialize virtual guidance completions and show a badge achievement presentation.',
  );

  console.log('Expedition Hub guidance badge materialization checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
