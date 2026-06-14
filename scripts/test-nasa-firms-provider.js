const assert = require('assert');
const fs = require('fs');
const Module = require('module');
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

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  assertProviderConfigured,
  createECS5ProviderRegistry,
  getProviderHealth,
  providerHealthSnapshotForAdmin,
} = loadTypeScriptModule('lib/ecs5ProviderRegistry.ts');
const {
  buildNasaFirmsAreaUrl,
  buildNasaFirmsDataAvailabilityUrl,
  buildNasaFirmsMapKeyStatusUrl,
  buildNasaFirmsRuntimeConfig,
  createNasaFirmsAdapter,
  normalizeNasaFirmsPayload,
  parseNasaFirmsCsv,
  processNasaFirmsWildfireSignals,
  redactNasaFirmsUrl,
  validateNasaFirmsArea,
  validateNasaFirmsDayRange,
} = loadTypeScriptModule('lib/ecs5FireIntelligence.ts');
const {
  buildNasaFirmsEdgeConfig,
  buildNasaFirmsHealth,
  buildNasaFirmsRequest,
  normalizeNasaFirmsDetections,
} = loadTypeScriptModule('supabase/functions/_shared/nasaFirms.ts');

async function main() {
const now = new Date('2026-06-14T18:00:00.000Z');
const key = 'server-only-firms-secret-key';
const area = '-121.6000,38.7000,-121.1000,39.1000';

assert.strictEqual(
  getProviderHealth('nasa_firms', createECS5ProviderRegistry({}, [], now)).status,
  'intentionally_disabled',
  'NASA FIRMS should not require a key when NASA_FIRMS_ENABLED is unset.',
);
assert.strictEqual(
  getProviderHealth('nasa_firms', createECS5ProviderRegistry({ NASA_FIRMS_ENABLED: 'false' }, [], now)).status,
  'intentionally_disabled',
  'NASA FIRMS disabled should not require NASA_FIRMS_API_KEY.',
);
assert.strictEqual(
  getProviderHealth('nasa_firms', createECS5ProviderRegistry({ NASA_FIRMS_ENABLED: 'true' }, [], now)).status,
  'missing_config',
  'NASA FIRMS enabled without NASA_FIRMS_API_KEY should be missing_config.',
);
assert.strictEqual(
  getProviderHealth('nasa_firms', createECS5ProviderRegistry({ NASA_FIRMS_ENABLED: 'true', NASA_FIRMS_API_KEY: key }, [], now)).status,
  'configured',
  'NASA FIRMS should configure from NASA_FIRMS_API_KEY.',
);
assert.strictEqual(
  getProviderHealth('nasa_firms', createECS5ProviderRegistry({ ENABLE_NASA_FIRMS: 'true', NASA_FIRMS_API_KEY: key }, [], now)).status,
  'configured',
  'Legacy ENABLE_NASA_FIRMS should remain an enable alias.',
);
assert.throws(
  () => assertProviderConfigured('nasa_firms', createECS5ProviderRegistry({ NASA_FIRMS_ENABLED: 'true' }, [], now)),
  (error) => error.message.includes('Missing required NASA FIRMS configuration: NASA_FIRMS_API_KEY'),
  'Missing config message should name NASA_FIRMS_API_KEY exactly.',
);
const adminSnapshot = providerHealthSnapshotForAdmin(createECS5ProviderRegistry({ NASA_FIRMS_ENABLED: 'true', NASA_FIRMS_API_KEY: key }, [], now));
assert.ok(JSON.stringify(adminSnapshot).includes('NASA_FIRMS_API_KEY'));
assert.ok(!JSON.stringify(adminSnapshot).includes(key), 'Provider health snapshot must never expose the NASA FIRMS key.');

const config = buildNasaFirmsRuntimeConfig({
  NASA_FIRMS_ENABLED: 'true',
  NASA_FIRMS_API_KEY: key,
  NASA_FIRMS_API_BASE_URL: 'https://firms.modaps.eosdis.nasa.gov/',
  NASA_FIRMS_DEFAULT_SOURCE: 'VIIRS_SNPP_NRT',
  NASA_FIRMS_DEFAULT_DAY_RANGE: '1',
});
assert.strictEqual(config.enabled, true);
assert.strictEqual(config.baseUrl, 'https://firms.modaps.eosdis.nasa.gov');
assert.strictEqual(config.defaultSource, 'VIIRS_SNPP_NRT');
assert.strictEqual(config.defaultDayRange, 1);

assert.strictEqual(validateNasaFirmsDayRange(1), 1);
assert.strictEqual(validateNasaFirmsDayRange('5'), 5);
assert.throws(() => validateNasaFirmsDayRange(0), /dayRange must be 1 through 5/);
assert.throws(() => validateNasaFirmsDayRange(6), /dayRange must be 1 through 5/);
assert.deepStrictEqual(validateNasaFirmsArea(area), [-121.6, 38.7, -121.1, 39.1]);
assert.throws(() => validateNasaFirmsArea('world'), /area must be west,south,east,north/);

const mapKeyUrl = buildNasaFirmsMapKeyStatusUrl(config);
assert.ok(mapKeyUrl.includes('/mapserver/mapkey_status/'));
assert.ok(mapKeyUrl.includes(`MAP_KEY=${encodeURIComponent(key)}`));
const areaUrl = buildNasaFirmsAreaUrl({ config, area, source: 'VIIRS_SNPP_NRT', dayRange: 2, date: '2026-06-14' });
assert.strictEqual(
  areaUrl,
  `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${area}/2/2026-06-14`,
);
assert.strictEqual(
  buildNasaFirmsDataAvailabilityUrl(config),
  `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${key}/all`,
);
assert.ok(!redactNasaFirmsUrl(areaUrl, key).includes(key), 'Redacted URL must hide the MAP_KEY path segment.');
assert.ok(redactNasaFirmsUrl(areaUrl, key).includes('[REDACTED]'));

const csv = [
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
  '38.801,-121.221,335.2,0.54,0.51,2026-06-14,0915,N,VIIRS,h,2.0NRT,298.4,45.7,D',
  '38.812,-121.230,318.1,0.45,0.48,2026-06-14,0920,N,VIIRS,n,2.0NRT,290.1,7.0,D',
].join('\n');
const rows = parseNasaFirmsCsv(csv);
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].latitude, '38.801');
assert.strictEqual(rows[0].bright_ti4, '335.2');

