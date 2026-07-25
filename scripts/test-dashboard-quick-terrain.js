const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    mod._compile(outputText, filename);
  } finally {
    Module._load = originalLoad;
  }
  return mod.exports;
}

const validation = loadTsModule('lib/dashboard/widgetRegistryValidation.ts');
const registry = loadTsModule('lib/widgetRegistry.ts', {
  './dashboard/widgetRegistryValidation': validation,
  './telemetryStateEngine': {
    evaluateTelemetryState: () => ({ availability: 'available' }),
    getPlaceholderContent: () => null,
    hasTelemetryDependency: () => false,
  },
  './ecsWidgetBridge': {
    WIDGET_CHANNEL_MAP: {},
    getWidgetFreshness: () => 'fresh',
  },
});
const noOp = () => {};
const dashboardStore = loadTsModule('lib/dashboardStore.ts', {
  './customWidgetStore': { customWidgetStore: { getAll: () => [] } },
  './ecsIssueIntelligence': { reportDataIntegrityFailure: noOp, reportRecoverableFailure: noOp },
  './ecsLogger': { ecsLog: { debug: noOp, warn: noOp } },
  './performance/ecsPerformanceDiagnostics': { incrementECSPerformanceCounter: noOp },
  './widgetRegistry': registry,
  './syncActionQueue': { queueDashboardAction: noOp },
  './dashboardPersistence': {
    readDashboardState: async () => null,
    writeDashboardState: async () => {},
    readCustomPresets: async () => null,
    writeCustomPresets: async () => {},
    markHydrated: noOp,
    isHydrated: () => true,
    waitForHydration: async () => {},
    flushPendingWrites: async () => {},
  },
});

const defaults = registry.getDefaultDashboardLayout('expedition');
assert.strictEqual(defaults.gridLayout, '2x2');
assert.deepStrictEqual(
  defaults.slots.map((slot) => slot.widgetId),
  ['attitude-monitor', 'terrain-risk', 'vehicle-systems'],
  'Quick Terrain must occupy the lower-left default slot after the full-width top row.',
);
assert.strictEqual(defaults.slots[1].widgetSize, '1x1');
assert(registry.getDashboardCatalogEntries('expedition').some((entry) => entry.widgetId === 'terrain-risk'));

for (const legacyId of ['quick-terrain', 'terrain-risk-widget', 'terrain-intelligence']) {
  const once = registry.getDashboardWidgetReplacement(legacyId);
  const twice = registry.getDashboardWidgetReplacement(once);
  assert.strictEqual(once, 'terrain-risk');
  assert.strictEqual(twice, 'terrain-risk', 'Legacy Terrain migration must be idempotent.');
}

const customSlots = [
  { slotIndex: 0, widgetType: 'vehicle-systems', widgetSize: '1x1', settings: { custom: true } },
  { slotIndex: 1, widgetType: 'terrain-risk', widgetSize: '1x1', settings: { source: 'user' } },
  { slotIndex: 2, widgetType: null, widgetSize: '2x1', settings: {} },
  { slotIndex: 3, widgetType: null, widgetSize: '2x1', settings: {} },
];
const persisted = {
  schemaVersion: 3,
  activeProfile: 'expedition',
  dashboardMode: 'expedition',
  profiles: {
    expedition: {
      profile: 'expedition',
      gridLayout: '2x2',
      slots: customSlots,
      layoutVersion: 2,
      gridColumns: 2,
      lastUIState: { customized: true },
    },
  },
};
const migrated = dashboardStore.validateAndMigrateDashboardState(persisted);
assert(migrated);
assert.strictEqual(migrated.profiles.expedition.slots[0].widgetType, 'vehicle-systems');
assert.strictEqual(migrated.profiles.expedition.slots[0].settings.custom, true);
assert.strictEqual(migrated.profiles.expedition.lastUIState.customized, true);
const migratedAgain = dashboardStore.validateAndMigrateDashboardState(migrated);
assert.deepStrictEqual(migratedAgain.profiles.expedition, migrated.profiles.expedition);

const newProfileState = dashboardStore.validateAndMigrateDashboardState({ profiles: {} });
assert.deepStrictEqual(
  newProfileState.profiles.expedition.slots.filter((slot) => slot.widgetType).map((slot) => slot.widgetType),
  ['attitude-monitor', 'terrain-risk', 'vehicle-systems'],
  'A new Expedition profile must receive the curated Quick Terrain default.',
);

const legacyPersisted = JSON.parse(JSON.stringify(persisted));
legacyPersisted.profiles.expedition.slots[1].widgetType = 'quick-terrain';
const legacyMigrated = dashboardStore.validateAndMigrateDashboardState(legacyPersisted);
assert.strictEqual(legacyMigrated.profiles.expedition.slots[1].widgetType, 'terrain-risk');

const rendererSource = fs.readFileSync(path.join(root, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const gridSource = fs.readFileSync(path.join(root, 'components/dashboard/WidgetGrid.tsx'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'app/(tabs)/dashboard.tsx'), 'utf8');

for (const expected of [
  'dashboard-quick-terrain-content',
  'dashboard-quick-terrain-profile',
  'NO ACTIVE ROUTE',
  'LOADING ANALYSIS',
  'PARTIAL ELEVATION PROFILE',
  'STALE CACHED PROFILE',
  'ELEVATION UNAVAILABLE',
  'TERRAIN ANALYSIS ERROR',
  'profileDensity: detailMode ? \'expanded\' : \'compact\'',
  'completedDistanceMiles={snapshot.currentProgressDistanceMiles}',
  'QUICK_TERRAIN_POSTURE_COLORS',
  'sourceState.toUpperCase()',
  'numberOfLines={1}',
]) {
  assert(rendererSource.includes(expected), `Quick Terrain renderer must include ${expected}.`);
}

assert(gridSource.includes('onLongPress={() => {'));
assert(gridSource.includes('longPressConsumedSlotRef'));
assert(dashboardSource.includes('onWidgetLongPress={onEnterCustomizeMode}'));
assert(dashboardSource.includes('setDetailVisible(true)'));
assert(rendererSource.includes("case 'terrain-risk': return <StandaloneTerrainRiskRuntimeWidget"));

console.log('[dashboard-quick-terrain] placement, migration, truth states, compact profile, and governance passed');
