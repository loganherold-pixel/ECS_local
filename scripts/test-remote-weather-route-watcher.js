const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const watcherPath = path.join(root, 'lib', 'remote', 'useRemoteWeatherRouteWatcher.ts');
const watcherSource = fs.readFileSync(watcherPath, 'utf8');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  watcherSource,
  "import { navigateRouteSessionStore } from '../navigateRouteSessionStore';",
  'Route watcher should subscribe to the unified active route session store.',
);
assertIncludes(
  watcherSource,
  "import { remotenessStore, type RemotenessOutput } from '../remotenessStore';",
  'Route watcher should pull remoteness score and cache readiness from the existing remoteness store.',
);
assertIncludes(
  watcherSource,
  'subscribeSharedOperationalWeather',
  'Route watcher should subscribe to operational weather changes.',
);
assertIncludes(
  watcherSource,
  'assessRemoteWeatherHazard(hazardInput)',
  'Route watcher should call the deterministic remote weather hazard engine.',
);
assertIncludes(
  watcherSource,
  'publishRemoteWeatherBriefEvent({',
  'Route watcher should publish actionable hazards into ECS Brief.',
);
assertIncludes(
  watcherSource,
  'export const REMOTE_WEATHER_ROUTE_WATCH_INTERVAL_MS = 5 * 60 * 1000',
  'Route watcher cadence should evaluate every five minutes while active.',
);
assertIncludes(
  watcherSource,
  'export const REMOTE_WEATHER_ROUTE_WATCH_DISTANCE_MI = 30',
  'Route watcher should evaluate the next 30 miles.',
);
assertIncludes(
  watcherSource,
  'export const REMOTE_WEATHER_ROUTE_WATCH_DURATION_MIN = 60',
  'Route watcher should evaluate the next 60 minutes.',
);
assertIncludes(
  watcherSource,
  "route.lifecycle !== 'active' || !route.sessionId",
  'Route watcher should run only when active route guidance exists.',
);
assertIncludes(
  watcherSource,
  'getRemoteWeatherRouteWatcherSegmentId(route)',
  'Route watcher should re-evaluate when entering a new route segment bucket.',
);
assertIncludes(
  watcherSource,
  'shouldEvaluateForWeatherRiskChange(lastWeatherRiskRef.current, weatherRisk)',
  'Route watcher should react immediately to material weather-risk changes.',
);
assertIncludes(
  watcherSource,
  'if (!hazard.shouldEmit) return;',
  'Route watcher should avoid publishing clear/non-actionable assessments.',
);
assertIncludes(
  watcherSource,
  'clearInterval(intervalRef.current)',
  'Route watcher should clean up the active cadence timer.',
);
assertIncludes(
  watcherSource,
  'clearTimeout(pendingEvaluationRef.current)',
  'Route watcher should clean up pending non-blocking evaluations.',
);
assertIncludes(
  watcherSource,
  'weather.status.source === \'cache_fresh\'',
  'Route watcher should truthfully account for cached weather readiness offline.',
);
assertIncludes(
  watcherSource,
  'snapshot.status.stale || snapshot.status.kind === \'offline\'',
  'Route watcher should degrade weather risk honestly when using stale/offline weather.',
);
assertIncludes(
  watcherSource,
  'bluPowerAuthority.getSnapshot()',
  'Route watcher should pull power runtime when available.',
);

assertNotIncludes(
  watcherSource,
  'Modal',
  'Route watcher must not create visible modal UI.',
);
assertNotIncludes(
  watcherSource,
  'Overlay',
  'Route watcher must not create visible overlays.',
);
assertNotIncludes(
  watcherSource,
  'Alert.alert',
  'Route watcher must not add duplicate visible alerts.',
);

assertIncludes(
  navigateSource,
  "import { useRemoteWeatherRouteWatcher } from '../../lib/remote/useRemoteWeatherRouteWatcher';",
  'Navigate should import the background remote/weather route watcher.',
);
assertIncludes(
  navigateSource,
  'useRemoteWeatherRouteWatcher({ enabled: true });',
  'Navigate should mount the watcher without adding UI.',
);
assertIncludes(
  packageSource,
  '"test:remote-weather-route-watcher": "node ./scripts/test-remote-weather-route-watcher.js"',
  'package.json should expose the route watcher regression test.',
);

console.log('Remote weather route watcher checks passed.');
