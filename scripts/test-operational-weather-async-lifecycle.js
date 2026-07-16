/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypeScriptModule(relativePath, stubs) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const compiled = new Module(fullPath, module);
  compiled.filename = fullPath;
  compiled.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compiled.require = request => {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request];
    }
    return Module._load(request, compiled);
  };
  compiled._compile(output.outputText, fullPath);
  return compiled.exports;
}

function loadAsyncSurfaceState() {
  return compileTypeScriptModule('lib/state/asyncSurfaceState.ts', {
    '../ecsLogger': { ecsLog: { dev() {} } },
    '../observability/ecsDiagnosticRedaction': {
      createECSDiagnosticToken: (prefix, value) => `${prefix}_${String(value).slice(-16)}`,
      fingerprintECSDiagnosticValue: value => JSON.stringify(value),
    },
    '../observability/ecsErrorContract': {
      normalizeECSSafeCode: value => String(value).toUpperCase().replace(/[^A-Z0-9_]+/g, '_'),
    },
    '../sourceTruth': {},
  });
}

function usableWeatherResult(result) {
  return Boolean(result?.data?.results?.some(entry => (
    entry?.current != null ||
    (Array.isArray(entry?.forecast) && entry.forecast.length > 0) ||
    (Array.isArray(entry?.daily) && entry.daily.length > 0)
  )));
}

function resolveTarget(input) {
  const candidate = input.currentGps || input.activeRoute || input.selectedCoordinate || input.lastKnown;
  if (!candidate) {
    return {
      coordinate: null,
      label: input.fallbackLabel || 'Current Position',
      sourceType: 'current_location',
      location: {
        source: 'unavailable',
        accuracyM: null,
        unavailableReason: input.currentGpsPermissionDenied ? 'permission denied' : 'waiting for gps',
      },
    };
  }
  const sourceType = input.currentGps
    ? 'current_location'
    : input.activeRoute
      ? 'route_origin'
      : input.selectedCoordinate
        ? 'selected_coordinate'
        : 'last_known';
  return {
    coordinate: { ...candidate, label: candidate.label || input.fallbackLabel || 'Current Position' },
    label: candidate.label || input.fallbackLabel || 'Current Position',
    sourceType,
    location: {
      source: input.currentGps ? 'current_gps' : sourceType,
      accuracyM: candidate.accuracyM ?? null,
      unavailableReason: null,
    },
  };
}

function createAppStateHarness(initialState = 'active') {
  const listeners = new Set();
  const AppState = {
    currentState: initialState,
    addEventListener(event, listener) {
      if (event !== 'change') return { remove() {} };
      listeners.add(listener);
      return {
        remove() {
          listeners.delete(listener);
        },
      };
    },
  };

  return {
    AppState,
    emit(nextState) {
      AppState.currentState = nextState;
      for (const listener of listeners) listener(nextState);
    },
  };
}

