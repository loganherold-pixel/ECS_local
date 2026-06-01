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
const storeSource = read('lib/expedition/expeditionPersonalRecordStore.ts');
const indexSource = read('lib/expedition/index.ts');
const tripStoreSource = read('lib/expedition/expeditionTripRecordStore.ts');
const hubSource = read('components/dashboard/ExpeditionTab.tsx');

[
  'export type PersonalExpeditionRecordType',
  'export type PersonalExpeditionRecordUnit',
  'export interface PersonalExpeditionRecord',
  'previousValue',
  'isCurrentRecord',
].forEach((snippet) => {
  assert(typesSource.includes(snippet), `Personal record model should include ${snippet}.`);
});

[
  'longest_distance',
  'longest_duration',
  'highest_elevation',
  'greatest_elevation_gain',
  'most_notable_moments',
  'most_badges_earned',
  'most_weather_events',
  'most_terrain_events',
  'most_route_deviations',
  'earliest_start',
  'latest_finish',
  'fastest_average_speed',
  'slowest_average_speed',
].forEach((type) => {
  assert(typesSource.includes(type), `Supported personal record type should exist: ${type}.`);
  assert(storeSource.includes(type), `Personal record service should evaluate ${type}.`);
});

[
  'evaluatePersonalRecordsForCompletedTrip',
  'getCurrentPersonalRecords',
  'getRecordsForTrip',
  'getRecordHistory',
  'didTripSetRecord',
].forEach((snippet) => {
  assert(storeSource.includes(snippet), `Personal record service should implement ${snippet}.`);
  assert(indexSource.includes(snippet), `Expedition index should export ${snippet}.`);
});

[
  'ecs_personal_expedition_records_v1',
  'createMigratingNonSecureStorage',
  'expeditionTripRecordStore.getCompleted()',
  'getUnlockedBadges',
  'normalizeCurrentRecordFlags',
  'buildRecordsFromHistory',
].forEach((snippet) => {
  assert(storeSource.includes(snippet), `Personal record service should include ${snippet}.`);
});

assert(
  tripStoreSource.includes("import('./expeditionPersonalRecordStore')") &&
    tripStoreSource.includes('evaluatePersonalRecordsForCompletedTrip') &&
    tripStoreSource.indexOf("import('./expeditionBadgeStore')") < tripStoreSource.indexOf("import('./expeditionInsightStore')") &&
    tripStoreSource.indexOf("import('./expeditionInsightStore')") < tripStoreSource.indexOf("import('./expeditionPersonalRecordStore')"),
  'Trip completion post-processing should evaluate personal records after badges and insights without blocking completion.',
);

[
  'getCurrentPersonalRecords',
  'getRecordsForTrip',
  'PersonalRecordsPreview',
  'ExpeditionTripPersonalRecords',
  'formatPersonalRecordValue',
  'recordsSet',
  'Previous {formatPersonalRecordValue',
].forEach((snippet) => {
  assert(hubSource.includes(snippet), `Expedition Hub/detail should surface personal records via ${snippet}.`);
});

[
  'record-breaking badge triggers',
  'record comparison charts',
  'export record stamps',
  'yearly records',
  'seasonal records',
].forEach((todo) => {
  assert(storeSource.includes(todo), `Future personal record hook should mention ${todo}.`);
});

for (const forbidden of [
  'SafetyChecklist',
  'fake records',
  'placeholder record',
  'Alert.alert',
  'EXPEDITION_BADGE_DEFINITIONS.map',
]) {
  assert(!storeSource.includes(forbidden), `Personal records service should avoid forbidden behavior: ${forbidden}.`);
  assert(!hubSource.includes(forbidden), `Personal record UI should avoid forbidden behavior: ${forbidden}.`);
}

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
const personalStorePath = path.join(root, 'lib', 'expedition', 'expeditionPersonalRecordStore.ts');
const badgeStorePath = path.join(root, 'lib', 'expedition', 'expeditionBadgeStore.ts');

