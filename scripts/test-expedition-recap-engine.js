const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const recapEnginePath = path.join(root, 'lib', 'expedition', 'expeditionRecapEngine.ts');
const storePath = path.join(root, 'lib', 'expedition', 'expeditionTripRecordStore.ts');
const typesPath = path.join(root, 'lib', 'expedition', 'expeditionTripRecordTypes.ts');
const indexPath = path.join(root, 'lib', 'expedition', 'index.ts');
const packagePath = path.join(root, 'package.json');

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

const typesSource = fs.readFileSync(typesPath, 'utf8');
const recapEngineSource = fs.readFileSync(recapEnginePath, 'utf8');
const storeSource = fs.readFileSync(storePath, 'utf8');
const indexSource = fs.readFileSync(indexPath, 'utf8');
const packageSource = fs.readFileSync(packagePath, 'utf8');

for (const snippet of [
  'export interface ExpeditionRecap',
  'journeySummary',
  'routeSummary',
  'environmentSummary',
  'terrainSummary',
  'expeditionEvents',
  'tripOutcome',
  'generatedNarrative',
  'recap: ExpeditionRecap | null',
]) {
  assert.ok(typesSource.includes(snippet), `Expedition recap model should include ${snippet}.`);
}

for (const snippet of [
  'generateExpeditionRecap',
  'highest_elevation',
  'weather_change',
  'route_deviation',
  'reroute_accepted',
  'recovery_tools_opened',
  'terrain_risk_warning',
  'TODO Expedition Recap: generate recap map layers',
  'TODO Expedition Recap: transform notable moments into a story timeline',
  'TODO Expedition Recap: evaluate badges',
  'TODO Expedition Recap: compute expedition scoring',
  'TODO Expedition Recap: feed PDF/export payloads',
]) {
  assert.ok(recapEngineSource.includes(snippet), `Recap engine should include deterministic recap hook: ${snippet}.`);
}

assert.ok(storeSource.includes('safeGenerateExpeditionRecap(withCompletionMoment, completedAt)'), 'Trip finalization should generate and attach a recap safely.');
assert.ok(indexSource.includes('generateExpeditionRecap'), 'Expedition barrel should export the recap engine.');
assert.ok(packageSource.includes('test:expedition-recap-engine'), 'package.json should expose the recap engine test.');
assert.ok(!recapEngineSource.includes('openai') && !recapEngineSource.includes('chatCompletion'), 'Recap generation should not use AI storytelling.');

const {
  createNewActiveTripRecord,
  expeditionTripRecordStore,
  finalizeCompletedTrip,
  normalizeExpeditionTripRecord,
} = require(storePath);
const { generateExpeditionRecap } = require(recapEnginePath);

const source = {
  source: 'test_fixture',
  quality: 'live',
  capturedAt: '2026-05-10T10:00:00.000Z',
};