function loadOperationalWeather(providerFetch, options = {}) {
  const asyncState = loadAsyncSurfaceState();
  const appStateHarness = createAppStateHarness(options.initialAppState);
  const resolveCachedResult = () => (
    typeof options.cachedResult === 'function'
      ? options.cachedResult()
      : options.cachedResult ?? null
  );
  const weather = compileTypeScriptModule('lib/useOperationalWeather.ts', {
    react: {
      useCallback: callback => callback,
      useEffect() {},
      useMemo: callback => callback(),
      useRef: value => ({ current: value }),
      useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    },
    'react-native': { AppState: appStateHarness.AppState },
    '@react-navigation/native': { useFocusEffect() {} },
    './ecsWeather': {
      buildECSWeatherSnapshot: ({ result, loading, waitingForGps, permissionBlocked, sourceType, locationResolution }) => ({
        status: {
          loading,
          kind: permissionBlocked ? 'permission_required' : waitingForGps ? 'waiting_for_gps' : loading ? 'loading' : result?.error ? 'provider_error' : 'ready',
        },
        sourceType,
        locationResolution,
      }),
    },
    './weatherLastGoodState': {
      resolveWeatherLastGoodUpdate(incoming, lastGood, hasUsableIncoming, options) {
        if (options?.explicitClear) {
          return { value: null, lastGood: null, retainedLastGood: false, clearedExplicitly: true };
        }
        if (hasUsableIncoming && incoming != null) {
          return { value: incoming, lastGood: incoming, retainedLastGood: false, clearedExplicitly: false };
        }
        if (lastGood != null) {
          return { value: lastGood, lastGood, retainedLastGood: true, clearedExplicitly: false };
        }
        return { value: incoming ?? null, lastGood: null, retainedLastGood: false, clearedExplicitly: false };
      },
    },
    './weatherStore': {
      hasUsableWeatherFetchResult: usableWeatherResult,
      waitForWeatherCacheHydration: () => Promise.resolve(),
    },
    './weatherService': {
      fetchSharedWeatherForCoordinates: coordinates => providerFetch(coordinates),
      getAnyCachedSharedWeather: resolveCachedResult,
      getCachedSharedWeatherResult: resolveCachedResult,
      resolveECSWeatherTarget: resolveTarget,
    },
    './weatherRequestDedupe': {
      buildWeatherRequestKey: input => JSON.stringify({
        coordinates: input.coordinates.map(({ lat, lng }) => [lat.toFixed(3), lng.toFixed(3)]),
        units: input.units,
        forceRefresh: input.forceRefresh,
      }),
    },
    './ecsLogger': {
      ecsLog: { warn() {}, dev() {} },
    },
    './weatherDiagnostics': { logWeatherDiagnostics() {} },
    './weatherLocationResolver': { WEATHER_LOCATION_STALE_DISTANCE_METERS: 5000 },
    './performance/ecsPerformanceDiagnostics': {
      incrementECSPerformanceCounter() {},
      startECSPerformanceRequest: () => ({ end() {} }),
    },
    './state/asyncSurfaceState': asyncState,
  });
  weather.__emitAppState = appStateHarness.emit;
  return weather;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function liveResult(lat, temperature) {
  return {
    result: {
      data: {
        results: [{ lat, lng: -120, current: { temp: temperature }, forecast: [], daily: [] }],
        fetched_at: new Date().toISOString(),
        units: 'imperial',
      },
      source: 'live',
      cachedAt: Date.now(),
      error: null,
    },
  };
}

function freshCachedResult(lat, temperature) {
  return {
    data: {
      results: [{ lat, lng: -120, current: { temp: temperature }, forecast: [], daily: [] }],
      fetched_at: new Date().toISOString(),
      units: 'imperial',
    },
    source: 'cache_fresh',
    cachedAt: Date.now(),
    error: null,
  };
}

async function waitUntil(predicate, message, timeoutMs = 500) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function testBoundedWait() {
  const weather = loadOperationalWeather(() => Promise.resolve(liveResult(1, 70)));
  await assert.rejects(
    weather.waitForOperationalWeatherRequest(new Promise(() => {}), { timeoutMs: 10 }),
    error => error instanceof weather.OperationalWeatherWaitError && error.failure === 'timeout',
    'A hung operational weather request must reach a timeout terminal.',
  );

  const controller = new AbortController();
  const cancelled = weather.waitForOperationalWeatherRequest(new Promise(() => {}), {
    signal: controller.signal,
    timeoutMs: 100,
  });
  controller.abort();
  await assert.rejects(
    cancelled,
    error => error instanceof weather.OperationalWeatherWaitError && error.failure === 'cancelled',
    'An aborted operational weather waiter must reach a cancelled terminal.',
  );
}

async function testRejectedProviderTerminatesSafely() {
  const secretFailure = 'provider secret payload should not escape';
  const weather = loadOperationalWeather(() => Promise.reject(new Error(secretFailure)));
  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
  });

  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status !== 'loading',
    'Rejected provider request did not settle.',
  );
  const state = weather.getSharedOperationalWeatherState();
  assert.strictEqual(state.snapshot.status.loading, false, 'Provider rejection must clear shared loading.');
  assert.strictEqual(state.asyncState.status, 'error', 'Provider rejection without data must be terminal error.');
  assert.strictEqual(state.asyncState.safeErrorCode, 'WEATHER_PROVIDER_FAILURE');
  assert.ok(state.result?.error, 'Provider rejection should expose safe terminal guidance.');
  assert.ok(!state.result.error.includes(secretFailure), 'Raw provider errors must not escape into shared UI state.');
}

