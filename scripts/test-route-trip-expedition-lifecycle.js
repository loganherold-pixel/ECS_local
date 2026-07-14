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
    return {
      Platform: { OS: 'web' },
      AppState: {
        currentState: 'active',
        addEventListener() { return { remove() {} }; },
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function load(relativePath) {
  return require(path.join(root, relativePath));
}

const lifecycle = load('lib/lifecycle/routeTripExpeditionLifecycle.ts');

const allowedTransitions = {
  discovered: ['previewing', 'planned', 'cancelled', 'failed'],
  previewing: ['discovered', 'planned', 'staged', 'cancelled', 'failed'],
  planned: ['previewing', 'offline_ready', 'expedition_ready', 'staged', 'cancelled', 'failed'],
  offline_ready: ['planned', 'expedition_ready', 'staged', 'cancelled', 'failed'],
  expedition_ready: ['planned', 'staged', 'active', 'cancelled', 'failed'],
  staged: ['previewing', 'active', 'cancelled', 'failed'],
  active: ['paused', 'completed', 'cancelled', 'failed'],
  paused: ['active', 'completed', 'cancelled', 'failed'],
  completed: ['archived'],
  cancelled: ['archived'],
  failed: ['discovered', 'previewing', 'planned', 'cancelled'],
  archived: [],
};

for (const [from, allowed] of Object.entries(allowedTransitions)) {
  assert.deepStrictEqual(lifecycle.getAllowedJourneyTransitions(from), allowed);
  for (const to of Object.keys(allowedTransitions)) {
    const decision = lifecycle.decideJourneyTransition(from, to);
    if (from === to) {
      assert.strictEqual(decision.accepted, true, `${from} should be idempotent.`);
      assert.strictEqual(decision.idempotent, true);
    } else {
      assert.strictEqual(decision.accepted, allowed.includes(to), `${from} -> ${to} transition mismatch.`);
    }
  }
}

const geometry = [
  { latitude: 39.1, longitude: -120.1 },
  { latitude: 39.2, longitude: -120.2 },
  { latitude: 39.3, longitude: -120.3 },
];
const fingerprint = lifecycle.buildGeometryFingerprint(geometry, 'test-route');
assert(fingerprint?.startsWith('test-route:3:'), 'Geometry should receive a deterministic fingerprint.');
assert.strictEqual(lifecycle.buildGeometryFingerprint(geometry, 'test-route'), fingerprint);
assert.notStrictEqual(
  lifecycle.buildGeometryFingerprint([...geometry, { latitude: 39.4, longitude: -120.4 }], 'test-route'),
  fingerprint,
);

for (const phase of Object.keys(allowedTransitions)) {
  const checkpoint = lifecycle.mergeJourneyLinkage(null, {
    phase,
    identity: { discoveryId: 'discovery:route-1' },
    updatedAt: '2026-07-12T12:00:00.000Z',
  });
  assert.strictEqual(lifecycle.normalizeJourneyLinkage(JSON.parse(JSON.stringify(checkpoint)))?.phase, phase);
}

assert.deepStrictEqual(lifecycle.decideGuidanceReplacement({ targetRouteId: 'new' }), {
  action: 'stage',
  reason: 'no_active_guidance',
});
assert.strictEqual(lifecycle.decideGuidanceReplacement({
  activeRouteId: 'route-a',
  activeSessionId: 'session-a',
  targetRouteId: 'route-a',
}).action, 'keep');
assert.strictEqual(lifecycle.decideGuidanceReplacement({
  activeRouteId: 'route-a',
  targetRouteId: 'route-b',
}).action, 'confirm');
assert.strictEqual(lifecycle.decideGuidanceReplacement({
  activeRouteId: 'route-a',
  targetRouteId: 'route-b',
  confirmed: true,
}).action, 'replace');

assert.strictEqual(lifecycle.decideJourneyResume({
  phase: 'planned',
  sourceObjectAvailable: false,
  embeddedGeometryAvailable: false,
  offline: false,
  offlinePackageAvailable: false,
}).reason, 'missing_source');
assert.deepStrictEqual(lifecycle.decideJourneyResume({
  phase: 'active',
  sourceObjectAvailable: false,
  embeddedGeometryAvailable: true,
  offline: true,
  offlinePackageAvailable: false,
}), {
  allowed: true,
  degraded: true,
  phase: 'active',
  reason: 'embedded_geometry_only',
});
assert.strictEqual(lifecycle.decideJourneyResume({
  phase: 'staged',
  sourceObjectAvailable: true,
  embeddedGeometryAvailable: true,
  offline: true,
  offlinePackageAvailable: true,
}).reason, 'offline_package_available');

const routeStorePath = path.join(root, 'lib/routeStore.ts');
let { routeStore } = require(routeStorePath);
const minimalGpx = `<?xml version="1.0"?><gpx><trk><name>Lifecycle GPX</name><trkseg><trkpt lat="39.1" lon="-120.1"/><trkpt lat="39.2" lon="-120.2"/></trkseg></trk></gpx>`;
const firstImport = routeStore.importGPX(minimalGpx, 'lifecycle_test');
const repeatedImport = routeStore.importGPX(minimalGpx, 'lifecycle_test');
assert.strictEqual(repeatedImport.id, firstImport.id, 'Repeated GPX import should reuse the route asset.');

const stitchedRoute = routeStore.createCustomRoute([
  { coordinates: [[-120.1, 39.1], [-120.2, 39.2], [-120.3, 39.3]] },
], {
  name: 'Stitched lifecycle route',
  sourceApp: 'ecs_navigate_mvum_stitch',
  externalSourceId: 'stitch-draft-1',
  externalSourceType: 'mvum_segment_stitch',
});
const repeatedStitch = routeStore.createCustomRoute([
  { coordinates: [[-120.1, 39.1], [-120.2, 39.2], [-120.3, 39.3]] },
], {
  name: 'Stitched lifecycle route',
  sourceApp: 'ecs_navigate_mvum_stitch',
  externalSourceId: 'stitch-draft-1',
  externalSourceType: 'mvum_segment_stitch',
});
assert.strictEqual(repeatedStitch.id, stitchedRoute.id, 'Repeated stitched-route save should be idempotent.');
assert.strictEqual(stitchedRoute.lifecycle.routeProvenance.origin, 'stitched');
assert.strictEqual(stitchedRoute.lifecycle.identity.routeAssetId, `route:${stitchedRoute.id}`);
assert.strictEqual(JSON.parse(memoryStorage.get('ecs_local_routes')).version, 2, 'Legacy route storage should upgrade to v2.');
delete require.cache[require.resolve(routeStorePath)];
({ routeStore } = require(routeStorePath));
assert.strictEqual(
  routeStore.getById(stitchedRoute.id)?.id,
  stitchedRoute.id,
  'Saved route assets should survive a module restart.',
);
routeStore.setActive(stitchedRoute.id);
assert.strictEqual(routeStore.getById(stitchedRoute.id).lifecycle.phase, 'staged');
routeStore.deactivateAll();
assert.strictEqual(
  routeStore.getById(stitchedRoute.id).lifecycle.phase,
  'previewing',
  'Deactivating a staged route should follow the staged-to-previewing transition.',
);

const runStorePath = path.join(root, 'lib/runStore.ts');
let { runStore } = require(runStorePath);
const firstRun = runStore.createFromRoute(stitchedRoute);
const repeatedRun = runStore.createFromRoute(stitchedRoute);
assert.strictEqual(repeatedRun.id, firstRun.id, 'A route asset should own one planning run conversion.');
assert.strictEqual(firstRun.source_route_id, stitchedRoute.id);
assert.strictEqual(JSON.parse(memoryStorage.get('ecs_local_runs')).version, 2, 'Legacy run storage should upgrade to v2.');
delete require.cache[require.resolve(runStorePath)];
({ runStore } = require(runStorePath));
assert.strictEqual(runStore.getById(firstRun.id)?.id, firstRun.id, 'Planning runs should survive a module restart.');
runStore.setActive(firstRun.id);
assert.strictEqual(runStore.getById(firstRun.id).lifecycle.phase, 'staged');
runStore.deactivateAll();
assert.strictEqual(
  runStore.getById(firstRun.id).lifecycle.phase,
  'previewing',
  'Deactivating a staged run should follow the staged-to-previewing transition.',
);

const routeInput = {
  id: stitchedRoute.id,
  name: stitchedRoute.name,
  source: stitchedRoute.source_format,
  distanceMiles: stitchedRoute.total_distance_miles,
  trailGeometry: geometry,
  routeGeometry: {
    type: 'LineString',
    coordinates: geometry.map((point) => [point.longitude, point.latitude]),
  },
  routeGeometryStatus: 'trail_available',
  routeMetadata: lifecycle.attachJourneyLinkageToMetadata({}, stitchedRoute.lifecycle),
};

const tripBuilderStorePath = path.join(root, 'lib/tripBuilder/tripBuilderRouteHandoffStore.ts');
let tripBuilderStore = require(tripBuilderStorePath);
const firstTripHandoff = tripBuilderStore.saveTripBuilderRouteHandoff(routeInput, {
  createdAt: '2026-07-12T13:00:00.000Z',
});
const secondTripHandoff = tripBuilderStore.saveTripBuilderRouteHandoff(routeInput, {
  createdAt: '2026-07-12T13:01:00.000Z',
});
assert.strictEqual(firstTripHandoff.handoffId, secondTripHandoff.handoffId);
assert.strictEqual(secondTripHandoff.schemaVersion, 2);
assert.strictEqual(secondTripHandoff.lifecycle.identity.routeAssetId, `route:${stitchedRoute.id}`);
delete require.cache[require.resolve(tripBuilderStorePath)];
tripBuilderStore = require(tripBuilderStorePath);
assert.strictEqual(
  tripBuilderStore.loadTripBuilderRouteHandoff().handoffId,
  firstTripHandoff.handoffId,
  'Trip Builder handoff should survive a module restart.',
);

const { buildTripPlan } = load('lib/tripBuilder/tripBuilderService.ts');
const tripPlan = buildTripPlan({
  route: routeInput,
  input: {
    tripType: 'day_trip',
    timeWindow: 'full_day',
    groupType: 'solo',
    priorities: ['low_risk'],
  },
  vehicleProfile: { id: 'vehicle-1', label: 'Lifecycle vehicle' },
  capturedAt: '2026-07-12T13:05:00.000Z',
});
assert.strictEqual(tripPlan.id, `trip-plan-${stitchedRoute.id}`);
assert.strictEqual(tripPlan.lifecycle.identity.routeAssetId, `route:${stitchedRoute.id}`);
assert.strictEqual(tripPlan.lifecycle.activeVehicleId, 'vehicle-1');

const tripBuilderScreen = fs.readFileSync(path.join(root, 'app/explore-trip-builder.tsx'), 'utf8');
assert(
  tripBuilderScreen.includes('waitForRouteStoreHydration(),') &&
    tripBuilderScreen.includes('waitForRunStoreHydration(),') &&
    tripBuilderScreen.includes('const requestedRouteId = params.routeId ? String(params.routeId) : null;'),
  'Trip Builder deep-link entry should resolve routeId only after route and run hydration.',
);

const offlineStorePath = path.join(root, 'lib/offlinePrepPack/offlinePrepPackHandoffStore.ts');
let offlineStore = require(offlineStorePath);
const offlineInput = {
  route: routeInput,
  tripPlan,
  vehicleProfile: { id: 'vehicle-1', label: 'Lifecycle vehicle' },
  exitPoints: [{ id: 'bailout-1' }],
  capturedAt: '2026-07-12T13:10:00.000Z',
};
const offlineHandoff = offlineStore.saveOfflinePrepPackHandoff(offlineInput, 'trip_builder');
assert.strictEqual(offlineHandoff.schemaVersion, 2);
assert.strictEqual(offlineHandoff.lifecycle.phase, 'offline_ready');
assert.deepStrictEqual(offlineHandoff.lifecycle.bailoutIds, ['bailout-1']);
delete require.cache[require.resolve(offlineStorePath)];
offlineStore = require(offlineStorePath);
assert.strictEqual(
  offlineStore.loadOfflinePrepPackHandoff().handoffId,
  offlineHandoff.handoffId,
  'Offline Prep handoff should survive a module restart.',
);

const { buildOfflinePrepPackManifest } = load('lib/offlinePrepPack/offlinePrepPackService.ts');
const manifest = buildOfflinePrepPackManifest(offlineInput);
assert.strictEqual(manifest.schemaVersion, 2);
assert.strictEqual(manifest.id, `offline-prep-${stitchedRoute.id}`);
assert.strictEqual(manifest.tripPlanId, tripPlan.id);
assert.strictEqual(manifest.routeAssetId, `route:${stitchedRoute.id}`);
assert.strictEqual(manifest.lifecycle.routeProvenance.origin, 'stitched');

const { tripRecorderEngine } = load('lib/tripRecorderEngine.ts');
const firstRecording = tripRecorderEngine.startRecording({
  expeditionId: 'recorder-expedition-1',
  name: 'Lifecycle recording',
});
const repeatedRecording = tripRecorderEngine.startRecording({
  expeditionId: 'recorder-expedition-1',
  name: 'Lifecycle recording retry',
});
assert.strictEqual(repeatedRecording.id, firstRecording.id, 'Repeated recording start should be idempotent.');
const replacementRecording = tripRecorderEngine.startRecording({
  expeditionId: 'recorder-expedition-2',
  name: 'Explicit replacement recording',
  replaceActive: true,
});
assert.notStrictEqual(replacementRecording.id, firstRecording.id, 'Recording replacement should require explicit intent.');
tripRecorderEngine.stopRecording();
tripRecorderEngine.destroy();

const { expeditionStateStore } = load('lib/expeditionStateStore.ts');
expeditionStateStore.reset();
expeditionStateStore.clearLog();
expeditionStateStore.clearTimeline();
const expedition = expeditionStateStore.beginExpedition({
  idempotencyKey: 'launch:route-1',
  activeVehicleId: 'vehicle-1',
  vehicleName: 'Lifecycle vehicle',
  routeAssetId: stitchedRoute.id,
  tripPlanId: tripPlan.id,
  offlinePackageId: manifest.id,
  runId: firstRun.id,
  lifecycle: manifest.lifecycle,
});
const repeatedExpedition = expeditionStateStore.beginExpedition({
  idempotencyKey: 'launch:route-2',
  activeVehicleId: 'vehicle-2',
  vehicleName: 'Should not replace active expedition',
});
assert.strictEqual(repeatedExpedition.id, expedition.id, 'A second begin must not replace an active expedition.');
assert.strictEqual(expeditionStateStore.pauseExpedition().lifecycle.phase, 'paused');
assert.strictEqual(expeditionStateStore.pauseExpedition(), null, 'Repeated pause should be rejected.');
assert.strictEqual(expeditionStateStore.resumeExpedition().lifecycle.phase, 'active');
assert.strictEqual(expeditionStateStore.endExpedition().lifecycle.phase, 'completed');
assert.strictEqual(expeditionStateStore.endExpedition(), null, 'Repeated completion should be idempotently rejected.');
assert.strictEqual(expeditionStateStore.getLog().length, 1, 'Completion log should contain one durable expedition entry.');

const tripRecordStoreModule = load('lib/expedition/expeditionTripRecordStore.ts');
const { expeditionTripRecordStore, trackExpeditionTripFromGuidanceSnapshot, normalizeTripRecord } = tripRecordStoreModule;

function guidanceSnapshot(lifecycleState, updatedAt) {
  return {
    sessionId: 'guidance-lifecycle-session',
    lifecycle: lifecycleState,
    source: 'trail',
    routeId: stitchedRoute.id,
    routeTitle: 'Lifecycle route',
    routeSubtitle: 'Canonical journey test',
    statusLabel: lifecycleState === 'arrived' ? 'Guidance complete' : 'Guidance active',
    instruction: lifecycleState === 'arrived' ? 'Arrived' : 'Continue',
    routePoints: geometry.map((point) => ({ lat: point.latitude, lng: point.longitude })),
    progressPoints: [],
    currentLocation: {
      latitude: lifecycleState === 'arrived' ? 39.3 : 39.1,
      longitude: lifecycleState === 'arrived' ? -120.3 : -120.1,
      timestamp: Date.parse(updatedAt),
    },
    headingDeg: 0,
    remainingDistanceM: lifecycleState === 'arrived' ? 0 : 1000,
    remainingDurationS: lifecycleState === 'arrived' ? 0 : 300,
    etaIso: null,
    progressPercent: lifecycleState === 'arrived' ? 100 : 0,
    nextInstructionDistanceM: lifecycleState === 'arrived' ? 0 : 500,
    isRerouting: false,
    isOffRoute: false,
    offRouteDistanceM: null,
    routeStatusKind: lifecycleState === 'arrived' ? 'arrived' : 'nominal',
    updatedAt,
  };
}

async function runAsyncChecks() {
  await expeditionTripRecordStore.clearAllForTests();
  await trackExpeditionTripFromGuidanceSnapshot(guidanceSnapshot('active', '2026-07-12T14:00:00.000Z'));
  await trackExpeditionTripFromGuidanceSnapshot(guidanceSnapshot('arrived', '2026-07-12T14:30:00.000Z'));
  await trackExpeditionTripFromGuidanceSnapshot(guidanceSnapshot('arrived', '2026-07-12T14:30:00.000Z'));
  const completed = await expeditionTripRecordStore.getCompleted();
  assert.strictEqual(completed.length, 1, 'Repeated arrival and restoration should produce one completed outcome.');
  assert.strictEqual(completed[0].schemaVersion, 'ecs.expedition.trip.v2');
  assert(completed[0].completionKey, 'Completed outcome should have a stable completion key.');
  assert.strictEqual(completed[0].lifecycle.phase, 'completed');

  const { materializeCompletedGuidanceSummary } = load('lib/expedition/completedGuidanceSummaryMaterializer.ts');
  const materialized = await materializeCompletedGuidanceSummary({
    completedExpeditionRecord: {
      id: 'dashboard-expedition-summary',
      guidanceSessionId: 'guidance-lifecycle-session',
      state: 'complete',
      title: 'Lifecycle route',
      updatedAt: '2026-07-12T14:30:00.000Z',
    },
    routeCompleted: true,
  });
  assert.strictEqual(materialized.created, false, 'Dashboard completion should converge on the guidance outcome.');
  assert.strictEqual((await expeditionTripRecordStore.getCompleted()).length, 1);

  const legacy = normalizeTripRecord({
    id: 'legacy-trip-v1',
    schemaVersion: 'ecs.expedition.trip.v1',
    status: 'completed',
    updatedAt: '2026-07-11T12:00:00.000Z',
    routePoints: [
      { latitude: 38, longitude: -119 },
      { latitude: 38.1, longitude: -119.1 },
    ],
  });
  assert.strictEqual(legacy.schemaVersion, 'ecs.expedition.trip.v2');
  assert.strictEqual(legacy.lifecycle.phase, 'completed');
  assert(legacy.completionKey, 'Legacy records should receive a completion key during migration.');

  console.log('Canonical route, trip, expedition, guidance, and archive lifecycle checks passed.');
}

runAsyncChecks().catch((error) => {
  console.error(error);
  process.exit(1);
});
