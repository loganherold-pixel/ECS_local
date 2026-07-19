const assert = require('assert');
const { spawnSync } = require('child_process');
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
    sourceUrl: 'https://private.example.test/source-record',
    userEmail: 'private-person@example.test',
    accessToken: 'private-user-token',
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

const DIAGNOSTICS_ENABLED_ENV = 'ECS_SUPPORT_DIAGNOSTICS_ENABLED';
const DIAGNOSTICS_APPROVED_ENV = 'ECS_SUPPORT_DIAGNOSTICS_APPROVED';

async function main(approvedDiagnostics) {
  if (approvedDiagnostics) {
    assert.strictEqual(process.env[DIAGNOSTICS_ENABLED_ENV], '1');
    assert.strictEqual(process.env[DIAGNOSTICS_APPROVED_ENV], '1');
  } else {
    assert.strictEqual(process.env[DIAGNOSTICS_ENABLED_ENV], undefined);
    assert.strictEqual(process.env[DIAGNOSTICS_APPROVED_ENV], undefined);
  }

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
  assert.ok(!serializedEvents.includes('https://private.example.test/source-record'));
  assert.ok(!serializedEvents.includes('private-person@example.test'));
  assert.ok(!serializedEvents.includes('private-user-token'));
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
  assert.strictEqual(
    debugLogs.length > 0,
    approvedDiagnostics,
    approvedDiagnostics
      ? 'Explicitly approved support diagnostics should capture detailed Route Context entries.'
      : 'Detailed Route Context entries must remain suppressed by default.',
  );
  if (approvedDiagnostics) {
    assert.ok(
      debugLogs.every((entry) =>
        entry.level === 'DEBUG' &&
        entry.category === 'ROUTE_CONTEXT' &&
        typeof entry.message === 'string' &&
        entry.details != null &&
        typeof entry.details === 'object'),
      'Approved diagnostics should use structured Route Context debug entries.',
    );
  }
  const serializedDebugLogs = JSON.stringify(debugLogs);
  assert.ok(!serializedDebugLogs.includes('38.123456'));
  assert.ok(!serializedDebugLogs.includes('-110.654321'));
  assert.ok(!serializedDebugLogs.includes('secret-polyline-not-for-logs'));
  assert.ok(!serializedDebugLogs.includes('Precise Trailhead Name'));
  assert.ok(!serializedDebugLogs.includes('https://private.example.test/source-record'));
  assert.ok(!serializedDebugLogs.includes('private-person@example.test'));
  assert.ok(!serializedDebugLogs.includes('private-user-token'));

  const sanitized = sanitizeRouteContextDebugPayload({
    lat: 38.123456,
    lng: -110.654321,
    address: '123 Sensitive Address',
    encodedPolyline: 'secret-polyline-not-for-logs',
    providerApiKey: 'super-secret-key',
    accessToken: 'private-user-token',
  });
  assert.strictEqual(sanitized.lat, 38.12);
  assert.strictEqual(sanitized.lng, -110.65);
  assert.strictEqual(sanitized.address, '[redacted_text]');
  assert.strictEqual(sanitized.encodedPolyline, '[redacted_geometry]');
  assert.strictEqual(sanitized.providerApiKey, '[redacted]');
  assert.strictEqual(sanitized.accessToken, '[redacted]');
  const serializedSanitized = JSON.stringify(sanitized);
  for (const privateValue of [
    '38.123456',
    '-110.654321',
    'private-user-token',
  ]) {
    assert.ok(!serializedSanitized.includes(privateValue), `Sanitized diagnostics must omit ${privateValue}.`);
  }

  setRouteContextTelemetrySink(null);
}

function runIsolatedMode(mode) {
  const env = { ...process.env };
  delete env[DIAGNOSTICS_ENABLED_ENV];
  delete env[DIAGNOSTICS_APPROVED_ENV];
  if (mode === 'approved') {
    env[DIAGNOSTICS_ENABLED_ENV] = '1';
    env[DIAGNOSTICS_APPROVED_ENV] = '1';
  }

  const child = spawnSync(process.execPath, [__filename, `--diagnostics-mode=${mode}`], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  if (child.status !== 0) {
    process.stderr.write(child.stdout || '');
    process.stderr.write(child.stderr || '');
  }
  assert.strictEqual(child.status, 0, `${mode} diagnostics subprocess should pass.`);
}

const modeArgument = process.argv.find((argument) => argument.startsWith('--diagnostics-mode='));
if (!modeArgument) {
  runIsolatedMode('default');
  runIsolatedMode('approved');
  console.log('Route Context telemetry default/approved isolation checks passed.');
} else {
  const diagnosticsMode = modeArgument.slice('--diagnostics-mode='.length);
  assert.ok(['default', 'approved'].includes(diagnosticsMode), 'Diagnostics test mode should be explicit.');
  main(diagnosticsMode === 'approved')
    .then(() => {
      console.log(`Route Context ${diagnosticsMode} telemetry checks passed.`);
    })
    .catch((error) => {
      setRouteContextTelemetrySink(null);
      console.error(error);
      process.exit(1);
    });
}