async function testLastGoodBecomesDegraded() {
  let calls = 0;
  const weather = loadOperationalWeather(coordinates => {
    calls += 1;
    if (calls === 1) return Promise.resolve(liveResult(coordinates[0].lat, 64));
    return Promise.reject(new Error('provider failed after last good'));
  });
  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
  });
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Initial live weather did not settle ready.',
  );

  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 36, lng: -120, hasFix: true },
  });
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'degraded',
    'Failed refresh with last-good data did not settle degraded.',
  );
  const state = weather.getSharedOperationalWeatherState();
  assert.strictEqual(state.snapshot.status.loading, false);
  assert.ok(
    state.result.source === 'cache_fresh' || state.result.source === 'cache_stale',
    'Retained last-good data must be labeled cached rather than live.',
  );
  assert.ok(state.result.error, 'Retained last-good data must retain degraded provider context.');
  assert.strictEqual(state.result.data.results[0].current.temp, 64, 'Last-good weather must be retained.');
}

async function testSupersededResponseCannotOverwrite() {
  const first = deferred();
  const weather = loadOperationalWeather(coordinates => (
    coordinates[0].lat === 35
      ? first.promise
      : Promise.resolve(liveResult(coordinates[0].lat, 81))
  ));
  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
  });
  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 36, lng: -120, hasFix: true },
  });
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Superseding request did not settle ready.',
  );
  first.resolve(liveResult(35, 40));
  await new Promise(resolve => setTimeout(resolve, 20));

  const state = weather.getSharedOperationalWeatherState();
  assert.strictEqual(state.result.data.results[0].current.temp, 81, 'Late superseded weather must not overwrite newer state.');
  assert.strictEqual(state.snapshot.status.loading, false);
}

async function testUnmountCancelsSharedRequest() {
  const weather = loadOperationalWeather(() => new Promise(() => {}));
  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
  });
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'loading',
    'Shared weather did not enter loading before unmount.',
  );

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay, ...args) => originalSetTimeout(
    callback,
    delay === 2500 ? 0 : delay,
    ...args,
  );
  try {
    weather.removeSharedOperationalWeatherConsumer('dashboard');
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'cancelled',
    'Unmounted shared weather request did not settle cancelled.',
  );
  const state = weather.getSharedOperationalWeatherState();
  assert.strictEqual(state.asyncState.cancellationReason, 'unmount');
  assert.strictEqual(state.snapshot.status.loading, false, 'Unmount cancellation must clear loading.');
}

async function testFreshCachedHydrationStillRefreshesLive() {
  let providerCalls = 0;
  const weather = loadOperationalWeather(
    coordinates => {
      providerCalls += 1;
      return Promise.resolve(liveResult(coordinates[0].lat, 72));
    },
    { cachedResult: freshCachedResult(35, 55) },
  );

  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
  });

  await waitUntil(
    () => providerCalls > 0,
    'Fresh cached hydration suppressed the first live provider request.',
  );
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Live refresh after cached hydration did not settle ready.',
  );

  const state = weather.getSharedOperationalWeatherState();
  assert.strictEqual(providerCalls, 1, 'Cached hydration should lead to exactly one shared live refresh.');
  assert.strictEqual(state.result?.source, 'live', 'A successful refresh must replace cached presentation with live source truth.');
  assert.strictEqual(state.result?.data?.results?.[0]?.current?.temp, 72);
  assert.strictEqual(state.snapshot.status.loading, false);
}

