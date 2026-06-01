const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  RouteContextOrchestrator,
  clearRouteContextTelemetryEvents,
  createRouteContextProviderRegistry,
  getRouteContextTelemetryEvents,
  sanitizeRouteContextDebugPayload,
  setRouteContextTelemetrySink,
} = require(path.join(root, 'lib', 'routeContext', 'index.ts'));
const { ecsLog } = require(path.join(root, 'lib', 'ecsLogger.ts'));

const preciseOrigin = { lat: 38.123456, lng: -110.654321 };

function route(id = 'telemetry-trail', origin = preciseOrigin) {
  return {
    id,
    tripId: 'trip-telemetry',
    origin,
    explicitTrailhead: { lat: 38.123456, lng: -110.654321, label: 'Precise Trailhead Name' },
    endpointCoordinate: { lat: 38.223456, lng: -110.554321 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110.654321, 38.123456],
        [-110.604321, 38.173456],
        [-110.554321, 38.223456],
      ],
    },
  };
}

const routingAdapter = {
  id: 'telemetry-routing',
  isAvailable: () => true,
  async computeRoute() {
    return {
      coordinates: [
        { lat: 38.123456, lng: -110.654321 },
        { lat: 38.223456, lng: -110.554321 },
      ],
      distanceMeters: 5100,
      durationSeconds: 700,
      encodedPolyline: 'secret-polyline-not-for-logs',
    };
  },
  async computeRouteMatrix() {
    return { cells: [] };
  },
};

const placesAdapter = {
  id: 'telemetry-places',
  isAvailable: () => true,
  async searchNearby(input) {
    return [{
      id: `${input.categories?.[0] ?? 'gas'}-1`,
      providerPlaceId: 'provider-place-secret',
      category: input.categories?.[0] ?? 'gas',
      name: 'Exact Place Name',
      address: '123 Sensitive Address',
      coordinate: { lat: 38.124567, lng: -110.655432 },
      confidence: 0.82,
      score: 0.9,
    }];
  },
  async searchText() {
    return [];
  },
};

