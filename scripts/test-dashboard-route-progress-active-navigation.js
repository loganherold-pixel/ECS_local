/* global __dirname */

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const widgetSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8');
const progressSource = fs.readFileSync(path.join(root, 'lib', 'activeRouteProgress.ts'), 'utf8');
const routeStoreSource = fs.readFileSync(path.join(root, 'lib', 'routeStore.ts'), 'utf8');
const navigateSessionSource = fs.readFileSync(path.join(root, 'lib', 'navigateRouteSessionStore.ts'), 'utf8');
const roadSource = fs.readFileSync(path.join(root, 'lib', 'useRoadNavigation.ts'), 'utf8');
const trailSource = fs.readFileSync(path.join(root, 'lib', 'useTrailNavigation.ts'), 'utf8');
const progressWidgetStart = widgetSource.indexOf('function ProgressWidget');
const progressWidgetEnd = widgetSource.indexOf('const RemotenessWidget', progressWidgetStart);
const progressWidgetSource =
  progressWidgetStart >= 0 && progressWidgetEnd > progressWidgetStart
    ? widgetSource.slice(progressWidgetStart, progressWidgetEnd)
    : '';

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function loadTsModule(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  const loadedModule = new Module(filename, module);
  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loadedModule.require.bind(loadedModule);
  loadedModule.require = (request) => (
    Object.prototype.hasOwnProperty.call(mocks, request) ? mocks[request] : originalRequire(request)
  );
  loadedModule._compile(outputText, filename);
  return loadedModule.exports;
}

includes(
  roadSource,
  'export function getActiveRoadNavigationSession()',
  'Road navigation hook should expose the active road guidance session.',
);
includes(
  roadSource,
  'export function subscribeActiveRoadNavigationSession',
  'Road navigation hook should expose a stable active-session subscription.',
);
includes(
  roadSource,
  'publishActiveRoadNavigationSession(session);',
  'Road navigation hook should publish session changes for Dashboard Route Progress.',
);

includes(
  trailSource,
  'export function getActiveTrailNavigationSession()',
  'Trail navigation hook should expose the active trail guidance session.',
);
includes(
  trailSource,
  'export function subscribeActiveTrailNavigationSession',
  'Trail navigation hook should expose a stable active-session subscription.',
);
includes(
  trailSource,
  'publishActiveTrailNavigationSession(session);',
  'Trail navigation hook should publish session changes for Dashboard Route Progress.',
);