const registry = createECS5ProviderRegistry({ NASA_FIRMS_ENABLED: 'true', NASA_FIRMS_API_KEY: key }, [], now);
const provider = getProviderHealth('nasa_firms', registry);
const observations = normalizeNasaFirmsPayload(csv, provider, { now });
assert.strictEqual(observations.length, 2);
assert.strictEqual(observations[0].providerId, 'nasa_firms');
assert.strictEqual(observations[0].sourceType, 'satellite');
assert.strictEqual(observations[0].subjectType, 'active_fire');
assert.strictEqual(observations[0].normalizedPayload.source, 'VIIRS_SNPP_NRT');
assert.strictEqual(observations[0].normalizedPayload.instrument, 'VIIRS');
assert.strictEqual(observations[0].normalizedPayload.satellite, 'N');
assert.strictEqual(observations[0].normalizedPayload.daynight, 'D');
assert.strictEqual(observations[0].normalizedPayload.frp, 45.7);
assert.ok(observations[0].confidenceScore >= 80);

const signals = normalizeNasaFirmsDetections(rows, { now, source: 'VIIRS_SNPP_NRT' });
assert.strictEqual(signals[0].source, 'nasa_firms');
assert.strictEqual(signals[0].kind, 'wildfire_hotspot');
assert.strictEqual(signals[0].subject.type, 'wildfire');
assert.strictEqual(signals[0].severity, 'warning');
assert.strictEqual(signals[1].severity, 'caution');
assert.strictEqual(signals[0].observedAt, '2026-06-14T09:15:00.000Z');
assert.ok(!JSON.stringify(signals).includes(key));

