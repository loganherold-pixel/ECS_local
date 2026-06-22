const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalModuleLoad = Module._load;
Module._load = function loadWithWeatherStubs(request, parent, isMain) {
  const normalized = request.replace(/\\/g, '/');
  if (normalized === './supabase' || normalized.endsWith('/lib/supabase')) {
    return {
      supabase: {
        functions: {
          invoke: async () => ({ data: null, error: { message: 'stubbed supabase invoke' } }),
        },
      },
    };
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

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

function walkFiles(dir, matcher, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, matcher, out);
    } else if (matcher(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod.load(fullPath);
  return mod.exports;
}

const appSourceFiles = [
  ...walkFiles(path.join(process.cwd(), 'app'), file => /\.(ts|tsx)$/.test(file)),
  ...walkFiles(path.join(process.cwd(), 'components'), file => /\.(ts|tsx)$/.test(file)),
  ...walkFiles(path.join(process.cwd(), 'lib'), file => /\.(ts|tsx)$/.test(file)),
];

const openWeatherClientSource = read('lib/openWeatherClient.ts');
const weatherStoreSource = read('lib/weatherStore.ts');
const diagnosticsSource = read('lib/weatherDiagnostics.ts');
const routeWeatherSource = read('components/navigate/RouteCorridorWeather.tsx');

assert(openWeatherClientSource.includes('EXPO_PUBLIC_ECS_WEATHER_DEBUG'), 'OpenWeather client should use the requested weather debug flag.');
assert(openWeatherClientSource.includes('EXPO_PUBLIC_ECS_DISABLE_OPENWEATHER'), 'OpenWeather client should expose the local provider kill switch.');
assert(openWeatherClientSource.includes('invokeOpenWeatherOneCallEdgeFunction'), 'OpenWeather edge invocation should be centralized.');
assert(openWeatherClientSource.includes("supabase.functions.invoke('get-weather'"), 'Central client should be the app-side edge function boundary.');
assert(openWeatherClientSource.includes('warnOpenWeatherBypass'), 'Central client should expose a hard dev warning for bypassed calls.');
assert(openWeatherClientSource.includes('recordOpenWeatherCacheHit'), 'Central client should track cache hits.');
assert(openWeatherClientSource.includes('recordOpenWeatherCacheMiss'), 'Central client should track cache misses.');
assert(openWeatherClientSource.includes('recordOpenWeatherDuplicateAvoided'), 'Central client should track duplicate calls avoided.');
assert(openWeatherClientSource.includes('recordOpenWeatherStaleCacheReturn'), 'Central client should track stale cache returns.');
assert(openWeatherClientSource.includes('recordOpenWeatherRateLimitDenial'), 'Central client should track rate-limit denials.');

assert(weatherStoreSource.includes('invokeOpenWeatherOneCallEdgeFunction'), 'weatherStore should use the central OpenWeather client.');
assert(!weatherStoreSource.includes("supabase.functions.invoke('get-weather'"), 'weatherStore should not invoke Supabase weather directly.');
assert(diagnosticsSource.includes("WEATHER_DIAGNOSTICS_DEBUG_FLAG = 'EXPO_PUBLIC_ECS_WEATHER_DEBUG'"), 'Weather diagnostics should use EXPO_PUBLIC_ECS_WEATHER_DEBUG.');
assert(routeWeatherSource.includes('MAX_SAMPLE_POINTS = 6'), 'Route corridor weather sampling should remain bounded to representative buckets.');

const directEdgeInvocations = appSourceFiles
  .filter(file => !/[\\/]lib[\\/]openWeatherClient\.ts$/.test(file))
  .filter(file => !/[\\/]lib[\\/]weatherEdgeFunctionSpec\.ts$/.test(file))
  .filter(file => read(path.relative(process.cwd(), file)).includes("supabase.functions.invoke('get-weather'"))
  .map(file => path.relative(process.cwd(), file).replace(/\\/g, '/'));
assert.deepStrictEqual(directEdgeInvocations, [], 'Only lib/openWeatherClient.ts may invoke the get-weather edge function.');

const directOpenWeatherUrls = appSourceFiles
  .filter(file => !/[\\/]lib[\\/]openWeatherOneCallAdapter\.ts$/.test(file))
  .filter(file => !/[\\/]lib[\\/]weatherEdgeFunctionSpec\.ts$/.test(file))
  .filter(file => read(path.relative(process.cwd(), file)).includes('api.openweathermap.org'))
  .map(file => path.relative(process.cwd(), file).replace(/\\/g, '/'));
assert.deepStrictEqual(directOpenWeatherUrls, [], 'Mobile/app code should not call OpenWeather provider URLs directly.');

const {
  buildOpenWeatherCoordinateBucket,
  getOpenWeatherSessionTelemetrySnapshot,
  invokeOpenWeatherOneCallEdgeFunction,
  recordOpenWeatherCacheHit,
  recordOpenWeatherCacheMiss,
  recordOpenWeatherDuplicateAvoided,
  recordOpenWeatherStaleCacheReturn,
  resetOpenWeatherSessionTelemetry,
} = loadTypeScriptModule('lib/openWeatherClient.ts');

assert.strictEqual(buildOpenWeatherCoordinateBucket({ lat: 39.12349, lng: -120.98751 }), '39.123,-120.988');

resetOpenWeatherSessionTelemetry();
recordOpenWeatherCacheHit({ source: 'test.cache_hit', screen: 'Navigate', coordinateBuckets: ['39.123,-120.988'] });
recordOpenWeatherCacheMiss({ source: 'test.cache_miss', screen: 'Navigate', coordinateBuckets: ['39.123,-120.988'] });
recordOpenWeatherDuplicateAvoided({ source: 'test.duplicate', screen: 'Navigate', coordinateBuckets: ['39.123,-120.988'] });
recordOpenWeatherStaleCacheReturn({ source: 'test.stale', screen: 'Explore', coordinateBuckets: ['39.124,-120.988'] });
const snapshot = getOpenWeatherSessionTelemetrySnapshot();
assert.strictEqual(snapshot.cacheHits, 1);
assert.strictEqual(snapshot.cacheMisses, 1);
assert.strictEqual(snapshot.duplicateCallsAvoided, 1);
assert.strictEqual(snapshot.staleCacheReturns, 1);
assert.strictEqual(snapshot.callsByScreen.Navigate.cacheHits, 1);
assert.strictEqual(snapshot.uniqueCoordinateBuckets.length, 2);

(async () => {
  resetOpenWeatherSessionTelemetry();
  let invoked = false;
  const disabled = await invokeOpenWeatherOneCallEdgeFunction(
    { lat: 39.1, lon: -120.9, units: 'imperial' },
    {
      source: 'test.kill_switch',
      screen: 'Navigate',
      env: { EXPO_PUBLIC_ECS_DISABLE_OPENWEATHER: 'true', EXPO_PUBLIC_ECS_WEATHER_DEBUG: 'true' },
      invoke: async () => {
        invoked = true;
        return { data: {}, error: null };
      },
    },
  );
  assert.strictEqual(invoked, false, 'Kill switch must prevent the edge invocation.');
  assert.strictEqual(disabled.error?.code, 'openweather_disabled');
  assert.strictEqual(getOpenWeatherSessionTelemetrySnapshot().killSwitchDenials, 1);

  resetOpenWeatherSessionTelemetry();
  const ok = await invokeOpenWeatherOneCallEdgeFunction(
    { coordinates: [{ lat: 39.1, lng: -120.9 }, { lat: 39.1004, lng: -120.9004 }], units: 'imperial' },
    {
      source: 'test.live',
      screen: 'Explore',
      routeSessionId: 'route-1',
      env: { EXPO_PUBLIC_ECS_WEATHER_DEBUG: 'true' },
      invoke: async () => ({ data: { ok: true }, error: null }),
    },
  );
  assert.deepStrictEqual(ok.data, { ok: true });
  const liveSnapshot = getOpenWeatherSessionTelemetrySnapshot();
  assert.strictEqual(liveSnapshot.edgeFunctionInvocations, 1);
  assert.strictEqual(liveSnapshot.totalOpenWeatherCallEstimate, 2);
  assert.strictEqual(liveSnapshot.callsByScreen.Explore.edgeFunctionInvocations, 1);
  assert.strictEqual(liveSnapshot.callsByRouteSession['route-1'].edgeFunctionInvocations, 1);

  console.log('openweather api safety checks passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