includes(
  progressSource,
  'subscribeActiveRoadNavigationSession',
  'Shared Route Progress contract should subscribe to active road guidance instead of creating its own road hook.',
);
includes(
  progressSource,
  'subscribeActiveTrailNavigationSession',
  'Shared Route Progress contract should subscribe to active trail guidance instead of creating its own trail hook.',
);
includes(
  progressSource,
  'navigateRouteSessionStore',
  'Shared Route Progress contract should consume the existing Navigate map route session store.',
);
includes(
  progressSource,
  'navigateRouteSessionStore.subscribe(syncNavigateSession)',
  'Shared Route Progress contract should subscribe to the existing Navigate map session instead of creating another map source.',
);
includes(
  progressSource,
  'navigateRouteSessionStore.hydrateFromPersistence()',
  'Shared Route Progress contract should restore the current Navigate map route session on dashboard launch.',
);
includes(
  progressSource,
  'getNavigateSessionProgressSnapshot',
  'Shared Route Progress contract should normalize Navigate map progress into the widget contract.',
);
includes(
  progressSource,
  'navigateRouteGeometryFallbackIdentity(params.navigateSession)',
  'Active Navigate progress should reuse saved active-route geometry when the live guidance session has no drawable route line.',
);
includes(
  progressSource,
  'route geometry from saved active route',
  'Route Progress should label geometry borrowed from the saved active route instead of pretending it came from live guidance.',
);
includes(
  progressSource,
  'rawProgressPercent',
  'Route Progress should prefer live progress percent from the existing Navigate map session.',
);
notIncludes(
  progressSource,
  'projectLiveLocationToNavigateRoute',
  'Route Progress must not independently re-project dashboard GPS away from authoritative Navigate progress.',
);
notIncludes(
  progressSource,
  'Progress calculated from dashboard GPS projected onto Navigate route',
  'Route Progress must not claim dashboard GPS is a second progress source.',
);
notIncludes(
  progressSource,
  'getNavigateSessionProgressSnapshot(params.navigateSession, gpsSpeed, liveGpsLocation)',
  'Dashboard Route Progress should consume the route-versioned Navigate session without re-projecting live GPS.',
);
includes(
  progressSource,
  'remainingDistanceM / 1609.344',
  'Route Progress should derive remaining miles from the existing Navigate map session when available.',
);
includes(
  progressSource,
  'Navigate map route session',
  'Route Progress should label the Navigate map route session as its source of truth.',
);
includes(
  progressSource,
  'return routeStore.subscribe(syncRoute);',
  'Shared Route Progress contract should subscribe to routeStore changes instead of polling imported active routes.',
);
notIncludes(
  progressSource,
  'useRoadNavigation({',
  'Dashboard Route Progress must not create a separate road guidance hook instance.',
);
notIncludes(
  progressSource,
  'useTrailNavigation({',
  'Dashboard Route Progress must not create a separate trail guidance hook instance.',
);
notIncludes(
  progressSource,
  'getMapboxTokenSync',
  'Dashboard Route Progress should not fetch routing tokens just to mirror progress.',
);
notIncludes(
  progressSource,
  'setInterval(syncRoute',
  'Dashboard Route Progress should not poll routeStore for active route changes.',
);
notIncludes(
  progressSource,
  'clearInterval(intervalId',
  'Dashboard Route Progress should clean up route updates through routeStore unsubscribe.',
);
notIncludes(
  widgetSource,
  'waypointProgressStore.advance(',
  'Dashboard Route Progress widget must not mutate active route or waypoint progress.',
);
includes(
  widgetSource,
  '<RouteProgressMiniMap',
  'Route Progress widget should render the in-house mini-map.',
);

includes(
  routeStoreSource,
  'export type RouteStoreListener = () => void;',
  'Route store should expose a typed listener contract for dashboard subscribers.',
);
includes(
  routeStoreSource,
  'subscribe: subscribeRouteStore,',
  'Route store should expose subscribe() for active-route observers.',
);
includes(
  routeStoreSource,
  'notifyRouteStoreListeners();',
  'Route store should notify subscribers only after persisted route data changes.',
);
includes(
  navigateSessionSource,
  'export const navigateRouteSessionStore',
  'Navigate map route session store should expose the singular map route session source used by the dashboard.',
);
includes(
  navigateSessionSource,
  "NAVIGATE_ROUTE_SESSION_KEY = 'ecs_navigate_route_session_v1'",
  'Navigate map route session should persist its active lightweight snapshot for dashboard tab restores.',
);
includes(
  navigateSessionSource,
  'routePoints: downsamplePoints(snapshot.routePoints)',
  'Navigate map route session persistence should keep drawable route geometry without storing an uncontrolled full trace.',
);
includes(
  navigateSessionSource,
  'const persistedNavigateSession = await loadPersistedNavigateRouteSession()',
  'Dashboard route progress hydration should prefer the persisted Navigate route session before lossy road/trail fallbacks.',
);
includes(
  navigateSessionSource,
  "currentSnapshot.lifecycle !== 'inactive'",
  'Navigate route progress hydration should not overwrite a live in-memory route session with stale persisted data.',
);
includes(
  navigateSessionSource,
  'progressPercent: number | null;',
  'Navigate map route session should expose live progress percent for dashboard Route Progress.',
);
includes(
  navigateSessionSource,
  'remainingDistanceM: number | null;',
  'Navigate map route session should expose remaining distance for dashboard Route Progress.',
);

