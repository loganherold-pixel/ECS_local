const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(outputText, filename);
}

require.extensions['.ts'] = compileTypeScript;

function loadTsModule(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    compileTypeScript(mod, filename);
  } finally {
    Module._load = originalLoad;
  }
  return mod.exports;
}

let routeSessionSnapshot = {
  sessionId: 'nav-session-1',
  lifecycle: 'preview',
  source: 'trail',
  routeId: 'route-alpine',
  routeTitle: 'Alpine Shelf Road',
  routeSubtitle: 'Shelf route',
  statusLabel: 'Trail route staged',
  instruction: null,
  routePoints: [
    { lat: 39, lng: -120, ele: 1400, ele_m: 1400 },
    { lat: 39.03, lng: -120.02, ele: 1540, ele_m: 1540 },
    { lat: 39.07, lng: -120.04, ele: 1840, ele_m: 1840 },
    { lat: 39.12, lng: -120.05, ele: 2100, ele_m: 2100 },
  ],
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
  routeStatusKind: 'nominal',
  updatedAt: '2026-05-26T12:00:00.000Z',
};

let activeLocalRoute = null;
let navigateSubscribed = false;
let routeStoreSubscribed = false;

const mocks = {
  './useOperationalWeather': {
    getSharedOperationalWeatherState: () => ({
      snapshot: {
        alerts: [],
        current: {},
        status: { source: 'none', stale: false, label: 'Weather unavailable' },
        fetchedAt: null,
        raw: null,
        daily: [],
        hourly: [],
        normalized: {},
      },
      result: null,
    }),
    subscribeSharedOperationalWeather: () => () => {},
  },
  './routeAnalysisEngine': {
    routeAnalysisEngine: {
      getCurrent: () => null,
      subscribe: () => () => {},
    },
  },
  './terrainAnalysisEngine': {
    terrainAnalysisEngine: {
      getCurrent: () => null,
      subscribe: () => () => {},
    },
  },
  './resourceForecastEngine': {
    resourceForecastEngine: {
      getCurrent: () => null,
      subscribe: () => () => {},
    },
  },
  './connectivity': {
    connectivity: {
      status: 'online',
      getDetailedState: () => ({
        initialized: true,
        status: 'online',
        networkType: 'wifi',
        level: 'good',
        latencyMs: 22,
        lastOnlineAt: '2026-05-26T12:00:00.000Z',
        lastOfflineAt: null,
      }),
      onStatusChange: () => () => {},
    },
  },
  './navigateRouteSessionStore': {
    navigateRouteSessionStore: {
      getSnapshot: () => routeSessionSnapshot,
      subscribe: () => {
        navigateSubscribed = true;
        return () => {};
      },
    },
  },
  './routeStore': {
    routeStore: {
      getActive: () => activeLocalRoute,
      subscribe: () => {
        routeStoreSubscribed = true;
        return () => {};
      },
    },
  },
  '../src/vehicle-telemetry/VehicleTelemetryStore': {
    vehicleTelemetryStore: {
      getECSVehicleTelemetryState: () => ({
        connectionState: 'disconnected',
        isConnected: false,
        hasData: false,
        isFresh: false,
        isStale: false,
        isShowingLastKnown: false,
        freshnessText: 'No telemetry',
        telemetry: {},
        lastUpdated: null,
      }),
      subscribe: () => () => {},
    },
  },
};

const {
  getDispatchChannelSnapshots,
  getLiveDispatchEventInput,
  subscribeDispatchChannels,
} = loadTsModule('lib/dispatchChannelState.ts', mocks);

const context = { queuedCount: 0, dirtyCount: 0, isOnline: true, offlineMode: false, syncStatus: 'synced' };
let channels = getDispatchChannelSnapshots(context);
let routeChannel = channels.find((channel) => channel.id === 'route');
let terrainChannel = channels.find((channel) => channel.id === 'terrain');

assert(routeChannel, 'Route channel should be present.');
assert.strictEqual(routeChannel.statusLabel, 'ROUTE STAGED');
assert.strictEqual(routeChannel.sourceLabel, 'Navigate Route Session');
assert(routeChannel.detail.includes('Alpine Shelf Road'), 'Route channel should name the staged route.');
assert.notStrictEqual(routeChannel.statusLabel, 'NO LIVE DATA');

assert(terrainChannel, 'Terrain channel should be present.');
assert.strictEqual(terrainChannel.sourceLabel, 'Route Terrain Risk');
assert.notStrictEqual(terrainChannel.statusLabel, 'NO LIVE DATA');
assert(/^(LOW|MODERATE|HIGH) \d+$/.test(terrainChannel.statusLabel), 'Terrain channel should expose a risk label and score.');
assert(terrainChannel.detail.includes('elevation profile'), 'Terrain channel should identify elevation-backed route data.');

const liveInput = getLiveDispatchEventInput(context, null);
assert(liveInput.activeRouteState, 'Live dispatch events should receive route fallback state.');
assert.strictEqual(liveInput.activeRouteState.routeName, 'Alpine Shelf Road');
assert(liveInput.terrainRiskState, 'Live dispatch events should receive terrain fallback state.');
assert.strictEqual(liveInput.terrainRiskState.routeName, 'Alpine Shelf Road');

const unsubscribe = subscribeDispatchChannels(() => {});
unsubscribe();
assert(navigateSubscribed, 'Dispatch channel subscription should listen for navigate route session changes.');
assert(routeStoreSubscribed, 'Dispatch channel subscription should listen for local active route changes.');

routeSessionSnapshot = { ...routeSessionSnapshot, lifecycle: 'inactive', routeId: null, routeTitle: null, routePoints: [] };
activeLocalRoute = {
  id: 'local-gpx',
  name: 'Imported Camp Loop',
  source_format: 'gpx',
  total_distance_miles: 7.5,
  updated_at: '2026-05-26T13:00:00.000Z',
  segments: [{
    points: [
      { lat: 40, lon: -111, ele: 1300 },
      { lat: 40.02, lon: -111.03, ele: 1580 },
      { lat: 40.06, lon: -111.08, ele: 1240 },
    ],
  }],
};

channels = getDispatchChannelSnapshots(context);
routeChannel = channels.find((channel) => channel.id === 'route');
terrainChannel = channels.find((channel) => channel.id === 'terrain');
assert.strictEqual(routeChannel.statusLabel, 'ROUTE READY');
assert.strictEqual(routeChannel.sourceLabel, 'Local Active Route');
assert(routeChannel.detail.includes('Imported Camp Loop'), 'Local route fallback should name the active route.');
assert.strictEqual(terrainChannel.sourceLabel, 'Route Terrain Risk');
assert.notStrictEqual(terrainChannel.statusLabel, 'NO LIVE DATA');

console.log('[dispatch-route-terrain-fallback] route and terrain fallback checks passed');
