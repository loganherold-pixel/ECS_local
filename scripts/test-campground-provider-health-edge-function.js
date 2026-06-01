const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const functionPath = path.join(root, 'supabase', 'functions', 'campground-provider-health', 'index.ts');
const denoPath = path.join(root, 'supabase', 'functions', 'campground-provider-health', 'deno.json');
const migrationPath = path.join(root, 'supabase', 'migrations', '020_established_campgrounds_provider_layer.sql');

const source = fs.readFileSync(functionPath, 'utf8');
const denoConfig = fs.readFileSync(denoPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

assert.ok(source.includes("serve(async (req) =>"), 'Function should use the repo Edge Function serve pattern.');
assert.ok(source.includes("req.method !== 'GET'"), 'Provider health should be GET-only.');
assert.ok(source.includes('provider_id'), 'Function should support provider_id filtering.');
assert.ok(source.includes('requireAdmin(req)'), 'Provider health must require admin authorization.');
assert.ok(source.includes('admin.auth.getUser(token)'), 'Admin gate should validate bearer tokens through Supabase auth.');
assert.ok(source.includes("from('operators')"), 'Admin gate should check ECS operators.');
assert.ok(source.includes("admin@expeditioncommand.com"), 'Admin gate should preserve existing internal admin bootstrap pattern.');
assert.ok(source.includes("getEnv('ECS_SUPABASE_URL')"), 'Function should use ECS Supabase URL env.');
assert.ok(source.includes("getEnv('ECS_SERVICE_ROLE_KEY')"), 'Function should use ECS service-role env server-side only.');

for (const provider of [
  'ridb',
  'nps',
  'campflare',
  'active',
  'reserveamerica',
  'aspira',
  'osm',
]) {
  assert.ok(source.includes(`providerId: '${provider}'`), `${provider} health definition should be present.`);
}

for (const secretRef of [
  'RIDB_API_KEY',
  'NPS_API_KEY',
  'CAMPFLARE_API_KEY',
  'ACTIVE_API_KEY',
  'ACTIVE_API_SECRET',
  'RESERVEAMERICA_API_KEY',
  'ASPIRA_API_KEY',
  'OSM_USER_AGENT',
  'OSM_ATTRIBUTION',
]) {
  assert.ok(source.includes(`'${secretRef}'`), `${secretRef} should be checked by name.`);
  assert.ok(migration.includes(secretRef), `${secretRef} should remain represented as provider config secret_ref metadata.`);
}

for (const outputField of [
  'providerId',
  'enabled',
  'hasRequiredSecrets',
  'missingSecretRefs',
  'attributionConfigured',
  'checkedAt',
]) {
  assert.ok(source.includes(outputField), `Provider health output should include ${outputField}.`);
}

assert.ok(
  source.includes("select('provider_id, enabled, attribution_text')"),
  'Function should read non-secret provider config metadata only.',
);
assert.ok(!source.includes('secret_ref'), 'Function should not read secret_ref rows from the database.');
assert.ok(!source.includes('console.log('), 'Function should not log provider health payloads.');
assert.ok(!source.includes('console.error('), 'Function should not log raw provider errors.');
assert.ok(!source.includes('Deno.env.toObject'), 'Function should not enumerate all environment variables.');
assert.ok(!source.includes('JSON.stringify(Deno.env'), 'Function should not serialize environment variables.');

for (const forbidden of [
  'sk_',
  'eyJ',
  'service_role=',
  'apikey=',
  'real-secret',
]) {
  assert.ok(!source.includes(forbidden), `Function source must not include sensitive token marker: ${forbidden}`);
}

assert.ok(
  denoConfig.includes('@supabase/functions-js'),
  'Function should include the standard Supabase Edge Function deno import config.',
);

const mockedEnvInvocationExample = {
  ECS_SUPABASE_URL: 'https://example.supabase.co',
  ECS_SERVICE_ROLE_KEY: 'mock-service-role-key',
  RIDB_API_KEY: 'mock-ridb-key',
  NPS_API_KEY: '',
  OSM_USER_AGENT: 'ecs-local-test',
  OSM_ATTRIBUTION: 'OpenStreetMap contributors',
};

assert.strictEqual(
  Object.keys(mockedEnvInvocationExample).includes('RIDB_API_KEY'),
  true,
  'Test should document mocked env var names for local invocation examples.',
);
assert.strictEqual(mockedEnvInvocationExample.NPS_API_KEY, '', 'Empty mocked env values represent missing secrets.');

console.log('Campground provider health Edge Function checks passed.');