async function testEligibleDashboardConsumerSurvivesWaitingConsumer() {
  let providerCalls = 0;
  const pending = deferred();
  const weather = loadOperationalWeather(coordinates => {
    providerCalls += 1;
    return pending.promise.then(() => liveResult(coordinates[0].lat, 68));
  });

  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
  });
  await waitUntil(() => providerCalls === 1, 'Dashboard did not issue its eligible weather request.');

  weather.setSharedOperationalWeatherConsumer('attitude-command-widget', {
    enabled: true,
    gps: { lat: null, lng: null, hasFix: false },
  });
  pending.resolve();

  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'A later coordinate-less consumer displaced the eligible Dashboard request.',
  );

  const state = weather.getSharedOperationalWeatherState();
  assert.strictEqual(providerCalls, 1, 'Two Dashboard consumers must share one eligible provider request.');
  assert.strictEqual(state.result?.source, 'live');
  assert.strictEqual(state.result?.data?.results?.[0]?.current?.temp, 68);
  assert.strictEqual(state.snapshot.status.loading, false);
}

async function testForegroundRefreshesWhenPolicyIsStale() {
  let providerCalls = 0;
  const weather = loadOperationalWeather(coordinates => {
    providerCalls += 1;
    return Promise.resolve(liveResult(coordinates[0].lat, 60 + providerCalls));
  });

  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
    freshnessWindowMs: 5,
  });
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Initial weather request did not settle before foreground test.',
  );

  await new Promise(resolve => setTimeout(resolve, 10));
  weather.__emitAppState('background');
  weather.__emitAppState('active');

  await waitUntil(
    () => providerCalls === 2,
    'Returning to the foreground did not refresh weather after the freshness window elapsed.',
  );
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Foreground refresh did not settle ready.',
  );

  const state = weather.getSharedOperationalWeatherState();
  assert.strictEqual(state.result?.source, 'live');
  assert.strictEqual(state.result?.data?.results?.[0]?.current?.temp, 62);
  assert.strictEqual(state.snapshot.status.loading, false);
}

async function testGpsJitterDoesNotCreateRequestStorm() {
  let providerCalls = 0;
  const weather = loadOperationalWeather(coordinates => {
    providerCalls += 1;
    return Promise.resolve(liveResult(coordinates[0].lat, 70));
  });
  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
  });
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Initial live request did not settle before GPS jitter test.',
  );

  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35.001, lng: -120.001, hasFix: true },
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.strictEqual(providerCalls, 1, 'Sub-threshold GPS jitter must not create another weather request.');
  assert.strictEqual(weather.getSharedOperationalWeatherState().snapshot.status.loading, false);
}

async function testMaterialLocationChangeRefreshes() {
  let providerCalls = 0;
  const weather = loadOperationalWeather(coordinates => {
    providerCalls += 1;
    return Promise.resolve(liveResult(coordinates[0].lat, 70 + providerCalls));
  });
  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
  });
  await waitUntil(() => providerCalls === 1, 'Initial material-location request was not issued.');
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Initial material-location request did not settle.',
  );

  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: 35.1, lng: -120, hasFix: true },
  });
  await waitUntil(() => providerCalls === 2, 'Material location change did not issue a new provider request.');
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Material location refresh did not settle.',
  );
  assert.strictEqual(weather.getSharedOperationalWeatherState().result.data.results[0].current.temp, 72);
}

async function testTwoEligibleConsumersShareRequest() {
  let providerCalls = 0;
  const pending = deferred();
  const weather = loadOperationalWeather(coordinates => {
    providerCalls += 1;
    return pending.promise.then(() => liveResult(coordinates[0].lat, 67));
  });
  const options = {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
  };
  weather.setSharedOperationalWeatherConsumer('dashboard', options);
  weather.setSharedOperationalWeatherConsumer('dispatch-weather-brief', options);
  await waitUntil(() => providerCalls === 1, 'Equivalent consumers did not join one weather request.');
  pending.resolve();
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Shared two-consumer weather request did not settle.',
  );
  assert.strictEqual(providerCalls, 1, 'Equivalent consumers must not duplicate provider requests.');
}

async function testPermissionDeniedTerminatesWithoutProvider() {
  let providerCalls = 0;
  const weather = loadOperationalWeather(() => {
    providerCalls += 1;
    return Promise.resolve(liveResult(35, 70));
  });
  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: null, lng: null, hasFix: false, permissionDenied: true },
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  const state = weather.getSharedOperationalWeatherState();
  assert.strictEqual(providerCalls, 0, 'Permission denial without a fallback must not call the provider.');
  assert.strictEqual(state.snapshot.status.kind, 'permission_required');
  assert.strictEqual(state.snapshot.status.loading, false);
}

