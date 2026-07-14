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
  createOperationalWeatherEnvironmentBroker,
} = require(path.join(process.cwd(), 'lib', 'weatherBrokerEnvironment.ts'));
const {
  createWeatherAdvisoryPublicationLedger,
} = require(path.join(process.cwd(), 'lib', 'weatherAdvisoryPublicationLedger.ts'));

const NOW = new Date('2026-07-13T12:00:00.000Z');
let observationSequence = 0;

function makeObservation(options = {}) {
  const providerId = options.providerId ?? 'openweather_onecall';
  const subjectType = options.subjectType ?? 'weather_forecast';
  const observedAt = options.observedAt ?? NOW.toISOString();
  const id = options.id ?? `${providerId}-${subjectType}-${++observationSequence}`;
  return {
    id,
    providerId,
    sourceName: options.sourceName ?? providerId,
    sourceType: options.sourceType ?? 'commercial_weather',
    subjectType,
    subjectId: options.subjectId ?? null,
    geometry: options.geometry ?? { type: 'Point', coordinates: [-120, 40] },
    bbox: null,
    observedAt,
    publishedAt: observedAt,
    ingestedAt: options.ingestedAt ?? NOW.toISOString(),
    expiresAt: options.expiresAt ?? new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    rawPayloadRef: null,
    normalizedPayload: options.payload ?? {
      current: { temp: 70, wind_speed: 5 },
      hourly: [{ dt: NOW.getTime() / 1000, temp: 72, wind_speed: 6 }],
    },
    evidenceUrl: null,
    contentHash: options.contentHash ?? `${id}-hash`,
    confidenceScore: options.confidenceScore ?? 88,
    confidenceBreakdown: {
      providerDefault: 88,
      freshness: 90,
      sourceAuthority: 80,
      completeness: 90,
      stalePenalty: 0,
    },
    knownLimitations: options.knownLimitations ?? [],
    supersedesObservationId: null,
    offlineCacheEligible: true,
    staleAt: options.staleAt ?? new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),
    validUntil: options.validUntil ?? new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
  };
}

function runResult(providerId, observations, options = {}) {
  return {
    providerId,
    observations,
    cacheStatus: options.cacheStatus ?? 'miss',
    stale: options.stale ?? false,
    warnings: options.warnings ?? [],
    contentHash: `${providerId}-run`,
  };
}

function createRegistry(handlers) {
  const calls = [];
  return {
    calls,
    async runAdapter(providerId, input, context) {
      calls.push({ providerId, input });
      const handler = handlers[providerId];
      if (!handler) return runResult(providerId, []);
      return handler(input, context, calls.length);
    },
  };
}

function request(overrides = {}) {
  return {
    coordinate: { lat: 40.001, lon: -120.001 },
    providerIds: ['openweather_onecall'],
    kinds: ['observation', 'forecast', 'alert', 'air_quality', 'fire_detection'],
    units: 'imperial',
    timeWindow: NOW.toISOString(),
    now: NOW,
    ...overrides,
  };
}