async function main() {
  clearRouteContextTelemetryEvents();
  const sinkEvents = [];
  setRouteContextTelemetrySink((event, properties) => {
    sinkEvents.push({ event, properties });
  });

  const orchestrator = new RouteContextOrchestrator({
    featureFlags: {
      'ecs.routeContextEngine.enabled': true,
      'ecs.routeContextEngine.prefetchOnTrailSelect': true,
    },
    providerRegistry: createRouteContextProviderRegistry({
      routing: routingAdapter,
      places: placesAdapter,
    }),
  });

  const success = await orchestrator.prefetchForTrailSelection({
    trail: route('telemetry-success'),
    selectedSupplyMode: 'gas',
  });
  assert.strictEqual(success.status, 'ready');
  orchestrator.getContext({ trailId: 'telemetry-success', selectedSupplyMode: 'gas' });

  const events = getRouteContextTelemetryEvents();
  const eventNames = events.map((entry) => entry.event);
  assert.ok(eventNames.includes('route_context_prefetch_started'));
  assert.ok(eventNames.includes('route_context_trailhead_resolved'));
  assert.ok(eventNames.includes('route_context_supply_candidates_found'));
  assert.ok(eventNames.includes('route_context_geometry_ready'));
  assert.ok(eventNames.includes('route_context_ready'));
  assert.ok(eventNames.includes('route_context_cache_hit'));
  assert.ok(sinkEvents.length >= events.length - 1);

  const serializedEvents = JSON.stringify(events);
  assert.ok(!serializedEvents.includes('38.123456'));
  assert.ok(!serializedEvents.includes('-110.654321'));
  assert.ok(!serializedEvents.includes('secret-polyline-not-for-logs'));
  assert.ok(!serializedEvents.includes('123 Sensitive Address'));
  assert.ok(!serializedEvents.includes('Exact Place Name'));
  assert.ok(events.every((entry) => entry.properties.providers == null || typeof entry.properties.providers.supplyAvailable === 'boolean'));

  clearRouteContextTelemetryEvents();
  const partial = new RouteContextOrchestrator({
    featureFlags: {
      'ecs.routeContextEngine.enabled': true,
      'ecs.routeContextEngine.prefetchOnTrailSelect': true,
    },
  });
  const partialContext = await partial.prefetchForTrailSelection({
    trail: route('telemetry-partial', null),
    selectedSupplyMode: 'gas',
  });
  assert.strictEqual(partialContext.status, 'partial');
  const partialEvents = getRouteContextTelemetryEvents();
  assert.ok(partialEvents.some((entry) => entry.event === 'route_context_partial'));
  assert.ok(partialEvents.some((entry) => entry.event === 'route_context_error'));
  assert.ok(partialEvents.some((entry) => entry.properties.warningCodes.includes('provider_unavailable')));

  clearRouteContextTelemetryEvents();
  const cancelDeferred = {};
  cancelDeferred.promise = new Promise((resolve) => {
    cancelDeferred.resolve = resolve;
  });
  const cancelOrchestrator = new RouteContextOrchestrator({
    featureFlags: {
      'ecs.routeContextEngine.enabled': true,
      'ecs.routeContextEngine.prefetchOnTrailSelect': true,
    },
    providerRegistry: createRouteContextProviderRegistry({
      routing: {
        ...routingAdapter,
        id: 'slow-telemetry-routing',
        async computeRoute() {
          await cancelDeferred.promise;
          return routingAdapter.computeRoute();
        },
      },
    }),
  });
  const cancelJob = cancelOrchestrator.prefetchForTrailSelection({
    trail: route('telemetry-cancel'),
    selectedSupplyMode: 'none',
  });
  cancelOrchestrator.cancelContextJob({ trailId: 'telemetry-cancel' });
  cancelDeferred.resolve();
  await cancelJob;
  assert.ok(getRouteContextTelemetryEvents().some((entry) => entry.event === 'route_context_job_cancelled'));

  ecsLog.clear();
  clearRouteContextTelemetryEvents();
  const noDebug = new RouteContextOrchestrator({
    featureFlags: {
      'ecs.routeContextEngine.enabled': true,
      'ecs.routeContextEngine.prefetchOnTrailSelect': true,
      'ecs.routeContextEngine.debugLogging': false,
    },
    providerRegistry: createRouteContextProviderRegistry({ routing: routingAdapter }),
  });
  await noDebug.prefetchForTrailSelection({
    trail: route('telemetry-no-debug'),
    selectedSupplyMode: 'none',
  });
  assert.strictEqual(ecsLog.getLogsByCategory('ROUTE_CONTEXT').length, 0);

  const debug = new RouteContextOrchestrator({
    featureFlags: {
      'ecs.routeContextEngine.enabled': true,
      'ecs.routeContextEngine.prefetchOnTrailSelect': true,
      'ecs.routeContextEngine.debugLogging': true,
    },
    providerRegistry: createRouteContextProviderRegistry({ routing: routingAdapter }),
  });
  await debug.prefetchForTrailSelection({
    trail: route('telemetry-debug'),
    selectedSupplyMode: 'none',
  });
  const debugLogs = ecsLog.getLogsByCategory('ROUTE_CONTEXT');
  assert.ok(debugLogs.length > 0);
  const serializedDebugLogs = JSON.stringify(debugLogs);
  assert.ok(!serializedDebugLogs.includes('38.123456'));
  assert.ok(!serializedDebugLogs.includes('-110.654321'));
  assert.ok(!serializedDebugLogs.includes('secret-polyline-not-for-logs'));
  assert.ok(!serializedDebugLogs.includes('Precise Trailhead Name'));

  const sanitized = sanitizeRouteContextDebugPayload({
    lat: 38.123456,
    lng: -110.654321,
    address: '123 Sensitive Address',
    encodedPolyline: 'secret-polyline-not-for-logs',
    providerApiKey: 'super-secret-key',
  });
  assert.strictEqual(sanitized.lat, 38.12);
  assert.strictEqual(sanitized.lng, -110.65);
  assert.strictEqual(sanitized.address, '[redacted_text]');
  assert.strictEqual(sanitized.encodedPolyline, '[redacted_geometry]');
  assert.strictEqual(sanitized.providerApiKey, '[redacted]');

  setRouteContextTelemetrySink(null);
}

main()
  .then(() => {
    console.log('Route Context privacy-safe telemetry checks passed.');
  })
  .catch((error) => {
    setRouteContextTelemetrySink(null);
    console.error(error);
    process.exit(1);
  });
