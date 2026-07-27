const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalModuleLoad = Module._load;
Module._load = function loadWithRouteWeatherSnapshotStubs(request, parent, isMain) {
  const normalized = request.replace(/\\/g, '/');
  if (normalized === './connectivity' || normalized.endsWith('/lib/connectivity')) {
    return { connectivity: { isOnline: () => true } };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod.load(fullPath);
  return mod.exports;
}

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

function makeRoutePoints(count, startLat = 39.02, startLng = -120.32, latSpan = 0.42, lngSpan = 0.35) {
  return Array.from({ length: count }, (_, index) => {
    const ratio = count <= 1 ? 0 : index / (count - 1);
    return {
      lat: startLat + latSpan * ratio,
      lng: startLng + lngSpan * ratio,
      ele: 1550 + Math.round(Math.sin(ratio * Math.PI) * 900),
    };
  });
}

function makeSharedWeather(sampleSelection, nowMs, overrides = {}) {
  const providerCallsAttempted = overrides.providerCallsAttempted ?? sampleSelection.samples.length;
  const providerCallsAvoided = overrides.providerCallsAvoided ?? sampleSelection.diagnostics.providerCallsAvoided;
  return {
    result: {
      data: {
        results: sampleSelection.samples.map((sample, index) => ({
          lat: sample.coordinate.lat,
          lng: sample.coordinate.lng,
          label: sample.label,
          error: null,
          current: {
            temp: 64 + index,
            feels_like: 63 + index,
            temp_min: 48,
            temp_max: 72,
            humidity: 38,
            pressure: 1016,
            visibility: 10000,
            wind_speed: index === 0 ? 12 : 18,
            wind_deg: 225,
            wind_gust: index === 1 ? 34 : 20,
            clouds: 20,
            weather_id: 800,
            weather_main: 'Clear',
            weather_description: 'clear sky',
            weather_icon: '01d',
            rain_1h: null,
            rain_3h: null,
            snow_1h: null,
            snow_3h: null,
            sunrise: 1777896000,
            sunset: 1777947600,
            location_name: sample.label,
            dt: 1777896000,
          },
          hourly: [],
          daily: [],
          forecast: [],
          alerts: index === 1 ? [{ title: 'Wind Advisory', severity: 'advisory', description: 'Gusty ridgeline winds.' }] : [],
          trail_conditions: null,
        })),
        fetched_at: new Date(nowMs).toISOString(),
        units: 'imperial',
        provider: 'openweather',
        errors: [],
      },
      source: overrides.source ?? 'live',
      cachedAt: nowMs,
      error: null,
      broker: {
        provider: 'openweather',
        product: 'onecall3',
        requestedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + 10 * 60 * 1000).toISOString(),
        stale: overrides.stale === true,
        cacheHit: overrides.cacheHit === true,
        bucketKey: sampleSelection.sampleBuckets[0] ?? 'none',
        bucketKeys: sampleSelection.sampleBuckets,
        sourceCoordinate: sampleSelection.samples[0]?.coordinate ?? { lat: 0, lng: 0 },
        normalizedCoordinate: sampleSelection.samples[0]?.coordinate ?? { lat: 0, lng: 0 },
        entries: sampleSelection.samples.map((sample) => ({
          provider: 'openweather',
          product: 'onecall3',
          requestedAt: new Date(nowMs).toISOString(),
          expiresAt: new Date(nowMs + 10 * 60 * 1000).toISOString(),
          stale: overrides.stale === true,
          cacheHit: overrides.cacheHit === true,
          bucketKey: sample.bucketKey,
          sourceCoordinate: sample.coordinate,
          normalizedCoordinate: sample.normalizedCoordinate,
          current: null,
          hourly: [],
          daily: [],
          alerts: [],
          providerCostMetadata: {
            providerCallsAttempted,
            providerCallsAvoided,
            budgetDenied: false,
            budgetRemaining: 99,
            sessionRemaining: 99,
            rateLimited: false,
            cooldownActive: false,
            offline: false,
            sections: ['current', 'alerts'],
            exclude: 'minutely,hourly,daily',
          },
        })),
        providerCostMetadata: {
          providerCallsAttempted,
          providerCallsAvoided,
          budgetDenied: false,
          budgetRemaining: 99,
          sessionRemaining: 99,
          rateLimited: overrides.rateLimited === true,
          cooldownActive: overrides.cooldownActive === true,
          offline: overrides.offline === true,
          sections: ['current', 'alerts'],
          exclude: 'minutely,hourly,daily',
        },
      },
    },
    snapshots: [],
    target: { coordinate: sampleSelection.samples[0]?.coordinate ?? null, source: 'active_route', location: null },
  };
}

const {
  buildRouteWeatherSnapshot,
  decideRouteWeatherRefresh,
  selectRouteWeatherSamplePoints,
} = loadTypeScriptModule('lib/routeWeatherSnapshot.ts');