const {
  createNewActiveTripRecord,
  expeditionTripRecordStore,
  finalizeCompletedTrip,
} = require(tripStorePath);
const { clearAllBadgesForTests } = require(badgeStorePath);
const {
  clearAllPersonalExpeditionRecordsForTests,
  didTripSetRecord,
  evaluatePersonalRecordsForCompletedTrip,
  getCurrentPersonalRecords,
  getRecordHistory,
  getRecordsForTrip,
} = require(personalStorePath);

async function saveCompletedTrip({
  id,
  title,
  startedAt,
  completedAt,
  distance,
  durationSeconds,
  highElevation,
}) {
  const routeGeometry = [
    { lat: 40, lng: -105, elevationFt: Math.max(100, highElevation - 500) },
    { lat: 40.2, lng: -105.2, elevationFt: highElevation },
  ];
  const active = createNewActiveTripRecord({
    id,
    title,
    startedAt,
    routeGeometry,
  });
  const completed = finalizeCompletedTrip(active, {
    completedAt,
    totalDistanceMiles: distance,
    totalDurationSeconds: durationSeconds,
    endCoordinate: routeGeometry[routeGeometry.length - 1],
    routeGeometry,
  });
  await expeditionTripRecordStore.save(completed);
  return completed;
}

async function main() {
  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();
  await clearAllPersonalExpeditionRecordsForTests();

  await saveCompletedTrip({
    id: 'record-trip-1',
    title: 'Baseline Ridge',
    startedAt: '2026-05-01T08:00:00.000Z',
    completedAt: '2026-05-01T12:00:00.000Z',
    distance: 24,
    durationSeconds: 4 * 3600,
    highElevation: 6200,
  });
  const firstRecords = await evaluatePersonalRecordsForCompletedTrip('record-trip-1');
  assert(firstRecords.length > 0, 'First completed trip should set initial personal records.');
  assert(await didTripSetRecord('record-trip-1'), 'didTripSetRecord should recognize initial records.');

  await saveCompletedTrip({
    id: 'record-trip-2',
    title: 'Long Basin Line',
    startedAt: '2026-05-03T09:00:00.000Z',
    completedAt: '2026-05-03T18:00:00.000Z',
    distance: 82,
    durationSeconds: 9 * 3600,
    highElevation: 6000,
  });
  await evaluatePersonalRecordsForCompletedTrip('record-trip-2');
  const distanceHistory = await getRecordHistory('longest_distance');
  assert.strictEqual(distanceHistory[0].tripId, 'record-trip-2', 'Longer trip should update longest_distance.');
  assert.strictEqual(distanceHistory[0].previousValue, 24, 'Updated distance record should retain previous value.');

  await saveCompletedTrip({
    id: 'record-trip-3',
    title: 'High Pass Track',
    startedAt: '2026-05-05T07:30:00.000Z',
    completedAt: '2026-05-05T15:00:00.000Z',
    distance: 41,
    durationSeconds: 7.5 * 3600,
    highElevation: 9200,
  });
  await evaluatePersonalRecordsForCompletedTrip('record-trip-3');
  const currentRecords = await getCurrentPersonalRecords();
  assert(
    currentRecords.some((record) => record.type === 'longest_distance' && record.tripId === 'record-trip-2'),
    'Current records should keep the longest distance holder.',
  );
  assert(
    currentRecords.some((record) => record.type === 'highest_elevation' && record.tripId === 'record-trip-3'),
    'Higher route should update highest_elevation.',
  );
  const tripThreeRecords = await getRecordsForTrip('record-trip-3');
  assert(tripThreeRecords.some((record) => record.type === 'highest_elevation'), 'Trip-specific records should be retrievable.');

  const persistedKeys = Array.from(memoryStorage.keys()).join('\n');
  assert(persistedKeys.includes('ecs_personal_expedition_records'), 'Personal records should persist locally.');

  console.log('Expedition personal records system checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
