const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, require, mod, filename, path.dirname(filename));
  return mod.exports;
}

const {
  ROAD_NAVIGATION_PROGRESS_PERSIST_MIN_INTERVAL_MS,
  buildRoadNavigationProgressPersistenceSnapshot,
  shouldPersistRoadNavigationProgressUpdate,
} = loadTsModule(path.join('lib', 'roadNavigationProgressPersistence.ts'));

function buildSession(overrides = {}) {
  return {
    sessionId: 'active-session',
    status: 'navigation_active',
    destination: {
      id: 'camp-alpha',
      title: 'Camp Alpha',
      coordinate: { lat: 38.78, lng: -121.2 },
      sourceType: 'manual_selection',
    },
    route: {
      id: 'route-alpha',
      routeVersion: 'route-version-1',
      guidance: {
        id: 'guidance-alpha',
        routeVersion: 'route-version-1',
        rerouteGeneration: 0,
      },
    },
    activeGuidance: {
      routeId: 'guidance-alpha',
      routeVersion: 'route-version-1',
      rerouteGeneration: 0,
    },
    currentStepIndex: 1,
    routeConfidenceState: 'on_route',
    rerouteStatus: 'on_route',
    completionReason: null,
    remainingDistanceM: 4200,
    nextInstructionDistanceM: 740,
    progressGeometry: [
      { lat: 38.78, lng: -121.2 },
      { lat: 38.781, lng: -121.201 },
    ],
    ...overrides,
  };
}

const firstSnapshot = buildRoadNavigationProgressPersistenceSnapshot(buildSession());

assert.strictEqual(
  shouldPersistRoadNavigationProgressUpdate({
    previous: null,
    next: firstSnapshot,
    nowMs: 1000,
    lastPersistedAtMs: null,
  }),
  true,
  'The first live progress snapshot should be durable.',
);

const distanceOnlySnapshot = buildRoadNavigationProgressPersistenceSnapshot(
  buildSession({
    remainingDistanceM: 4160,
    nextInstructionDistanceM: 700,
    progressGeometry: [
      { lat: 38.78, lng: -121.2 },
      { lat: 38.7812, lng: -121.2012 },
    ],
  }),
);

assert.deepStrictEqual(
  distanceOnlySnapshot,
  firstSnapshot,
  'Distance and progress-geometry churn should not be part of the durable checkpoint identity.',
);
assert.strictEqual(
  shouldPersistRoadNavigationProgressUpdate({
    previous: firstSnapshot,
    next: distanceOnlySnapshot,
    nowMs: 5000,
    lastPersistedAtMs: 1000,
  }),
  false,
  'A distance-only GPS tick inside the throttle window must not enqueue full session persistence.',
);

const stepChangeSnapshot = buildRoadNavigationProgressPersistenceSnapshot(
  buildSession({ currentStepIndex: 2 }),
);
assert.strictEqual(
  shouldPersistRoadNavigationProgressUpdate({
    previous: firstSnapshot,
    next: stepChangeSnapshot,
    nowMs: 6000,
    lastPersistedAtMs: 1000,
  }),
  true,
  'A maneuver step change should be saved so restored guidance resumes on the correct instruction.',
);

const offRouteSnapshot = buildRoadNavigationProgressPersistenceSnapshot(
  buildSession({
    routeConfidenceState: 'off_route_confirmed',
    rerouteStatus: 'off_route_confirmed',
  }),
);
assert.strictEqual(
  shouldPersistRoadNavigationProgressUpdate({
    previous: firstSnapshot,
    next: offRouteSnapshot,
    nowMs: 7000,
    lastPersistedAtMs: 1000,
  }),
  true,
  'Off-route confirmation should be a durable checkpoint before reroute work starts.',
);

const rerouteAppliedSnapshot = buildRoadNavigationProgressPersistenceSnapshot(
  buildSession({
    route: {
      id: 'route-alpha-reroute',
      routeVersion: 'route-version-2',
      guidance: {
        id: 'guidance-alpha-reroute',
        routeVersion: 'route-version-2',
        rerouteGeneration: 1,
      },
    },
    activeGuidance: {
      routeId: 'guidance-alpha-reroute',
      routeVersion: 'route-version-2',
      rerouteGeneration: 1,
    },
  }),
);
assert.strictEqual(
  shouldPersistRoadNavigationProgressUpdate({
    previous: firstSnapshot,
    next: rerouteAppliedSnapshot,
    nowMs: 8000,
    lastPersistedAtMs: 1000,
  }),
  true,
  'A new route version/reroute generation must always be saved.',
);

assert.strictEqual(
  shouldPersistRoadNavigationProgressUpdate({
    previous: firstSnapshot,
    next: firstSnapshot,
    nowMs: 1000 + ROAD_NAVIGATION_PROGRESS_PERSIST_MIN_INTERVAL_MS + 1,
    lastPersistedAtMs: 1000,
  }),
  true,
  'Unchanged active guidance should still refresh durably on the long checkpoint interval.',
);

console.log('[road-navigation-progress-persistence] passed');
