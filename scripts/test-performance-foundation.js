const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
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
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const { ECS_PERFORMANCE_BUDGETS, ECS_PERFORMANCE_WORKFLOW_IDS } = require(path.join(root, 'lib', 'performance', 'performanceBudgets.ts'));
const { ECSPerformanceCollector } = require(path.join(root, 'lib', 'performance', 'ecsPerformanceDiagnostics.ts'));
const { buildECSPerformanceReport } = require(path.join(root, 'lib', 'performance', 'performanceReport.ts'));
const startupDiagnostics = require(path.join(root, 'lib', 'startupDiagnostics.ts'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'config', 'performance-baseline.json'), 'utf8'));

assert.strictEqual(ECS_PERFORMANCE_WORKFLOW_IDS.length, 15, 'All requested representative workflows must be budgeted.');
assert.deepStrictEqual(
  baseline.workflows.map(entry => entry.workflowId).sort(),
  [...ECS_PERFORMANCE_WORKFLOW_IDS].sort(),
  'Baseline coverage must match the typed budget registry.',
);
ECS_PERFORMANCE_WORKFLOW_IDS.forEach(workflowId => {
  const budget = ECS_PERFORMANCE_BUDGETS[workflowId];
  assert(budget.targetMs > 0 && budget.hardLimitMs >= budget.targetMs, `${workflowId} must have a valid absolute budget.`);
  assert(budget.primaryOperation.length > 0, `${workflowId} must identify its primary gated operation.`);
  assert(budget.maxRelativeRegressionPct > 0, `${workflowId} must have a relative no-regression budget.`);
});

const disabledCollector = new ECSPerformanceCollector({ enabled: false, now: () => 0 });
disabledCollector.startSpan('cold_startup_shell', 'startup_to_usable_shell').end();
assert.strictEqual(disabledCollector.snapshot().spans.length, 0, 'Disabled/production collection must be a no-op.');

for (let index = 0; index < 100; index += 1) {
  startupDiagnostics.markStartupPhase('setup_status_known', { iteration: index });
}
assert.strictEqual(startupDiagnostics.getStartupDiagnosticsSnapshot().transitions.length, 80, 'Startup history must remain bounded.');

let now = 100;
const collector = new ECSPerformanceCollector({
  enabled: true,
  now: () => now,
  maxSpans: 20,
  longTaskThresholdMs: 50,
});

const startup = collector.startSpan('cold_startup_shell', 'startup', {
  trackOutstanding: true,
  metadata: { routeKind: 'main', token: 'must-not-leak', latitude: 1 },
});
now += 450;
startup.end('completed', { sourceState: 'cached' });
let snapshot = collector.snapshot();
assert.strictEqual(snapshot.spans[0].durationMs, 450);
assert.strictEqual(snapshot.outstandingAsyncJobs, 0);
assert.strictEqual(snapshot.peakOutstandingAsyncJobs, 1);
assert.strictEqual(snapshot.spans[0].metadata.routeKind, 'main');
assert.strictEqual(snapshot.spans[0].metadata.token, undefined, 'Sensitive metadata keys must be removed.');
assert.strictEqual(snapshot.spans[0].metadata.latitude, undefined, 'Coordinates must be removed.');

const weather = collector.startRequest('weather_refresh', 'operational_weather_provider', 'private-coordinate-key');
const joined = collector.startRequest('weather_refresh', 'operational_weather_provider', 'private-coordinate-key');
assert.strictEqual(joined.joined, true, 'Duplicate in-flight requests must be observed as joins.');
now += 125;
weather.end();

const releaseOne = collector.registerSubscription('dispatch_ready', 'realtime', 'expedition-private-id');
const releaseTwo = collector.registerSubscription('dispatch_ready', 'realtime', 'expedition-private-id');
releaseTwo();
releaseOne();

collector.measureSync('offline_prep_departure_audit', 'departure_audit', () => {
  now += 60;
  return true;
});
const offlinePrep = collector.startSpan('offline_prep_departure_audit', 'package_read_to_manifest_ready');
now += 30;
offlinePrep.end();

snapshot = collector.snapshot();
assert(!JSON.stringify(snapshot).includes('private-coordinate-key'), 'Internal request identities must not appear in snapshots.');
assert(!JSON.stringify(snapshot).includes('expedition-private-id'), 'Subscription identities must not appear in snapshots.');
assert(snapshot.counters.some(entry => entry.workflowId === 'weather_refresh' && entry.counter === 'repeated_requests' && entry.value === 1));
assert(snapshot.counters.some(entry => entry.workflowId === 'dispatch_ready' && entry.counter === 'duplicate_subscriptions' && entry.value === 1));
assert(snapshot.counters.some(entry => entry.workflowId === 'offline_prep_departure_audit' && entry.counter === 'long_sync_tasks' && entry.value === 1));
assert.strictEqual(snapshot.activeSubscriptionCount, 0);

const passingReport = buildECSPerformanceReport(snapshot, baseline);
assert.strictEqual(passingReport.workflowCount, 15);
assert(passingReport.measuredWorkflowCount >= 3);

const regressionSnapshot = {
  ...snapshot,
  spans: Array.from({ length: 10 }, (_, index) => ({
    id: 1_000 + index,
    workflowId: 'primary_tab_switch',
    operation: 'command_dock_navigation',
    startedAtMs: index * 2_000,
    endedAtMs: index * 2_000 + 1_500,
    durationMs: 1_500,
    status: 'completed',
  })),
  counters: [],
  peakOutstandingAsyncJobs: 0,
};
const baselineWithTab = {
  ...baseline,
  workflows: baseline.workflows.map(entry => entry.workflowId === 'primary_tab_switch'
    ? { ...entry, p95Ms: 600, sampleCount: 10, evidence: 'measured' }
    : entry),
};
const failedReport = buildECSPerformanceReport(regressionSnapshot, baselineWithTab);
const tabResult = failedReport.workflows.find(entry => entry.workflowId === 'primary_tab_switch');
assert.strictEqual(tabResult.status, 'failed');
assert(tabResult.reasons.some(reason => reason.includes('hard limit')));
assert(tabResult.reasons.some(reason => reason.includes('Relative regression')));

const callsiteExpectations = [
  ['lib/startupDiagnostics.ts', ['cold_startup_shell', 'warm_startup_restore', 'auth_setup_handoff']],
  ['components/CommandDock.tsx', ['primary_tab_switch']],
  ['components/navigate/MapRenderer.tsx', ['navigate_map_first_meaningful_render', 'navigate_map_viewport_interaction']],
  ['app/(tabs)/navigate.tsx', ['gpx_import_preview', 'route_preview_guidance']],
  ['app/(tabs)/dashboard.tsx', ['dashboard_stable_grid']],
  ['app/(tabs)/discover.tsx', ['explore_results']],
  ['components/dispatch/DispatchCadCommandCenter.tsx', ['dispatch_ready']],
  ['app/explore-offline-prep-pack.tsx', ['offline_prep_departure_audit']],
  ['lib/readiness/expeditionReadinessScoring.ts', ['offline_prep_departure_audit']],
  ['lib/vehicleSetupStore.ts', ['active_vehicle_propagation']],
  ['lib/useOperationalWeather.ts', ['weather_refresh']],
  ['lib/useUnifiedDeviceConnections.ts', ['device_reconnect']],
];
callsiteExpectations.forEach(([relativePath, workflowIds]) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  workflowIds.forEach(workflowId => assert(source.includes(workflowId), `${relativePath} must instrument ${workflowId}.`));
});

console.log('ECS performance foundation checks passed.');
