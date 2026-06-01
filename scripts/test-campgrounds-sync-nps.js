const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const functionPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-nps', 'index.ts');
const adapterPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-nps', 'npsAdapter.ts');
const denoPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-nps', 'deno.json');

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

require(path.join(root, 'tests', 'campgrounds', 'npsAdapter.test.ts'));

const source = fs.readFileSync(functionPath, 'utf8');
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const denoConfig = fs.readFileSync(denoPath, 'utf8');

assert.ok(source.includes("getEnvOrNull('NPS_API_KEY')"), 'NPS sync must read NPS_API_KEY server-side only.');
assert.ok(source.includes('admin.auth.getUser(token)'), 'NPS sync should use ECS admin bearer-token auth.');
assert.ok(source.includes("from('operators')"), 'NPS sync should check ECS operators for admin access.');
assert.ok(source.includes("admin@expeditioncommand.com"), 'NPS sync should preserve the internal admin bootstrap pattern.');
assert.ok(source.includes("from('campground_sync_runs')"), 'NPS sync should record sync runs.');
assert.ok(source.includes("from('campgrounds')"), 'NPS sync should upsert/enrich canonical campgrounds.');
assert.ok(source.includes("from('campground_source_records')"), 'NPS sync should upsert provider source records.');
assert.ok(source.includes("provider_id', 'nps'") || source.includes("provider_id: 'nps'"), 'NPS sync should use provider_id nps.');
assert.ok(source.includes('SyncFailureDiagnostic'), 'NPS sync should return sanitized per-record failure diagnostics.');
assert.ok(source.includes('MAX_FAILURE_DIAGNOSTICS = 5'), 'NPS sync should cap diagnostic examples.');
assert.ok(source.includes('throwWriteError'), 'NPS sync should preserve sanitized Supabase write errors.');
assert.ok(source.includes('source_record_upsert'), 'NPS sync should identify source-record write failures.');
assert.ok(source.includes('failureDiagnostics'), 'NPS sync response should include limited failure diagnostics.');
assert.ok(!source.includes('failureDiagnostics.push(rows.sourceRecord)'), 'NPS diagnostics must not include raw source records.');
assert.ok(source.includes('buildNpsCampgroundsUrl'), 'NPS sync should fetch campgrounds endpoint.');
assert.ok(source.includes('buildNpsParksUrl'), 'NPS sync should fetch park context.');
assert.ok(source.includes('buildNpsAlertsUrl'), 'NPS sync should fetch alert/context enrichment.');
assert.ok(source.includes('appendApiKey(url, apiKey)'), 'NPS API key should be added server-side at fetch time.');
assert.ok(source.includes('getNextNpsStart'), 'NPS sync should handle pagination.');
assert.ok(source.includes('response.status === 429'), 'NPS sync should handle rate limits.');
assert.ok(source.includes('mergeNpsIntoExistingCampground'), 'NPS sync should enrich existing canonical records.');
assert.ok(source.includes('selectBestNpsCampgroundMatch'), 'NPS sync should match existing campgrounds by name/proximity/context.');
assert.ok(source.includes('recordsEnriched'), 'NPS sync should count enriched records separately.');
assert.ok(source.includes('dryRun'), 'NPS sync should support a dryRun invocation path for safe local checks.');
assert.ok(source.includes("select('attribution_text')"), 'NPS sync should use provider config attribution text.');
assert.ok(source.includes("health_status: 'healthy'"), 'NPS sync should update provider health metadata after successful sync.');

assert.ok(adapterSource.includes('normalizeNpsCampgroundRecord'), 'NPS adapter should expose normalization.');
assert.ok(adapterSource.includes('source_confidence: NPS_SOURCE_CONFIDENCE'), 'NPS source confidence should be explicit.');
assert.ok(adapterSource.includes("availability_status: availabilityStatus"), 'NPS availability should be normalized conservatively.');
assert.ok(adapterSource.includes('mergeNpsIntoExistingCampground'), 'NPS adapter should expose canonical enrichment merge logic.');
assert.ok(adapterSource.includes('selectBestNpsCampgroundMatch'), 'NPS adapter should expose match scoring.');
assert.ok(adapterSource.includes('payload_hash: computePayloadHash'), 'NPS source records should preserve payload hashes.');
assert.ok(adapterSource.includes('raw_json: rawJson'), 'NPS source records should preserve raw_json for backend provenance.');
assert.ok(adapterSource.includes('npsProviderError'), 'NPS adapter should expose sanitized provider errors.');
assert.ok(
  adapterSource.includes('existingReservation ?? npsReservation'),
  'NPS enrichment must preserve stronger existing reservation URLs.',
);
assert.ok(
  adapterSource.includes('keepExistingCoordinates'),
  'NPS enrichment must avoid overwriting higher-confidence coordinates.',
);

for (const fixture of [
  'nps-only-campground.json',
  'nps-ridb-match.json',
  'nps-missing-location.json',
  'nps-park-context.json',
  'nps-alert-context.json',
  'nps-page-1.json',
  'nps-page-2.json',
  'nps-provider-error.json',
]) {
  assert.ok(
    fs.existsSync(path.join(root, 'fixtures', 'campgrounds', 'nps', fixture)),
    `NPS fixture should exist: ${fixture}`,
  );
}

for (const forbidden of [
  'sk_',
  'eyJ',
  'service_role=',
  'real-secret',
]) {
  assert.ok(!source.includes(forbidden), `NPS sync source must not include sensitive token marker: ${forbidden}`);
  assert.ok(!adapterSource.includes(forbidden), `NPS adapter source must not include sensitive token marker: ${forbidden}`);
}

assert.ok(
  denoConfig.includes('@supabase/functions-js'),
  'NPS sync function should include the standard Supabase Edge Function deno import config.',
);

console.log('NPS campgrounds sync adapter checks passed.');