async function main() {
  await expeditionTripRecordStore.clearAllForTests();

  const active = createNewActiveTripRecord({
    id: 'recap-trip',
    title: 'Mountain Loop',
    startedAt: '2026-05-10T10:00:00.000Z',
    routeGeometry: [
      { lat: 39, lng: -105, elevationFt: 6000, recordedAt: '2026-05-10T10:00:00.000Z' },
      { lat: 39.01, lng: -105.01, elevationFt: 7200, recordedAt: '2026-05-10T11:00:00.000Z' },
      { lat: 39.03, lng: -105.02, elevationFt: 7100, recordedAt: '2026-05-10T12:00:00.000Z' },
    ],
  });
  const enriched = {
    ...active,
    weatherSnapshots: [
      {
        id: 'weather-1',
        capturedAt: '2026-05-10T10:15:00.000Z',
        summary: 'Clear',
        temperatureF: 45,
        source,
      },
      {
        id: 'weather-2',
        capturedAt: '2026-05-10T12:15:00.000Z',
        summary: 'Windy',
        temperatureF: 70,
        source,
      },
    ],
    terrainRiskSnapshots: [
      {
        id: 'terrain-1',
        capturedAt: '2026-05-10T11:30:00.000Z',
        riskLevel: 'caution',
        summary: 'Steep rocky grade',
        coordinate: { lat: 39.01, lng: -105.01, elevationFt: 7200 },
        source,
      },
    ],
    deviations: [
      {
        id: 'deviation-1',
        capturedAt: '2026-05-10T11:40:00.000Z',
        distanceMeters: 140,
        statusLabel: 'Reroute accepted',
        coordinate: { lat: 39.02, lng: -105.015 },
        source,
      },
    ],
    recoveryPanelUsed: [
      {
        usedAt: '2026-05-10T11:50:00.000Z',
        context: 'Recovery reference opened',
        source,
      },
    ],
  };

  const completed = finalizeCompletedTrip(enriched, {
    completedAt: '2026-05-10T13:00:00.000Z',
    endCoordinate: { lat: 39.03, lng: -105.02, elevationFt: 7100 },
  });

  assert.ok(completed.recap, 'Completing a trip should attach a recap.');
  assert.strictEqual(completed.recap.tripId, 'recap-trip');
  assert.strictEqual(completed.recap.journeySummary.totalDurationHours, 3);
  assert.ok(completed.recap.journeySummary.averageSpeedMph != null, 'Average speed should be computed when distance and duration exist.');
  assert.strictEqual(completed.recap.journeySummary.maxElevationFt, 7200);
  assert.strictEqual(completed.recap.environmentSummary.temperatureRange.minF, 45);
  assert.strictEqual(completed.recap.environmentSummary.temperatureRange.maxF, 70);
  assert.ok(completed.recap.environmentSummary.weatherConditionsEncountered.includes('Clear'));
  assert.ok(completed.recap.terrainSummary.terrainRiskEvents.some((event) => event.id === 'terrain-1'));
  assert.ok(completed.recap.expeditionEvents.notableMoments.some((moment) => moment.type === 'highest_elevation'));
  assert.ok(completed.recap.expeditionEvents.notableMoments.some((moment) => moment.type === 'weather_change'));
  assert.ok(completed.recap.expeditionEvents.notableMoments.some((moment) => moment.type === 'terrain_risk_warning'));
  assert.ok(completed.recap.expeditionEvents.reroutes.some((moment) => moment.type === 'reroute_accepted'));
  assert.ok(completed.recap.expeditionEvents.recoveryPanelUsage.length === 1);
  assert.ok(/^Completed a /.test(completed.recap.generatedNarrative.summaryParagraph), 'Narrative should be a concise factual completion summary.');
  assert.ok(!/legendary|epic|unforgettable|breathtaking/i.test(completed.recap.generatedNarrative.summaryParagraph), 'Narrative should avoid fictional or exaggerated language.');

  await expeditionTripRecordStore.save(completed);
  const saved = await expeditionTripRecordStore.getById('recap-trip');
  assert.strictEqual(saved.recap.generatedNarrative.headline, 'Completed Mountain Loop');

  const raw = memoryStorage.get('ecs_expedition_trip_records_v1');
  assert.ok(raw && raw.includes('"recap"'), 'Persisted local trip payload should contain recap data.');
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed.records[0].recap.tripId, 'recap-trip', 'Recap should survive local persistence serialization.');

  const sparseActive = createNewActiveTripRecord({
    id: 'partial-trip',
    title: 'Partial Trip',
    startedAt: '2026-05-11T10:00:00.000Z',
  });
  const sparseCompleted = finalizeCompletedTrip(sparseActive, {
    completedAt: '2026-05-11T10:30:00.000Z',
  });
  assert.ok(sparseCompleted.recap, 'Missing optional data should still produce a partial recap.');
  assert.strictEqual(sparseCompleted.recap.environmentSummary, undefined, 'Weather fields should be omitted when unavailable.');
  assert.strictEqual(sparseCompleted.recap.terrainSummary, undefined, 'Terrain fields should be omitted when unavailable.');
  assert.ok(sparseCompleted.recap.generatedNarrative.summaryParagraph.length > 0);

  const directRecap = generateExpeditionRecap(sparseCompleted);
  assert.strictEqual(directRecap.tripId, 'partial-trip');

  const normalizedLegacy = normalizeExpeditionTripRecord({
    id: 'legacy-without-recap',
    title: 'Legacy',
    status: 'completed',
    startedAt: '2026-05-01T10:00:00.000Z',
    completedAt: '2026-05-01T11:00:00.000Z',
  });
  assert.strictEqual(normalizedLegacy.recap, null, 'Old completed records without recaps should normalize safely.');

  console.log('Expedition recap engine checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
