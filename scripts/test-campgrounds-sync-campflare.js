const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const functionPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-campflare', 'index.ts');
const adapterPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-campflare', 'campflareAdapter.ts');
const denoPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-campflare', 'deno.json');
const migrationPath = path.join(root, 'supabase', 'migrations', '021_campground_availability_checked_at.sql');

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

require(path.join(root, 'tests', 'campgrounds', 'campflareAdapter.test.ts'));

const source = fs.readFileSync(functionPath, 'utf8');
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const denoConfig = fs.readFileSync(denoPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

assert.ok(source.includes("getEnvOrNull('CAMPFLARE_API_KEY')"), 'Campflare sync must read CAMPFLARE_API_KEY server-side only.');
assert.ok(source.includes('admin.auth.getUser(token)'), 'Campflare sync should use ECS admin bearer-token auth.');
assert.ok(source.includes("from('operators')"), 'Campflare sync should check ECS operators for admin access.');
assert.ok(source.includes("admin@expeditioncommand.com"), 'Campflare sync should preserve the internal admin bootstrap pattern.');
assert.ok(source.includes("from('campground_sync_runs')"), 'Campflare sync should record sync runs.');
assert.ok(source.includes("from('campground_source_records')"), 'Campflare sync should upsert provider source records.');
assert.ok(source.includes("from('campground_availability')"), 'Campflare sync should upsert availability rows.');
assert.ok(source.includes("from('campgrounds')"), 'Campflare sync should update canonical availability only after matching.');
assert.ok(source.includes("provider_id', 'campflare'") || source.includes("provider_id: 'campflare'"), 'Campflare sync should use provider_id campflare.');
assert.ok(source.includes('buildCampflareAvailabilityUrl'), 'Campflare sync should fetch the availability endpoint adapter URL.');
assert.ok(source.includes('getNextCampflareCursor'), 'Campflare sync should handle cursor pagination.');
assert.ok(source.includes('response.status === 429'), 'Campflare sync should handle rate limits.');
assert.ok(source.includes('selectBestCampflareMatch'), 'Campflare sync should match existing canonical campgrounds.');
assert.ok(source.includes('recordsUnmatched'), 'Campflare sync should count unmatched provider records.');
assert.ok(source.includes('upsertCampflareSource(normalized, null'), 'Unmatched Campflare records should still preserve source provenance.');
assert.ok(source.includes('upsertCampflareAvailabilityRow'), 'Campflare availability should use update-or-insert behavior.');
assert.ok(source.includes("rows.canonicalAvailabilityStatus !== 'unknown'"), 'Canonical availability should update only from fresh provider-backed availability.');
assert.ok(source.includes('last_availability_checked_at'), 'Canonical campgrounds should track fresh availability check time.');
assert.ok(source.includes("select('attribution_text, cache_ttl_seconds, base_url')"), 'Campflare sync should read provider config metadata.');
assert.ok(source.includes('mergeAttribution'), 'Campflare sync should preserve provider attribution on canonical updates.');
assert.ok(source.includes('dryRun'), 'Campflare sync should support a dryRun invocation path for safe local checks.');
assert.ok(source.includes("health_status: 'healthy'"), 'Campflare sync should update provider health metadata after successful sync.');

assert.ok(adapterSource.includes('normalizeCampflareRecord'), 'Campflare adapter should expose normalization.');
assert.ok(adapterSource.includes('effectiveCampflareAvailabilityStatus'), 'Campflare adapter should expose freshness-aware availability status.');
assert.ok(adapterSource.includes('isCampflareAvailabilityFresh'), 'Campflare adapter should expose freshness checks.');
assert.ok(adapterSource.includes('selectBestCampflareMatch'), 'Campflare adapter should expose matching logic.');
assert.ok(adapterSource.includes('payload_hash: computePayloadHash(record)'), 'Campflare source records should preserve payload hashes.');
assert.ok(adapterSource.includes('raw_json: jsonValue(record)'), 'Campflare source records should preserve raw_json for backend provenance.');
assert.ok(adapterSource.includes('canonicalAvailabilityStatus ==='), 'Campflare adapter should prevent expired availability from driving canonical values.');
assert.ok(adapterSource.includes('campflareProviderError'), 'Campflare adapter should expose sanitized provider errors.');

assert.ok(
  migration.includes('last_availability_checked_at') &&
    migration.includes('idx_campgrounds_last_availability_checked_at'),
  'Campflare availability migration should add canonical availability freshness fields.',
);

for (const fixture of [
  'available-campground.json',
  'sold-out-campground.json',
  'first-come-campground.json',
  'expired-availability.json',
  'unmatched-campground.json',
  'provider-error.json',
  'page-1.json',
  'page-2.json',
]) {
  assert.ok(
    fs.existsSync(path.join(root, 'fixtures', 'campgrounds', 'campflare', fixture)),
    `Campflare fixture should exist: ${fixture}`,
  );
}

for (const forbidden of [
  'sk_',
  'eyJ',
  'service_role=',
  'real-secret',
]) {
  assert.ok(!source.includes(forbidden), `Campflare sync source must not include sensitive token marker: ${forbidden}`);
  assert.ok(!adapterSource.includes(forbidden), `Campflare adapter source must not include sensitive token marker: ${forbidden}`);
}

assert.ok(
  denoConfig.includes('@supabase/functions-js'),
  'Campflare sync function should include the standard Supabase Edge Function deno import config.',
);

console.log('Campflare campgrounds sync adapter checks passed.');
