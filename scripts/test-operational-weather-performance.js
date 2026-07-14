const Module = require('module');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  createOperationalWeatherEnvironmentBroker,
} = require(path.join(process.cwd(), 'lib', 'weatherBrokerEnvironment.ts'));
const {
  sampleRouteWeatherRisk,
} = require(path.join(process.cwd(), 'lib', 'ecs5RouteWeatherSampler.ts'));

const NOW = new Date('2026-07-13T12:00:00.000Z');

function observation(providerId, call, lat = 40, lon = -120) {
  return {
    id: `${providerId}-${call}`,
    providerId,
    sourceName: providerId,
    sourceType: providerId === 'nws' ? 'federal_agency' : 'commercial_weather',
    subjectType: 'weather_forecast',
    subjectId: null,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    bbox: null,
    observedAt: NOW.toISOString(),
    publishedAt: NOW.toISOString(),
    ingestedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    rawPayloadRef: null,
    normalizedPayload: {
      current: { temp: 70, wind_speed: 6 },
      forecast: [{ startTime: NOW.toISOString(), temperature: 72, windSpeed: 7 }],
    },
    evidenceUrl: null,
    contentHash: `${providerId}-${call}-hash`,
    confidenceScore: 88,
    confidenceBreakdown: {
      providerDefault: 88,
      freshness: 90,
      sourceAuthority: 85,
      completeness: 90,
      stalePenalty: 0,
    },
    knownLimitations: [],
    supersedesObservationId: null,
    offlineCacheEligible: true,
    staleAt: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),
    validUntil: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
  };
}

function registry(delayMs = 0) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async runAdapter(providerId, input) {
      calls += 1;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        providerId,
        observations: [observation(providerId, calls, input.lat, input.lon)],
        cacheStatus: 'miss',
        stale: false,
        warnings: [],
        contentHash: `${providerId}-${calls}`,
      };
    },
  };
}

async function main() {
  const legacyRegistry = registry(0);
  const legacyStarted = Date.now();
  await Promise.all(Array.from({ length: 20 }, () => legacyRegistry.runAdapter(
    'openweather_onecall',
    { lat: 40.001, lon: -120.001 },
    {},
  )));
  const legacyDirectDurationMs = Date.now() - legacyStarted;

  const sharedRegistry = registry(6);
  const broker = createOperationalWeatherEnvironmentBroker({
    registry: sharedRegistry,
    nowMs: () => NOW.getTime(),
    maxCacheEntries: 8,
  });
  const unsubs = Array.from({ length: 4 }, () => broker.subscribe(() => {}));
  const brokerRequest = {
    coordinate: { lat: 40.001, lon: -120.001 },
    providerIds: ['openweather_onecall'],
    kinds: ['observation', 'forecast'],
    timeWindow: NOW.toISOString(),
    now: NOW,
  };

  const sharedStarted = Date.now();
  await Promise.all(Array.from({ length: 20 }, (_, index) => broker.fetch({
    ...brokerRequest,
    requestScope: `consumer-${index}`,
  })));
  const sharedDurationMs = Date.now() - sharedStarted;
  await Promise.all(Array.from({ length: 20 }, (_, index) => broker.fetch({
    ...brokerRequest,
    coordinate: { lat: 40.001 + index * 0.00001, lon: -120.001 },
  })));
  for (const unsubscribe of unsubs) unsubscribe();
  const diagnostics = broker.getDiagnostics();
  const avoidedRequests = diagnostics.joinedRequestCount + diagnostics.cacheHitCount;
  const requestAvoidanceRate = diagnostics.requestCount > 0
    ? avoidedRequests / diagnostics.requestCount
    : 0;

  const routeRegistry = registry(0);
  const geometry = Array.from({ length: 5_000 }, (_, index) => ({
    lat: 35 + index * 0.0002,
    lon: -118 - index * 0.0002,
  }));
  const routeStarted = Date.now();
  const routeResult = await sampleRouteWeatherRisk({
    routeId: 'performance-route',
    routeJobScope: 'performance-route',
    geometry,
    tripStartTime: NOW.toISOString(),
    estimatedRouteDurationMinutes: 480,
    sampleIntervalMiles: 10,
    maxSamplePoints: 12,
    maxProviderCalls: 12,
    providerPriorityList: ['nws'],
    now: NOW,
  }, routeRegistry);
  const routeSamplingDurationMs = Date.now() - routeStarted;

  const checks = {
    identicalRequestProviderCalls: sharedRegistry.calls === 1,
    requestAvoidanceRate: requestAvoidanceRate >= 0.95,
    boundedCache: diagnostics.cacheSize <= 8,
    noOutstandingBrokerJobs: diagnostics.inFlightCount === 0,
    boundedRouteSamples: routeResult.samplePoints.length <= 12,
    boundedRouteProviderCalls: routeResult.diagnostics.providerCallsAttempted <= 12,
    subscriberCleanup: diagnostics.subscriberCount === 0,
    subscriberFanOutBounded: diagnostics.subscriberNotificationCount === 4,
  };
  const report = {
    schemaVersion: 1,
    workflow: 'operational_weather_broker_ci',
    generatedAt: new Date().toISOString(),
    measurements: {
      syntheticLegacyDirectProviderCalls: legacyRegistry.calls,
      syntheticLegacyDirectDurationMs: legacyDirectDurationMs,
      logicalRequests: diagnostics.requestCount,
      providerCalls: sharedRegistry.calls,
      joinedRequests: diagnostics.joinedRequestCount,
      cacheHits: diagnostics.cacheHitCount,
      requestAvoidanceRate: Number(requestAvoidanceRate.toFixed(3)),
      subscriberNotifications: diagnostics.subscriberNotificationCount,
      subscriberFanOut: 4,
      sharedRequestDurationMs: sharedDurationMs,
      routeGeometryPointCount: geometry.length,
      routeSamplePointCount: routeResult.samplePoints.length,
      routeProviderCalls: routeResult.diagnostics.providerCallsAttempted,
      routeSamplingDurationMs,
      cacheEntries: diagnostics.cacheSize,
      outstandingAsyncJobs: diagnostics.inFlightCount,
    },
    beforeAfter: {
      scope: 'deterministic_ci_fixture_not_device_or_provider_measurement',
      beforeDirectProviderCalls: legacyRegistry.calls,
      afterBrokerProviderCalls: sharedRegistry.calls,
      providerCallReductionRate: Number((1 - sharedRegistry.calls / legacyRegistry.calls).toFixed(3)),
    },
    budgets: {
      identicalRequestProviderCallsMax: 1,
      relativeRequestAvoidanceRateMin: 0.95,
      brokerCacheEntriesMax: 8,
      routeSamplePointsMax: 12,
      routeProviderCallsMax: 12,
      outstandingAsyncJobsMax: 0,
      subscriberNotificationsPerSourceUpdateMax: 4,
      timingPolicy: 'observed_only_requires_real_supported_device_baseline',
    },
    checks,
    passed: Object.values(checks).every(Boolean),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