[
  'activeRouteId: string | null;',
  'status: ActiveRouteProgressStatus;',
  'percentComplete: number;',
  'milesCompleted: number | null;',
  'milesRemaining: number | null;',
  'estimatedArrival: string | null;',
  'totalDistance: number | null;',
  'updatedAt: string | null;',
  'nextInstructionDistanceM: number | null;',
  'nextInstructionDistanceText: string;',
  'distanceRemainingMiles === b.distanceRemainingMiles',
  'etaMinutes === b.etaMinutes',
  'progressPct === b.progressPct',
].forEach((fragment) => {
  includes(progressSource, fragment, `Route Progress normalized model should include ${fragment}`);
});

includes(
  widgetSource,
  'remainingDistanceText={progressSummary?.remainingMilesText ?? null}',
  'Route Progress should pass remaining distance to the mini-map overlay.',
);
includes(
  widgetSource,
  'etaText={progressSummary?.etaLabel ?? null}',
  'Route Progress should pass ETA to the mini-map overlay.',
);
includes(
  widgetSource,
  'inactivePlaceholderSource={ROUTE_PROGRESS_PLACEHOLDER}',
  'Route Progress should use the topo placeholder when guidance is unavailable.',
);
includes(
  progressSource,
  "source: 'road-guidance'",
  'Road guidance should be a first-class Route Progress source.',
);
includes(
  progressSource,
  "source: 'trail-guidance'",
  'Trail guidance should be a first-class Route Progress source.',
);
includes(
  progressSource,
  'formatRouteProgressTurnDistance(session.nextInstructionDistanceM)',
  'Shared Route Progress contract should expose next maneuver distance text from guidance state.',
);
includes(
  widgetSource,
  'useActiveRouteProgressSnapshot(options)',
  'Dashboard Route Progress widget should read the shared route progress object only.',
);
includes(
  widgetSource,
  'const hasActiveRouteProgress = Boolean(routeProgress?.isActive);',
  'Attitude Command Route Progress should distinguish active guidance from staged/standby route state.',
);
includes(
  widgetSource,
  'function RouteCommandModule',
  'Route Command center module should render as a dedicated route instrument.',
);
assert(
  widgetSource.includes('<CommandCenterHost') &&
    widgetSource.includes("externalRenderers={{") &&
    widgetSource.includes("threeDNavigation: ({ mode }) => (") &&
    widgetSource.includes("{renderCommandPanel('route')}"),
  'Command Module host should mount the current Navigation Command shell with the Route Terrain Risk panel instead of the retired route-command placeholder.',
);
includes(
  widgetSource,
  'routeProgress?.nextInstructionDistanceText',
  'Route Command should use the shared next maneuver distance field.',
);
includes(
  widgetSource,
  'Start guidance from Navigate or Explore',
  'Route Command should provide a truthful no-active-route state.',
);
assert.ok(
  !/case 'routeCommand':\s*return <AttitudeCommandRouteProgressMapVisual/.test(widgetSource),
  'Route Command center module must not reuse the Route Progress map visual.',
);
includes(
  widgetSource,
  'isGuidanceActive={Boolean(progressSummary?.isActive)}',
  'Route Progress visual should render active guidance only when the shared snapshot is active.',
);
includes(
  widgetSource,
  'function hasRenderableRouteProgressGeometry',
  'Attitude Command Route Progress should avoid drawing active geometry when route geometry is unavailable.',
);
notIncludes(
  widgetSource,
  'routeActivePulse',
  'Route Progress should not render the removed sliding pulse treatment.',
);
includes(
  widgetSource,
  'isSunlightPanel || isWeatherPanel || isVehiclePanel || isRoutePanel || isPowerPanel',
  'Route Progress should suppress the shell status pill so only one Active pill remains.',
);
notIncludes(
  progressWidgetSource,
  'routeMetricName',
  'Route Progress should not render the removed bottom metadata strip.',
);
notIncludes(
  progressWidgetSource,
  'Guidance standby',
  'No-active-route state should rely on the topo placeholder, not standby copy.',
);

