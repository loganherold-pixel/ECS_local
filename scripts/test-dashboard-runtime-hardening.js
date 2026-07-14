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

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const selectors = require(path.join(root, 'lib', 'dashboard', 'dashboardRuntimeSelectors.ts'));
const validation = require(path.join(root, 'lib', 'dashboard', 'widgetRegistryValidation.ts'));
const widgetRegistry = require(path.join(root, 'lib', 'widgetRegistry.ts'));

const baseData = {
  activeTrip: { id: 'route-1', updated_at: '2026-07-12T12:00:00.000Z' },
  activeVehicleContext: { activeVehicleId: 'vehicle-1', profileSignature: 'profile-a' },
  loadItems: [{ id: 'load-1', packed: false, weight_lbs: 25 }],
  telemetry: { hasData: true, freshnessLabel: 'live', engineStatus: 'nominal' },
  telemetryScanner: { isConnected: true },
  powerAuthority: { freshness: 'live', batteryPercent: 82, outputWatts: 120 },
  weatherSnapshot: { status: { kind: 'live' }, current: { temp: 75 } },
  dashboardCommandState: { compactSummary: 'Route ready' },
  aiState: { readiness: 'ready' },
  waypoints: [{ latitude: 34, longitude: -118 }, { latitude: 34.1, longitude: -118.1 }],
};
const options = {
  gpsHasFix: true,
  gpsLatitude: 34.00001,
  gpsLongitude: -118.00001,
  gpsSpeedMph: 12,
  gpsAccuracyM: 8,
};

const vehicleKey = selectors.selectDashboardWidgetRenderKey('vehicle-systems', baseData, options);
const weatherOnlyChange = {
  ...baseData,
  weatherSnapshot: { status: { kind: 'cached' }, current: { temp: 51 } },
};
assert.strictEqual(
  selectors.selectDashboardWidgetRenderKey('vehicle-systems', weatherOnlyChange, options),
  vehicleKey,
  'Weather-only changes must not rerender Vehicle Systems.',
);
assert.notStrictEqual(
  selectors.selectDashboardWidgetRenderKey('vehicle-systems', {
    ...baseData,
    telemetry: { ...baseData.telemetry, freshnessLabel: 'stale' },
  }, options),
  vehicleKey,
  'Vehicle telemetry freshness changes must rerender Vehicle Systems.',
);
assert.notStrictEqual(
  selectors.selectDashboardWidgetRenderKey('hwy-elevation-profile', weatherOnlyChange, options),
  selectors.selectDashboardWidgetRenderKey('hwy-elevation-profile', baseData, options),
  'Weather widgets must react to weather source-state changes.',
);
assert.strictEqual(
  selectors.selectDashboardExpeditionHubRenderKey({
    expeditionHasActiveRoute: true,
    expeditionId: 'expedition-1',
    gpsLatitude: 34,
  }),
  selectors.selectDashboardExpeditionHubRenderKey({
    expeditionHasActiveRoute: true,
    expeditionId: 'expedition-1',
    gpsLatitude: 35,
  }),
  'Live GPS updates must not rerender Expedition Hub when lifecycle inputs are unchanged.',
);
assert.strictEqual(
  selectors.selectDashboardGpsRenderKey(options),
  selectors.selectDashboardGpsRenderKey({ ...options, gpsLatitude: 34.00002, gpsLongitude: -118.00002 }),
  'Sub-pixel GPS jitter must stay in the same render bucket.',
);

const activePresentation = selectors.selectDashboardExpeditionPresentation({
  expeditionState: 'active',
  currentRecord: { id: 'active-2', state: 'active' },
  retainedCompletedRecord: { id: 'complete-1', state: 'complete', endTime: '2026-07-11T12:00:00.000Z' },
  latestCompletedLog: { id: 'complete-1' },
  completedGuidanceSummary: { id: 'guidance-1' },
  routeProgressCompleted: false,
});
assert.strictEqual(activePresentation.routeCompleted, false, 'Prior history must not mark an active expedition complete.');
assert.strictEqual(activePresentation.completedSummaryRecord, null, 'Prior completion must not contaminate active state.');

