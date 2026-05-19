const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const mobile = read('lib/map/establishedCampgroundMobile.ts');
const mobileClient = read('lib/map/establishedCampgroundSearchClient.ts');
const marker = read('lib/map/establishedCampgrounds.ts');
const search = read('supabase/functions/campgrounds-search/index.ts');
const detail = read('supabase/functions/campground-detail/index.ts');
const shared = read('supabase/functions/_shared/campgroundApi.ts');
const mobileTest = read('tests/map/establishedCampgroundsMobile.test.ts');
const endpointTest = read('scripts/test-campground-endpoints.js');
const runbook = read('docs/integrations/established-campgrounds-provider-sync.md');

const providerSecretRefs = [
  'RIDB_API_KEY',
  'NPS_API_KEY',
  'CAMPFLARE_API_KEY',
  'ACTIVE_API_KEY',
  'ACTIVE_API_SECRET',
  'RESERVEAMERICA_API_KEY',
  'ASPIRA_API_KEY',
  'OSM_USER_AGENT',
  'OSM_OVERPASS_URL',
  'OSM_ATTRIBUTION',
];

assert.ok(
  mobile.includes("ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION = 'campgrounds-search'"),
  'Mobile established campground search must call the ECS campgrounds-search endpoint.',
);
assert.ok(
  mobileClient.includes('supabase.functions.invoke(ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION'),
  'Mobile established campground search should invoke the ECS-owned Edge Function.',
);
assert.ok(
  mobile.includes('attribution: cleanText(record.attribution)'),
  'Mobile marker/detail mapping must preserve campground attribution.',
);
assert.ok(
  mobile.includes('Available reported - verify with operator') && !mobile.includes('Available now'),
  'Mobile availability copy must avoid claiming live availability as available now.',
);

for (const forbidden of providerSecretRefs) {
  assert.ok(!mobile.includes(forbidden), `Mobile campground code must not reference provider secret/env ${forbidden}.`);
  assert.ok(!mobileClient.includes(forbidden), `Mobile campground client must not reference provider secret/env ${forbidden}.`);
}

assert.ok(
  marker.includes('attribution: campground.attribution'),
  'Map marker builder must preserve attribution for RIDB/NPS/Campflare/OSM-enriched rows.',
);
assert.ok(
  search.includes("from('campgrounds')") &&
    search.includes("from('campground_availability')") &&
    search.includes("neq('status', 'removed')"),
  'Search endpoint must read cached canonical campgrounds and availability while excluding removed rows.',
);
assert.ok(
  search.includes('buildCampgroundSearchFeatureCollection') &&
    search.includes('filterCampgroundSearchRows'),
  'Search endpoint must use shared marker/filter logic.',
);
assert.ok(!search.includes('fetch('), 'Search endpoint must not fetch provider APIs during mobile map requests.');
assert.ok(!search.includes('fetchOsmFallbackCampgrounds'), 'Search endpoint must not use OSM fallback on mobile map requests.');
for (const forbidden of providerSecretRefs) {
  assert.ok(!search.includes(forbidden), `Search endpoint must not reference provider secret/env ${forbidden}.`);
}
assert.ok(
  search.includes('cached_search_result') && search.includes('bboxProvided: true'),
  'Search diagnostics should report bbox presence without logging exact viewport coordinates.',
);
assert.ok(
  !search.includes('cached_search_result') || !search.includes('bbox: params.bbox,\n    limit: params.limit'),
  'Successful search diagnostics must not log exact bbox coordinates.',
);

assert.ok(
  detail.includes("from('campgrounds')") &&
    detail.includes("from('campground_source_records')") &&
    detail.includes("from('campground_availability')"),
  'Detail endpoint must read canonical records, source summaries, and availability from ECS storage.',
);
assert.ok(!detail.includes('fetch('), 'Detail endpoint must not fetch provider APIs during mobile detail requests.');
assert.ok(
  detail.includes('payload_hash') && !detail.includes('raw_json'),
  'Detail endpoint must expose payload hashes and must not expose raw provider payloads.',
);

assert.ok(
  shared.includes('effectiveAvailabilityStatus') &&
    shared.includes('isAvailabilityFresh') &&
    shared.includes('rawJson: null'),
  'Shared campground API must centralize freshness handling and redact raw provider JSON.',
);
assert.ok(
  shared.includes('attribution: campground.attribution') &&
    shared.includes('attribution: campground.attribution,'),
  'Shared campground API must preserve attribution in marker and detail responses.',
);

assert.ok(
    mobileTest.includes('Source / attribution') &&
    mobileTest.includes('fetchEstablishedCampgroundsForMap({ bbox: request.bbox })') &&
    mobileTest.includes('Mobile integration must not reference provider secret'),
  'Mobile regression coverage must verify attribution display, Navigate wiring, and provider-secret isolation.',
);
assert.ok(
  endpointTest.includes('Search endpoint should use cached canonical records only') &&
    endpointTest.includes('Search endpoint must not reference provider secrets'),
  'Endpoint regression coverage must verify cached-only mobile search and provider-secret isolation.',
);

for (const token of [
  'Mobile clients must never call provider APIs directly',
  'campgrounds-search',
  'Troubleshooting Missing Campgrounds',
  'Attribution Requirements',
  'Known Limitations',
  'Scheduling is a deployment environment responsibility',
  'Campflare availability is freshness-sensitive. Expired availability must degrade to `unknown`.',
]) {
  assert.ok(runbook.includes(token), `Established campground runbook missing release-readiness note: ${token}`);
}

console.log('Established campground release-readiness checks passed.');
