const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sharedPath = path.join(root, 'supabase', 'functions', '_shared', 'campgroundApi.ts');
const searchPath = path.join(root, 'supabase', 'functions', 'campgrounds-search', 'index.ts');
const detailPath = path.join(root, 'supabase', 'functions', 'campground-detail', 'index.ts');
const searchDenoPath = path.join(root, 'supabase', 'functions', 'campgrounds-search', 'deno.json');
const detailDenoPath = path.join(root, 'supabase', 'functions', 'campground-detail', 'deno.json');

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

require(path.join(root, 'tests', 'campgrounds', 'campgroundApi.test.ts'));

const shared = fs.readFileSync(sharedPath, 'utf8');
const search = fs.readFileSync(searchPath, 'utf8');
const detail = fs.readFileSync(detailPath, 'utf8');
const searchDeno = fs.readFileSync(searchDenoPath, 'utf8');
const detailDeno = fs.readFileSync(detailDenoPath, 'utf8');

assert.ok(shared.includes('parseCampgroundSearchParams'), 'Shared endpoint module should parse search inputs.');
assert.ok(shared.includes('filterCampgroundSearchRows'), 'Shared endpoint module should apply search filters.');
assert.ok(shared.includes('effectiveAvailabilityStatus'), 'Shared endpoint module should centralize availability TTL behavior.');
assert.ok(shared.includes('buildCampgroundSearchRecord'), 'Shared endpoint module should build marker-ready records.');
assert.ok(shared.includes('buildCampgroundDetailResponse'), 'Shared endpoint module should build detail responses.');
assert.ok(shared.includes("type: 'established_campground'") || shared.includes('buildCampgroundMarker'), 'Search output should be established campground marker-ready.');
assert.ok(shared.includes('rawJson: null'), 'Detail source summaries should not expose raw provider JSON.');

assert.ok(search.includes("from('campgrounds')"), 'Search endpoint should read cached canonical campgrounds.');
assert.ok(search.includes("from('campground_availability')"), 'Search endpoint should read cached availability rows.');
assert.ok(search.includes("neq('status', 'removed')"), 'Search endpoint should not return removed duplicate campground pins.');
assert.ok(search.includes('filterCampgroundSearchRows'), 'Search endpoint should use shared filter logic.');
assert.ok(search.includes('buildCampgroundSearchFeatureCollection'), 'Search endpoint should return marker-ready GeoJSON features.');
assert.ok(search.includes('routeFilterApplied: false'), 'Search endpoint should not pretend route-aware filtering exists before route geometry wiring.');
assert.ok(
  search.includes('fetchOsmFallbackCampgrounds') &&
    search.includes('OSM_USER_AGENT') &&
    search.includes('cache_empty') &&
    search.includes('cache_error'),
  'Search endpoint should use a real OSM viewport fallback when cached canonical data is unavailable.',
);
assert.ok(!search.includes('requireAdmin'), 'Search endpoint should be mobile-facing, not admin-only.');

assert.ok(detail.includes("from('campgrounds')"), 'Detail endpoint should read cached canonical campground record.');
assert.ok(detail.includes("from('campground_source_records')"), 'Detail endpoint should return provider source summaries.');
assert.ok(detail.includes("from('campground_availability')"), 'Detail endpoint should return availability summaries.');
assert.ok(detail.includes("payload_hash") && !detail.includes("raw_json"), 'Detail endpoint should expose payload hashes but not raw_json.');
assert.ok(detail.includes("neq('status', 'removed')"), 'Detail endpoint should not return removed duplicate campground rows.');
assert.ok(!detail.includes('fetch('), 'Detail endpoint must not call provider APIs on detail requests.');
assert.ok(!detail.includes('requireAdmin'), 'Detail endpoint should be mobile-facing, not admin-only.');

for (const forbidden of [
  'RIDB_API_KEY',
  'NPS_API_KEY',
  'CAMPFLARE_API_KEY',
  'ACTIVE_API_KEY',
  'ACTIVE_API_SECRET',
  'RESERVEAMERICA_API_KEY',
  'ASPIRA_API_KEY',
  'sk_',
  'eyJ',
  'service_role=',
]) {
  assert.ok(!shared.includes(forbidden), `Shared endpoint module must not reference provider secrets: ${forbidden}`);
  assert.ok(!search.includes(forbidden), `Search endpoint must not reference provider secrets: ${forbidden}`);
  assert.ok(!detail.includes(forbidden), `Detail endpoint must not reference provider secrets: ${forbidden}`);
}

assert.ok(!shared.includes('OSM_USER_AGENT'), 'Shared endpoint module should not require provider runtime env.');
assert.ok(search.includes('OSM_USER_AGENT'), 'Search endpoint may use OSM_USER_AGENT for non-secret Overpass attribution.');
assert.ok(!detail.includes('OSM_USER_AGENT'), 'Detail endpoint should not require OSM fallback config.');

assert.ok(searchDeno.includes('@supabase/functions-js'), 'Search endpoint should include standard Supabase deno config.');
assert.ok(detailDeno.includes('@supabase/functions-js'), 'Detail endpoint should include standard Supabase deno config.');

console.log('Campground search/detail endpoint checks passed.');
