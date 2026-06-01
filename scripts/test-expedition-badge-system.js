const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const typesSource = read('lib/expedition/expeditionTripRecordTypes.ts');
const registrySource = read('lib/expedition/expeditionBadgeRegistry.ts');
const storeSource = read('lib/expedition/expeditionBadgeStore.ts');
const tripStoreSource = read('lib/expedition/expeditionTripRecordStore.ts');
const hubSource = read('components/dashboard/ExpeditionTab.tsx');
const indexSource = read('lib/expedition/index.ts');

[
  'export interface ExpeditionBadge',
  'category: ExpeditionBadgeCategory',
  'rarity: ExpeditionBadgeRarity',
  'iconKey',
  'unlockedAt',
  'unlockedTripId',
  'isHidden',
  'isRepeatable',
  'progressCurrent',
  'progressTarget',
  'evaluationType',
  'evaluationConfig',
].forEach((snippet) => {
  assert(typesSource.includes(snippet), `Badge type should include ${snippet}.`);
});

[
  "'firsts'",
  "'distance'",
  "'elevation'",
  "'duration'",
  "'weather'",
  "'terrain'",
  "'recovery'",
  "'route_behavior'",
  "'time_of_day'",
  "'exploration'",
  "'remoteness'",
  "'notable_moments'",
  "'personal_records'",
  "'seasonal'",
  "'expedition_history'",
  "'consistency'",
  "'hidden'",
].forEach((category) => {
  assert(typesSource.includes(category), `Badge categories should include ${category}.`);
});

[
  "'common'",
  "'uncommon'",
  "'rare'",
  "'epic'",
  "'legendary'",
  "'hidden'",
].forEach((rarity) => {
  assert(typesSource.includes(rarity), `Badge rarity should include ${rarity}.`);
});

[
  'First Expedition',
  'First 10 Miles',
  'First 50 Miles',
  'First 100 Miles',
  'First Mountain Route',
  'First Desert Route',
  'First Forest Route',
  'First Night Finish',
  'First Weather Event',
  'First Route Deviation',
  '50 Miles Explored',
  '100 Miles Explored',
  '250 Miles Explored',
  '500 Miles Explored',
  '1,000 Miles Explored',
  '2,500 Miles Explored',
  '5,000 Miles Explored',
  '10-Mile Day',
  '50-Mile Day',
  '100-Mile Day',
  'Highest Point Yet',
  'Storm Runner',
  'Night Return',
  'Recovery Ready',
  'Remote Route',
  'Mountain Pass',
  'Desert Crossing',
  'Long Haul',
  'Early Start',
  'Sunset Finish',
  'Trail Veteran',
  'Weathered It',
  'Route Adjusted',
  'Moment Captured',
  'Longest Expedition Yet',
  'Ghost Trail',
  'Golden Hour',
  'Spring Route',
  'Winter Route',
  'Uncharted Habit',
].forEach((title) => {
  assert(registrySource.includes(title), `Badge registry should seed ${title}.`);
});

assert(
  registrySource.includes('evaluationType') && registrySource.includes('evaluationConfig'),
  'Badge registry should keep badge definitions data-driven.',
);
assert(registrySource.includes('getVisibleBadgeDefinitions'), 'Badge registry should expose visible-only definition helper.');

[
  'evaluateBadgesForCompletedTrip',
  'getUnlockedBadges',
  'getBadgesForTrip',
  'getRecentBadgeUnlocks',
  'getBadgeProgress',
  'hasBadge',
].forEach((helper) => {
  assert(storeSource.includes(`export async function ${helper}`), `${helper} should be exported from badge store.`);
  assert(indexSource.includes(helper), `${helper} should be exported from expedition barrel.`);
});

