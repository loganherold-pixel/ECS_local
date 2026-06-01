const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const {
  buildWeatherRequestKey,
  clearInFlightWeatherRequests,
  getInFlightWeatherRequestCount,
  runDedupedWeatherRequest,
} = loadTypeScriptModule('lib/weatherRequestDedupe.ts');

const weatherStore = fs
  .readFileSync(path.join(process.cwd(), 'lib', 'weatherStore.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

async function main() {
  clearInFlightWeatherRequests();

  const baseKey = buildWeatherRequestKey({
    mode: 'location',
    coordinates: [{ lat: 39.12345, lng: -120.98765 }],
    units: 'imperial',
    forceRefresh: false,
  });
  const roundedKey = buildWeatherRequestKey({
    mode: 'location',
    coordinates: [{ lat: 39.12349, lng: -120.98761 }],
    units: 'imperial',
    forceRefresh: false,
  });
  const metricKey = buildWeatherRequestKey({
    mode: 'location',
    coordinates: [{ lat: 39.12345, lng: -120.98765 }],
    units: 'metric',
    forceRefresh: false,
  });
  const forceKey = buildWeatherRequestKey({
    mode: 'location',
    coordinates: [{ lat: 39.12345, lng: -120.98765 }],
    units: 'imperial',
    forceRefresh: true,
  });

  assert.strictEqual(baseKey, roundedKey, 'weather request key should round coordinates to 3 decimals');
  assert.notStrictEqual(baseKey, metricKey, 'weather request key should keep unit changes distinct');
  assert.notStrictEqual(baseKey, forceKey, 'weather request key should keep force refresh distinct');

  let serviceCalls = 0;
  let joined = 0;
  const request = () => {
    serviceCalls += 1;
    return new Promise(resolve => setTimeout(() => resolve({ ok: true, calls: serviceCalls }), 15));
  };

  const [first, second, third] = await Promise.all([
    runDedupedWeatherRequest(baseKey, request, () => { joined += 1; }),
    runDedupedWeatherRequest(baseKey, request, () => { joined += 1; }),
    runDedupedWeatherRequest(baseKey, request, () => { joined += 1; }),
  ]);

  assert.deepStrictEqual(first, { ok: true, calls: 1 });
  assert.strictEqual(first, second, 'duplicate in-flight requests should reuse the same promise result');
  assert.strictEqual(second, third, 'triple in-flight requests should reuse the same promise result');
  assert.strictEqual(serviceCalls, 1, 'duplicate in-flight requests should create one service call');
  assert.strictEqual(joined, 2, 'duplicate callers should report joining the existing request');
  assert.strictEqual(getInFlightWeatherRequestCount(), 0, 'in-flight weather requests should clear after completion');

  assert(weatherStore.includes('request_joined_existing'), 'weather store should log joined duplicate requests');
  assert(weatherStore.includes('WEATHER_JOIN_LOG_THROTTLE_MS'), 'weather store should throttle repeated joined-existing logs');
  assert(weatherStore.includes('weatherJoinedExistingLog(requestKey'), 'weather store should route joined-existing logs through the throttle helper');
  assert(weatherStore.includes('request_skipped_fresh_cache'), 'weather store should log fresh cache skips');
  assert(weatherStore.includes('runDedupedWeatherRequest(requestKey'), 'weather store should dedupe live weather requests by key');

  console.log('weather request dedupe tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