const inactiveNavigateSession = {
  sessionId: null,
  lifecycle: 'inactive',
  source: 'none',
  routeId: null,
  routeTitle: null,
  routeSubtitle: null,
  statusLabel: 'No active route',
  instruction: null,
  routePoints: [],
  progressPoints: [],
  currentLocation: null,
  headingDeg: null,
  remainingDistanceM: null,
  remainingDurationS: null,
  etaIso: null,
  progressPercent: null,
  nextInstructionDistanceM: null,
  isRerouting: false,
  isOffRoute: false,
  offRouteDistanceM: null,
  routeStatusKind: null,
  updatedAt: null,
};

const inactiveRoadSession = {
  sessionId: null,
  status: 'idle',
  destination: null,
  route: null,
};

const inactiveTrailSession = {
  sessionId: null,
  status: 'idle',
  payload: null,
};

const progressRuntime = loadTsModule('lib/activeRouteProgress.ts', {
  react: {
    useEffect: () => undefined,
    useMemo: (factory) => factory(),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => undefined],
  },
  './routeStore': {
    routeStore: { getActive: () => null, subscribe: () => () => undefined },
  },
  './waypointProgressStore': {
    waypointProgressStore: { getIndex: () => 0, isRouteComplete: () => false },
  },
  './navigateRouteSessionStore': {
    navigateRouteSessionStore: {
      getSnapshot: () => inactiveNavigateSession,
      subscribe: () => () => undefined,
      hydrateFromPersistence: async () => inactiveNavigateSession,
    },
  },
  './useRoadNavigation': {
    getActiveRoadNavigationSession: () => inactiveRoadSession,
    subscribeActiveRoadNavigationSession: () => () => undefined,
  },
  './useTrailNavigation': {
    getActiveTrailNavigationSession: () => inactiveTrailSession,
    subscribeActiveTrailNavigationSession: () => () => undefined,
  },
  './vehicleDisplayStore': {
    vehicleDisplayStore: { getNavigationData: () => ({ currentLat: null, currentLon: null }), subscribe: () => () => undefined },
  },
  './routeGuidanceCopy': {
    buildProceedRouteInstruction: (destination) => `Proceed to ${destination}`,
  },
  './navigation/guidanceRouteProjection': {
    buildGuidanceRouteDistanceIndex: (geometry) => ({ geometry, totalDistanceM: geometry.length > 1 ? 1000 : 0 }),
    projectGuidanceRouteAtDistance: (index) => (
      index.geometry.length > 1 ? { coordinate: index.geometry[0] } : null
    ),
    resolveGuidanceRouteProgress: ({ routeGeometry }) => ({ completedGeometry: routeGeometry.slice(0, 1) }),
  },
});

function savedRoute(overrides = {}) {
  return {
    id: 'saved-route-b',
    name: 'Saved Route B',
    description: null,
    linked_run_id: null,
    source_fingerprint: 'source-fingerprint-b',
    total_distance_miles: 2,
    elevation_gain_ft: 300,
    waypoint_count: 2,
    segment_count: 1,
    waypoints: [
      { lat: 39, lon: -120, name: 'Start', waypointType: null },
      { lat: 39.02, lon: -120.02, name: 'Finish', waypointType: null },
    ],
    segments: [{ points: [{ lat: 39, lon: -120 }, { lat: 39.02, lon: -120.02 }] }],
    updated_at: '2026-07-15T12:00:00.000Z',
    ...overrides,
  };
}

function activeNavigateSession(routeId, source = 'road') {
  return {
    ...inactiveNavigateSession,
    sessionId: 'navigate-session-a',
    lifecycle: 'active',
    source,
    routeId,
    routeTitle: 'Live Route A',
    statusLabel: 'Route active',
    remainingDistanceM: 1200,
    progressPercent: 20,
    updatedAt: '2026-07-15T12:05:00.000Z',
  };
}

function activeRoadSession(routeId) {
  return {
    ...inactiveRoadSession,
    sessionId: 'road-session-a',
    status: 'navigation_active',
    destination: {
      id: routeId,
      title: 'Road Route A',
      subtitle: null,
      coordinate: { lat: 40, lng: -121 },
      sourceType: 'manual_selection',
      raw: null,
    },
    currentStepIndex: 0,
    nextInstruction: null,
    nextInstructionDistanceM: null,
    remainingDistanceM: 1200,
    remainingDurationS: 600,
    routeStatusLabel: 'Route active',
    routeConfidenceState: 'on_route',
    offRouteDistanceM: null,
    error: null,
    isOffRoute: false,
    progressGeometry: [],
    updatedAt: '2026-07-15T12:05:00.000Z',
  };
}