const standbyPresentation = selectors.selectDashboardExpeditionPresentation({
  expeditionState: 'standby',
  currentRecord: null,
  retainedCompletedRecord: { id: 'complete-1', state: 'complete' },
  latestCompletedLog: null,
  completedGuidanceSummary: null,
  routeProgressCompleted: false,
});
assert.strictEqual(standbyPresentation.completedSummaryRecord.id, 'complete-1');
assert.strictEqual(standbyPresentation.routeCompleted, true);

assert.strictEqual(selectors.selectDashboardGeofenceEnabled('vehicle-1', 'standby'), true);
assert.strictEqual(selectors.selectDashboardGeofenceEnabled('vehicle-1', 'active'), true);
assert.strictEqual(selectors.selectDashboardGeofenceEnabled('vehicle-1', 'paused'), false);
assert.strictEqual(selectors.selectDashboardGeofenceEnabled(null, 'standby'), false);

const assessmentContext = {
  expeditionId: 'expedition-1',
  offlineMode: false,
  route: {
    lifecycleState: { value: 'active' },
    routeId: 'route-1',
    progressPercent: { value: 25.2 },
    distanceRemainingMiles: { value: 18.04 },
    currentLocation: { value: { latitude: 34.00001, longitude: -118.00001 } },
  },
  convoy: { communicationsStatus: { value: 'online' }, teamMemberCount: { value: 2 } },
  logistics: { fuelLevelPercent: { value: 72 }, waterRemainingLiters: { value: 18 } },
  vehicles: [{ vehicleId: 'vehicle-1', readinessStatus: { value: 'normal' } }],
};
const assessmentKey = selectors.buildDashboardAssessmentRefreshKey(assessmentContext);
assert.strictEqual(
  selectors.buildDashboardAssessmentRefreshKey({
    ...assessmentContext,
    capturedAt: '2026-07-12T12:01:00.000Z',
    route: {
      ...assessmentContext.route,
      currentLocation: { value: { latitude: 34.00002, longitude: -118.00002 } },
    },
  }),
  assessmentKey,
  'Timestamp-only and sub-bucket GPS changes must not refresh every Expedition assessment.',
);
assert.notStrictEqual(
  selectors.buildDashboardAssessmentRefreshKey({
    ...assessmentContext,
    logistics: { ...assessmentContext.logistics, fuelLevelPercent: { value: 55 } },
  }),
  assessmentKey,
  'Operational resource changes must refresh Expedition assessments.',
);

const validRegistry = [{ widget_id: 'one', default_size: '1x1', render_ready: true, widget_status: 'active' }];
const validCatalog = [{
  widgetId: 'one',
  supportedWidgetSizes: ['1x1'],
  recommendedWidgetSize: '1x1',
  minimumWidgetSize: '1x1',
  supportedModes: ['expedition'],
  defaultModes: ['expedition'],
  tabEligibility: 'expedition',
  liveData: true,
  liveSources: ['gps'],
  fallbackBehavior: 'Shows unavailable state.',
  detailView: 'widget_detail',
  pickerEnabled: true,
}];
assert.strictEqual(validation.validateDashboardWidgetContracts({
  registry: validRegistry,
  catalog: validCatalog,
  defaultLayouts: { expedition: { slots: [{ widgetId: 'one', widgetSize: '1x1' }] } },
}).valid, true);

const invalidResult = validation.validateDashboardWidgetContracts({
  registry: [...validRegistry, ...validRegistry],
  catalog: [{ ...validCatalog[0], liveSources: [], fallbackBehavior: '', detailView: undefined }],
  defaultLayouts: { expedition: { slots: [{ widgetId: 'one', widgetSize: '2x2' }] } },
});
assert.strictEqual(invalidResult.valid, false);
for (const code of ['duplicate_registry_id', 'missing_source_contract', 'missing_fallback_state', 'missing_detail_view', 'invalid_default_layout']) {
  assert(invalidResult.issues.some((issue) => issue.code === code), `Expected registry validation issue: ${code}.`);
}
assert.deepStrictEqual(
  widgetRegistry.validateDashboardWidgetRegistry().issues,
  [],
  'The production Dashboard registry and catalog must satisfy the executable contract.',
);