async function main() {
  let online = true;
  const registry = createRegistry({
    openweather_onecall: async () => {
      await new Promise((resolve) => setTimeout(resolve, 8));
      return runResult('openweather_onecall', [makeObservation({ id: 'ow-current' })]);
    },
  });
  const broker = createOperationalWeatherEnvironmentBroker({
    registry,
    isOnline: () => online,
    nowMs: () => NOW.getTime(),
    maxCacheEntries: 4,
  });

  let subscriberA = 0;
  let subscriberB = 0;
  const unsubscribeA = broker.subscribe(() => { subscriberA += 1; });
  const unsubscribeB = broker.subscribe(() => { subscriberB += 1; });
  const [first, joined] = await Promise.all([
    broker.fetch(request({ requestScope: 'dashboard' })),
    broker.fetch(request({ requestScope: 'dispatch' })),
  ]);
  assert.strictEqual(registry.calls.length, 1, 'Identical multi-consumer requests should share one provider call.');
  assert.strictEqual(first.requestKey, joined.requestKey, 'Consumer scope must not fragment the request key.');
  assert.strictEqual(first.byKind.observation.length, 1);
  assert.strictEqual(first.byKind.forecast.length, 1);
  assert.strictEqual(subscriberA, 1);
  assert.strictEqual(subscriberB, 1);
  assert.strictEqual(broker.getDiagnostics().joinedRequestCount, 1);

  const cancellationRegistry = createRegistry({
    nws: async () => {
      await new Promise((resolve) => setTimeout(resolve, 12));
      return runResult('nws', [makeObservation({
        id: 'shared-cancellation',
        providerId: 'nws',
        sourceType: 'federal_agency',
      })]);
    },
  });
  const cancellationBroker = createOperationalWeatherEnvironmentBroker({
    registry: cancellationRegistry,
    nowMs: () => NOW.getTime(),
  });
  const cancelledConsumer = new AbortController();
  const retainedConsumer = new AbortController();
  const cancelledPromise = cancellationBroker.fetch(request({
    providerIds: ['nws'],
    signal: cancelledConsumer.signal,
    requestScope: 'navigate',
  })).then(() => null, (error) => error);
  const retainedPromise = cancellationBroker.fetch(request({
    providerIds: ['nws'],
    signal: retainedConsumer.signal,
    requestScope: 'dashboard',
  }));
  cancelledConsumer.abort();
  const [cancelledError, retainedResult] = await Promise.all([cancelledPromise, retainedPromise]);
  assert.strictEqual(cancelledError?.name, 'OperationalWeatherRequestCancelledError');
  assert.strictEqual(cancellationRegistry.calls.length, 1);
  assert.ok(retainedResult.data.length > 0, 'One consumer cancelling must not abort work still needed by another consumer.');

  const jitterResult = await broker.fetch(request({
    coordinate: { lat: 40.009, lon: -120.009 },
    requestScope: 'navigate',
  }));
  assert.strictEqual(registry.calls.length, 1, 'GPS jitter inside a coordinate bucket should use the shared cache.');
  assert.strictEqual(jitterResult.cacheHit, true);
  unsubscribeA();
  unsubscribeB();
  assert.strictEqual(broker.getDiagnostics().subscriberCount, 0, 'Subscribers should clean up exactly.');

  const forecastOnlyRegistry = createRegistry({
    nws: async () => runResult('nws', [makeObservation({
      id: 'forecast-only',
      providerId: 'nws',
      sourceType: 'federal_agency',
      payload: { forecast: [{ startTime: NOW.toISOString(), temperature: 66 }] },
    })]),
  });
  const forecastOnly = await createOperationalWeatherEnvironmentBroker({
    registry: forecastOnlyRegistry,
    nowMs: () => NOW.getTime(),
  }).fetch(request({ providerIds: ['nws'], kinds: ['observation', 'forecast'] }));
  assert.strictEqual(forecastOnly.byKind.observation.length, 0, 'Forecast-only data must not be labeled as a current observation.');
  assert.strictEqual(forecastOnly.byKind.forecast.length, 1);

  const shortValidityRegistry = createRegistry({
    openweather_onecall: async () => runResult('openweather_onecall', [makeObservation({
      id: 'short-validity',
      expiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
      staleAt: new Date(NOW.getTime() + 30_000).toISOString(),
      validUntil: new Date(NOW.getTime() + 30_000).toISOString(),
    })]),
  });
  const shortValidityBroker = createOperationalWeatherEnvironmentBroker({
    registry: shortValidityRegistry,
    nowMs: () => NOW.getTime(),
  });
  await shortValidityBroker.fetch(request());
  const crossedValidity = await shortValidityBroker.fetch(request({
    now: new Date(NOW.getTime() + 45_000),
  }));
  assert.strictEqual(crossedValidity.cacheHit, true);
  assert.ok(crossedValidity.data.every((datum) => datum.stale), 'Provider validity must override the generic broker cache TTL.');
  assert.ok(crossedValidity.warnings.some((warning) => warning.includes('validity boundary')));

  const isolatedRegistry = createRegistry({
    nws: async () => { throw new Error('NWS provider unavailable'); },
    openweather_onecall: async () => runResult('openweather_onecall', [makeObservation({ id: 'healthy-provider' })]),
  });
  const isolated = await createOperationalWeatherEnvironmentBroker({
    registry: isolatedRegistry,
    nowMs: () => NOW.getTime(),
  }).fetch(request({ providerIds: ['nws', 'openweather_onecall'] }));
  assert.ok(isolated.data.length > 0, 'One provider failure must not clear another provider result.');
  assert.strictEqual(isolated.providers.find((item) => item.providerId === 'nws').status, 'failed');
  assert.strictEqual(isolated.providers.find((item) => item.providerId === 'openweather_onecall').status, 'success');

  const timeoutRegistry = createRegistry({
    nws: async () => new Promise(() => {}),
  });
  const timeout = await createOperationalWeatherEnvironmentBroker({
    registry: timeoutRegistry,
    timeoutMs: 5,
    nowMs: () => NOW.getTime(),
  }).fetch(request({ providerIds: ['nws'] }));
  assert.strictEqual(timeout.providers[0].status, 'timeout');
  assert.strictEqual(timeout.byKind.observation.length, 0);

  let shouldFailRefresh = false;
  const lastGoodRegistry = createRegistry({
    openweather_onecall: async () => {
      if (shouldFailRefresh) throw new Error('provider refresh failed token=server-secret');
      return runResult('openweather_onecall', [makeObservation({ id: 'last-good' })]);
    },
  });
  const lastGoodBroker = createOperationalWeatherEnvironmentBroker({
    registry: lastGoodRegistry,
    nowMs: () => NOW.getTime(),
  });
  await lastGoodBroker.fetch(request());
  shouldFailRefresh = true;
  const lastGood = await lastGoodBroker.fetch(request({ forceRefresh: true }));
  assert.strictEqual(lastGood.providers[0].status, 'degraded');
  assert.strictEqual(lastGood.providers[0].cacheState, 'last_good');
  assert.strictEqual(lastGood.data[0].stale, true);
  assert.ok(!lastGood.warnings.join(' ').includes('server-secret'), 'Diagnostics must redact provider credentials.');

  const persisted = lastGoodBroker.exportState();
  online = false;
  const restarted = createOperationalWeatherEnvironmentBroker({
    registry: lastGoodRegistry,
    initialState: persisted,
    isOnline: () => online,
    nowMs: () => NOW.getTime(),
  });
  const offline = await restarted.fetch(request());
  assert.strictEqual(offline.cacheHit, true);
  assert.strictEqual(offline.stale, true);
  assert.ok(offline.data.length > 0, 'Persisted offline snapshots should remain usable and visibly stale.');

  const conflictRegistry = createRegistry({
    nws: async () => runResult('nws', [makeObservation({
      id: 'nws-observation',
      providerId: 'nws',
      sourceType: 'federal_agency',
      payload: { current: { temp: 48, wind_speed: 4 } },
    })]),
    openweather_onecall: async () => runResult('openweather_onecall', [makeObservation({
      id: 'ow-observation',
      payload: { current: { temp: 70, wind_speed: 25 } },
    })]),
  });
  const conflict = await createOperationalWeatherEnvironmentBroker({
    registry: conflictRegistry,
    nowMs: () => NOW.getTime(),
  }).fetch(request({ providerIds: ['nws', 'openweather_onecall'], kinds: ['observation'] }));
  assert.strictEqual(conflict.byKind.observation.length, 2, 'Conflicting provider facts must remain separate.');
  assert.ok(conflict.conflicts.length > 0, 'Material provider differences should be surfaced as conflicts.');

  const alertPayload = {
    event: 'Red Flag Warning',
    onset: NOW.toISOString(),
    expires: new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  };
  const alertRegistry = createRegistry({
    nws: async () => runResult('nws', [makeObservation({
      id: 'official-alert',
      providerId: 'nws',
      sourceType: 'federal_agency',
      subjectType: 'weather_alert',
      payload: alertPayload,
    })]),
    openweather_onecall: async () => runResult('openweather_onecall', [makeObservation({
      id: 'commercial-alert',
      subjectType: 'weather_alert',
      payload: alertPayload,
    })]),
  });
  const alerts = await createOperationalWeatherEnvironmentBroker({
    registry: alertRegistry,
    nowMs: () => NOW.getTime(),
  }).fetch(request({ providerIds: ['nws', 'openweather_onecall'], kinds: ['alert'] }));
  assert.strictEqual(alerts.byKind.alert.length, 1, 'Equivalent cross-provider alerts should publish once.');
  assert.strictEqual(alerts.byKind.alert[0].authority, 'official', 'Official alert authority should win dedupe priority.');
  assert.strictEqual(alerts.diagnostics.alertDuplicatesSuppressed, 1);

  const noAqi = await createOperationalWeatherEnvironmentBroker({
    registry: createRegistry({ airnow: async () => runResult('airnow', []) }),
    nowMs: () => NOW.getTime(),
  }).fetch(request({ providerIds: ['airnow'], kinds: ['air_quality'] }));
  assert.strictEqual(noAqi.byKind.air_quality.length, 0);
  assert.strictEqual(noAqi.providers[0].status, 'unavailable');

  const boundedRegistry = createRegistry({
    openweather_onecall: async (_, __, call) => runResult('openweather_onecall', [makeObservation({ id: `bounded-${call}` })]),
  });
  const bounded = createOperationalWeatherEnvironmentBroker({
    registry: boundedRegistry,
    nowMs: () => NOW.getTime(),
    maxCacheEntries: 2,
  });
  await bounded.fetch(request({ coordinate: { lat: 35, lon: -120 } }));
  await bounded.fetch(request({ coordinate: { lat: 36, lon: -120 } }));
  await bounded.fetch(request({ coordinate: { lat: 37, lon: -120 } }));
  assert.strictEqual(bounded.getDiagnostics().cacheSize, 2);
  assert.ok(bounded.getDiagnostics().cacheEvictionCount >= 1);
  assert.strictEqual(bounded.getDiagnostics().devOnly, true, 'Provider health diagnostics remain operator/development data.');

  const advisoryLedger = createWeatherAdvisoryPublicationLedger(16);
  assert.strictEqual(advisoryLedger.evaluate({
    namespace: 'weather-test',
    scopeKey: 'route-a',
    severity: 'watch',
    fingerprint: 'wind watch',
    publishedAt: 1_000_000,
    dedupeWindowMs: 15 * 60 * 1000,
  }), 'emitted');
  assert.strictEqual(advisoryLedger.evaluate({
    namespace: 'weather-test',
    scopeKey: 'route-a',
    severity: 'watch',
    fingerprint: 'wind watch',
    publishedAt: 1_001_000,
    dedupeWindowMs: 15 * 60 * 1000,
  }), 'duplicate_suppressed');
  assert.strictEqual(advisoryLedger.evaluate({
    namespace: 'weather-test',
    scopeKey: 'route-a',
    severity: 'critical',
    fingerprint: 'wind warning',
    publishedAt: 1_002_000,
    dedupeWindowMs: 15 * 60 * 1000,
  }), 'severity_escalation');
  for (let index = 0; index < 40; index += 1) {
    advisoryLedger.evaluate({
      namespace: 'weather-test',
      scopeKey: `route-${index}`,
      severity: 'info',
      fingerprint: `advisory-${index}`,
      publishedAt: 2_000_000,
      dedupeWindowMs: 15 * 60 * 1000,
    });
  }
  assert.strictEqual(advisoryLedger.getDiagnostics().size, 16, 'Advisory publication history must remain bounded.');
  assert.ok(advisoryLedger.getDiagnostics().evicted > 0);

  console.log('Operational weather environmental broker checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
