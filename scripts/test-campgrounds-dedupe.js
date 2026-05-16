const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'supabase', 'functions', '_shared', 'campgroundDedupe.ts');
const functionPath = path.join(root, 'supabase', 'functions', 'campgrounds-dedupe', 'index.ts');
const denoPath = path.join(root, 'supabase', 'functions', 'campgrounds-dedupe', 'deno.json');

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

require(path.join(root, 'tests', 'campgrounds', 'campgroundDedupe.test.ts'));

const helper = fs.readFileSync(helperPath, 'utf8');
const source = fs.readFileSync(functionPath, 'utf8');
const denoConfig = fs.readFileSync(denoPath, 'utf8');

assert.ok(helper.includes('manual: 1000'), 'Manual ECS override should have highest dedupe priority.');
assert.ok(helper.includes('ridb: 920'), 'RIDB should be high-priority for federal catalog identity.');
assert.ok(helper.includes('nps: 900'), 'NPS should be high-priority for NPS enrichment.');
assert.ok(helper.includes('campflare: 780'), 'Campflare should contribute availability/status without beating official identity.');
assert.ok(helper.includes('osm: 580'), 'OSM should remain lower-confidence supplemental data.');
assert.ok(helper.includes('normalizeDedupeUrl'), 'Dedupe helper should compare normalized reservation/detail/source URLs.');
assert.ok(helper.includes('scoreCampgroundPair'), 'Dedupe helper should expose transparent pair scoring.');
assert.ok(helper.includes('buildCampgroundDedupePlan'), 'Dedupe helper should build merge plans.');
assert.ok(helper.includes('mergeCampgroundRows'), 'Dedupe helper should merge canonical fields without null overwrites.');
assert.ok(helper.includes('same provider source record'), 'Dedupe scoring should include exact provider source matches.');
assert.ok(helper.includes('reservation/detail/source URL match'), 'Dedupe scoring should include URL matching.');
assert.ok(helper.includes('within 250 meters'), 'Dedupe scoring should include campground-level proximity.');
assert.ok(helper.includes('same managing agency or organization'), 'Dedupe scoring should include agency context.');

assert.ok(source.includes('buildCampgroundDedupePlan'), 'Dedupe Edge Function should use shared helper plan.');
assert.ok(source.includes('admin.auth.getUser(token)'), 'Dedupe Edge Function should use ECS admin bearer-token auth.');
assert.ok(source.includes("from('operators')"), 'Dedupe Edge Function should check ECS operators for admin access.');
assert.ok(source.includes("from('campgrounds')"), 'Dedupe Edge Function should read/update canonical campgrounds.');
assert.ok(source.includes("from('campground_source_records')"), 'Dedupe Edge Function should move source records to canonical campground.');
assert.ok(source.includes("from('campground_availability')"), 'Dedupe Edge Function should move availability rows to canonical campground.');
assert.ok(source.includes("status: 'removed'"), 'Dedupe Edge Function should remove duplicate map pins by marking duplicates removed.');
assert.ok(source.includes("provider_id: 'dedupe'"), 'Dedupe Edge Function should record sync-run audit rows.');
assert.ok(source.includes('dryRun'), 'Dedupe Edge Function should support dryRun preview.');
assert.ok(source.includes('audit'), 'Dedupe Edge Function should return a clear audit trail.');

for (const forbidden of [
  'RIDB_API_KEY',
  'NPS_API_KEY',
  'CAMPFLARE_API_KEY',
  'ACTIVE_API_KEY',
  'ACTIVE_API_SECRET',
  'RESERVEAMERICA_API_KEY',
  'ASPIRA_API_KEY',
  'OSM_USER_AGENT',
  'sk_',
  'eyJ',
  'service_role=',
]) {
  assert.ok(!helper.includes(forbidden), `Dedupe helper must not reference provider secrets: ${forbidden}`);
  assert.ok(!source.includes(forbidden), `Dedupe function must not reference provider secrets: ${forbidden}`);
}

assert.ok(
  denoConfig.includes('@supabase/functions-js'),
  'Dedupe Edge Function should include the standard Supabase Edge Function deno import config.',
);

console.log('Campground dedupe checks passed.');
