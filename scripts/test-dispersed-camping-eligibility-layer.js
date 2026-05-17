const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const navigateSource = read('app/(tabs)/navigate.tsx');
const mapRendererSource = read('components/navigate/MapRenderer.tsx');
const regionSheetSource = read('components/navigate/DispersedCampingRegionSheet.tsx');
const routeSummarySource = read('components/navigate/DispersedCampingRouteSummary.tsx');
const typesSource = read('lib/map/dispersedCampingTypes.ts');
const sampleSource = read('lib/map/sampleDispersedCampingGeojson.ts');
const eligibilitySource = read('lib/map/dispersedCampingEligibility.ts');
const adapterSource = read('lib/map/dispersedCampingGeojsonAdapter.ts');
const messagesSource = read('lib/map/mapboxLayerMessages.ts');
const routeSearchSource = read('lib/map/dispersedCampingRouteSearch.ts');
const searchClientSource = read('lib/map/dispersedCampingSearchClient.ts');
const mobileSource = read('lib/map/dispersedCampingMobile.ts');
const edgeSource = read('supabase/functions/dispersed-camping-eligibility/index.ts');
const supabaseSource = read('lib/supabase.ts');
const envExampleSource = read('.env.example');

[
  'Dispersed Camping Eligibility',
  'Highlights likely eligible public-land regions. Verify local rules before camping.',
  'Likely eligible',
  'Verify locally',
  'Restricted / unavailable',
].forEach((copy) => {
  assert.ok(
    navigateSource.includes(copy) || sampleSource.includes(copy) || typesSource.includes(copy),
    `Missing required copy: ${copy}`,
  );
});

[
  ['legal', 'camping'],
  ['Camping', 'is', 'allowed', 'here'],
  ['safe', 'to', 'camp'],
  ['Guaran', 'teed'],
  ['You', 'can', 'camp', 'here'],
  ['allowed', 'camping'],
].map((parts) => parts.join(' ')).forEach((forbidden) => {
  const haystack = [
    navigateSource,
    mapRendererSource,
    regionSheetSource,
    typesSource,
    sampleSource,
    eligibilitySource,
    adapterSource,
    messagesSource,
    routeSummarySource,
    routeSearchSource,
  ].join('\n');
  assert.ok(
    !haystack.toLowerCase().includes(forbidden.toLowerCase()),
    `Forbidden dispersed-camping wording found: ${forbidden}`,
  );
});

assert.ok(
  envExampleSource.includes('EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER=false'),
  'Internal/dev feature flag should be documented and default disabled.',
);

assert.ok(
  navigateSource.includes('dispersedCampingEligibilityEnabled') &&
    navigateSource.includes('dispersedCampingUiState') &&
    navigateSource.includes('setDispersedCampingUiState') &&
    navigateSource.includes('setCampLayerEnabled'),
  'Navigate should own the local dispersed-camping eligibility toggle state.',
);

assert.ok(
  navigateSource.includes('[CAMP_LAYER_DEBUG]') &&
    navigateSource.includes('checkbox_change') &&
    navigateSource.includes('frontend_fetch_start') &&
    navigateSource.includes('frontend_fetch_success') &&
    navigateSource.includes('frontend_fetch_empty') &&
    navigateSource.includes('sanitizeCampLayerBbox'),
  'Navigate should expose concise dev-gated camp layer diagnostics for toggles, fetches, counts, and sanitized bboxes.',
);

assert.ok(
  !navigateSource.includes("sampleDispersedCampingGeojson") &&
    !navigateSource.includes('SAMPLE_DISPERSED_CAMPING_ELIGIBILITY_REGIONS'),
  'Navigate production layer should not render demo dispersed-camping polygons.',
);

assert.ok(
  searchClientSource.includes('supabase.functions.invoke(DISPERSED_CAMPING_EDGE_FUNCTION') &&
    mobileSource.includes("DISPERSED_CAMPING_EDGE_FUNCTION = 'dispersed-camping-eligibility'") &&
    mobileSource.includes('buildDispersedCampingSearchRequest') &&
    supabaseSource.includes('"dispersed-camping-eligibility"'),
  'Navigate dispersed-camping layer should use the ECS dispersed-camping eligibility edge function.',
);

assert.ok(
  edgeSource.includes('PAD_US_MANAGER_FEATURE_URL') &&
    edgeSource.includes('USGS PAD-US Manager Name FeatureServer') &&
    edgeSource.includes("Mang_Name in ('BLM','USFS')") &&
    edgeSource.includes('esriRingsToGeoJson') &&
    edgeSource.includes('Likely eligible'),
  'Dispersed camping edge function should fetch real PAD-US BLM/USFS polygons and normalize GeoJSON eligibility features.',
);

assert.ok(
  navigateSource.includes('accessibilityRole="checkbox"') &&
    navigateSource.includes('dispersedCampingEligibilityLayerAvailable'),
  'Navigate should render the gated checkbox-style filter control.',
);

assert.ok(
  navigateSource.includes('dispersedCampingEligibility={dispersedCampingEligibilityLayer}'),
  'Navigate should pass the eligibility layer state into MapRenderer.',
);

