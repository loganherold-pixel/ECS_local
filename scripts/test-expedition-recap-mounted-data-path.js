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
  if (request === 'react-native') return { Platform: { OS: 'web' } };
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

const selectors = require(path.join(root, 'lib', 'dashboard', 'dashboardRuntimeSelectors.ts'));
const {
  expeditionTripRecordStore,
} = require(path.join(root, 'lib', 'expedition', 'expeditionTripRecordStore.ts'));
const {
  clearAllBadgesForTests,
} = require(path.join(root, 'lib', 'expedition', 'expeditionBadgeStore.ts'));
const {
  materializeCompletedGuidanceSummary,
} = require(path.join(root, 'lib', 'expedition', 'completedGuidanceSummaryMaterializer.ts'));
const {
  getCompletedTrips,
  getTripById,
} = require(path.join(root, 'lib', 'expedition', 'expeditionTripRepository.ts'));
const {
  buildExpeditionRecapRoutePresentation,
} = require(path.join(root, 'lib', 'expedition', 'expeditionRecapRoutePresentation.ts'));

const plannedRoute = [
  { lat: 39.1, lng: -122.7, elevationFeet: 1_100 },
  { lat: 39.2, lng: -122.6, elevationFeet: 3_400 },
  { lat: 39.3, lng: -122.5, elevationFeet: 900 },
];

const recordedTrace = [
  { lat: 39.11, lng: -122.69, elevationFt: 1_120, recordedAt: '2026-07-17T10:00:00.000Z' },
  { lat: 39.21, lng: -122.59, elevationFt: 3_380, recordedAt: '2026-07-17T11:00:00.000Z' },
  { lat: 39.29, lng: -122.51, elevationFt: 920, recordedAt: '2026-07-17T12:00:00.000Z' },
];

async function main() {
  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();

  const guidanceSummary = selectors.buildDashboardCompletedGuidanceRouteSummary({
    routeProgress: {
      guidanceSessionId: 'recap-mounted-session',
      activeRouteId: 'recap-mounted-route',
      routeLabel: 'Mendocino Story Route',
      destinationLabel: 'Trail end',
      totalDistance: 23,
      completedMiles: 23,
      source: 'trail-guidance',
      lastUpdated: '2026-07-17T12:00:00.000Z',
      updatedAt: '2026-07-17T12:00:00.000Z',
      routePoints: plannedRoute,
      progressPoints: [],
    },
    routeProgressCompleted: true,
    expeditionId: 'recap-mounted-expedition',
  });

  const dashboardPresentation = selectors.selectDashboardExpeditionPresentation({
    expeditionState: 'standby',
    currentRecord: null,
    retainedCompletedRecord: {
      id: 'recap-mounted-expedition',
      state: 'complete',
      expeditionName: 'Mendocino Story Expedition',
      routeAssetId: 'route:recap-mounted-route',
      lifecycle: {
        identity: {
          guidanceSessionId: 'guidance:recap-mounted-session',
          routeAssetId: 'route:recap-mounted-route',
        },
      },
    },
    latestCompletedLog: null,
    completedGuidanceSummary: guidanceSummary,
    routeProgressCompleted: true,
  });

  assert.deepStrictEqual(
    dashboardPresentation.completedSummaryRecord.plannedRouteGeometry,
    plannedRoute,
    'The mounted Dashboard selection must retain matching planned geometry instead of the geometry-free completion alone.',
  );

  const firstMaterialization = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: dashboardPresentation.completedSummaryRecord,
    routeCompleted: dashboardPresentation.routeCompleted,
  });
  assert.ok(firstMaterialization.trip, 'The mounted completion payload should produce a persisted trip detail.');
  assert.strictEqual(firstMaterialization.trip.routeGeometry.length, 0, 'Planned points must not become GPS history.');
  assert.strictEqual(firstMaterialization.trip.plannedRouteGeometry.length, 3);

  const recentTrips = await getCompletedTrips();
  assert.strictEqual(recentTrips.length, 1, 'The completion path should create one recent expedition record.');
  const plannedDetail = await getTripById(recentTrips[0].id);
  const plannedPresentation = buildExpeditionRecapRoutePresentation({
    tripId: plannedDetail.id,
    startedAt: plannedDetail.startedAt,
    completedAt: plannedDetail.completedAt,
    routeGeometry: plannedDetail.routeGeometry,
    plannedRouteGeometry: plannedDetail.plannedRouteGeometry,
    recap: plannedDetail.recap,
  });
  assert.strictEqual(plannedPresentation.status, 'ready');
  assert.strictEqual(plannedPresentation.source, 'planned');
  assert.ok(/does not represent confirmed travel/i.test(plannedPresentation.sourceDetail));
  assert.ok(plannedPresentation.storyMoments.some((moment) => moment.type === 'highest_elevation'));
  assert.ok(plannedPresentation.storyMoments.some((moment) => moment.type === 'lowest_elevation'));

  const lateRecordedResult = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: {
      id: 'recap-mounted-route-alias',
      state: 'complete',
      guidanceSessionId: 'recap-mounted-session',
      routeGeometry: recordedTrace,
      plannedRouteGeometry: plannedRoute,
      updatedAt: '2026-07-17T12:01:00.000Z',
    },
    routeCompleted: true,
  });
  assert.strictEqual(lateRecordedResult.trip.id, plannedDetail.id, 'Late trace data must enrich the same canonical trip.');
  assert.strictEqual((await getCompletedTrips()).length, 1, 'Late enrichment must not create a blank alias trip.');

  const recordedDetail = await getTripById(plannedDetail.id);
  const recordedPresentation = buildExpeditionRecapRoutePresentation({
    tripId: recordedDetail.id,
    startedAt: recordedDetail.startedAt,
    completedAt: recordedDetail.completedAt,
    routeGeometry: recordedDetail.routeGeometry,
    plannedRouteGeometry: recordedDetail.plannedRouteGeometry,
    recap: recordedDetail.recap,
  });
  assert.strictEqual(recordedPresentation.source, 'recorded', 'A later valid GPS trace must become the authoritative recap display.');
  assert.deepStrictEqual(
    recordedPresentation.geometry.map(({ lat, lng }) => ({ lat, lng })),
    recordedTrace.map(({ lat, lng }) => ({ lat, lng })),
  );

  console.log('Expedition mounted recap data-path checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