const nowMs = Date.parse('2026-06-22T12:00:00.000Z');

const denseDayRoute = makeRoutePoints(1000);
const daySelection = selectRouteWeatherSamplePoints({
  routeId: 'rubicon-day-route',
  routePoints: denseDayRoute,
  userLocation: { lat: 39.021, lng: -120.321, label: 'Current position' },
  routeDistanceMiles: 24,
  tripType: 'Day Trip',
  maxBuckets: 6,
});

assert(daySelection.samples.length <= 3, 'short/day routes should use at most three weather buckets');
assert(daySelection.samples.length >= 2, 'short/day routes should still sample a meaningful start/current and end/midpoint');
assert.strictEqual(new Set(daySelection.sampleBuckets).size, daySelection.sampleBuckets.length, 'sample buckets must be deduped before weather fetches');
assert(daySelection.diagnostics.providerCallsAvoided >= 990, 'route weather sampling should avoid per-coordinate provider calls');
assert(daySelection.diagnostics.routeWeatherSampleCount === daySelection.samples.length, 'sample diagnostics should report the bounded sample count');
assert(daySelection.diagnostics.bucketDedupeCount >= 0, 'sample diagnostics should report weather bucket dedupe');

const longSelection = selectRouteWeatherSamplePoints({
  routeId: 'expedition-route',
  routePoints: makeRoutePoints(1200, 38.7, -121.4, 1.35, 1.1),
  routeDistanceMiles: 180,
  tripType: 'Expedition',
  includeHighElevationRiskPoint: true,
  maxBuckets: 6,
});
assert(longSelection.samples.length <= 6, 'long expedition route weather sampling should obey the hard bucket cap');
assert(longSelection.samples.some((sample) => sample.reason === 'route_midpoint'), 'route midpoint should be a representative weather sample');
assert(longSelection.samples.some((sample) => sample.reason === 'route_end'), 'route destination/end should be a representative weather sample');

const snapshot = buildRouteWeatherSnapshot({
  routeId: 'rubicon-day-route',
  navigationSessionId: 'nav-session-1',
  sampleSelection: daySelection,
  weather: makeSharedWeather(daySelection, nowMs),
  refreshReason: 'navigation_start',
  nowMs,
});
assert.strictEqual(snapshot.routeId, 'rubicon-day-route');
assert.strictEqual(snapshot.navigationSessionId, 'nav-session-1');
assert.deepStrictEqual(snapshot.sampleBuckets, daySelection.sampleBuckets);
assert.strictEqual(snapshot.provider, 'openweather');
assert.strictEqual(snapshot.weatherSnapshotAge, 0);
assert.strictEqual(snapshot.lastProviderRefreshAt, snapshot.fetchedAt);
assert(snapshot.expiresAt.endsWith('Z'), 'snapshot should include an ISO expiration');
assert(snapshot.currentSummary, 'snapshot should include a current weather summary');
assert(snapshot.alerts.length === 1, 'snapshot should preserve route alerts');
assert(snapshot.riskFlags.includes('wind_gust'), 'snapshot should convert relevant weather into route risk flags');
assert(snapshot.sourceCallCount <= daySelection.samples.length, 'snapshot source call count should be bounded by sample buckets, not geometry points');
assert.strictEqual(snapshot.diagnostics.routeWeatherSampleCount, daySelection.samples.length);
assert(snapshot.diagnostics.providerCallsAvoided >= 990, 'snapshot diagnostics should expose avoided provider calls');
assert.strictEqual(snapshot.diagnostics.weatherRefreshReason, 'navigation_start');

const gpsDecision = decideRouteWeatherRefresh({
  reason: 'gps_update',
  previousSnapshot: snapshot,
  sampleBuckets: daySelection.sampleBuckets,
  currentBucketKey: daySelection.sampleBuckets[0],
  nowMs: nowMs + 2 * 60 * 1000,
});
assert.strictEqual(gpsDecision.shouldRefresh, false, 'GPS movement inside fresh route weather buckets should not refresh weather');
assert.strictEqual(gpsDecision.deniedReason, 'same_bucket_ttl_fresh');
assert.strictEqual(gpsDecision.useCachedSnapshot, true);

const rerouteSameBucket = decideRouteWeatherRefresh({
  reason: 'route_recalculation',
  previousSnapshot: snapshot,
  sampleBuckets: [...daySelection.sampleBuckets],
  nowMs: nowMs + 5 * 60 * 1000,
});
assert.strictEqual(rerouteSameBucket.shouldRefresh, false, 'reroute inside the same weather buckets should reuse the cached route snapshot');
assert.strictEqual(rerouteSameBucket.deniedReason, 'reroute_reuses_cached_route_snapshot');

