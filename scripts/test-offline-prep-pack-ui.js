/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function includes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} missing expected contract: ${needle}`);
}

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1;
}

const screen = read('app/explore-offline-prep-pack.tsx');
const rootLayout = read('app/_layout.tsx');
const planningTabs = read('components/discover/ExplorePlanningTabs.tsx');
const registry = read('lib/explore/exploreFeatureRegistry.ts');
const tripBuilder = read('app/explore-trip-builder.tsx');
const discover = read('app/(tabs)/discover.tsx');
const ecsButton = read('components/ECSButton.tsx');

// Canonical mounted route contract. These checks intentionally avoid local handler,
// state-variable, import-order, and copy spellings.
includes(rootLayout, 'name="explore-offline-prep-pack"', 'Root Offline Prep route registration');
includes(registry, "route: '/explore-offline-prep-pack'", 'Explore feature registry route');
includes(planningTabs, "offline_prep_pack: '/explore-offline-prep-pack'", 'Explore planning-tab route');
includes(screen, 'export default function ExploreOfflinePrepPackScreen()', 'Mounted Offline Prep component');
includes(screen, 'activeTab="offline_prep_pack"', 'Mounted active Explore planning tab');
includes(tripBuilder, "pushSingleFlight('/explore-offline-prep-pack')", 'Trip Builder handoff route');
includes(discover, "pathname: '/explore-offline-prep-pack'", 'Explore handoff route');

// Compact overview and persistent action-dock contract. Detailed assets remain
// available through progressive disclosure instead of pushing actions below them.
[
  'offline-prep-pack-screen',
  'offline-prep-content-list',
  'offline-prep-manifest',
  'offline-prep-navigation-overview',
  'offline-prep-details-toggle',
  'offline-prep-action-dock',
  'offline-prep-prepare',
  'offline-prep-printable-manifest',
  'offline-prep-map-queue-state',
  'offline-prep-failed-state',
].forEach((testId) => {
  assert.strictEqual(
    occurrenceCount(screen, `testID="${testId}"`),
    1,
    `${testId} should identify exactly one mounted surface.`,
  );
});

const listPosition = screen.indexOf('testID="offline-prep-content-list"');
const dockPosition = screen.indexOf('testID="offline-prep-action-dock"');
assert.ok(listPosition >= 0 && dockPosition > listPosition, 'The action dock must mount outside and after the virtualized details list.');
assert.ok(!screen.includes("type: 'manifest_prepare'"), 'Prepare must not return to a deeply-scrolled manifest row.');
assert.ok(!screen.includes("type: 'manifest_export'"), 'Share/print must not return to a deeply-scrolled manifest row.');
assert.match(
  screen,
  /if \(detailsVisible\) \{[\s\S]{0,500}manifest\.items\.forEach/,
  'Individual manifest rows should render only after the operator expands pack details.',
);
includes(screen, 'testID={`offline-prep-group-${group.id}`}', 'Compact asset groups');
includes(screen, 'testID="offline-prep-required-attention"', 'Required-attention summary');
includes(screen, 'Print / Share Emergency Manifest', 'Family emergency manifest action');
assert.ok(!screen.includes('Export GPX'), 'The compact pack must not add a redundant GPX action.');
assert.ok(!screen.includes('Save Trip Sheet'), 'The compact pack must not add a redundant trip-sheet action.');

// Failures must win over normal empty state and remain visible even while a manifest
// exists. This is a narrow static contract because the repository has no mounted
// React Native component-test renderer.
const failedLoadPosition = screen.indexOf('if (error && routes.length === 0)');
const normalEmptyPosition = screen.indexOf('if (routes.length === 0)');
assert.ok(
  failedLoadPosition >= 0 && normalEmptyPosition > failedLoadPosition,
  'Route hydration failure must render as failure rather than an empty route list.',
);
includes(screen, "if (error) rows.push({ type: 'error' });", 'Manifest action failure row');
includes(screen, 'label={selectedInput ? \'Retry Status\' : \'Retry Loading\'}', 'Visible failure retry');

// Accessibility and terminal feedback contract.
includes(screen, 'accessibilityRole="progressbar"', 'Required-asset progress semantics');
includes(screen, 'accessibilityLabel="Required offline navigation assets"', 'Required-asset progress label');
includes(screen, 'accessibilityValue={{ min: 0, max: 100, now: requiredPercent', 'Required-asset progress value');
includes(screen, 'accessibilityState={{ expanded: detailsVisible }}', 'Details disclosure state');
includes(screen, 'accessibilityLabel="Print or share family emergency trip manifest"', 'Family manifest accessibility label');
includes(screen, 'routeCoordinates: getOfflinePrepPackRouteCoordinates(selectedInput)', 'Canonical route coordinates passed to family manifest');
includes(screen, 'readiness: selectedInput.readiness ?? selectedInput.tripPlan?.readinessReference ?? null', 'Route-linked readiness passed to family manifest');
includes(screen, 'offlinePresentation: packPresentation', 'Offline presentation remains distinct from route readiness');
includes(screen, '<ECSOperationalAnnouncer event={packStateAnnouncement} />', 'Terminal pack-state announcement');
includes(screen, 'performOfflinePackPreparation = async (context: OfflinePrepActionContext)', 'Mounted action lifecycle context');
includes(screen, 'mountedRef.current && context.isCurrent() && !context.signal.aborted', 'Stale action presentation guard');
includes(screen, 'prepareActionLifecycleRef.current = createOfflinePrepActionLifecycle<void>()', 'Strict-mode-safe action lifecycle setup');
includes(ecsButton, 'busy: loading', 'Shared ECS button busy state');
includes(ecsButton, 'disabled: isDisabled', 'Shared ECS button disabled state');
includes(ecsButton, 'Math.ceil((44 - height) / 2)', 'Shared ECS button minimum touch target');

// Behavior-level presentation checks exercise the model actually consumed by the
// overview and action dock, rather than checking implementation source spellings.
const { buildOfflineReadinessManifest } = require(path.join(
  root,
  'lib',
  'offlinePrepPack',
  'offlineReadinessManifest.ts',
));
const { buildOfflinePrepPackPresentation } = require(path.join(
  root,
  'lib',
  'offlinePrepPack',
  'offlinePrepPackPresentation.ts',
));

const generatedAt = '2026-07-17T12:00:00.000Z';

function item(type, overrides = {}) {
  return {
    id: `ui-${type}`,
    type,
    label: String(type).replace(/_/g, ' '),
    status: 'ready',
    availability: 'available',
    required: false,
    source: 'deterministic_ui_fixture',
    summary: `${type} fixture.`,
    count: null,
    estimatedSizeMB: null,
    cacheKey: null,
    error: null,
    metadata: null,
    ...overrides,
  };
}

function fixtureItems() {
  return [
    item('offline_map', {
      status: 'not_started',
      availability: 'pending_download',
      required: true,
      estimatedSizeMB: 36,
    }),
    item('route_line', { required: true, count: 24 }),
    item('road_turn_guidance', { required: true, count: 7 }),
    item('trip_itinerary', { required: true, count: 4 }),
    item('weather_snapshot', {
      status: 'unavailable',
      availability: 'not_set',
      summary: 'Optional weather snapshot is not included.',
    }),
  ];
}

function fixtureManifest(items) {
  const readinessManifest = buildOfflineReadinessManifest({
    packageId: 'ui-pack',
    routeId: 'ui-route',
    generatedAt,
    items,
  });
  return {
    schemaVersion: 1,
    id: 'ui-pack',
    generatedAt,
    routeId: 'ui-route',
    routeName: 'UI Fixture Route',
    routeBounds: null,
    items,
    progress: {
      status: 'partially_ready',
      totalItems: items.length,
      readyItems: items.filter((entry) => entry.status === 'ready').length,
      unavailableItems: items.filter((entry) => entry.status === 'unavailable').length,
      failedItems: items.filter((entry) => entry.status === 'failed').length,
      percent: 60,
    },
    errors: items.map((entry) => entry.error).filter(Boolean),
    tripPlanId: 'ui-trip-plan',
    routeAssetId: 'ui-route-asset',
    lifecycle: { phase: 'offline_ready', identity: {}, provenance: {} },
    readinessManifest,
  };
}

function queue(status, overrides = {}) {
  const downloading = status === 'downloading';
  return {
    status,
    label: status === 'complete' ? 'MAP READY' : `MAP ${status.toUpperCase()}`,
    message: downloading ? 'Route tiles are downloading.' : `Map state: ${status}.`,
    regionId: 'ui-region',
    jobId: 'ui-job',
    percent: status === 'complete' ? 100 : downloading ? 45 : 0,
    totalTiles: 100,
    downloadedTiles: status === 'complete' ? 100 : downloading ? 45 : 0,
    failedTiles: status === 'failed' ? 1 : 0,
    estimatedSizeMB: 36,
    downloadedSizeMB: status === 'complete' ? 36 : downloading ? 16 : 0,
    errorMessage: status === 'failed' ? 'Offline tile preparation failed.' : null,
    retryable: status === 'failed' || status === 'cancelled',
    active: status === 'queued' || downloading,
    source: 'sync_job',
    updatedAt: generatedAt,
    ...overrides,
  };
}

const manifest = fixtureManifest(fixtureItems());
const needsDownload = buildOfflinePrepPackPresentation({
  manifest,
  mapQueueState: queue('not_requested'),
  now: generatedAt,
});
assert.strictEqual(needsDownload.kind, 'needs_download');
assert.strictEqual(needsDownload.primaryActionLabel, 'Download Offline Pack');
assert.strictEqual(needsDownload.primaryActionEnabled, true);
assert.strictEqual(needsDownload.groups.length, 4, 'Overview should consolidate items into four readable groups.');
assert.strictEqual(
  needsDownload.groups.reduce((total, group) => total + group.items.length, 0),
  manifest.items.length,
  'Every asset must remain reachable through one overview group.',
);

const preparing = buildOfflinePrepPackPresentation({
  manifest,
  mapQueueState: queue('downloading'),
  now: generatedAt,
});
assert.strictEqual(preparing.kind, 'preparing');
assert.strictEqual(preparing.primaryActionEnabled, false, 'Download action must be busy/disabled while the shared queue runs.');

const ready = buildOfflinePrepPackPresentation({
  manifest,
  mapQueueState: queue('complete'),
  now: generatedAt,
});
assert.strictEqual(ready.kind, 'ready', 'An optional missing snapshot must not conceal required offline readiness.');
assert.strictEqual(ready.navigationReady, true);
assert.strictEqual(ready.mapReady, true);
assert.strictEqual(ready.turnGuidanceState, 'ready');
assert.strictEqual(ready.optionalGapCount, 1);
assert.match(ready.summary, /optional item is not included/i);

const failed = buildOfflinePrepPackPresentation({
  manifest,
  mapQueueState: queue('failed'),
  now: generatedAt,
});
assert.strictEqual(failed.kind, 'error');
assert.strictEqual(failed.primaryActionLabel, 'Retry Offline Preparation');
assert.strictEqual(failed.primaryActionEnabled, true);
assert.match(failed.summary, /failed/i);

console.log('Offline Prep Pack mounted overview/action-dock contract tests passed.');
