const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
  'rawProgressPercent',
  'Route Progress should prefer live progress percent from the existing Navigate map session.',
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
includes(
  widgetSource,
  '<RouteCommandModule',
  'Command Module host should mount Route Command instead of the generic placeholder.',
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
  'isSunlightPanel || isWeatherPanel || isRoutePanel',
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

console.log('Dashboard Route Progress active navigation checks passed.');