async function testDocumentedRouteFallbackLoads() {
  let providerCalls = 0;
  const weather = loadOperationalWeather(coordinates => {
    providerCalls += 1;
    return Promise.resolve(liveResult(coordinates[0].lat, 66));
  });
  weather.setSharedOperationalWeatherConsumer('dashboard', {
    enabled: true,
    gps: { lat: null, lng: null, hasFix: false, permissionDenied: true },
    routeCoordinate: { lat: 36, lng: -119, label: 'Active route origin' },
  });
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Documented active-route fallback did not load weather.',
  );
  const state = weather.getSharedOperationalWeatherState();
  assert.strictEqual(providerCalls, 1);
  assert.strictEqual(state.result.data.results[0].lat, 36);
  assert.strictEqual(state.snapshot.status.loading, false);
}

async function testUnmountRemountRetainsLiveResult() {
  let providerCalls = 0;
  const weather = loadOperationalWeather(coordinates => {
    providerCalls += 1;
    return Promise.resolve(liveResult(coordinates[0].lat, 69));
  });
  const options = {
    enabled: true,
    gps: { lat: 35, lng: -120, hasFix: true },
  };
  weather.setSharedOperationalWeatherConsumer('dashboard', options);
  await waitUntil(
    () => weather.getSharedOperationalWeatherState().asyncState.status === 'ready',
    'Initial live weather did not settle before remount.',
  );
  weather.removeSharedOperationalWeatherConsumer('dashboard');
  weather.setSharedOperationalWeatherConsumer('dashboard-remount', options);
  await new Promise(resolve => setTimeout(resolve, 20));
  const state = weather.getSharedOperationalWeatherState();
  assert.strictEqual(providerCalls, 1, 'A harmless Dashboard remount must retain fresh live weather without refetching.');
  assert.strictEqual(state.result.source, 'live');
  assert.strictEqual(state.snapshot.status.loading, false);
}

async function main() {
  const source = fs.readFileSync(path.join(root, 'lib', 'useOperationalWeather.ts'), 'utf8');
  assert.ok(source.includes("cancelSharedOperationalWeatherRequest('unmount')"), 'No-consumer cleanup must cancel the mounted request.');
  assert.ok(source.includes('isCurrentECSAsyncSurfaceRequest(sharedWeatherAsyncState, identity)'), 'Shared weather must validate typed request identity.');
  assert.ok(source.includes('} catch (error) {') && source.includes('} finally {'), 'Shared weather must own rejection and finally terminals.');

  const focusedRegressionTests = {
    'cache-to-live': testFreshCachedHydrationStillRefreshesLive,
    'consumer-priority': testEligibleDashboardConsumerSurvivesWaitingConsumer,
    'foreground-refresh': testForegroundRefreshesWhenPolicyIsStale,
  };
  const focusedCase = process.env.ECS_WEATHER_TEST_CASE;
  if (focusedCase) {
    const test = focusedRegressionTests[focusedCase];
    assert.ok(test, `Unknown ECS_WEATHER_TEST_CASE: ${focusedCase}`);
    await test();
    console.log(`Operational weather regression test passed: ${focusedCase}.`);
    return;
  }

  await testBoundedWait();
  await testRejectedProviderTerminatesSafely();
  await testLastGoodBecomesDegraded();
  await testSupersededResponseCannotOverwrite();
  await testUnmountCancelsSharedRequest();
  await testFreshCachedHydrationStillRefreshesLive();
  await testEligibleDashboardConsumerSurvivesWaitingConsumer();
  await testForegroundRefreshesWhenPolicyIsStale();
  await testGpsJitterDoesNotCreateRequestStorm();
  await testMaterialLocationChangeRefreshes();
  await testTwoEligibleConsumersShareRequest();
  await testPermissionDeniedTerminatesWithoutProvider();
  await testDocumentedRouteFallbackLoads();
  await testUnmountRemountRetainsLiveResult();
  console.log('Operational weather async lifecycle tests passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