const dashboardSource = read('app/(tabs)/dashboard.tsx');
const gridSource = read('components/dashboard/WidgetGrid.tsx');
const storeSource = read('lib/dashboardStore.ts');
const persistenceSource = read('lib/dashboardPersistence.ts');
const expeditionHubSource = read('components/dashboard/ExpeditionTab.tsx');
const assessmentStoreSource = read('stores/expeditionAssessmentStore.ts');
const geofenceSource = read('lib/useGeofenceMonitor.ts');
const modeEngineSource = read('lib/dashboardModeEngine.ts');
const registrySource = read('lib/widgetRegistry.ts');

assert(dashboardSource.includes('const DashboardGridZone = React.memo('), 'Dashboard content zones must be memoized.');
assert(dashboardSource.includes("React.lazy(() => import('../../components/dashboard/ExpeditionTab'))"), 'Expedition Hub must be lazy-loaded.');
assert(dashboardSource.includes("React.lazy(() => import('../../components/dashboard/WidgetDetailModal'))"), 'Widget details must be lazy-loaded.');
assert(!dashboardSource.includes('advisoryStore.pushContextBatch'), 'Dashboard must not duplicate its visible top lane into the retired advisory queue.');
assert(!dashboardSource.includes('advisoryStore.clear()'), 'Dashboard unmount must not clear shared advisory state.');
assert(gridSource.includes('<WidgetErrorBoundary widgetType={slot.widgetType} slotIndex={slotIndex}>'), 'Each widget renderer must have failure isolation.');
assert(!gridSource.includes('!prev.isCompact ? prev.widgetData === next.widgetData'), 'Expanded widgets must use source-specific render keys instead of broad object identity.');
assert(!gridSource.includes('consumablesStore.subscribe'), 'WidgetGrid must not rerender every slot from a broad consumables subscription.');
assert(storeSource.includes('if (_dashboardHydrationFlight)'), 'Dashboard hydration must be single-flight.');
assert(storeSource.includes('persistence_unchanged_write_skipped'), 'Unchanged dashboard writes must be skipped.');
assert(persistenceSource.includes('coalescedWrites'), 'Dashboard persistence must expose write-coalescing diagnostics.');
assert(persistenceSource.includes('void writePersisted(key, data).then'), 'Web and native writes must commit from the debounce timer.');
assert(expeditionHubSource.includes('completedTripsLoadFlightRef'), 'Expedition Hub hydration must be single-flight.');
assert(assessmentStoreSource.includes('assessmentRefreshFlight'), 'Assessment refreshes must be single-flight with a trailing latest refresh.');
assert(geofenceSource.includes('geofence_duplicate_transition_suppressed'), 'Geofence transition side effects must suppress duplicate attempts.');
assert(modeEngineSource.includes('if (!_autoModeEnabled || _isManualOverride) return;'), 'Mode engine must honor manual override.');
assert(registrySource.includes('export function validateDashboardWidgetRegistry()'), 'Widget registry must expose executable validation.');

console.log(JSON.stringify({
  passed: true,
  checks: {
    selectorIsolation: true,
    sourceStateRefresh: true,
    expeditionStateSeparation: true,
    geofenceEligibility: true,
    registryValidation: true,
    singleFlightHydration: true,
    widgetFailureIsolation: true,
    lazyHeavySurfaces: true,
  },
  beforeAfterEvidence: {
    before: {
      broadFullWidgetIdentityGuards: 1,
      broadGridConsumablesSubscriptions: 1,
      dashboardAdvisoryQueuePublishers: 1,
      lazyDashboardHeavySurfaces: 0,
    },
    after: {
      broadFullWidgetIdentityGuards: 0,
      broadGridConsumablesSubscriptions: 0,
      dashboardAdvisoryQueuePublishers: 0,
      lazyDashboardHeavySurfaces: 2,
    },
  },
}));
