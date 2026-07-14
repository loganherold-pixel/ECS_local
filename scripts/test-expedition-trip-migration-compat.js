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
const storeSource = read('lib/expedition/expeditionTripRecordStore.ts');
const indexSource = read('lib/expedition/index.ts');

[
  'schemaVersion: string',
  'normalizeTripRecord',
  'migrateTripRecord',
  'validateTripRecord',
  'getTripSchemaVersion',
  'upgradeTripSchemaIfNeeded',
  'getExpeditionSchemaMigrationHooks',
].forEach((snippet) => {
  assert(
    typesSource.includes(snippet) || storeSource.includes(snippet),
    `Migration support should include ${snippet}.`,
  );
  if (!snippet.includes(': string')) {
    assert(indexSource.includes(snippet), `Expedition barrel should export ${snippet}.`);
  }
});

[
  'currentTripSchema',
  'recapSchema',
  'badgeUnlockSchema',
  'insightSchema',
  'reportSchema',
  'personalRecordsSchema',
].forEach((hook) => {
  assert(storeSource.includes(hook), `Migration hooks should include ${hook}.`);
});

[
  'Untitled Expedition',
  'safeGenerateExpeditionRecap(normalized',
  'normalizeGeometry(input?.routeGeometry ?? input?.routePoints ?? []',
  'badgesUnlocked: normalizeArray<string>(input?.badgesUnlocked)',
  'weatherSnapshots: normalizeArray(input?.weatherSnapshots)',
  'terrainRiskSnapshots: normalizeArray(input?.terrainRiskSnapshots)',
  'notableMoments: normalizeArray(input?.notableMoments)',
  'logTripMigrationIssue',
  'Skipping trip record that failed migration.',
].forEach((snippet) => {
  assert(storeSource.includes(snippet), `Trip migration should safely handle legacy data via ${snippet}.`);
});

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
  getExpeditionSchemaMigrationHooks,
  getTripSchemaVersion,
  migrateTripRecord,
  normalizeTripRecord,
  upgradeTripSchemaIfNeeded,
  validateTripRecord,
} = require(tripStorePath);

async function main() {
  const currentSchema = getTripSchemaVersion();
  assert.strictEqual(currentSchema, 'ecs.expedition.trip.v2');
  assert.strictEqual(getExpeditionSchemaMigrationHooks().reportSchema, 'ecs.expedition.report.v1');

  const missingEverything = normalizeTripRecord({
    id: 'legacy-missing-fields',
    status: 'completed',
    updatedAt: '2026-05-01T12:00:00.000Z',
  });
  assert(missingEverything, 'Legacy record with minimal fields should normalize.');
  assert.strictEqual(missingEverything.schemaVersion, currentSchema);
  assert.strictEqual(missingEverything.title, 'Untitled Expedition');
  assert.strictEqual(missingEverything.completedAt, '2026-05-01T12:00:00.000Z');
  assert.deepStrictEqual(missingEverything.routeGeometry, []);
  assert.deepStrictEqual(missingEverything.badgesUnlocked, []);
  assert.deepStrictEqual(missingEverything.notableMoments, []);
  assert.deepStrictEqual(missingEverything.weatherSnapshots, []);
  assert.deepStrictEqual(missingEverything.terrainRiskSnapshots, []);
  assert.strictEqual(missingEverything.routeBounds, null);
  assert.strictEqual(missingEverything.recap, null);
  assert.strictEqual(missingEverything.lifecycle.phase, 'completed');
  assert(missingEverything.completionKey, 'Legacy completed trips should receive a stable completion key.');

  const legacyWithEnoughRecapData = migrateTripRecord({
    id: 'legacy-recap',
    name: 'Legacy Alpine Run',
    status: 'completed',
    createdAt: '2026-05-02T08:00:00.000Z',
    updatedAt: '2026-05-02T11:00:00.000Z',
    totalDistanceMiles: 44,
    totalDurationSeconds: 3 * 3600,
    routePoints: [
      { latitude: 38, longitude: -107, ele: 1800 },
      { latitude: 38.2, longitude: -107.2, ele: 2200 },
    ],
  });
  assert(legacyWithEnoughRecapData?.recap, 'Legacy completed trip with enough data should get fallback recap.');
  assert(legacyWithEnoughRecapData?.routeBounds, 'Legacy routePoints should normalize to route bounds.');

  assert.strictEqual(validateTripRecord({}), false, 'Invalid records should not validate.');

  memoryStorage.set('ecs_expedition_trip_records_v1', JSON.stringify({
    version: 0,
    activeTripId: null,
    records: [
      { id: 'stored-old', status: 'completed', updatedAt: '2026-05-03T13:00:00.000Z' },
      { status: 'missing-id' },
    ],
  }));
  const upgrade = await upgradeTripSchemaIfNeeded();
  assert.strictEqual(upgrade.upgraded, 1);
  assert.strictEqual(upgrade.skipped, 1);
  const completed = await expeditionTripRecordStore.getCompleted();
  assert.strictEqual(completed.length, 1, 'Migrated completed trip should remain retrievable.');
  assert.strictEqual(completed[0].schemaVersion, currentSchema);

  console.log('Expedition trip migration compatibility checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
