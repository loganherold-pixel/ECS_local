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

function distanceMiles(a, b) {
  if (!a || !b) return null;
  const radius = 3958.8;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

const { normalizeCampScoutCommandData } = loadTsModule('lib/navigation/campScoutCommandData.ts', {
  './bearingUtils': {
    calculateDistanceMiles: distanceMiles,
  },
  '../map/routeGeometryUtils': {
    distancePointToRouteMiles: (point, route) => {
      if (!point || !Array.isArray(route) || route.length === 0) return null;
      return Math.min(...route.map((entry) => distanceMiles(point, entry)));
    },
  },
});

function environment(minutes = 240, nextEvent = 'sunset') {
  return {
    sunlight: {
      nextEvent,
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
            wind_gust: 14,
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

const empty = normalizeCampScoutCommandData();
assert.strictEqual(empty.dataState, 'setupNeeded');
assert.strictEqual(empty.recommendationLabel, 'ADD CAMP CANDIDATES FROM MAP');
assert(empty.missingInputs.includes('Camp candidates'));

const ranked = normalizeCampScoutCommandData({
  currentLocation: { latitude: 39, longitude: -105, accuracyMeters: 10 },
  routePoints: [
    { latitude: 39, longitude: -105 },
    { latitude: 39.1, longitude: -105.1 },
  ],
  routeActive: true,
  environment: environment(420),
  weather: weather(),
  sourceUpdatedAt: Date.now(),
  candidates: [
    {
      id: 'saved-camp',
      name: 'Saved Ridge Camp',
      latitude: 39.02,
      longitude: -105.02,
      source: 'savedPin',
      legalAccessConfidence: 'verify',
      flatnessScore: 60,
      remotenessScore: 66,
      vehicleAccessConfidence: 'limited',
      isEstimated: true,
    },
    {
      id: 'established-camp',
      name: 'Known Campground',
      latitude: 39.03,
      longitude: -105.03,
      source: 'establishedCampground',
      legalAccessConfidence: 'established',
      flatnessScore: 78,
      remotenessScore: 48,
      vehicleAccessConfidence: 'good',
    },
  ],
});
assert(['live', 'estimated'].includes(ranked.dataState));
assert.strictEqual(ranked.candidates[0].id, 'established-camp');
assert.strictEqual(ranked.bestCandidateId, 'established-camp');
assert(ranked.recommendationLabel.includes('ESTABLISHED CAMPGROUND') || ranked.recommendationLabel.includes('BEST SITE'));
assert(ranked.selectedCandidateMetrics.some((metric) => metric.id === 'legalAccess'));
assert(ranked.recommendationReason.includes('Verify'));

const noCandidates = normalizeCampScoutCommandData({
  currentLocation: { latitude: 39, longitude: -105, accuracyMeters: 10 },
  environment: environment(240),
  weather: weather(),
});
assert.strictEqual(noCandidates.dataState, 'partial');
assert.strictEqual(noCandidates.recommendationLabel, 'NO CANDIDATES FOUND');

const noGpsWithCandidate = normalizeCampScoutCommandData({
  candidates: [
    {
      id: 'manual-candidate',
      name: 'Manual Camp Candidate',
      latitude: 39.02,
      longitude: -105.02,
      source: 'userSelected',
      legalAccessConfidence: 'verify',
    },
  ],
});
assert(['partial', 'estimated'].includes(noGpsWithCandidate.dataState));
assert(noGpsWithCandidate.missingInputs.includes('Location'));
assert.strictEqual(noGpsWithCandidate.candidates.length, 1);

const offlineSaved = normalizeCampScoutCommandData({
  currentLocation: { latitude: 39, longitude: -105, accuracyMeters: 45 },
  routePoints: [{ latitude: 39, longitude: -105 }],
  environment: environment(120),
  isOffline: true,
  isUsingCachedData: true,
  candidates: [
    {
      id: 'offline-camp',
      name: 'Offline Saved Camp',
      latitude: 39.04,
      longitude: -105.04,
      source: 'savedPin',
      legalAccessConfidence: 'verify',
      isEstimated: true,
    },
  ],
});
assert.strictEqual(offlineSaved.dataState, 'offline');
assert(offlineSaved.recommendationLabel.includes('OFFLINE'));

const restricted = normalizeCampScoutCommandData({
  currentLocation: { latitude: 39, longitude: -105 },
  routePoints: [{ latitude: 39, longitude: -105 }],
  environment: environment(420),
  weather: weather(),
  candidates: [
    {
      id: 'restricted',
      name: 'Closed Area',
      latitude: 39.01,
      longitude: -105.01,
      source: 'dispersedCandidate',
      legalAccessConfidence: 'restricted',
      flatnessScore: 90,
      remotenessScore: 90,
    },
  ],
});
assert(restricted.candidates[0].scorePercent <= 22);
assert.strictEqual(restricted.selectedCandidateMetrics[0].value, 'Restricted / avoid');

const likelyEligible = normalizeCampScoutCommandData({
  currentLocation: { latitude: 39, longitude: -105 },
  routePoints: [{ latitude: 39, longitude: -105 }],
  environment: environment(420),
  weather: weather(),
  candidates: [
    {
      id: 'dispersed-candidate',
      name: 'Dispersed Candidate',
      latitude: 39.01,
      longitude: -105.01,
      source: 'dispersedCandidate',
      legalAccessConfidence: 'likelyAllowed',
      flatnessScore: 70,
      remotenessScore: 70,
    },
  ],
});
assert.strictEqual(likelyEligible.selectedCandidateMetrics[0].value, 'Likely eligible - verify');

const widgetSource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/CampScoutCommand.tsx'),
  'utf8',
);
const hookSource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/useCampScoutData.ts'),
  'utf8',
);
const widgetRenderers = fs.readFileSync(path.join(repoRoot, 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
const commandStore = fs.readFileSync(path.join(repoRoot, 'lib/ecsCommandModuleStore.ts'), 'utf8');
const commandRegistry = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/commandCenterRegistry.ts'),
  'utf8',
);

assert(widgetSource.includes('CommandCenterFrame'), 'Camp Scout must render inside CommandCenterFrame');
assert(widgetSource.includes('CAMP SCOUT COMMAND'), 'Camp Scout title missing');
assert(widgetSource.includes('Campsite Viability Intelligence'), 'Camp Scout subtitle missing');
assert(widgetSource.includes('Verify access before camping'), 'Camp Scout must use cautious access copy');
assert(widgetSource.includes('actionStrip'), 'Camp Scout must include bottom recommendation strip');
assert(!widgetSource.includes('Legal campsite') && !widgetSource.includes('Guaranteed'), 'widget must avoid guarantee copy');
assert(hookSource.includes('pinStore.getAll'), 'hook should use saved pin source');
assert(hookSource.includes('SAMPLE_ESTABLISHED_CAMPSITES'), 'hook should support dev-gated established campsite source');
assert(hookSource.includes('EXPO_PUBLIC_ECS_ESTABLISHED_CAMPSITES_LAYER'), 'established campsite samples should require explicit feature flag');
assert(hookSource.includes('getCachedWeatherResult'), 'hook should use existing weather cache source');
assert(hookSource.includes('buildEnvironmentSnapshot'), 'hook should use existing daylight/environment source');
assert(widgetRenderers.includes('<CommandCenterHost'), 'Dashboard renderer should use CommandCenterHost');
assert(commandRegistry.includes('component: CampScoutCommandWidget'), 'Command-center registry should host Camp Scout widget');
assert(commandStore.includes("'campScoutCommand'"), 'Command module store should register Camp Scout');

console.log('Camp Scout Command checks passed');