function activeTrailSession(routeId, routeMetadata = null) {
  return {
    ...inactiveTrailSession,
    sessionId: 'trail-session-a',
    status: 'navigation_active_trail',
    payload: {
      id: routeId,
      title: 'Trail Route A',
      subtitle: null,
      trailGeometry: [],
      trailWaypoints: [],
      trailDecisionPoints: [],
      tripMode: 'trail',
      routeMetadata,
      raw: null,
    },
    promptTitle: 'Trail guidance active',
    promptDetail: null,
    nextInstructionDistanceM: null,
    remainingDistanceM: 1200,
    progressPercent: 20,
    routeStatusLabel: 'Trail active',
    progressGeometry: [],
    updatedAt: '2026-07-15T12:05:00.000Z',
  };
}

function getProgressSnapshot({
  activeRoute = savedRoute(),
  navigateSession = inactiveNavigateSession,
  roadSession = inactiveRoadSession,
  trailSession = inactiveTrailSession,
  options,
}) {
  return progressRuntime.getActiveRouteProgressSnapshot({
    activeRoute,
    navigationData: { currentLat: null, currentLon: null },
    navigateSession,
    roadSession,
    trailSession,
    options,
  });
}

[
  {
    label: 'Navigate',
    sessions: { navigateSession: activeNavigateSession('live-route-a') },
  },
  {
    label: 'road',
    sessions: { roadSession: activeRoadSession('live-route-a') },
  },
  {
    label: 'trail',
    sessions: { trailSession: activeTrailSession('live-route-a') },
  },
].forEach(({ label, sessions }) => {
  const snapshot = getProgressSnapshot(sessions);
  assert.strictEqual(
    snapshot.routePoints.length,
    0,
    `${label} route A must not inherit saved route B geometry.`,
  );
  assert.ok(
    !snapshot.geometryStatus.includes('route geometry from saved active route'),
    `${label} mismatch must remain explicitly geometry-unavailable.`,
  );
});

const exactRouteSnapshot = getProgressSnapshot({ roadSession: activeRoadSession('saved-route-b') });
assert.strictEqual(exactRouteSnapshot.routePoints.length, 2, 'An exact route identity may reuse saved route geometry.');

const linkedRunSnapshot = getProgressSnapshot({
  activeRoute: savedRoute({ linked_run_id: 'linked-run-a' }),
  navigateSession: activeNavigateSession('linked-run-a', 'run'),
});
assert.strictEqual(linkedRunSnapshot.routePoints.length, 2, 'An explicitly linked run may reuse its saved route geometry.');

const fingerprintSnapshot = getProgressSnapshot({
  trailSession: activeTrailSession('live-route-a', { source_fingerprint: 'source-fingerprint-b' }),
});
assert.strictEqual(
  fingerprintSnapshot.routePoints.length,
  2,
  'An exact explicit source fingerprint may associate otherwise distinct route IDs.',
);

const staleGpsSnapshot = getProgressSnapshot({
  options: {
    gpsLatitude: 39.005,
    gpsLongitude: -120.995,
    gpsHasFix: true,
    gpsTimestampMs: Date.now() - 10 * 60 * 1000,
  },
});
assert.strictEqual(
  staleGpsSnapshot.stateLabel,
  'STAGED',
  'A warm but stale GPS coordinate must not be treated as live imported-route progress.',
);
assert.match(staleGpsSnapshot.confidenceLine, /stale/i);

const freshGpsSnapshot = getProgressSnapshot({
  options: {
    gpsLatitude: 39.005,
    gpsLongitude: -120.995,
    gpsHasFix: true,
    gpsTimestampMs: Date.now(),
  },
});
assert.strictEqual(freshGpsSnapshot.stateLabel, 'ACTIVE');

console.log('Dashboard Route Progress active navigation checks passed.');
