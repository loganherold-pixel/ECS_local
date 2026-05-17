const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypeScriptModule;

const watcherSource = fs.readFileSync(path.join(root, 'lib', 'remote', 'useRemoteWeatherRouteWatcher.ts'), 'utf8');
const cadLogSource = fs.readFileSync(path.join(root, 'components', 'dashboard', 'MissionBriefCadLog.tsx'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

const { assessRemoteWeatherHazard } = require(path.join(root, 'lib', 'remote', 'remoteWeatherHazardEngine.ts'));
const {
  publishRemoteWeatherBriefEvent,
  resetRemoteWeatherBriefPublisherForTests,
} = require(path.join(root, 'lib', 'remote', 'remoteWeatherBriefPublisher.ts'));
const { briefCadLogStore, recordBriefCadEntry } = require(path.join(root, 'lib', 'briefCadLogStore.ts'));

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function baseHazardInput(overrides = {}) {
  return {
    routeId: 'route-smoke',
    segmentId: 'segment-1',
    remotenessScore: 25,
    routeConfidence: 88,
    weatherRisk: 0.1,
    windMph: 8,
    precipProb: 0.1,
    tempF: 72,
    smokeRisk: 0.1,
    fireRisk: 0.1,
    signalLossMiles: 0,
    cacheReady: true,
    powerHours: 10,
    distanceAheadMi: 12,
    etaMinutes: 35,
    ...overrides,
  };
}

function publishHazard(hazard, overrides = {}) {
  return publishRemoteWeatherBriefEvent({
    hazard,
    routeId: 'route-smoke',
    segmentId: 'segment-1',
    remotenessScore: 70,
    routeConfidence: 61,
    weatherRisk: 0.6,
    distanceAheadMi: 18,
    etaMinutes: 42,
    createdAt: 10_000_000,
    ...overrides,
  });
}

// 1. No active route: watcher should stop before building/publishing advisories.
assertIncludes(
  watcherSource,
  "if (input.route.lifecycle !== 'active' || !input.route.sessionId) return null;",
  'No-active-route path should not build a hazard input.',
);
assertIncludes(
  watcherSource,
  "if (route.lifecycle !== 'active' || !route.sessionId) {\n        resetRouteState();\n        return;",
  'No-active-route path should reset watcher state and return before publishing.',
);

resetRemoteWeatherBriefPublisherForTests();
briefCadLogStore.clear();

// 2. Active route + high remoteness + high weather emits one ECS Brief warning.
let hazard = assessRemoteWeatherHazard(baseHazardInput({
  remotenessScore: 70,
  weatherRisk: 0.6,
  routeConfidence: 61,
  distanceAheadMi: 18,
}));
assert.strictEqual(hazard.shouldEmit, true);
assert.strictEqual(hazard.severity, 'warning');
let result = publishHazard(hazard);
assert.strictEqual(result.emitted, true);
assert.strictEqual(result.event.source, 'ecs-remote-weather');
assert.strictEqual(result.event.severity, 'warning');
assert.strictEqual(briefCadLogStore.getEntries().length, 1, 'High remote/weather risk should emit one ECS Brief warning.');

// 3. Duplicate condition within 10 minutes suppresses duplicate.
result = publishHazard(hazard, { createdAt: 10_000_000 + 60_000 });
assert.strictEqual(result.emitted, false);
assert.strictEqual(result.reason, 'duplicate_suppressed');
assert.strictEqual(briefCadLogStore.getEntries().length, 1, 'Duplicate condition should not spam ECS Brief.');

// 4. Severity escalation watch -> warning emits immediately.
resetRemoteWeatherBriefPublisherForTests();
briefCadLogStore.clear();
const watchHazard = assessRemoteWeatherHazard(baseHazardInput({
  remotenessScore: 65,
  signalLossMiles: 10,
  weatherRisk: 0.2,
}));
assert.strictEqual(watchHazard.severity, 'watch');
result = publishHazard(watchHazard, { routeId: 'route-escalation', segmentId: 'segment-signal', createdAt: 20_000_000 });
assert.strictEqual(result.emitted, true);
const warningHazard = assessRemoteWeatherHazard(baseHazardInput({
  remotenessScore: 66,
  signalLossMiles: 25,
  weatherRisk: 0.5,
}));
assert.strictEqual(warningHazard.severity, 'warning');
result = publishHazard(warningHazard, {
  routeId: 'route-escalation',
  segmentId: 'segment-signal',
  createdAt: 20_000_000 + 30_000,
});
assert.strictEqual(result.emitted, true);
assert.strictEqual(result.reason, 'severity_escalation');
assert.strictEqual(briefCadLogStore.getEntries().length, 2, 'Severity escalation should appear immediately.');

// 5. Offline cache missing + remote segment emits offline readiness warning.
resetRemoteWeatherBriefPublisherForTests();
briefCadLogStore.clear();
hazard = assessRemoteWeatherHazard(baseHazardInput({
  remotenessScore: 60,
  cacheReady: false,
  routeConfidence: 65,
}));
assert.strictEqual(hazard.shouldEmit, true);
assert.strictEqual(hazard.severity, 'warning');
assert.strictEqual(hazard.type, 'offline_readiness_gap');
result = publishHazard(hazard, { routeId: 'route-cache-gap', segmentId: 'segment-cache', createdAt: 30_000_000 });
assert.strictEqual(result.emitted, true);
assert.strictEqual(result.event.title, 'OFFLINE READINESS GAP');

// 6. Route end cleanup stops future emissions.
assertIncludes(
  watcherSource,
  'const resetRouteState = () => {\n      clearRouteInterval();',
  'Route-end cleanup should clear the active cadence timer.',
);
assertIncludes(
  watcherSource,
  'clearTimeout(pendingEvaluationRef.current)',
  'Route-end cleanup should clear pending evaluations.',
);
assertIncludes(
  watcherSource,
  'unsubscribeRoute();',
  'Watcher should unsubscribe from route state on unmount.',
);
assertIncludes(
  watcherSource,
  'unsubscribeWeather();',
  'Watcher should unsubscribe from weather state on unmount.',
);

// 7. Existing ECS Brief normal advisories still render and record normally.
resetRemoteWeatherBriefPublisherForTests();
briefCadLogStore.clear();
recordBriefCadEntry({
  id: 'normal-dashboard-advisory',
  text: 'Existing ECS advisory remains readable.',
  mode: 'advisory',
  priority: 4,
  queuedAt: 40_000_000,
  source: 'dashboard_advisory',
});
const normalEntries = briefCadLogStore.getEntries();
assert.strictEqual(normalEntries.length, 1);
assert.strictEqual(normalEntries[0].source, 'dashboard_advisory');
assert.strictEqual(normalEntries[0].message, 'Existing ECS advisory remains readable.');
assertIncludes(cadLogSource, '{isRemoteWeather ? (', 'CAD log should branch remote/weather rendering.');
assertIncludes(cadLogSource, ') : (\n                  <>', 'CAD log should retain the existing normal-entry rendering branch.');
assertIncludes(cadLogSource, 'LAT {formatCoordinate(entry.latitude)}', 'Normal CAD rows should still render existing coordinate metadata.');

// 8. Dashboard has no duplicate overlays or floating banners.
for (const source of [watcherSource, dashboardSource, navigateSource, cadLogSource]) {
  assertNotIncludes(source, 'RemoteWeatherOverlay', 'Predictive advisories should not create a remote/weather overlay.');
  assertNotIncludes(source, 'RemoteWeatherBanner', 'Predictive advisories should not create a remote/weather banner.');
  assertNotIncludes(source, 'PredictiveHazardOverlay', 'Predictive advisories should not create a predictive hazard overlay.');
  assertNotIncludes(source, 'PredictiveHazardBanner', 'Predictive advisories should not create a predictive hazard banner.');
}
assertIncludes(
  dashboardSource,
  '<CommandBriefScreen embedded />',
  'Dashboard should keep the embedded ECS Brief screen as the detailed source of truth.',
);
assertIncludes(
  packageSource,
  '"test:predictive-advisory-regression": "node ./scripts/test-predictive-advisory-regression.js"',
  'package.json should expose the predictive advisory regression smoke test.',
);

console.log('Predictive advisory regression checks passed.');
