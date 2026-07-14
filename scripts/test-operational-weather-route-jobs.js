const assert = require('assert');
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
  createOperationalWeatherRouteJobCoordinator,
} = require(path.join(process.cwd(), 'lib', 'weatherBrokerEnvironment.ts'));
const {
  buildSegmentWeatherRisk,
  MAX_ROUTE_WEATHER_SAMPLE_POINTS,
  sampleRouteWeatherRisk,
} = require(path.join(process.cwd(), 'lib', 'ecs5RouteWeatherSampler.ts'));

const NOW = new Date('2026-07-13T12:00:00.000Z');

function observation(providerId, lat, lon, call) {
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
      forecast: [{
        startTime: NOW.toISOString(),
        endTime: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
        temperature: 70,
        windSpeed: 7,
        probabilityOfPrecipitation: 10,
      }],
    },
    evidenceUrl: null,
    contentHash: `${providerId}-${call}-hash`,
    confidenceScore: 90,
    confidenceBreakdown: {
      providerDefault: 90,
      freshness: 90,
      sourceAuthority: 90,
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

function createDelayedRegistry(delayMs = 15) {
  const calls = [];
  return {
    calls,
    runAdapter(providerId, input, context) {
      const call = calls.length + 1;
      calls.push({ providerId, input });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({
          providerId,
          observations: [observation(providerId, input.lat, input.lon, call)],
          cacheStatus: 'miss',
          stale: false,
          warnings: [],
          contentHash: `${providerId}-${call}`,
        }), delayMs);
        if (context?.signal) {
          context.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('provider request cancelled'));
          }, { once: true });
        }
      });
    },
  };
}

async function main() {
  const coordinator = createOperationalWeatherRouteJobCoordinator();
  const first = coordinator.begin('navigate-weather', 'route-a');
  const joined = coordinator.begin('navigate-weather', 'route-a');
  assert.strictEqual(first.isCurrent(), true);
  joined.finish();
  assert.strictEqual(first.isCurrent(), true, 'One joined consumer finishing must not invalidate another.');
  const replacement = coordinator.begin('navigate-weather', 'route-b');
  assert.strictEqual(first.signal.aborted, true, 'A changed route fingerprint should abort the stale job.');
  assert.strictEqual(first.isCurrent(), false);
  assert.strictEqual(replacement.isCurrent(), true);
  replacement.finish();
  first.finish();
  assert.strictEqual(coordinator.getDiagnostics().active, 0);
  assert.ok(coordinator.getDiagnostics().cancelled >= 1);

  const delayedRegistry = createDelayedRegistry(30);
  const routeA = sampleRouteWeatherRisk({
    routeId: 'route-a',
    routeJobScope: 'active-route-test',
    geometry: [{ lat: 40, lon: -120 }, { lat: 40.2, lon: -120.2 }],
    tripStartTime: NOW.toISOString(),
    providerPriorityList: ['nws'],
    now: NOW,
  }, delayedRegistry);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const routeB = sampleRouteWeatherRisk({
    routeId: 'route-b',
    routeJobScope: 'active-route-test',
    geometry: [{ lat: 41, lon: -121 }, { lat: 41.2, lon: -121.2 }],
    tripStartTime: NOW.toISOString(),
    providerPriorityList: ['nws'],
    now: NOW,
  }, delayedRegistry);
  const [staleResult, currentResult] = await Promise.all([routeA, routeB]);
  assert.strictEqual(staleResult.cancelled, true, 'A stale route response must not replace current corridor data.');
  assert.strictEqual(staleResult.segmentRisks.length, 0);
  assert.strictEqual(currentResult.cancelled, false);
  assert.ok(currentResult.segmentRisks.length > 0);

  const quotaRegistry = createDelayedRegistry(0);
  const quotaResult = await sampleRouteWeatherRisk({
    routeId: 'quota-route',
    routeJobScope: 'quota-route-test',
    geometry: Array.from({ length: 200 }, (_, index) => ({
      lat: 35 + index * 0.01,
      lon: -118 - index * 0.01,
    })),
    tripStartTime: NOW.toISOString(),
    estimatedRouteDurationMinutes: 600,
    sampleIntervalMiles: 5,
    maxSamplePoints: 100,
    maxProviderCalls: 4,
    maxRouteDistanceMiles: 20,
    maxForecastHorizonMinutes: 60,
    providerPriorityList: ['nws', 'nws', 'openweather_onecall'],
    now: NOW,
  }, quotaRegistry);
  assert.ok(quotaResult.samplePoints.length <= 2, 'Provider quota should bound route sample count.');
  assert.ok(quotaResult.samplePoints.length <= MAX_ROUTE_WEATHER_SAMPLE_POINTS);
  assert.ok(quotaResult.samplePoints.every((point) => point.distanceMiles <= 20));
  assert.ok(quotaResult.diagnostics.providerCallsAttempted <= 4);
  assert.strictEqual(quotaResult.diagnostics.providerCount, 2, 'Duplicate providers should not consume quota twice.');

  const staleObservation = {
    ...observation('nws', 40, -120, 99),
    cachedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    staleAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    staleReason: 'provider_expired',
    offlineWarning: 'Last-good weather retained for offline reference.',
  };
  const staleRisk = buildSegmentWeatherRisk({
    routeId: 'stale-route',
    point: { lat: 40, lon: -120, distanceMiles: 0, index: 0 },
    estimatedArrivalAt: NOW.toISOString(),
    observations: [staleObservation],
    now: NOW,
  });
  assert.strictEqual(staleRisk.sourceState, 'stale');
  assert.ok(staleRisk.confidenceScore <= 50);
  assert.ok(staleRisk.riskReasons.some((reason) => reason.includes('Stale or last-good')));
  assert.deepStrictEqual(staleRisk.sourceProviders, ['nws']);

  const unavailableRisk = buildSegmentWeatherRisk({
    routeId: 'missing-route',
    point: { lat: 40, lon: -120, distanceMiles: 0, index: 0 },
    estimatedArrivalAt: NOW.toISOString(),
    observations: [],
    now: NOW,
  });
  assert.strictEqual(unavailableRisk.sourceState, 'unavailable');
  assert.strictEqual(unavailableRisk.weatherRiskLabel, 'unknown');

  const samplerSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'ecs5RouteWeatherSampler.ts'), 'utf8');
  const navigateSource = fs.readFileSync(path.join(process.cwd(), 'components', 'navigate', 'RouteCorridorWeather.tsx'), 'utf8');
  assert.ok(samplerSource.includes("from './weatherBrokerEnvironment'"));
  assert.ok(!samplerSource.includes('.runAdapter('), 'Route sampler must not bypass the operational broker.');
  assert.ok(navigateSource.includes('beginOperationalWeatherRouteJob'));
  assert.ok(navigateSource.includes('routeJob.isCurrent()'));
  assert.ok(navigateSource.includes('cancelOperationalWeatherRouteJob'));
  for (const adapterPath of [
    'lib/openWeatherOneCallAdapter.ts',
    'lib/nwsWeatherAdapter.ts',
    'lib/airNowAdapter.ts',
  ]) {
    const adapterSource = fs.readFileSync(path.join(process.cwd(), adapterPath), 'utf8');
    assert.ok(adapterSource.includes('context.signal?.aborted'), `${adapterPath} should stop retry work after cancellation.`);
    assert.ok(adapterSource.includes('context.signal'), `${adapterPath} should forward the broker abort signal.`);
  }

  console.log('Operational weather route job and quota checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