const rerouteNewBucketExpired = decideRouteWeatherRefresh({
  reason: 'route_recalculation',
  previousSnapshot: snapshot,
  sampleBuckets: [...daySelection.sampleBuckets, '39.90_-121.50'],
  nowMs: nowMs + 11 * 60 * 1000,
});
assert.strictEqual(rerouteNewBucketExpired.shouldRefresh, true, 'reroute entering a new bucket after TTL should refresh route weather');
assert.strictEqual(rerouteNewBucketExpired.refreshReason, 'significant_reroute_new_bucket_ttl_expired');

const exploreListDecision = decideRouteWeatherRefresh({
  reason: 'explore_list_load',
  previousSnapshot: null,
  sampleBuckets: daySelection.sampleBuckets,
  nowMs,
});
assert.strictEqual(exploreListDecision.shouldRefresh, false, 'Explore list loads should not fetch live weather for every route card');
assert.strictEqual(exploreListDecision.deniedReason, 'explore_list_defers_live_weather');

const detailDecision = decideRouteWeatherRefresh({
  reason: 'route_detail_open',
  previousSnapshot: null,
  sampleBuckets: daySelection.sampleBuckets,
  nowMs,
});
assert.strictEqual(detailDecision.shouldRefresh, true, 'opening route detail may fetch bounded route weather');
assert.strictEqual(detailDecision.refreshReason, 'route_detail_open');

const offlineDecision = decideRouteWeatherRefresh({
  reason: 'offline_packet',
  previousSnapshot: snapshot,
  sampleBuckets: daySelection.sampleBuckets,
  offline: true,
  nowMs: nowMs + 60 * 60 * 1000,
});
assert.strictEqual(offlineDecision.shouldRefresh, false, 'offline packet generation should not retry provider weather while offline');
assert.strictEqual(offlineDecision.deniedReason, 'offline_cached_route_snapshot');

const staleOfflineSnapshot = buildRouteWeatherSnapshot({
  routeId: 'rubicon-day-route',
  navigationSessionId: 'nav-session-1',
  sampleSelection: daySelection,
  weather: makeSharedWeather(daySelection, nowMs, { stale: true, source: 'cache_stale', offline: true, providerCallsAttempted: 0 }),
  refreshReason: 'offline_packet',
  nowMs: nowMs + 60 * 60 * 1000,
});
assert.strictEqual(staleOfflineSnapshot.stale, true);
assert(staleOfflineSnapshot.weatherSnapshotAge >= 60 * 60 * 1000, 'offline route weather snapshot should expose age');
assert.strictEqual(staleOfflineSnapshot.lastProviderRefreshAt, new Date(nowMs).toISOString());

const cooldownDecision = decideRouteWeatherRefresh({
  reason: 'interval',
  previousSnapshot: snapshot,
  sampleBuckets: daySelection.sampleBuckets,
  providerCooldownUntilMs: nowMs + 5 * 60 * 1000,
  nowMs,
});
assert.strictEqual(cooldownDecision.shouldRefresh, false, 'provider cooldown should deny route weather refreshes');
assert.strictEqual(cooldownDecision.deniedReason, 'provider_cooldown');

const routeCorridorWeather = read('components/navigate/RouteCorridorWeather.tsx');
assert(routeCorridorWeather.includes('selectRouteWeatherSamplePoints'), 'Route corridor weather should use the shared route weather sampler.');
assert(routeCorridorWeather.includes('buildRouteWeatherSnapshot'), 'Route corridor weather should build cached route weather snapshots.');
assert(routeCorridorWeather.includes('decideRouteWeatherRefresh'), 'Route corridor weather should gate refreshes through route weather policy.');
assert(routeCorridorWeather.includes('MAX_SAMPLE_POINTS = 6'), 'Route corridor weather should cap representative route samples to six buckets.');
assert(!routeCorridorWeather.includes('function sampleRoutePoints'), 'Route corridor weather should not keep a separate dense route point sampler.');

const offlinePrepPack = read('app/explore-offline-prep-pack.tsx');
assert(offlinePrepPack.includes('selectRouteWeatherSamplePoints'), 'Offline Prep should use shared route weather sampling.');
assert(offlinePrepPack.includes('buildRouteWeatherSnapshot'), 'Offline Prep should persist route weather snapshot metadata.');
assert(offlinePrepPack.includes('weatherSnapshotAge'), 'Offline Prep snapshots should include weatherSnapshotAge.');
assert(offlinePrepPack.includes('lastProviderRefreshAt'), 'Offline Prep snapshots should include lastProviderRefreshAt.');

const trailPackCard = read('components/discover/TrailPackCard.tsx');
const routeCard = read('components/discover/ExploreTrailRouteCard.tsx');
assert(!trailPackCard.includes('fetchSharedWeatherForCoordinates'), 'Explore route cards should not fetch live route weather on initial list render.');
assert(!routeCard.includes('fetchSharedWeatherForCoordinates'), 'Explore trail cards should not fetch live route weather on initial list render.');

console.log('route weather snapshot checks passed');
