const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const storePath = path.join(root, 'lib', 'expedition', 'expeditionTripRecordStore.ts');
const repositoryPath = path.join(root, 'lib', 'expedition', 'expeditionTripRepository.ts');
const repositorySource = fs.readFileSync(repositoryPath, 'utf8');

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

assert(
  repositorySource.includes('getCompletedTrips') &&
    repositorySource.includes('getTripById') &&
    repositorySource.includes('getMostRecentCompletedTrip') &&
    repositorySource.includes('getActiveTrip') &&
    repositorySource.includes('archiveTrip') &&
    repositorySource.includes('deleteTripRecord') &&
    repositorySource.includes('updateTripTitle'),
  'Expedition trip repository should expose the required completed-trip accessors.',
);
assert(!repositorySource.includes('routeGeometry:'), 'Completed trip list summaries should not expose routeGeometry.');
assert(!repositorySource.includes('RecoveryPanel'), 'Repository must not modify or import recovery panel behavior.');
assert(!repositorySource.toLowerCase().includes('checklist'), 'Repository must not add checklist behavior.');
assert(!repositorySource.includes('PDF') && !repositorySource.includes('exportPdf'), 'Repository must not add PDF/export behavior.');

const {
  createNewActiveTripRecord,
  expeditionTripRecordStore,
  finalizeCompletedTrip,
} = require(storePath);
const repository = require(repositoryPath);

async function main() {
  await expeditionTripRecordStore.clearAllForTests();

  const firstActive = createNewActiveTripRecord({
    id: 'trip-older',
    title: 'Older Trail',
    startedAt: '2026-05-01T10:00:00.000Z',
    routeGeometry: [
      { lat: 39, lng: -104, elevationFt: 6000 },
      { lat: 39.1, lng: -104.1, elevationFt: 6500 },
    ],
  });
  const older = finalizeCompletedTrip(firstActive, {
    completedAt: '2026-05-01T12:00:00.000Z',
    endCoordinate: { lat: 39.1, lng: -104.1, elevationFt: 6500 },
  });

  const secondActive = createNewActiveTripRecord({
    id: 'trip-newer',
    title: 'Newer Trail',
    startedAt: '2026-05-03T10:00:00.000Z',
    routeGeometry: [
      { lat: 40, lng: -105, elevationFt: 7000 },
      { lat: 40.2, lng: -105.2, elevationFt: 7600 },
    ],
  });
  const newer = finalizeCompletedTrip(secondActive, {
    completedAt: '2026-05-03T12:00:00.000Z',
    endCoordinate: { lat: 40.2, lng: -105.2, elevationFt: 7600 },
  });

  const active = createNewActiveTripRecord({
    id: 'trip-active',
    title: 'Active Trail',
    startedAt: '2026-05-04T10:00:00.000Z',
  });

  await expeditionTripRecordStore.save(older);
  await expeditionTripRecordStore.save(newer);
  await expeditionTripRecordStore.save(active);

  const completed = await repository.getCompletedTrips();
  assert.deepStrictEqual(completed.map((trip) => trip.id), ['trip-newer', 'trip-older']);
  assert.strictEqual(completed[0].title, 'Newer Trail');
  assert.strictEqual(Number.isInteger(completed[0].badgesUnlockedCount), true);
  assert.strictEqual(completed[0].notableMomentsCount >= 1, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(completed[0], 'routeGeometry'), false);

  const mostRecent = await repository.getMostRecentCompletedTrip();
  assert.strictEqual(mostRecent.id, 'trip-newer');

  const fullTrip = await repository.getTripById('trip-newer');
  assert.strictEqual(fullTrip.id, 'trip-newer');
  assert.ok(Array.isArray(fullTrip.routeGeometry), 'Opening a trip by ID should return full route geometry.');

  const currentActive = await repository.getActiveTrip();
  assert.strictEqual(currentActive.id, 'trip-active');

  const renamed = await repository.updateTripTitle('trip-newer', 'Renamed Newer Trail');
  assert.strictEqual(renamed.title, 'Renamed Newer Trail');
  const renamedAgain = await repository.getTripById('trip-newer');
  assert.strictEqual(renamedAgain.title, 'Renamed Newer Trail');

  await repository.archiveTrip('trip-newer');
  const afterArchive = await repository.getCompletedTrips();
  assert.deepStrictEqual(afterArchive.map((trip) => trip.id), ['trip-older']);

  const deleted = await repository.deleteTripRecord('trip-older');
  assert.strictEqual(deleted, true);
  assert.strictEqual(await repository.getTripById('trip-older'), null);
  assert.deepStrictEqual(await repository.getCompletedTrips(), []);

  const sparse = await expeditionTripRecordStore.save({
    id: 'legacy-sparse',
    title: '',
    status: 'completed',
    startedAt: '2026-05-05T10:00:00.000Z',
    completedAt: '2026-05-05T11:00:00.000Z',
  });
  assert.strictEqual(sparse.title, 'Untitled Expedition');
  assert.deepStrictEqual(sparse.notableMoments, []);
  assert.deepStrictEqual(sparse.badgesUnlocked, []);
  assert.strictEqual((await repository.getTripById('legacy-sparse')).routeGeometry.length, 0);

  console.log('Expedition trip repository checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