assert(
  storeSource.includes("createMigratingNonSecureStorage('ecs_expedition_badges'"),
  'Badge unlocks should use ECS local persisted storage.',
);
assert(
  tripStoreSource.includes('queueCompletedTripPostProcessing') &&
    tripStoreSource.includes("import('./expeditionBadgeStore')") &&
    tripStoreSource.includes('evaluateBadgesForCompletedTrip(record.id)'),
  'Completed trip persistence should queue non-blocking badge evaluation.',
);
assert(
  hubSource.includes('getUnlockedBadges') &&
    hubSource.includes('getBadgesForTrip') &&
    hubSource.includes('Unlocked Badges') &&
    hubSource.includes('Badges Earned') &&
    hubSource.includes('No badges earned on this expedition.'),
  'Expedition Hub should render unlocked-only badges and trip-earned badges.',
);
assert(
  !hubSource.includes('EXPEDITION_BADGE_DEFINITIONS.map') &&
    !hubSource.toLowerCase().includes('mystery badge') &&
    !hubSource.includes('Locked Badge'),
  'Expedition Hub must not expose a complete locked badge catalog.',
);

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
} = require(tripStorePath);
const {
  clearAllBadgesForTests,
  evaluateBadgesForCompletedTrip,
  getBadgeProgress,
  getBadgesForTrip,
  getVisibleBadgeDefinitions,
  getRecentBadgeUnlocks,
  getUnlockedBadges,
  hasBadge,
} = {
  ...require(badgeStorePath),
  ...require(path.join(root, 'lib', 'expedition', 'expeditionBadgeRegistry.ts')),
};