const sampleSourceCount = (sampleSource.match(/id: 'ecs-demo-dispersed-eligibility-/g) || []).length;
assert.ok(sampleSourceCount >= 3 && sampleSourceCount <= 5, 'Sample source data should include 3-5 demo polygon records.');

['high', 'medium', 'verify', 'restricted'].forEach((confidence) => {
  assert.ok(eligibilitySource.includes(`'${confidence}'`), `Missing classifier confidence: ${confidence}`);
});

['BLM', 'USFS', 'UNKNOWN'].forEach((manager) => {
  assert.ok(sampleSource.includes(`landManager: '${manager}'`), `Missing land manager sample: ${manager}`);
});

[
  'ecs-dispersed-camping-eligibility',
  'ecs-dispersed-camping-eligibility-fill',
  'ecs-dispersed-camping-eligibility-outline',
  'SET_DISPERSED_CAMPING_LAYER_ENABLED',
].forEach((token) => {
  assert.ok(mapRendererSource.includes(token) || messagesSource.includes(token), `Missing Mapbox token: ${token}`);
});

assert.ok(
  messagesSource.includes('DISPERSED_CAMPING_REGION_SELECTED') &&
    mapRendererSource.includes('DISPERSED_CAMPING_REGION_SELECTED') &&
    mapRendererSource.includes("map.on('click', DISPERSED_CAMPING_FILL_LAYER_ID") &&
    mapRendererSource.includes("map.on('click', DISPERSED_CAMPING_OUTLINE_LAYER_ID"),
  'MapRenderer should emit selection events from the eligibility fill/outline layers.',
);

assert.ok(
  navigateSource.includes('selectedDispersedCampingRegion') &&
    navigateSource.includes('setSelectedDispersedCampingRegion(null)') &&
    navigateSource.includes('<DispersedCampingRegionSheet'),
  'Navigate should store, show, and clear the selected dispersed-camping region.',
);

[
  'Dispersed Camping Eligibility',
  'Why ECS highlighted this',
  'Restrictions / caveats',
  'Sources',
  'Source basis unavailable.',
  'Current local restrictions not confirmed.',
  'Not shown as eligible.',
  'Coming later',
].forEach((copy) => {
  assert.ok(regionSheetSource.includes(copy), `Region sheet missing copy: ${copy}`);
});

assert.ok(
  sampleSource.includes('toDispersedCampingFeatureCollection') &&
    sampleSource.includes('toDispersedCampingRegions'),
  'Sample layer should use the real dispersed-camping adapter and classifier path.',
);

assert.ok(
  mapRendererSource.includes('removeDispersedCampingEligibilityLayer') &&
    mapRendererSource.includes('map.removeLayer') &&
    mapRendererSource.includes('map.removeSource'),
  'MapRenderer should remove dispersed-camping layers and source when disabled.',
);

assert.ok(
  mapRendererSource.includes("geometryType === 'Polygon' || geometryType === 'MultiPolygon'") &&
    mapRendererSource.includes("expectedGeometry: 'Polygon|MultiPolygon'") &&
    mapRendererSource.includes('invalid_geojson_filtered') &&
    mapRendererSource.includes('featureCollection('),
  'Dispersed camping renderer should safely accept only polygon/multipolygon GeoJSON features.',
);

assert.ok(
  mapRendererSource.includes('sendCampLayerDebug') &&
    mapRendererSource.includes('map_source_update') &&
    mapRendererSource.includes('layer_toggle_received') &&
    mapRendererSource.includes('mapLayerVisible') &&
    mapRendererSource.includes('mapSourceExists'),
  'MapRenderer should report camp layer source updates, toggle payload counts, source/layer presence, and visibility in dev diagnostics.',
);

assert.ok(
  mapRendererSource.includes("sendCampLayerDebug('queued_until_style_loaded'") &&
    mapRendererSource.includes("sendCampLayerDebug('applied_after_style_load'") &&
    mapRendererSource.includes("sendCampLayerDebug('skipped_stale_payload'") &&
    mapRendererSource.includes("sendCampLayerDebug('source_set_data'") &&
    mapRendererSource.includes("sendCampLayerDebug('source_created'") &&
    mapRendererSource.includes("sendCampLayerDebug('layer_removed'") &&
    mapRendererSource.includes("applyDispersedCampingDesiredState('style_load')"),
  'Dispersed camping WebView lifecycle should queue updates until style load and apply the latest desired state once.',
);

assert.ok(
  mapRendererSource.includes('getFirstExistingLayerId') &&
    mapRendererSource.includes('ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID') &&
    mapRendererSource.includes('ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID') &&
    mapRendererSource.includes("'route-layer'") &&
    mapRendererSource.includes('CAMP_SCOUT_LAYER_ID'),
  'Eligibility layer should be inserted beneath established campground, route, and camp/search marker layers.',
);

assert.ok(
  navigateSource.includes('<DispersedCampingRouteSummary') &&
    routeSummarySource.includes('Dispersed Camping Near Route') &&
    routeSearchSource.includes('RouteNearbyDispersedCampingRegion') &&
    routeSearchSource.includes('DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES = 5'),
  'Navigate should show a compact route-aware dispersed-camping summary with the default corridor.',
);

assert.ok(
  adapterSource.includes('routeNearby') &&
    adapterSource.includes('distanceFromRouteMiles') &&
    mapRendererSource.includes("['get', 'routeNearby']"),
  'Route-nearby eligibility regions should be flagged in GeoJSON and emphasized in Mapbox styling.',
);

console.log('Dispersed camping eligibility layer checks passed.');
