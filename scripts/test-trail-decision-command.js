const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');

function loadTsModule(relativePath, mocks = {}) {
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
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => (mocks[request] ? mocks[request] : originalRequire(request));
  mod._compile(outputText, filename);
  return mod.exports;
}

const { normalizeTrailDecisionCommandData } = loadTsModule('lib/navigation/trailDecisionCommandData.ts');

function route(overrides = {}) {
  return {
    hasRoute: true,
    isActive: true,
    routeLabel: 'Trail Route',
    remainingMiles: 6,
    remainingMilesText: '6.0 mi',
    etaLabel: '4:20 PM',
    source: 'trail-guidance',
    sourceDetail: 'Navigate trail guidance',
    stateTone: 'live',
    confidenceLine: 'Trail state: nominal',
    geometryStatus: '12 trail progress points',
    calculationState: 'Progress calculated from Navigate trail guidance',
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function environment(minutes, nextEvent = 'sunset') {
  return {
    sunlight: {
      nextEvent: minutes == null ? null : nextEvent,
      remainingMinutes: minutes,
      source: 'calculated',
    },
  };
}

function weather(overrides = {}) {
  return {
    source: 'live',
    cachedAt: null,
    error: null,
    data: {
      fetched_at: new Date().toISOString(),
      units: 'imperial',
      results: [
        {
          error: null,
          current: {
            wind_speed: 8,
            wind_gust: 15,
            weather_main: 'Clear',
          },
          alerts: [],
          trail_conditions: { overall: 'good', factors: [] },
          ...overrides,
        },
      ],
    },
  };
}

function remoteness(overrides = {}) {
  return {
    isActive: true,
    score: 20,
    level: 'Low',
    confidence: { level: 'medium' },
    terrain: {
      complexity: 'low',
    },
    ...overrides,
  };
}

function vehicle(overrides = {}) {
  return {
    hasVehicleContext: true,
    tiresLift: { tireSizeInches: 33 },
    spec: { ground_clearance_in: 9.5 },
    resourceProfile: {
      tireSizeInches: 33,
      suspensionLiftInches: 1.5,
    },
    weightSnapshot: {
      gvwrUsagePct: 72,
    },
    capabilitySnapshot: {},
    ...overrides,
  };
}

const empty = normalizeTrailDecisionCommandData();
assert.strictEqual(empty.dataState, 'setupNeeded');
assert.strictEqual(empty.recommendedDecision, 'unknown');
assert.strictEqual(empty.actionLabel, 'SELECT ROUTE TO BEGIN');
assert(empty.missingInputs.includes('Location'));

const live = normalizeTrailDecisionCommandData({
  currentLocation: { latitude: 39, longitude: -105, accuracyMeters: 7 },
  currentHeadingDegrees: 120,
  activeRouteProgress: route(),
  environment: environment(420),
  weather: weather(),
  vehicleContext: vehicle(),
  remotenessIndex: remoteness(),
  sourceUpdatedAt: Date.now(),
});
assert(['live', 'estimated'].includes(live.dataState));
assert.strictEqual(live.recommendedDecision, 'proceed');
assert.strictEqual(live.decisionLabel, 'PROCEED');
assert.strictEqual(live.routeActive, true);
assert(live.factors.find((factor) => factor.id === 'daylightMargin'));
assert(live.confidencePercent >= 60);

const nighttime = normalizeTrailDecisionCommandData({
  currentLocation: { latitude: 39, longitude: -105, accuracyMeters: 7 },
  activeRouteProgress: route(),
  environment: environment(360, 'sunrise'),
  weather: weather(),
  vehicleContext: vehicle(),
  remotenessIndex: remoteness(),
});
const nighttimeDaylightFactor = nighttime.factors.find((factor) => factor.id === 'daylightMargin');
assert.strictEqual(nighttime.daylightMargin, 'critical');
assert(nighttimeDaylightFactor.value.includes('until sunrise'));
assert(!nighttime.missingInputs.includes('Sunlight window'));

const noRoute = normalizeTrailDecisionCommandData({
  currentLocation: { latitude: 39, longitude: -105, accuracyMeters: 7 },
  environment: environment(240),
  weather: weather(),
  vehicleContext: vehicle(),
  remotenessIndex: remoteness(),
});
assert.strictEqual(noRoute.dataState, 'partial');
assert.strictEqual(noRoute.actionLabel, 'SELECT ROUTE TO BEGIN');
assert(noRoute.missingInputs.includes('Active route'));

const noVehicle = normalizeTrailDecisionCommandData({
  currentLocation: { latitude: 39, longitude: -105, accuracyMeters: 7 },
  activeRouteProgress: route(),
  environment: environment(240),
  weather: weather(),
  remotenessIndex: remoteness(),
});
assert(['estimated', 'partial'].includes(noVehicle.dataState));
assert.strictEqual(noVehicle.vehicleFit, 'unknown');
assert(noVehicle.missingInputs.includes('Vehicle profile'));

const offline = normalizeTrailDecisionCommandData({
  currentLocation: { latitude: 39, longitude: -105, accuracyMeters: 45 },
  activeRouteProgress: route(),
  environment: environment(240),
  weather: weather(),
  vehicleContext: vehicle(),
  remotenessIndex: remoteness(),
  isOffline: true,
  isUsingCachedData: true,
});
assert.strictEqual(offline.dataState, 'offline');
assert.strictEqual(offline.recommendedDecision, 'holdPosition');
assert.strictEqual(offline.actionLabel, 'OFFLINE - USE LAST KNOWN ROUTE');

const highRisk = normalizeTrailDecisionCommandData({
  currentLocation: { latitude: 39, longitude: -105, accuracyMeters: 20 },
  activeRouteProgress: route({
    remainingMiles: 28,
    confidenceLine: 'Route confidence: low',
    geometryStatus: 'Route geometry unavailable',
  }),
  environment: environment(80),
  weather: weather({
    alerts: [{ severity: 'warning', title: 'Storm', description: 'Storm nearby', type: 'storm' }],
    trail_conditions: { overall: 'poor', factors: [] },
  }),
  vehicleContext: vehicle({
    weightSnapshot: { gvwrUsagePct: 106 },
  }),
  remotenessIndex: remoteness({
    level: 'Extreme',
    score: 88,
    terrain: { complexity: 'high' },
  }),
});
assert(
  ['turnBackRecommended', 'holdPosition', 'rerouteRecommended', 'scoutOnFoot'].includes(highRisk.recommendedDecision),
);
assert.notStrictEqual(highRisk.recommendedDecision, 'proceed');
assert(highRisk.factors.some((factor) => factor.severity === 'critical'));

const componentSource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/TrailDecisionCommand.tsx'),
  'utf8',
);
const hookSource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/useTrailDecisionData.ts'),
  'utf8',
);
const widgetRenderers = fs.readFileSync(path.join(repoRoot, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const commandStore = fs.readFileSync(path.join(repoRoot, 'lib/ecsCommandModuleStore.ts'), 'utf8');
const commandRegistry = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/commandCenterRegistry.ts'),
  'utf8',
);

assert(componentSource.includes('CommandCenterFrame'), 'Trail Decision must render inside CommandCenterFrame');
assert(componentSource.includes('TRAIL DECISION COMMAND'), 'Trail Decision title missing');
assert(componentSource.includes('Go / No-Go Terrain Assessment'), 'Trail Decision subtitle missing');
assert(componentSource.includes('Verify conditions before committing'), 'Trail Decision must use cautious copy');
assert(componentSource.includes('actionStrip'), 'Trail Decision must include bottom recommendation strip');
assert(!componentSource.includes('mock') && !componentSource.includes('demo'), 'component must not use mock/demo data');
assert(hookSource.includes('useActiveRouteProgressSnapshot'), 'hook should use existing route progress source');
assert(hookSource.includes('buildEnvironmentSnapshot'), 'hook should use existing environment/daylight source');
assert(hookSource.includes('getCachedWeatherResult'), 'hook should use existing weather cache source');
assert(hookSource.includes('getActiveVehicleContext'), 'hook should use active Fleet vehicle context');
assert(hookSource.includes('remotenessStore.getIndex'), 'hook should use existing remoteness source');
assert(widgetRenderers.includes('<CommandCenterHost'), 'Dashboard renderer should use CommandCenterHost');
assert(commandRegistry.includes('component: TrailDecisionCommandWidget'), 'Command-center registry should host Trail Decision widget');
assert(commandStore.includes("'trailDecisionCommand'"), 'Command module store should register Trail Decision');

console.log('Trail Decision Command checks passed');
