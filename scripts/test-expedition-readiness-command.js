const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

const { normalizeExpeditionReadinessCommandData } = loadTsModule(
  'lib/navigation/expeditionReadinessCommandData.ts',
);

function freshness(label, source = 'live') {
  return {
    label,
    source,
    updatedAt: new Date().toISOString(),
    state: source === 'missing' ? 'missing' : source === 'cached' ? 'stale' : 'fresh',
    isStale: source === 'cached',
    isMissing: source === 'missing',
    isMock: false,
    isDemo: false,
    isInferred: source === 'inferred',
    detail: null,
  };
}

function category(id, overrides = {}) {
  return {
    id,
    label: id.replace(/_/g, ' '),
    score: 88,
    status: 'ready',
    confidence: 'high',
    summary: 'Nominal',
    factors: [
      {
        id: `${id}-factor`,
        label: 'Source',
        impact: 'positive',
        detail: 'Nominal source',
        source: 'live',
        confidence: 'high',
      },
    ],
    missingInputs: [],
    lastUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function assessment(overrides = {}) {
  const sourceFreshness = {
    route: freshness('Route'),
    weather: freshness('Weather'),
    fleet: freshness('Fleet'),
    offline: freshness('Offline cache'),
    camp: freshness('Camp'),
    power: freshness('Power'),
    fuel: freshness('Fuel'),
    recovery: freshness('Recovery'),
    communications: freshness('Comms'),
    daylight: freshness('Daylight'),
    telemetry: freshness('Telemetry'),
    currentLocation: freshness('Location'),
  };
  return {
    tripIntent: 'unknown',
    tripIntentSource: 'unknown',
    readinessProfile: 'unknown',
    calibration: {},
    readinessPreferences: {},
    preferenceEffects: [],
    overallScore: 84,
    status: 'ready',
    confidence: 'high',
    updatedAt: new Date().toISOString(),
    sourceFreshness,
    categories: [
      category('vehicle_fit'),
      category('route_risk'),
      category('weather_window'),
      category('daylight_margin'),
      category('power_runtime'),
      category('communications_signal_confidence'),
      category('recovery_bailout_access'),
      category('camp_legality_confidence'),
      category('offline_preparedness'),
    ],
    blockers: [],
    warnings: [],
    recommendations: ['Ready to continue'],
    departureAudit: [],
    recoveryBrief: {},
    powerBrief: {},
    explanation: 'Major ECS readiness systems are within current confidence margins.',
    dataIntegrity: {
      usesMockData: false,
      usesDemoData: false,
      usesInferredData: false,
      unmarkedSyntheticData: [],
    },
    ...overrides,
  };
}

const empty = normalizeExpeditionReadinessCommandData();
assert.strictEqual(empty.dataState, 'setupNeeded');
assert.strictEqual(empty.overallStatus, 'unknown');
assert.strictEqual(empty.primaryRecommendation, 'READINESS ASSESSMENT LIMITED');

const nominal = normalizeExpeditionReadinessCommandData({ assessment: assessment() });
assert.strictEqual(nominal.overallStatus, 'ready');
assert(['live', 'estimated'].includes(nominal.dataState));
assert.strictEqual(nominal.primaryRecommendation, 'READY TO CONTINUE');
assert(nominal.systems.find((system) => system.id === 'vehicle'));
assert(nominal.systems.find((system) => system.id === 'power'));
assert(nominal.systems.find((system) => system.id === 'incident'));
assert.strictEqual(nominal.systems.find((system) => system.id === 'incident').isEstimated, false);

const warning = normalizeExpeditionReadinessCommandData({
  assessment: assessment({
    overallScore: 66,
    status: 'caution',
    categories: [
      category('vehicle_fit'),
      category('route_risk'),
      category('daylight_margin', {
        score: 44,
        status: 'caution',
        summary: 'Low daylight margin',
      }),
      category('recovery_bailout_access', {
        score: 52,
        status: 'caution',
        summary: 'Remote recovery exposure',
      }),
    ],
    warnings: [
      {
        id: 'daylight-warning',
        categoryId: 'daylight_margin',
        label: 'Low daylight',
        detail: 'Daylight margin is limited.',
        severity: 'warning',
      },
    ],
    recommendations: ['Continue with caution'],
  }),
});
assert(['caution', 'notReady'].includes(warning.overallStatus));
assert.notStrictEqual(warning.primaryRecommendation, 'READY TO CONTINUE');
assert(warning.warnings.some((issue) => issue.systemId === 'daylight'));

const offline = normalizeExpeditionReadinessCommandData({
  assessment: assessment(),
  isOffline: true,
});
assert.strictEqual(offline.dataState, 'offline');
assert(offline.primaryRecommendation.includes('OFFLINE'));

const incident = normalizeExpeditionReadinessCommandData({
  assessment: assessment(),
  activeIncidentCount: 1,
  highestIncidentSeverity: 'critical',
});
assert.strictEqual(incident.overallStatus, 'notReady');
assert(incident.primaryRecommendation.includes('INCIDENT ACTIVE'));

const missingVehicle = normalizeExpeditionReadinessCommandData({
  assessment: assessment({
    categories: [
      category('vehicle_fit', {
        score: 0,
        status: 'hold',
        summary: 'Vehicle profile unavailable',
        missingInputs: ['fleet'],
      }),
      category('route_risk'),
    ],
    blockers: [
      {
        id: 'vehicle-blocker',
        categoryId: 'vehicle_fit',
        label: 'Vehicle setup required',
        detail: 'Add vehicle profile for better readiness scoring.',
        severity: 'blocker',
      },
    ],
  }),
});
assert.strictEqual(missingVehicle.overallStatus, 'notReady');
assert.strictEqual(missingVehicle.dataState, 'partial');
assert(missingVehicle.blockers.some((issue) => issue.systemId === 'vehicle'));

const missingGpsAndVehicle = normalizeExpeditionReadinessCommandData({
  assessment: assessment({
    categories: [
      category('vehicle_fit', {
        score: 0,
        status: 'hold',
        summary: 'Vehicle profile unavailable',
        missingInputs: ['Vehicle profile'],
      }),
      category('route_risk', {
        score: 0,
        status: 'hold',
        summary: 'Location unavailable',
        missingInputs: ['Current location', 'Weather', 'Daylight window', 'Power source'],
      }),
    ],
  }),
});
assert.strictEqual(missingGpsAndVehicle.dataState, 'setupNeeded');

const componentSource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/ExpeditionReadinessCommand.tsx'),
  'utf8',
);
const hookSource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/useExpeditionReadinessData.ts'),
  'utf8',
);
const widgetRenderers = fs.readFileSync(path.join(repoRoot, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const commandStore = fs.readFileSync(path.join(repoRoot, 'lib/ecsCommandModuleStore.ts'), 'utf8');
const commandRegistry = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/commandCenterRegistry.ts'),
  'utf8',
);

assert(componentSource.includes('CommandCenterFrame'), 'Expedition Readiness must render inside CommandCenterFrame');
assert(componentSource.includes('EXPEDITION READINESS COMMAND'), 'Expedition Readiness title missing');
assert(componentSource.includes('Continuation Readiness Assessment'), 'Expedition Readiness subtitle missing');
assert(componentSource.includes('Verify current field conditions'), 'Expedition Readiness must use cautious copy');
assert(componentSource.includes('actionStrip'), 'Expedition Readiness must include bottom recommendation strip');
assert(!componentSource.includes('safe to continue'), 'widget must avoid guaranteed safety copy');
assert(hookSource.includes('useExpeditionReadinessState'), 'hook should use existing readiness store');
assert(hookSource.includes('dispatchEventStore'), 'hook should include Dispatch/incident state');
assert(widgetRenderers.includes('<CommandCenterHost'), 'Dashboard renderer should use CommandCenterHost');
assert(commandRegistry.includes('component: ExpeditionReadinessCommand'), 'Command-center registry should host Expedition Readiness widget');
assert(commandStore.includes("'expeditionReadinessCommand'"), 'Command module store should register Expedition Readiness');

console.log('Expedition Readiness Command checks passed');
