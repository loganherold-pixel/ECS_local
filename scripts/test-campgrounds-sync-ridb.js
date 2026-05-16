const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const functionPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-ridb', 'index.ts');
const adapterPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-ridb', 'ridbAdapter.ts');
const denoPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-ridb', 'deno.json');

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

require(path.join(root, 'tests', 'campgrounds', 'ridbAdapter.test.ts'));

const source = fs.readFileSync(functionPath, 'utf8');
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const denoConfig = fs.readFileSync(denoPath, 'utf8');

assert.ok(source.includes("getEnvOrNull('RIDB_API_KEY')"), 'RIDB sync must read RIDB_API_KEY server-side only.');
assert.ok(source.includes('admin.auth.getUser(token)'), 'RIDB sync should use ECS admin bearer-token auth.');
assert.ok(source.includes("from('operators')"), 'RIDB sync should check ECS operators for admin access.');
assert.ok(source.includes("admin@expeditioncommand.com"), 'RIDB sync should preserve the internal admin bootstrap pattern.');
assert.ok(source.includes("from('campground_sync_runs')"), 'RIDB sync should record sync runs.');
assert.ok(source.includes("from('campgrounds')"), 'RIDB sync should upsert canonical campgrounds.');
assert.ok(source.includes("from('campground_source_records')"), 'RIDB sync should upsert provider source records.');
assert.ok(source.includes("provider_id', 'ridb'") || source.includes("provider_id: 'ridb'"), 'RIDB sync should use provider_id ridb.');
assert.ok(source.includes('SyncFailureDiagnostic'), 'RIDB sync should return sanitized per-record failure diagnostics.');
assert.ok(source.includes('MAX_FAILURE_DIAGNOSTICS = 5'), 'RIDB sync should cap diagnostic examples.');
assert.ok(source.includes('throwWriteError'), 'RIDB sync should preserve sanitized Supabase write errors.');
assert.ok(source.includes('source_record_upsert'), 'RIDB sync should identify source-record write failures.');
assert.ok(source.includes('failureDiagnostics'), 'RIDB sync response should include limited failure diagnostics.');
assert.ok(!source.includes('failureDiagnostics.push(rows.sourceRecord)'), 'RIDB diagnostics must not include raw source records.');
assert.ok(source.includes('fetchRidbPage'), 'RIDB sync should fetch paginated RIDB pages.');
assert.ok(source.includes('getNextRidbOffset'), 'RIDB sync should handle pagination.');
assert.ok(source.includes('response.status === 429'), 'RIDB sync should handle rate limits.');
assert.ok(source.includes('finalStatus = counts.recordsUpserted > 0 ?'), 'RIDB sync should distinguish partial failures.');
assert.ok(source.includes('dryRun'), 'RIDB sync should support a dryRun invocation path for safe local checks.');
assert.ok(source.includes("select('attribution_text')"), 'RIDB sync should use provider config attribution text.');
assert.ok(source.includes("health_status: 'healthy'"), 'RIDB sync should update provider health metadata after successful sync.');

assert.ok(adapterSource.includes('normalizeRidbFacilityRecord'), 'RIDB adapter should expose normalization.');
assert.ok(adapterSource.includes('source_confidence: RIDB_SOURCE_CONFIDENCE'), 'RIDB source confidence should be explicit and high.');
assert.ok(adapterSource.includes("availability_status: availabilityStatus"), 'RIDB availability should be normalized conservatively.');
assert.ok(adapterSource.includes("status,"), 'RIDB status should be normalized from provider fields only.');
assert.ok(adapterSource.includes('payload_hash: computePayloadHash(record)'), 'RIDB source records should preserve payload hashes.');
assert.ok(adapterSource.includes('raw_json: rawJson'), 'RIDB source records should preserve raw_json for backend provenance.');
assert.ok(adapterSource.includes('dedupeRidbRecords'), 'RIDB adapter should handle duplicate provider IDs.');
assert.ok(adapterSource.includes('ridbProviderError'), 'RIDB adapter should expose sanitized provider errors.');

for (const fixture of [
  'valid-campground.json',
  'missing-lat-lng.json',
  'page-1.json',
  'page-2.json',
  'provider-error.json',
]) {
  assert.ok(
    fs.existsSync(path.join(root, 'fixtures', 'campgrounds', 'ridb', fixture)),
    `RIDB fixture should exist: ${fixture}`,
  );
}

for (const forbidden of [
  'sk_',
  'eyJ',
  'service_role=',
  'apikey=',
  'real-secret',
]) {
  assert.ok(!source.includes(forbidden), `RIDB sync source must not include sensitive token marker: ${forbidden}`);
  assert.ok(!adapterSource.includes(forbidden), `RIDB adapter source must not include sensitive token marker: ${forbidden}`);
}

assert.ok(
  denoConfig.includes('@supabase/functions-js'),
  'RIDB sync function should include the standard Supabase Edge Function deno import config.',
);

console.log('RIDB campgrounds sync adapter checks passed.');
