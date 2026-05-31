const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const memoryStorage = new Map();
const writtenFiles = new Map();
let printShouldFail = false;
let sharingAvailable = true;
let sharedUri = null;
let fileSystemWriteAvailable = true;

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
  if (request === 'expo-print') {
    return {
      printToFileAsync: async () => {
        if (printShouldFail) throw new Error('print unavailable');
        return { uri: 'file:///tmp/generated-expedition-report.pdf' };
      },
    };
  }
  if (request === 'expo-sharing') {
    return {
      isAvailableAsync: async () => sharingAvailable,
      shareAsync: async (uri) => {
        if (!sharingAvailable) throw new Error('share unavailable');
        sharedUri = uri;
      },
    };
  }
  if (request === 'expo-file-system/legacy') {
    return {
      documentDirectory: 'file:///documents/',
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
      getInfoAsync: async (uri) => ({
        exists: uri.endsWith('/') || writtenFiles.has(uri),
        isDirectory: uri.endsWith('/'),
        size: writtenFiles.get(uri)?.length ?? 0,
      }),
      makeDirectoryAsync: async (uri) => {
        if (!fileSystemWriteAvailable) return;
        writtenFiles.set(uri, '');
      },
      writeAsStringAsync: async (uri, body) => {
        if (!fileSystemWriteAvailable) return;
        writtenFiles.set(uri, body);
      },
      readAsStringAsync: async (uri) => {
        if (writtenFiles.has(uri)) return writtenFiles.get(uri);
        if (uri.endsWith('.pdf')) return 'cGRm';
        return '';
      },
      deleteAsync: async (uri) => {
        writtenFiles.delete(uri);
      },
    };
  }
  if (request === 'expo-file-system') {
    return {};
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
const repositoryPath = path.join(root, 'lib', 'expedition', 'expeditionTripRepository.ts');
const recapEnginePath = path.join(root, 'lib', 'expedition', 'expeditionRecapEngine.ts');
const badgeStorePath = path.join(root, 'lib', 'expedition', 'expeditionBadgeStore.ts');
const badgeRegistryPath = path.join(root, 'lib', 'expedition', 'expeditionBadgeRegistry.ts');
const insightStorePath = path.join(root, 'lib', 'expedition', 'expeditionInsightStore.ts');
const personalRecordStorePath = path.join(root, 'lib', 'expedition', 'expeditionPersonalRecordStore.ts');
const reportStorePath = path.join(root, 'lib', 'expedition', 'expeditionReportStore.ts');
const hubSourcePath = path.join(root, 'components', 'dashboard', 'ExpeditionTab.tsx');
const typesSourcePath = path.join(root, 'lib', 'expedition', 'expeditionTripRecordTypes.ts');

const {
  createNewActiveTripRecord,
  expeditionTripRecordStore,
  finalizeCompletedTrip,
  getTripSchemaVersion,
  migrateTripRecord,
  normalizeTripRecord,
  safelyStoreNotableMoment,
  updateTripStatsDuringGuidance,
  upgradeTripSchemaIfNeeded,
} = require(tripStorePath);
const {
  getCompletedTrips,
  getTripById,
} = require(repositoryPath);
const { generateExpeditionRecap } = require(recapEnginePath);
const {
  clearAllBadgesForTests,
  evaluateBadgesForCompletedTrip,
  getBadgeProgress,
  getBadgesForTrip,
  getUnlockedBadges,
} = require(badgeStorePath);
const { getVisibleBadgeDefinitions } = require(badgeRegistryPath);
const {
  clearAllInsightsForTests,
  dismissInsight,
  generateInsightsFromTripHistory,
  getCurrentInsights,
  refreshExpeditionInsights,
} = require(insightStorePath);
const {
  clearAllPersonalExpeditionRecordsForTests,
  evaluatePersonalRecordsForCompletedTrip,
  getCurrentPersonalRecords,
  getRecordHistory,
} = require(personalRecordStorePath);
const {
  clearAllExpeditionReportsForTests,
  generateExpeditionReport,
  getReportForTrip,
  shareExpeditionReport,
} = require(reportStorePath);

const source = {
  source: 'test_fixture',
  quality: 'mock',
  capturedAt: '2026-05-01T08:00:00.000Z',
};

function waitForPostProcessing() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

async function resetStores() {
  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();
  await clearAllInsightsForTests();
  await clearAllPersonalExpeditionRecordsForTests();
  await clearAllExpeditionReportsForTests();
  memoryStorage.clear();
  writtenFiles.clear();
  sharedUri = null;
  printShouldFail = false;
  sharingAvailable = true;
  fileSystemWriteAvailable = true;
}

function makeCompletedTrip({
  id,
  title,
  startedAt,
  completedAt,
  totalDistanceMiles,
  totalDurationSeconds,
  routeGeometry,
  weatherSnapshots = [],
  terrainRiskSnapshots = [],
  recoveryPanelUsed = [],
  deviations = [],
  notableMoments = [],
  campCandidatesViewed = [],
  resupplyStopsViewed = [],
  bailoutPointsUsed = [],
}) {
  const active = createNewActiveTripRecord({
    id,
    title,
    startedAt,
    routeGeometry,
  });
  const withMoments = notableMoments.reduce(
    (record, moment) => safelyStoreNotableMoment(record, moment),
    active,
  );
  const completed = finalizeCompletedTrip(withMoments, {
    completedAt,
    totalDistanceMiles,
    totalDurationSeconds,
    routeGeometry,
    endCoordinate: routeGeometry[routeGeometry.length - 1] ?? null,
  });
  return {
    ...completed,
    weatherSnapshots,
    terrainRiskSnapshots,
    recoveryPanelUsed,
    deviations,
    campCandidatesViewed,
    resupplyStopsViewed,
    bailoutPointsUsed,
  };
}

async function saveTrip(input) {
  const trip = makeCompletedTrip(input);
  return expeditionTripRecordStore.save(trip);
}

async function testTripRecordHelpers() {
  await resetStores();

  const active = createNewActiveTripRecord({
    id: 'svc-active',
    title: 'Service Active Route',
    startedAt: '2026-05-01T08:00:00.000Z',
    routeGeometry: [
      { lat: 39, lng: -104, elevationFt: 5200 },
      { lat: 39.1, lng: -104.1, elevationFt: 5600 },
    ],
  });
  assert.strictEqual(active.status, 'active');
  assert.strictEqual(active.totalDurationSeconds, 0);
  assert(active.notableMoments.some((moment) => moment.type === 'guidance_started'));

  const updated = updateTripStatsDuringGuidance(active, {
    updatedAt: '2026-05-01T09:00:00.000Z',
    totalDistanceMiles: 12.5,
    totalDurationSeconds: 3600,
    currentCoordinate: { lat: 39.2, lng: -104.2, elevationFt: 6000 },
    routeGeometry: [
      { lat: 39, lng: -104, elevationFt: 5200 },
      { lat: 39.2, lng: -104.2, elevationFt: 6000 },
    ],
    isOffRoute: true,
    offRouteDistanceM: 150,
    statusLabel: 'Reroute accepted',
    dataSource: source,
  });
  assert.strictEqual(updated.totalDistanceMiles, 12.5);
  assert.strictEqual(updated.totalDurationSeconds, 3600);
  assert.strictEqual(updated.deviations.length, 1);
  assert(updated.notableMoments.some((moment) => moment.type === 'route_deviation'));

  const completed = finalizeCompletedTrip(updated, {
    completedAt: '2026-05-01T10:00:00.000Z',
    totalDistanceMiles: 24.2,
    totalDurationSeconds: 7200,
    endCoordinate: { lat: 39.2, lng: -104.2, elevationFt: 6000 },
  });
  assert.strictEqual(completed.status, 'completed');
  assert(completed.recap, 'Finalized trips should include a recap.');
  assert(completed.generatedSummary?.text, 'Finalized trips should include a generated summary.');

  await expeditionTripRecordStore.save(completed);
  await saveTrip({
    id: 'svc-newer',
    title: 'Newer Stored Route',
    startedAt: '2026-05-03T08:00:00.000Z',
    completedAt: '2026-05-03T12:00:00.000Z',
    totalDistanceMiles: 41,
    totalDurationSeconds: 4 * 3600,
    routeGeometry: [
      { lat: 40, lng: -105, elevationFt: 6100 },
      { lat: 40.3, lng: -105.2, elevationFt: 6900 },
    ],
  });

  const completedSummaries = await getCompletedTrips();
  assert.deepStrictEqual(completedSummaries.map((trip) => trip.id), ['svc-newer', 'svc-active']);
  assert(!Object.prototype.hasOwnProperty.call(completedSummaries[0], 'routeGeometry'));
  assert((await getTripById('svc-active')).routeGeometry.length > 0);
  assert(memoryStorage.get('ecs_expedition_trip_records_v1')?.includes('svc-active'));
}

async function testRecapGeneration() {
  await resetStores();

  const completeTrip = makeCompletedTrip({
    id: 'svc-recap-complete',
    title: 'Complete Recap Route',
    startedAt: '2026-05-01T08:00:00.000Z',
    completedAt: '2026-05-01T12:00:00.000Z',
    totalDistanceMiles: 58,
    totalDurationSeconds: 4 * 3600,
    routeGeometry: [
      { lat: 38, lng: -106, elevationFt: 5000, recordedAt: '2026-05-01T08:00:00.000Z' },
      { lat: 38.2, lng: -106.2, elevationFt: 7200, recordedAt: '2026-05-01T10:00:00.000Z' },
    ],
    weatherSnapshots: [
      { id: 'w1', capturedAt: '2026-05-01T09:00:00.000Z', summary: 'Clear', temperatureF: 42, source },
      { id: 'w2', capturedAt: '2026-05-01T11:00:00.000Z', summary: 'Wind', temperatureF: 68, source },
    ],
    terrainRiskSnapshots: [
      {
        id: 't1',
        capturedAt: '2026-05-01T10:30:00.000Z',
        riskLevel: 'caution',
        summary: 'Steep grade',
        coordinate: { lat: 38.2, lng: -106.2, elevationFt: 7200 },
        source,
      },
    ],
  });
  const recap = generateExpeditionRecap(completeTrip);
  assert.strictEqual(recap.tripId, 'svc-recap-complete');
  assert.strictEqual(recap.journeySummary.averageSpeedMph, 14.5);
  assert(recap.environmentSummary?.weatherConditionsEncountered.includes('Clear'));
  assert(recap.terrainSummary?.terrainRiskEvents?.length === 1);
  assert(recap.expeditionEvents.notableMoments.some((moment) => moment.type === 'highest_elevation'));
  assert(recap.generatedNarrative.summaryParagraph.length <= 180);
  assert(!/legendary|epic|unforgettable|breathtaking|story/i.test(recap.generatedNarrative.summaryParagraph));

  const noWeather = generateExpeditionRecap({ ...completeTrip, id: 'no-weather', weatherSnapshots: [] });
  assert.strictEqual(noWeather.environmentSummary, undefined);

  const noTerrain = generateExpeditionRecap({ ...completeTrip, id: 'no-terrain', terrainRiskSnapshots: [], routeGeometry: [] });
  assert.strictEqual(noTerrain.terrainSummary, undefined);

  const noGeometry = generateExpeditionRecap({
    ...completeTrip,
    id: 'no-geometry',
    routeGeometry: [],
    routeBounds: null,
    startCoordinate: null,
    endCoordinate: null,
  });
  assert.strictEqual(noGeometry.routeSummary.routeGeometryReference, null);
  assert.strictEqual(noGeometry.routeSummary.routeBounds, null);
}

async function testNotableMoments() {
  await resetStores();

  const active = createNewActiveTripRecord({
    id: 'svc-moments',
    startedAt: '2026-05-01T08:00:00.000Z',
  });
  const withMoment = safelyStoreNotableMoment(active, {
    id: 'manual-note-1',
    capturedAt: '2026-05-01T09:00:00.000Z',
    type: 'manual_note',
    title: '  Field note  ',
    detail: '  Short factual detail.  ',
    coordinate: null,
    source,
  });
  const duplicate = safelyStoreNotableMoment(withMoment, {
    id: 'manual-note-1',
    capturedAt: '2026-05-01T09:05:00.000Z',
    type: 'manual_note',
    title: 'Duplicate',
    source,
  });
  assert.strictEqual(duplicate.notableMoments.filter((moment) => moment.id === 'manual-note-1').length, 1);
  const storedMoment = duplicate.notableMoments.find((moment) => moment.id === 'manual-note-1');
  assert.strictEqual(storedMoment.title, 'Field note');
  assert.strictEqual(storedMoment.detail, 'Short factual detail.');
  assert.strictEqual(storedMoment.coordinate, null);

  const completed = finalizeCompletedTrip(duplicate, {
    completedAt: '2026-05-01T10:00:00.000Z',
    totalDistanceMiles: 10,
    totalDurationSeconds: 2 * 3600,
  });
  await expeditionTripRecordStore.save({
    ...completed,
    recap: {
      ...completed.recap,
      expeditionEvents: {
        ...completed.recap.expeditionEvents,
        notableMoments: [
          {
            id: 'late',
            capturedAt: '2026-05-01T09:45:00.000Z',
            type: 'manual_note',
            title: 'Late moment',
            detail: null,
            coordinate: null,
          },
          {
            id: 'early',
            capturedAt: '2026-05-01T08:15:00.000Z',
            type: 'manual_note',
            title: 'Early moment',
            detail: null,
            coordinate: null,
          },
        ],
      },
    },
  });
  const report = await generateExpeditionReport('svc-moments');
  assert.deepStrictEqual(report.notableMoments.map((moment) => moment.id), ['early', 'late']);
}

async function testBadgesAndNonBlockingFailure() {
  await resetStores();

  const firstTrip = await saveTrip({
    id: 'svc-badge-1',
    title: 'Badge Distance Route',
    startedAt: '2026-05-01T07:00:00.000Z',
    completedAt: '2026-05-01T15:00:00.000Z',
    totalDistanceMiles: 75,
    totalDurationSeconds: 8 * 3600,
    routeGeometry: [
      { lat: 39, lng: -104, elevationFt: 5200 },
      { lat: 39.7, lng: -104.7, elevationFt: 7600 },
    ],
  });
  await evaluateBadgesForCompletedTrip(firstTrip.id);
  const firstIds = (await getUnlockedBadges()).map((badge) => badge.id);
  assert(firstIds.includes('first-expedition'));
  assert(firstIds.includes('miles-50'));
  assert(getVisibleBadgeDefinitions().every((definition) => !definition.isHidden));
  assert(!(await getBadgeProgress()).some((badge) => !badge.unlockedAt && badge.isHidden));

  const recoveryTrip = await saveTrip({
    id: 'svc-badge-recovery',
    title: 'Recovery Badge Route',
    startedAt: '2026-05-02T07:00:00.000Z',
    completedAt: '2026-05-02T12:00:00.000Z',
    totalDistanceMiles: 18,
    totalDurationSeconds: 5 * 3600,
    routeGeometry: [
      { lat: 40, lng: -105, elevationFt: 6000 },
      { lat: 40.2, lng: -105.2, elevationFt: 6400 },
    ],
    recoveryPanelUsed: [
      {
        usedAt: '2026-05-02T10:00:00.000Z',
        context: 'Recovery tools opened',
        source,
      },
    ],
  });
  await evaluateBadgesForCompletedTrip(recoveryTrip.id);
  const recoveryIds = (await getBadgesForTrip(recoveryTrip.id)).map((badge) => badge.id);
  assert(recoveryIds.includes('recovery-ready'));

  await waitForPostProcessing();
  let unhandled = null;
  const onUnhandled = (error) => {
    unhandled = error;
  };
  process.once('unhandledRejection', onUnhandled);
  const failingLoad = Module._load;
  Module._load = function throwForBadgeStore(request, parent, isMain) {
    if (request === './expeditionBadgeStore' || String(request).endsWith('expeditionBadgeStore')) {
      throw new Error('badge evaluator unavailable');
    }
    return failingLoad(request, parent, isMain);
  };
  const completedDespiteBadgeFailure = makeCompletedTrip({
    id: 'svc-badge-failure-safe',
    title: 'Failure Safe Route',
    startedAt: '2026-05-03T07:00:00.000Z',
    completedAt: '2026-05-03T08:00:00.000Z',
    totalDistanceMiles: 4,
    totalDurationSeconds: 3600,
    routeGeometry: [
      { lat: 41, lng: -106, elevationFt: 5000 },
      { lat: 41.1, lng: -106.1, elevationFt: 5050 },
    ],
  });
  await expeditionTripRecordStore.save(completedDespiteBadgeFailure);
  await waitForPostProcessing();
  Module._load = failingLoad;
  process.removeListener('unhandledRejection', onUnhandled);
  assert.strictEqual(unhandled, null, 'Badge post-processing failure should not surface as an unhandled rejection.');
  assert.strictEqual((await expeditionTripRecordStore.getById('svc-badge-failure-safe')).status, 'completed');
}

async function testInsights() {
  await resetStores();

  assert.deepStrictEqual(await generateInsightsFromTripHistory(), []);

  for (const trip of [
    {
      id: 'svc-insight-1',
      title: 'Insight Foothill Route',
      startedAt: '2026-05-01T12:00:00.000Z',
      completedAt: '2026-05-01T19:00:00.000Z',
      totalDistanceMiles: 42,
      totalDurationSeconds: 7 * 3600,
      routeGeometry: [
        { lat: 39, lng: -104, elevationFt: 5200 },
        { lat: 39.4, lng: -104.3, elevationFt: 6900 },
      ],
      weatherSnapshots: [
        { id: 'iw1', capturedAt: '2026-05-01T15:00:00.000Z', summary: 'Rain', precipitation: 'Rain', source },
      ],
    },
    {
      id: 'svc-insight-2',
      title: 'Insight High Route',
      startedAt: '2026-05-04T12:00:00.000Z',
      completedAt: '2026-05-04T19:30:00.000Z',
      totalDistanceMiles: 184,
      totalDurationSeconds: 7.5 * 3600,
      routeGeometry: [
        { lat: 40, lng: -105, elevationFt: 6100 },
        { lat: 40.8, lng: -105.6, elevationFt: 7420 },
      ],
      terrainRiskSnapshots: [
        { id: 'it1', capturedAt: '2026-05-04T16:00:00.000Z', riskLevel: 'caution', summary: 'Loose grade', source },
      ],
    },
    {
      id: 'svc-insight-3',
      title: 'Insight Mesa Route',
      startedAt: '2026-05-08T11:00:00.000Z',
      completedAt: '2026-05-08T19:45:00.000Z',
      totalDistanceMiles: 66,
      totalDurationSeconds: 8 * 3600,
      routeGeometry: [
        { lat: 41, lng: -106, elevationFt: 5800 },
        { lat: 41.5, lng: -106.3, elevationFt: 7100 },
      ],
    },
  ]) {
    const saved = await saveTrip(trip);
    await evaluateBadgesForCompletedTrip(saved.id);
  }

  const insights = await generateInsightsFromTripHistory();
  assert(insights.length >= 3);
  assert(insights.every((insight) => insight.sourceTripIds.length > 0));
  assert(insights.every((insight) => !/you should|next time|you need|ecs recommends|recommend/i.test(insight.description)));

  const current = await getCurrentInsights();
  assert(current.length >= 1 && current.length <= 3);
  const dismissed = await dismissInsight(current[0].id);
  assert.strictEqual(dismissed.isDismissed, true);
  await refreshExpeditionInsights();
  assert(!(await getCurrentInsights(10)).some((insight) => insight.id === dismissed.id));
}

async function testPersonalRecords() {
  await resetStores();

  await saveTrip({
    id: 'svc-record-1',
    title: 'Baseline Record Route',
    startedAt: '2026-05-01T08:00:00.000Z',
    completedAt: '2026-05-01T12:00:00.000Z',
    totalDistanceMiles: 24,
    totalDurationSeconds: 4 * 3600,
    routeGeometry: [
      { lat: 40, lng: -105, elevationFt: 5600 },
      { lat: 40.2, lng: -105.2, elevationFt: 6200 },
    ],
  });
  const baseline = await evaluatePersonalRecordsForCompletedTrip('svc-record-1');
  assert(baseline.length > 0);

  await saveTrip({
    id: 'svc-record-2',
    title: 'Longer Record Route',
    startedAt: '2026-05-03T08:00:00.000Z',
    completedAt: '2026-05-03T18:00:00.000Z',
    totalDistanceMiles: 82,
    totalDurationSeconds: 10 * 3600,
    routeGeometry: [
      { lat: 40, lng: -105, elevationFt: 5600 },
      { lat: 40.3, lng: -105.3, elevationFt: 6000 },
    ],
  });
  await evaluatePersonalRecordsForCompletedTrip('svc-record-2');
  assert.strictEqual((await getRecordHistory('longest_distance'))[0].tripId, 'svc-record-2');

  await saveTrip({
    id: 'svc-record-3',
    title: 'Higher Record Route',
    startedAt: '2026-05-05T08:00:00.000Z',
    completedAt: '2026-05-05T16:00:00.000Z',
    totalDistanceMiles: 41,
    totalDurationSeconds: 8 * 3600,
    routeGeometry: [
      { lat: 40, lng: -105, elevationFt: 6200 },
      { lat: 40.4, lng: -105.4, elevationFt: 9200 },
    ],
  });
  await evaluatePersonalRecordsForCompletedTrip('svc-record-3');
  const current = await getCurrentPersonalRecords();
  assert(current.some((record) => record.type === 'longest_distance' && record.tripId === 'svc-record-2'));
  assert(current.some((record) => record.type === 'highest_elevation' && record.tripId === 'svc-record-3'));
  assert(memoryStorage.get('ecs_personal_expedition_records_v1')?.includes('svc-record-3'));
}

async function testMigrationCompatibility() {
  await resetStores();

  const oldSchema = normalizeTripRecord({
    id: 'svc-legacy-old-schema',
    schemaVersion: 'legacy.v0',
    status: 'completed',
    updatedAt: '2026-05-01T12:00:00.000Z',
  });
  assert.strictEqual(oldSchema.schemaVersion, getTripSchemaVersion());
  assert.strictEqual(oldSchema.title, 'Untitled Expedition');
  assert.strictEqual(oldSchema.completedAt, '2026-05-01T12:00:00.000Z');
  assert.deepStrictEqual(oldSchema.routeGeometry, []);
  assert.deepStrictEqual(oldSchema.badgesUnlocked, []);
  assert.strictEqual(oldSchema.recap, null);

  const migrated = migrateTripRecord({
    id: 'svc-legacy-recap',
    status: 'completed',
    updatedAt: '2026-05-02T12:00:00.000Z',
    totalDistanceMiles: 22,
    routePoints: [
      { latitude: 38, longitude: -107, ele: 1800 },
      { latitude: 38.2, longitude: -107.2, ele: 2200 },
    ],
  });
  assert(migrated.recap, 'Legacy trips with enough stats should gain an on-demand recap.');
  assert(migrated.routeBounds, 'Legacy routePoints should migrate to route bounds.');

  memoryStorage.set('ecs_expedition_trip_records_v1', JSON.stringify({
    version: 0,
    activeTripId: null,
    records: [
      { id: 'svc-stored-missing-completedAt', status: 'completed', createdAt: '2026-05-03T10:00:00.000Z' },
      { id: 'svc-stored-missing-badges', status: 'completed', updatedAt: '2026-05-04T10:00:00.000Z', routeGeometry: [] },
      { status: 'bad-record' },
    ],
  }));
  const upgrade = await upgradeTripSchemaIfNeeded();
  assert.strictEqual(upgrade.upgraded, 2);
  assert.strictEqual(upgrade.skipped, 1);
  const completed = await expeditionTripRecordStore.getCompleted();
  assert.strictEqual(completed.length, 2);
  assert(completed.every((trip) => Array.isArray(trip.badgesUnlocked)));
  assert(completed.every((trip) => trip.schemaVersion === getTripSchemaVersion()));
}

async function testReports() {
  await resetStores();

  const trip = await saveTrip({
    id: 'svc-report-1',
    title: 'Report Route',
    startedAt: '2026-05-01T07:00:00.000Z',
    completedAt: '2026-05-01T17:00:00.000Z',
    totalDistanceMiles: 62,
    totalDurationSeconds: 10 * 3600,
    routeGeometry: [
      { lat: 35, lng: -111, elevationFt: 5200 },
      { lat: 35.4, lng: -111.4, elevationFt: 6800 },
    ],
  });
  await evaluateBadgesForCompletedTrip(trip.id);
  const report = await generateExpeditionReport(trip.id);
  assert(report);
  assert.strictEqual(report.tripId, trip.id);
  assert(report.recapSummary);
  assert.strictEqual(report.mapSnapshotUri, null);
  assert(report.localUri, 'PDF/HTML-capable platform should return a local report URI.');
  assert(writtenFiles.get(Array.from(writtenFiles.keys()).find((uri) => uri.endsWith('.html'))).includes('Map snapshot unavailable for this report.'));
  assert.strictEqual((await getReportForTrip(trip.id)).id, report.id);
  assert.strictEqual((await shareExpeditionReport(report.id)).ok, true);
  assert.strictEqual(sharedUri, report.localUri);

  printShouldFail = true;
  fileSystemWriteAvailable = false;
  const failedFallbackTrip = await saveTrip({
    id: 'svc-report-fallback',
    title: 'Report Fallback Route',
    startedAt: '2026-05-02T07:00:00.000Z',
    completedAt: '2026-05-02T08:00:00.000Z',
    totalDistanceMiles: 4,
    totalDurationSeconds: 3600,
    routeGeometry: [
      { lat: 36, lng: -112, elevationFt: 5000 },
      { lat: 36.1, lng: -112.1, elevationFt: 5050 },
    ],
  });
  const failedFallbackReport = await generateExpeditionReport(failedFallbackTrip.id);
  assert(failedFallbackReport, 'Report generation should return metadata even when file export APIs fail.');
  assert.strictEqual(failedFallbackReport.exportFormat, 'text');
  assert.strictEqual(failedFallbackReport.localUri, null);
  const failedShare = await shareExpeditionReport(failedFallbackReport.id);
  assert.strictEqual(failedShare.ok, false);
  assert(failedShare.unavailableReason);

  const typesSource = fs.readFileSync(typesSourcePath, 'utf8');
  const hubSource = fs.readFileSync(hubSourcePath, 'utf8');
  assert(typesSource.includes("'failed'"), 'Report export status type should include failed.');
  assert(hubSource.includes("setReportStatus('failed')"), 'Detail export action should expose failed status handling.');
}

async function main() {
  await testTripRecordHelpers();
  await testRecapGeneration();
  await testNotableMoments();
  await testBadgesAndNonBlockingFailure();
  await testInsights();
  await testPersonalRecords();
  await testMigrationCompatibility();
  await testReports();

  console.log('Expedition Hub service coverage checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
