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

const {
  createNewActiveTripRecord,
  expeditionTripRecordStore,
  finalizeCompletedTrip,
} = require(path.join(root, 'lib', 'expedition', 'expeditionTripRecordStore.ts'));
const {
  clearAllBadgesForTests,
} = require(path.join(root, 'lib', 'expedition', 'expeditionBadgeStore.ts'));
const {
  materializeCompletedGuidanceSummary,
} = require(path.join(root, 'lib', 'expedition', 'completedGuidanceSummaryMaterializer.ts'));

const plannedRoute = [
  { lat: 39.1, lng: -120.1, elevationFt: 5100 },
  { lat: 39.2, lng: -120.2, elevationFt: 6400 },
  { lat: 39.3, lng: -120.3, elevationFt: 5700 },
];

const recordedTrace = [
  { lat: 39.11, lng: -120.11, recordedAt: '2026-07-16T09:00:00.000Z' },
  { lat: 39.19, lng: -120.19, recordedAt: '2026-07-16T09:30:00.000Z' },
];

const conflictingLateTrace = [
  { lat: 38.1, lng: -119.1 },
  { lat: 38.2, lng: -119.2 },
];

function completedRecord(input) {
  const active = createNewActiveTripRecord({
    id: input.id,
    completionKey: input.completionKey,
    title: input.title,
    startedAt: '2026-07-16T09:00:00.000Z',
    routeGeometry: input.routeGeometry,
    plannedRouteGeometry: input.plannedRouteGeometry,
    guidanceSessionId: input.guidanceSessionId,
  });
  return finalizeCompletedTrip(active, {
    completedAt: '2026-07-16T10:00:00.000Z',
    routeGeometry: input.routeGeometry,
    plannedRouteGeometry: input.plannedRouteGeometry,
  });
}