async function main() {
  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();

  const { EXPEDITION_BADGE_DEFINITIONS } = require(path.join(root, 'lib', 'expedition', 'expeditionBadgeRegistry.ts'));
  assert(EXPEDITION_BADGE_DEFINITIONS.length >= 100, 'Badge registry should contain at least 100 badge definitions.');
  const ids = new Set(EXPEDITION_BADGE_DEFINITIONS.map((definition) => definition.id));
  assert.strictEqual(ids.size, EXPEDITION_BADGE_DEFINITIONS.length, 'Badge ids should be unique.');
  for (const definition of EXPEDITION_BADGE_DEFINITIONS) {
    assert(definition.evaluationType, `${definition.id} should define evaluationType.`);
    assert(definition.evaluationConfig && typeof definition.evaluationConfig === 'object', `${definition.id} should define evaluationConfig.`);
  }
  assert(
    getVisibleBadgeDefinitions().every((definition) => !definition.isHidden),
    'Visible registry helper must not expose hidden locked badges.',
  );

  const firstActive = createNewActiveTripRecord({
    id: 'badge-trip-1',
    title: 'First Long Trail',
    startedAt: '2026-05-01T05:30:00.000Z',
    routeGeometry: [
      { lat: 39, lng: -104, elevationFt: 5000 },
      { lat: 39.4, lng: -104.5, elevationFt: 9200 },
    ],
  });
  const firstTrip = finalizeCompletedTrip(firstActive, {
    completedAt: '2026-05-01T19:10:00.000Z',
    totalDistanceMiles: 75,
    totalDurationSeconds: 8 * 3600,
    endCoordinate: { lat: 39.4, lng: -104.5, elevationFt: 9200 },
  });
  await expeditionTripRecordStore.save(firstTrip);
  await evaluateBadgesForCompletedTrip('badge-trip-1');
  const firstIds = (await getUnlockedBadges()).map((badge) => badge.id);
  assert(firstIds.includes('first-expedition'), 'First completed trip should unlock First Expedition.');
  assert(firstIds.includes('miles-50'), 'A 75-mile first trip should unlock 50 Miles Explored.');
  assert(firstIds.includes('fifty-mile-day'), 'A 75-mile trip should unlock 50-Mile Day.');
  assert(firstIds.includes('highest-point-yet'), 'First trip with elevation should unlock Highest Point Yet.');

  assert.strictEqual(await hasBadge('first-expedition'), true);
  const firstTripBadges = await getBadgesForTrip('badge-trip-1');
  assert(firstTripBadges.some((badge) => badge.id === 'first-expedition'));

  const secondActive = createNewActiveTripRecord({
    id: 'badge-trip-2',
    title: 'Remote Desert Route',
    startedAt: '2026-05-03T07:00:00.000Z',
    routeGeometry: [
      { lat: 36, lng: -115, elevationFt: 2200 },
      { lat: 36.8, lng: -115.7, elevationFt: 3100 },
    ],
  });
  const secondTrip = finalizeCompletedTrip(secondActive, {
    completedAt: '2026-05-04T04:30:00.000Z',
    totalDistanceMiles: 200,
    totalDurationSeconds: 12 * 3600,
    endCoordinate: { lat: 36.8, lng: -115.7, elevationFt: 3100 },
  });
  await expeditionTripRecordStore.save({
    ...secondTrip,
    weatherSnapshots: [
      {
        id: 'weather-hot',
        capturedAt: '2026-05-03T18:00:00.000Z',
        summary: 'High heat',
        temperatureF: 101,
        precipitation: null,
        source: {
          source: 'test_weather',
          quality: 'mock',
          capturedAt: '2026-05-03T18:00:00.000Z',
        },
      },
    ],
  });
  await evaluateBadgesForCompletedTrip('badge-trip-2');
  const allUnlocked = await getUnlockedBadges();
  const unlockedIds = allUnlocked.map((badge) => badge.id);
  assert(unlockedIds.includes('miles-100'), 'Cumulative mileage should unlock 100 Miles Explored.');
  assert(unlockedIds.includes('miles-250'), 'Cumulative mileage should unlock 250 Miles Explored.');
  assert(unlockedIds.includes('long-haul'), 'A 200-mile trip should unlock Long Haul.');
  assert(unlockedIds.includes('night-return'), 'Late completion should unlock Night Return.');
  assert(unlockedIds.includes('desert-crossing'), 'High heat/desert context should unlock Desert Crossing.');

  const recoveryActive = createNewActiveTripRecord({
    id: 'badge-trip-3',
    title: 'Recovery Forest Route',
    startedAt: '2026-05-05T09:00:00.000Z',
    routeGeometry: [
      { lat: 37, lng: -106, elevationFt: 6200 },
      { lat: 37.2, lng: -106.2, elevationFt: 6400 },
    ],
  });
  const recoveryTrip = finalizeCompletedTrip(recoveryActive, {
    completedAt: '2026-05-05T14:00:00.000Z',
    totalDistanceMiles: 18,
    totalDurationSeconds: 5 * 3600,
    endCoordinate: { lat: 37.2, lng: -106.2, elevationFt: 6400 },
  });
  await expeditionTripRecordStore.save({
    ...recoveryTrip,
    recoveryPanelUsed: [
      {
        usedAt: '2026-05-05T12:00:00.000Z',
        context: 'Recovery panel opened',
        source: {
          source: 'test_recovery',
          quality: 'mock',
          capturedAt: '2026-05-05T12:00:00.000Z',
        },
      },
    ],
  });
  await evaluateBadgesForCompletedTrip('badge-trip-3');
  const afterRecoveryIds = (await getUnlockedBadges()).map((badge) => badge.id);
  assert(afterRecoveryIds.includes('recovery-ready'), 'Recovery usage should unlock Recovery Ready.');
  assert(afterRecoveryIds.includes('recovery-panel-opened'), 'Recovery usage should unlock Recovery Panel Opened.');

  const recent = await getRecentBadgeUnlocks(3);
  assert.strictEqual(recent.length, 3, 'Recent unlock helper should honor the limit.');

  const progress = await getBadgeProgress();
  assert(progress.some((badge) => badge.id === 'miles-500' && badge.progressCurrent >= 275));
  assert(!progress.some((badge) => badge.id === 'uncharted-habit'), 'Hidden badges should stay absent until unlocked.');
  assert(!progress.some((badge) => !badge.unlockedAt && badge.isHidden), 'Locked hidden badges should never be returned as progress.');
  assert(progress.length < EXPEDITION_BADGE_DEFINITIONS.length, 'Progress helper should not expose the complete locked catalog.');

  const persistedKeys = Array.from(memoryStorage.keys()).join('\n');
  assert(persistedKeys.includes('ecs_expedition_badges'), 'Badge unlocks should survive relaunch through local storage.');

  console.log('Expedition badge system checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
