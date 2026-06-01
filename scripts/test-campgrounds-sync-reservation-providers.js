const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sharedAdapterPath = path.join(root, 'supabase', 'functions', '_shared', 'campgroundReservationProviderAdapter.ts');
const sharedSyncPath = path.join(root, 'supabase', 'functions', '_shared', 'campgroundReservationProviderSync.ts');
const activePath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-active', 'index.ts');
const reserveAmericaPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-reserveamerica', 'index.ts');
const aspiraPath = path.join(root, 'supabase', 'functions', 'campgrounds-sync-aspira', 'index.ts');

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

require(path.join(root, 'tests', 'campgrounds', 'reservationProviderAdapter.test.ts'));

const sharedAdapter = fs.readFileSync(sharedAdapterPath, 'utf8');
const sharedSync = fs.readFileSync(sharedSyncPath, 'utf8');
const active = fs.readFileSync(activePath, 'utf8');
const reserveAmerica = fs.readFileSync(reserveAmericaPath, 'utf8');
const aspira = fs.readFileSync(aspiraPath, 'utf8');

assert.ok(active.includes("'ACTIVE_API_KEY'"), 'ACTIVE function must reference ACTIVE_API_KEY server-side.');
assert.ok(active.includes("'ACTIVE_API_SECRET'"), 'ACTIVE function must reference ACTIVE_API_SECRET server-side.');
assert.ok(reserveAmerica.includes("'RESERVEAMERICA_API_KEY'"), 'ReserveAmerica function must reference RESERVEAMERICA_API_KEY server-side.');
assert.ok(aspira.includes("'ASPIRA_API_KEY'"), 'Aspira function must reference ASPIRA_API_KEY server-side.');

for (const [name, source, providerId] of [
  ['ACTIVE', active, 'active'],
  ['ReserveAmerica', reserveAmerica, 'reserveamerica'],
  ['Aspira', aspira, 'aspira'],
]) {
  assert.ok(source.includes('createReservationProviderSyncHandler'), `${name} should use the shared reservation provider sync handler.`);
  assert.ok(source.includes(`providerId: '${providerId}'`), `${name} should set providerId ${providerId}.`);
  assert.ok(source.includes('buildAuthHeaders'), `${name} should build provider auth headers only inside the Edge Function.`);
}

assert.ok(sharedSync.includes('admin.auth.getUser(token)'), 'Reservation provider sync should use ECS admin bearer-token auth.');
assert.ok(sharedSync.includes("from('operators')"), 'Reservation provider sync should check ECS operators for admin access.');
assert.ok(sharedSync.includes("admin@expeditioncommand.com"), 'Reservation provider sync should preserve the internal admin bootstrap pattern.');
assert.ok(sharedSync.includes("from('campground_sync_runs')"), 'Reservation provider sync should record sync runs.');
assert.ok(sharedSync.includes("from('campgrounds')"), 'Reservation provider sync should upsert canonical campgrounds.');
assert.ok(sharedSync.includes("from('campground_source_records')"), 'Reservation provider sync should upsert provider source records.');
assert.ok(sharedSync.includes('response.status === 429'), 'Reservation provider sync should handle rate limits.');
assert.ok(sharedSync.includes('getNextReservationProviderCursor'), 'Reservation provider sync should support cursor pagination.');
assert.ok(sharedSync.includes('getNextReservationProviderOffset'), 'Reservation provider sync should support offset pagination.');
assert.ok(sharedSync.includes('recordsEnriched'), 'Reservation provider sync should count dedupe/enrichment separately.');
assert.ok(sharedSync.includes('finalStatus = counts.recordsUpserted > 0 ?'), 'Reservation provider sync should distinguish partial failures.');
assert.ok(sharedSync.includes('dryRun'), 'Reservation provider sync should support dryRun checks.');
assert.ok(sharedSync.includes("select('attribution_text, base_url')"), 'Reservation provider sync should use provider config metadata.');
assert.ok(sharedSync.includes("health_status: 'healthy'"), 'Reservation provider sync should update provider health metadata after successful sync.');

assert.ok(sharedAdapter.includes('normalizeReservationProviderRecord'), 'Shared adapter should expose reservation provider normalization.');
assert.ok(sharedAdapter.includes('selectBestReservationProviderMatch'), 'Shared adapter should expose cross-provider dedupe matching.');
assert.ok(sharedAdapter.includes('mergeReservationProviderIntoExistingCampground'), 'Shared adapter should preserve/enrich existing canonical records.');
assert.ok(sharedAdapter.includes("availability_status: 'unknown'"), 'Reservation metadata providers should not claim live availability by default.');
assert.ok(sharedAdapter.includes('reservation_url: existingReservation ?? providerReservation'), 'Reservation URLs should be preserved and filled when missing.');
assert.ok(sharedAdapter.includes('payload_hash: computePayloadHash(record)'), 'Source records should preserve payload hashes.');
assert.ok(sharedAdapter.includes('raw_json: jsonValue(record)'), 'Source records should preserve raw_json for backend provenance.');
assert.ok(sharedAdapter.includes('reservationProviderError'), 'Shared adapter should expose sanitized provider errors.');

for (const fixture of [
  'active-campground.json',
  'reserveamerica-campground.json',
  'aspira-campground.json',
  'missing-coordinates.json',
  'provider-error.json',
  'page-1.json',
  'page-2.json',
]) {
  assert.ok(
    fs.existsSync(path.join(root, 'fixtures', 'campgrounds', 'reservation-providers', fixture)),
    `Reservation provider fixture should exist: ${fixture}`,
  );
}

for (const functionName of [
  'campgrounds-sync-active',
  'campgrounds-sync-reserveamerica',
  'campgrounds-sync-aspira',
]) {
  const denoConfig = fs.readFileSync(path.join(root, 'supabase', 'functions', functionName, 'deno.json'), 'utf8');
  assert.ok(
    denoConfig.includes('@supabase/functions-js'),
    `${functionName} should include the standard Supabase Edge Function deno import config.`,
  );
}

for (const forbidden of [
  'sk_',
  'eyJ',
  'service_role=',
  'real-secret',
]) {
  for (const [label, source] of [
    ['shared adapter', sharedAdapter],
    ['shared sync', sharedSync],
    ['active', active],
    ['reserveamerica', reserveAmerica],
    ['aspira', aspira],
  ]) {
    assert.ok(!source.includes(forbidden), `${label} source must not include sensitive token marker: ${forbidden}`);
  }
}

console.log('ACTIVE / ReserveAmerica / Aspira campgrounds sync adapter checks passed.');