async function main() {
  await expeditionTripRecordStore.clearAllForTests();
  await clearAllBadgesForTests();

  const emptyCanonical = completedRecord({
    id: 'canonical-late-geometry-trip',
    completionKey: 'expedition-trip:late-geometry-session',
    title: 'Late geometry trip',
    guidanceSessionId: 'late-geometry-session',
    routeGeometry: [],
    plannedRouteGeometry: [],
  });
  await expeditionTripRecordStore.save(emptyCanonical);

  const enriched = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: {
      id: 'dashboard-summary-alias',
      state: 'complete',
      lifecycle: {
        identity: {
          guidanceSessionId: 'guidance:late-geometry-session',
          completedOutcomeId: 'expedition-trip:late-geometry-session',
        },
      },
      routePoints: plannedRoute,
      updatedAt: '2026-07-16T10:01:00.000Z',
    },
    routeCompleted: true,
  });

  assert.strictEqual(enriched.created, false, 'Late geometry must enrich the canonical record, not create an alias trip.');
  assert.strictEqual(enriched.trip.id, emptyCanonical.id, 'Nested lifecycle identity must converge on the canonical trip.');
  assert.deepStrictEqual(enriched.trip.routeGeometry, [], 'Canonical planned points must not be relabeled as a GPS trace.');
  assert.deepStrictEqual(
    enriched.trip.plannedRouteGeometry.map(({ lat, lng }) => ({ lat, lng })),
    plannedRoute.map(({ lat, lng }) => ({ lat, lng })),
    'Late routePoints must populate planned geometry on an already-completed record.',
  );
  assert.strictEqual((await expeditionTripRecordStore.getCompleted()).length, 1, 'Alias materialization must not duplicate the trip.');

  await expeditionTripRecordStore.clearAllForTests();
  const recordedCanonical = completedRecord({
    id: 'canonical-recorded-trip',
    completionKey: 'expedition-trip:recorded-session',
    title: 'Recorded trip',
    guidanceSessionId: 'recorded-session',
    routeGeometry: recordedTrace,
    plannedRouteGeometry: [],
  });
  await expeditionTripRecordStore.save(recordedCanonical);

  const preserved = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: {
      id: 'second-dashboard-alias',
      state: 'completed',
      guidance: { sessionId: 'recorded-session' },
      routeGeometry: conflictingLateTrace,
      plannedRouteGeometry: plannedRoute,
      updatedAt: '2026-07-16T10:02:00.000Z',
    },
    routeCompleted: true,
  });

  assert.strictEqual(preserved.trip.id, recordedCanonical.id, 'Nested guidance session identity must deduplicate the summary alias.');
  assert.deepStrictEqual(
    preserved.trip.routeGeometry.map(({ lat, lng }) => ({ lat, lng })),
    recordedTrace.map(({ lat, lng }) => ({ lat, lng })),
    'A complete recorded GPS trace must never be overwritten by late geometry.',
  );
  assert.strictEqual(preserved.trip.plannedRouteGeometry.length, plannedRoute.length);
  assert.strictEqual((await expeditionTripRecordStore.getCompleted()).length, 1);

  await expeditionTripRecordStore.clearAllForTests();
  const created = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: {
      id: 'new-separated-geometry-trip',
      state: 'complete',
      guidanceSessionId: 'new-separated-session',
      routeGeometry: recordedTrace,
      routePoints: plannedRoute,
      updatedAt: '2026-07-16T10:03:00.000Z',
    },
    routeCompleted: true,
  });

  assert.strictEqual(created.created, true);
  assert.deepStrictEqual(
    created.trip.routeGeometry.map(({ lat, lng }) => ({ lat, lng })),
    recordedTrace.map(({ lat, lng }) => ({ lat, lng })),
  );
  assert.deepStrictEqual(
    created.trip.plannedRouteGeometry.map(({ lat, lng }) => ({ lat, lng })),
    plannedRoute.map(({ lat, lng }) => ({ lat, lng })),
    'Recorded and planned geometry must remain distinct on initial materialization.',
  );

  await expeditionTripRecordStore.clearAllForTests();
  const nestedDrawable = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: {
      id: 'nested-drawable-geometry-trip',
      state: 'complete',
      guidanceSessionId: 'nested-drawable-session',
      routePoints: [plannedRoute[0]],
      routeSession: { routePoints: plannedRoute },
      updatedAt: '2026-07-16T10:03:30.000Z',
    },
    routeCompleted: true,
  });
  assert.strictEqual(
    nestedDrawable.trip.plannedRouteGeometry.length,
    plannedRoute.length,
    'A sparse top-level candidate must not mask drawable geometry from the canonical nested route session.',
  );

  await expeditionTripRecordStore.clearAllForTests();
  const geometryWithoutElevation = plannedRoute.map(({ lat, lng }) => ({ lat, lng }));
  const elevationSparseCanonical = completedRecord({
    id: 'late-elevation-trip',
    completionKey: 'expedition-trip:late-elevation-session',
    title: 'Late elevation trip',
    guidanceSessionId: 'late-elevation-session',
    routeGeometry: [],
    plannedRouteGeometry: geometryWithoutElevation,
  });
  await expeditionTripRecordStore.save(elevationSparseCanonical);
  const elevationEnriched = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: {
      id: 'late-elevation-alias',
      state: 'complete',
      guidanceSessionId: 'late-elevation-session',
      plannedRouteGeometry: plannedRoute,
      updatedAt: '2026-07-16T10:03:45.000Z',
    },
    routeCompleted: true,
  });
  assert.deepStrictEqual(
    elevationEnriched.trip.plannedRouteGeometry.map((point) => point.elevationFt),
    plannedRoute.map((point) => point.elevationFt),
    'Late metadata hydration should fill elevation on the same canonical geometry so high and low story points remain available.',
  );

  await expeditionTripRecordStore.clearAllForTests();
  const longRecordedTrace = Array.from({ length: 3_005 }, (_, index) => ({
    lat: 35 + index * 0.00001,
    lng: -118 - index * 0.00001,
    elevationFt: index === 777 ? 9_000 : index === 1_555 ? 100 : 1_000,
  }));
  const downsampled = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: {
      id: 'downsampled-extrema-trip',
      state: 'complete',
      guidanceSessionId: 'downsampled-extrema-session',
      routeGeometry: longRecordedTrace,
      updatedAt: '2026-07-16T10:03:50.000Z',
    },
    routeCompleted: true,
  });
  assert.ok(downsampled.trip.routeGeometry.length <= 2_500);
  assert.ok(
    downsampled.trip.routeGeometry.some((point) => point.elevationFt === 9_000) &&
      downsampled.trip.routeGeometry.some((point) => point.elevationFt === 100),
    'Persistence downsampling must retain deterministic high and low samples used by the recap story.',
  );

  await expeditionTripRecordStore.clearAllForTests();
  const lifecycleOnly = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: {
      id: 'lifecycle-only-completion',
      lifecycle: 'arrived',
      routePoints: plannedRoute,
      updatedAt: '2026-07-16T10:04:00.000Z',
    },
  });
  assert.ok(lifecycleOnly.trip, 'Legacy string lifecycle completion should remain materializable.');
  assert.strictEqual(lifecycleOnly.trip.plannedRouteGeometry.length, plannedRoute.length);

  console.log('Completed guidance geometry materialization checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