const processor = processNasaFirmsWildfireSignals(signals, { now });
assert.strictEqual(processor.title, 'NASA FIRMS wildfire hotspot cluster');
assert.strictEqual(processor.priority, 'warning');
assert.deepStrictEqual(processor.evidenceSignalIds.sort(), signals.map((signal) => signal.id).sort());
assert.ok(processor.summary.includes('2 satellite detections'));
assert.ok(processor.recommendations.some((item) => /verify/i.test(item)));

const edgeConfig = buildNasaFirmsEdgeConfig((name) => ({
  NASA_FIRMS_ENABLED: 'true',
  NASA_FIRMS_API_KEY: key,
  NASA_FIRMS_API_BASE_URL: 'https://firms.modaps.eosdis.nasa.gov',
  NASA_FIRMS_DEFAULT_SOURCE: 'VIIRS_SNPP_NRT',
  NASA_FIRMS_DEFAULT_DAY_RANGE: '1',
})[name]);
assert.strictEqual(edgeConfig.apiKey, key);
const edgeHealth = buildNasaFirmsHealth(edgeConfig, {
  now,
  lastAuthCheckAt: '2026-06-14T17:55:00.000Z',
  lastFetchAt: '2026-06-14T17:56:00.000Z',
  lastProcessedAt: '2026-06-14T17:57:00.000Z',
  lastRecordCount: 2,
});
assert.strictEqual(edgeHealth.provider, 'nasa_firms');
assert.strictEqual(edgeHealth.status, 'healthy');
assert.strictEqual(edgeHealth.apiKeyPresent, true);
assert.ok(!JSON.stringify(edgeHealth).includes(key));

const disabledEdge = buildNasaFirmsEdgeConfig(() => undefined);
assert.strictEqual(disabledEdge.enabled, false);
assert.strictEqual(buildNasaFirmsHealth(disabledEdge, { now }).status, 'disabled');
const missingEdge = buildNasaFirmsEdgeConfig((name) => ({ NASA_FIRMS_ENABLED: 'true' })[name]);
assert.deepStrictEqual(missingEdge.missingEnv, ['NASA_FIRMS_API_KEY']);
assert.strictEqual(buildNasaFirmsHealth(missingEdge, { now }).lastError, 'Missing required NASA FIRMS configuration: NASA_FIRMS_API_KEY');

const request = buildNasaFirmsRequest(edgeConfig, { area, dayRange: 1 });
assert.strictEqual(request.redactedUrl.includes(key), false);
assert.strictEqual(request.url.includes(key), true);
assert.ok(request.cacheKey.includes('nasa_firms:area'));

const adapter = createNasaFirmsAdapter(provider);
let requestedUrl = null;
await adapter.fetch({ area, dayRange: 1, config }, {
  serverFetch: async (requestInput) => {
    requestedUrl = requestInput.url;
    return csv;
  },
  now,
});
assert.ok(requestedUrl.includes(key));
assert.ok(!requestedUrl.includes('{{NASA_FIRMS'));

const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5FireIntelligence.ts'), 'utf8');
const legacyFirmsMapKeyName = 'NASA_FIRMS' + '_MAP_KEY';
assert.ok(!source.includes(legacyFirmsMapKeyName));
assert.ok(!source.includes('{{NASA_FIRMS_API_KEY}}'));

const edgeFunctionSource = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/nasa-firms-intelligence/index.ts'), 'utf8');
for (const envName of [
  'NASA_FIRMS_ENABLED',
  'NASA_FIRMS_API_KEY',
  'NASA_FIRMS_API_BASE_URL',
  'NASA_FIRMS_DEFAULT_SOURCE',
  'NASA_FIRMS_DEFAULT_DAY_RANGE',
]) {
  assert.ok(edgeFunctionSource.includes('Deno.env.get'), 'Edge Function should read runtime config from Deno.env.get.');
  assert.ok(edgeFunctionSource.includes(envName) || fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/nasaFirms.ts'), 'utf8').includes(envName));
}
assert.ok(edgeFunctionSource.includes('redactNasaFirmsUrl(text.slice(0, 500), config.apiKey)'));
assert.ok(!edgeFunctionSource.includes('console.log'), 'Edge Function should not log full FIRMS URLs or secret-bearing responses.');

console.log('NASA FIRMS provider checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
