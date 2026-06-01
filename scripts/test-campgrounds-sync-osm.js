const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const functionPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-osm', 'index.ts');
const adapterPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-osm', 'osmAdapter.ts');
const denoPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-osm', 'deno.json');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

require(path.join(root, 'tests', 'campgrounds', 'osmAdapter.test.ts'));

const source = fs.readFileSync(functionPath, 'utf8');
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const denoConfig = fs.readFileSync(denoPath, 'utf8');

assert.ok(source.includes("getEnvOrNull('OSM_USER_AGENT')"), 'OSM sync must read OSM_USER_AGENT server-side only.');
assert.ok(source.includes("getEnvOrNull('OSM_ATTRIBUTION')"), 'OSM sync must read OSM_ATTRIBUTION server-side only.');
assert.ok(source.includes('admin.auth.getUser(token)'), 'OSM sync should use ECS admin bearer-token auth.');
assert.ok(source.includes("from('operators')"), 'OSM sync should check ECS operators for admin access.');
assert.ok(source.includes("admin@expeditioncommand.com"), 'OSM sync should preserve the internal admin bootstrap pattern.');
assert.ok(source.includes("from('campground_sync_runs')"), 'OSM sync should record sync runs.');
assert.ok(source.includes("from('campgrounds')"), 'OSM sync should upsert canonical campgrounds.');
assert.ok(source.includes("from('campground_source_records')"), 'OSM sync should upsert provider source records.');
assert.ok(source.includes("provider_id', 'osm'") || source.includes("provider_id: 'osm'"), 'OSM sync should use provider_id osm.');
assert.ok(source.includes('SyncFailureDiagnostic'), 'OSM sync should return sanitized per-record failure diagnostics.');
assert.ok(source.includes('MAX_FAILURE_DIAGNOSTICS = 5'), 'OSM sync should cap diagnostic examples.');
assert.ok(source.includes('throwWriteError'), 'OSM sync should preserve sanitized Supabase write errors.');
assert.ok(source.includes('source_record_upsert'), 'OSM sync should identify source-record write failures.');
assert.ok(source.includes('failureDiagnostics'), 'OSM sync response should include limited failure diagnostics.');
assert.ok(!source.includes('failureDiagnostics.push(rows.sourceRecord)'), 'OSM diagnostics must not include raw source records.');
assert.ok(source.includes('validateOsmBbox'), 'OSM sync should require bounded bbox inputs.');
assert.ok(source.includes('buildOsmOverpassQuery'), 'OSM sync should build Overpass queries through the adapter.');
assert.ok(source.includes('fetchOverpassPage'), 'OSM sync should fetch Overpass pages.');
assert.ok(source.includes("'User-Agent': userAgent"), 'OSM sync should send configured OSM user agent.');
assert.ok(source.includes('response.status === 429') && source.includes('response.status === 504'), 'OSM sync should handle Overpass rate limits/timeouts.');
assert.ok(source.includes('finalStatus = counts.recordsUpserted > 0 ?'), 'OSM sync should distinguish partial failures.');
assert.ok(source.includes('dryRun'), 'OSM sync should support a dryRun invocation path for safe local checks.');
assert.ok(source.includes("health_status: 'healthy'"), 'OSM sync should update provider health metadata after successful sync.');

assert.ok(adapterSource.includes('OSM_SOURCE_CONFIDENCE = 58'), 'OSM source confidence should be explicitly lower than official providers.');
assert.ok(adapterSource.includes("availability_status: 'unknown'"), 'OSM must not claim live availability.');
assert.ok(adapterSource.includes("status: 'unknown'"), 'OSM must not claim open/closed legal status.');
assert.ok(adapterSource.includes('node["tourism"~"^(camp_site|camp_pitch)$"]'), 'OSM query should include campsite nodes.');
assert.ok(adapterSource.includes('way["tourism"~"^(camp_site|camp_pitch)$"]'), 'OSM query should include campsite ways.');
assert.ok(adapterSource.includes('relation["tourism"~"^(camp_site|camp_pitch)$"]'), 'OSM query should include campsite relations.');
assert.ok(adapterSource.includes('payload_hash: computePayloadHash(element)'), 'OSM source records should preserve payload hashes.');
assert.ok(adapterSource.includes('raw_json: jsonValue(element)'), 'OSM source records should preserve raw_json for backend provenance.');
assert.ok(adapterSource.includes('selectBestOsmCampgroundMatch'), 'OSM adapter should match before creating canonical records.');
assert.ok(adapterSource.includes('osmProviderError'), 'OSM adapter should expose sanitized provider errors.');

for (const fixture of [
  'node-camp-site.json',
  'way-camp-site.json',
  'relation-camp-site.json',
  'camp-pitch.json',
  'invalid-geometry.json',
  'overpass-page.json',
  'overpass-error.json',
]) {
  assert.ok(
    fs.existsSync(path.join(root, 'fixtures', 'campgrounds', 'osm', fixture)),
    `OSM fixture should exist: ${fixture}`,
  );
}

for (const forbidden of [
  'sk_',
  'eyJ',
  'service_role=',
  'apikey=',
  'real-secret',
]) {
  assert.ok(!source.includes(forbidden), `OSM sync source must not include sensitive token marker: ${forbidden}`);
  assert.ok(!adapterSource.includes(forbidden), `OSM adapter source must not include sensitive token marker: ${forbidden}`);
}

assert.ok(
  denoConfig.includes('@supabase/functions-js'),
  'OSM sync function should include the standard Supabase Edge Function deno import config.',
);

console.log('OSM campgrounds sync adapter checks passed.');
