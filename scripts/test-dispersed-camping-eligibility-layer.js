const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const navigateSource = read('app/(tabs)/navigate.tsx');
const mapRendererSource = read('components/navigate/MapRenderer.tsx');
const regionSheetSource = read('components/navigate/DispersedCampingRegionSheet.tsx');
const routeSummarySource = read('components/navigate/DispersedCampingRouteSummary.tsx');
const establishedSummarySource = read('components/navigate/EstablishedCampsitesRouteSummary.tsx');
const typesSource = read('lib/map/dispersedCampingTypes.ts');
const sampleSource = read('lib/map/sampleDispersedCampingGeojson.ts');
const eligibilitySource = read('lib/map/dispersedCampingEligibility.ts');
const adapterSource = read('lib/map/dispersedCampingGeojsonAdapter.ts');
const messagesSource = read('lib/map/mapboxLayerMessages.ts');
const routeSearchSource = read('lib/map/dispersedCampingRouteSearch.ts');
const searchClientSource = read('lib/map/dispersedCampingSearchClient.ts');
const mobileSource = read('lib/map/dispersedCampingMobile.ts');
const zoomSource = read('lib/map/campLayerZoom.ts');
const campCandidateScoringSource = read('lib/campops/campCandidateScoring.ts');
const edgeSource = read('supabase/functions/dispersed-camping-eligibility/index.ts');
const supabaseSource = read('lib/supabase.ts');
const envExampleSource = read('.env.example');
const easConfig = JSON.parse(read('eas.json'));
const toggleDispersedStart = navigateSource.indexOf('const toggleDispersedCampingEligibility = useCallback(() => {');
const toggleDispersedEnd = navigateSource.indexOf('const toggleEstablishedCampsites = useCallback(() => {', toggleDispersedStart);
const toggleDispersedBlock = navigateSource.slice(toggleDispersedStart, toggleDispersedEnd);
const removeDispersedStart = mapRendererSource.indexOf('function removeDispersedCampingEligibilityLayer()');
const removeDispersedEnd = mapRendererSource.indexOf('function removeEstablishedCampsitesLayer()', removeDispersedStart);
const removeDispersedBlock = mapRendererSource.slice(removeDispersedStart, removeDispersedEnd);

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
  easConfig.build?.fieldtest?.env?.EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER === 'true' &&
    easConfig.build?.fieldtest?.env?.EXPO_PUBLIC_ECS_ESTABLISHED_CAMPSITES_LAYER === 'true',
  'Field-test APK builds should explicitly enable the Navigate camp layer button and camp layer menu.',
);

assert.ok(
  navigateSource.includes('dispersedCampingEligibilityEnabled') &&
    navigateSource.includes('dispersedCampingUiState') &&
    navigateSource.includes('setDispersedCampingUiState') &&
    navigateSource.includes('setCampLayerEnabled'),
  'Navigate should own the local dispersed-camping eligibility toggle state.',
);

assert.ok(
  zoomSource.includes('DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM = 9') &&
    zoomSource.includes("isCampLayerZoomEligible(layer: CampLayerFetchLayer, zoom: unknown)") &&
    navigateSource.includes('dispersedCampingEligibilityZoomReady') &&
    navigateSource.includes("isCampLayerZoomEligible('dispersed_camping', mapZoom)") &&
    navigateSource.includes('dispersedCampingZoomPrompt') &&
    navigateSource.includes('setCampLayerZoomDeferred') &&
    navigateSource.includes("reason: 'zoom_too_low'"),
  'Navigate should defer dispersed-camping fetch/render work until users zoom into public-land planning scale.',
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
  toggleDispersedBlock.includes('setDispersedCampingUiState((current) => setCampLayerEnabled(current, next));') &&
    toggleDispersedBlock.includes('dispersedCampingFetchCoordinatorRef.current.cancel();') &&
    !toggleDispersedBlock.includes('setDispersedCampingRegions([]);') &&
    toggleDispersedBlock.includes('setSelectedDispersedCampingRegion(null);') &&
    navigateSource.includes('renderKey: dispersedCampingEligibilityRenderKey'),
  'Dispersed camping checkbox off should update UI immediately, cancel fetch work, preserve cached regions, and send a lightweight render key.',
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

assert.ok(
  navigateSource.includes('campScoutDrawingSuppressesDispersedRegionSheet') &&
    navigateSource.includes("campsiteDrawMode || campScoutAreaMode === 'drawing'") &&
    navigateSource.includes('if (campScoutDrawingSuppressesDispersedRegionSheet)') &&
    navigateSource.includes('setSelectedDispersedCampingRegion(null);'),
  'Dispersed camping region sheets should be suppressed while the Camp Scout polygon drawing tool owns map taps.',
);

[
  'Dispersed Camping Eligibility',
  'Why ECS highlighted this',
  'Restrictions / caveats',
  'Sources',
  'Source basis unavailable.',
  'Current local restrictions not confirmed.',
  'Not shown as eligible.',
  'Live source:',
  'Scout nearby pins',
].forEach((copy) => {
  assert.ok(regionSheetSource.includes(copy), `Region sheet missing copy: ${copy}`);
});

assert.ok(
  regionSheetSource.includes('onScoutNearbyPins') &&
    regionSheetSource.includes('onClearScoutPins') &&
    regionSheetSource.includes('Clear pins') &&
    navigateSource.includes('handleScoutSelectedDispersedCampingRegionPins') &&
    navigateSource.includes('handleClearDispersedCampingCampScoutPins') &&
    navigateSource.includes('generateDispersedCampingCampScoutPins') &&
    navigateSource.includes("setSelectedDispersedCampingRegion(null);") &&
    !regionSheetSource.includes('Coming later'),
  'Selected dispersed regions should wire Scout Nearby pins into the live Camp Scout candidate pipeline with clear/reset controls.',
);

assert.ok(
  navigateSource.includes('!dispersedCampingRouteSummaryVisible') &&
    navigateSource.includes('clearScoutPinsFloatingButton') &&
    !navigateSource.includes('if (!dispersedCampingRouteHasRoute) {\n      setDispersedCampingCampScoutCandidates([]);'),
  'Dispersed Camp Scout pins should persist until the explicit clear action, even when route overlays are hidden.',
);

assert.ok(
  navigateSource.includes('scoutPinsVisible={dispersedCampingCampScoutCandidates.length > 0}') &&
    regionSheetSource.includes('accessibilityLabel="Clear dispersed camping scout pins"') &&
    routeSummarySource.includes('accessibilityLabel="Clear dispersed camping scout pins"'),
  'Dispersed camping popup and route summary should expose a clear button when scout pins are visible.',
);

assert.ok(
  !navigateSource.includes('ECS-INFERRED CAMP CANDIDATES') &&
    !navigateSource.includes('NO ELIGIBLE CAMP CANDIDATES FOUND') &&
    navigateSource.includes('setDispersedCampingCampScoutStatus('),
  'Scout candidate pins should update the dispersed camping status container without showing redundant map toasts.',
);

assert.ok(
  !navigateSource.includes("showToast('DISPERSED CAMP SCOUT PINS CLEARED')") &&
    navigateSource.includes("setDispersedCampingCampScoutStatus('Dispersed camping scout pins cleared.');"),
  'Clearing dispersed camp scout pins should update local status without showing a redundant map toast.',
);

assert.ok(
  campCandidateScoringSource.includes('Nearest road or trail access is not confirmed') &&
    campCandidateScoringSource.includes('route preview may end at the closest routable road'),
  'ECS-inferred dispersed campsite candidates should warn when road/trail access is not confirmed.',
);

assert.ok(
  !regionSheetSource.includes('setTimeout(') &&
    !regionSheetSource.includes('setInterval(') &&
    regionSheetSource.includes('onClose'),
  'Dispersed camping region details should stay open until the user explicitly closes them.',
);

assert.ok(
  navigateSource.includes('const campLayerDetailBottomOffset = Math.max(') &&
    navigateSource.includes('COMPASS_BOTTOM + COMPASS_SIZE + OVERLAY_GROUP_GAP') &&
    navigateSource.includes('DISPERSED_CAMPING_LEGEND_STACK_HEIGHT') &&
    navigateSource.includes('campLayerRouteSummaryStackBottom') &&
    navigateSource.includes('bottomOffset={campLayerDetailBottomOffset}') &&
    navigateSource.includes('<EstablishedCampsiteSheet') &&
    navigateSource.includes('<DispersedCampingRegionSheet'),
  'Camp detail popups should clear fixed map controls, compass, route summaries, and the dispersed camping legend.',
);

assert.ok(
  navigateSource.includes('const dispersedCampingLegendBottom = bottomLeftMapOverlayStackBottom') &&
    navigateSource.includes('dispersedCampingLegendBottom + DISPERSED_CAMPING_LEGEND_STACK_HEIGHT + OVERLAY_GAP') &&
    navigateSource.includes('ESTABLISHED_CAMPSITES_ROUTE_SUMMARY_STACK_HEIGHT') &&
    navigateSource.includes('DISPERSED_CAMPING_ROUTE_SUMMARY_STACK_HEIGHT'),
  'Active-guidance camp route summaries should stack above the dispersed camping legend instead of covering it.',
);

assert.ok(
  routeSummarySource.includes("pointerEvents={hasResults ? 'box-none' : 'none'}"),
  'Empty dispersed-camping route summary cards should pass touches through to map controls.',
);

assert.ok(
  routeSummarySource.includes('<View pointerEvents="none" style={styles.header}>') &&
    routeSummarySource.includes('<View pointerEvents="none" style={styles.resultStack}>') &&
    establishedSummarySource.includes('<View pointerEvents="none" style={styles.header}>'),
  'Non-interactive camping route summary copy should not become a native touch target over the map.',
);

assert.ok(
  navigateSource.includes('toDispersedCampingFeatureCollection(dispersedCampingRegionsForMap') &&
    navigateSource.includes('dispersedCampingRegions.filter((region) => dispersedCampingRouteNearbyIds.has(region.id))') &&
    navigateSource.includes('CAMP_LAYER_ROUTE_MAP_RESULT_LIMIT') &&
    navigateSource.includes('candidateGenerationTrigger:') &&
    navigateSource.includes("'explicit_user_action'") &&
    !navigateSource.includes("origin: 'route'"),
  'Route-nearby dispersed camping should render only 3-mile corridor regions and generate ECS-inferred pins from explicit Scout actions.',
);
assert.ok(
  routeSearchSource.includes('MAX_DISPERSED_CAMPING_ROUTE_ANALYSIS_POINTS') &&
    routeSearchSource.includes('thinRouteForCampLayerSearch'),
  'Route-nearby dispersed camping should thin long active-guidance route geometry before polygon distance checks.',
);
assert.ok(
  !navigateSource.includes('DISPERSED CAMPING ELIGIBILITY ON') &&
    !navigateSource.includes('DISPERSED CAMPING ELIGIBILITY OFF') &&
    !navigateSource.includes('ESTABLISHED CAMPGROUNDS ON') &&
    !navigateSource.includes('ESTABLISHED CAMPGROUNDS OFF'),
  'Camp layer checkbox changes should rely on visible checkmarks/pins instead of transient banners over active guidance.',
);

assert.ok(
  sampleSource.includes('toDispersedCampingFeatureCollection') &&
    sampleSource.includes('toDispersedCampingRegions'),
  'Sample layer should use the real dispersed-camping adapter and classifier path.',
);

assert.ok(
  mapRendererSource.includes('removeDispersedCampingEligibilityLayer') &&
    removeDispersedBlock.includes("map.setLayoutProperty(DISPERSED_CAMPING_FILL_LAYER_ID, 'visibility', 'none')") &&
    removeDispersedBlock.includes("map.setLayoutProperty(DISPERSED_CAMPING_OUTLINE_LAYER_ID, 'visibility', 'none')") &&
    !removeDispersedBlock.includes('map.removeLayer') &&
    !removeDispersedBlock.includes('map.removeSource') &&
    !removeDispersedBlock.includes('setGeoJson(DISPERSED_CAMPING_SOURCE_ID, featureCollection([]))') &&
    mapRendererSource.includes("map.setLayoutProperty(DISPERSED_CAMPING_FILL_LAYER_ID, 'visibility', 'visible')") &&
    mapRendererSource.includes("map.setLayoutProperty(DISPERSED_CAMPING_FILL_LAYER_ID, 'visibility', 'none')") &&
    mapRendererSource.includes('state.renderKey'),
  'MapRenderer should hide dispersed-camping layers when disabled and preserve the source/layers for fast re-enable.',
);

assert.ok(
  mapRendererSource.includes('DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM') &&
    mapRendererSource.includes('minzoom: ${DISPERSED_CAMPING_ELIGIBILITY_MIN_ZOOM}'),
  'Dispersed camping Mapbox layers should also have a minzoom safety net.',
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
    mapRendererSource.includes("sendCampLayerDebug('map_layer_hidden'") &&
    mapRendererSource.includes("applyDispersedCampingDesiredState('style_load')"),
  'Dispersed camping WebView lifecycle should queue updates until style load and apply the latest desired state once.',
);

assert.ok(
  mapRendererSource.includes('getFirstExistingLayerId') &&
    mapRendererSource.includes('promoteRouteGuidanceLayers') &&
    mapRendererSource.includes("map.moveLayer(layerId)") &&
    mapRendererSource.includes('ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID') &&
    mapRendererSource.includes('ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID') &&
    mapRendererSource.includes("'route-layer'") &&
    mapRendererSource.includes('CAMP_SCOUT_LAYER_ID'),
  'Eligibility layer should be inserted beneath camp/search layers and active guidance should be promoted after camp layer updates.',
);

assert.ok(
  navigateSource.includes('<DispersedCampingRouteSummary') &&
    routeSummarySource.includes('Dispersed Camping Near Route') &&
    routeSearchSource.includes('RouteNearbyDispersedCampingRegion') &&
    routeSearchSource.includes('DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES = 3') &&
    routeSearchSource.includes('expandedRouteBounds') &&
    routeSearchSource.includes('regionIntersectsBounds(region, expandedRouteBounds)'),
  'Navigate should show a compact route-aware dispersed-camping summary with the default corridor.',
);

assert.ok(
  navigateSource.includes('DISPERSED_CAMPING_ROUTE_SUMMARY_STACK_HEIGHT') &&
    navigateSource.includes('? 214') &&
    navigateSource.includes(': 190') &&
    navigateSource.includes('ESTABLISHED_CAMPSITES_ROUTE_SUMMARY_STACK_HEIGHT') &&
    navigateSource.includes('? 198 : 112'),
  'Navigate should reserve enough stacked overlay height so route-aware camp cards keep an even gap.',
);

assert.ok(
  adapterSource.includes('routeNearby') &&
    adapterSource.includes('distanceFromRouteMiles') &&
    mapRendererSource.includes("['get', 'routeNearby']"),
  'Route-nearby eligibility regions should be flagged in GeoJSON and emphasized in Mapbox styling.',
);

assert.ok(
  navigateSource.includes('focusGeneratedPins?: boolean') &&
    navigateSource.includes('scoutCenter?: { latitude: number; longitude: number } | null') &&
    navigateSource.includes('maxScoutRadiusMiles?: number') &&
    navigateSource.includes('maxRouteDistanceMiles?: number') &&
    navigateSource.includes('maxRouteDistanceMiles: DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES') &&
    navigateSource.includes('maxCandidates?: number') &&
    navigateSource.includes('maxCandidates: 10') &&
    navigateSource.includes('maxScoutRadiusMiles: 2') &&
    navigateSource.includes('maxCandidates: 5') &&
    navigateSource.includes("reason: 'dispersed_camping_scout_pin_focus'") &&
    navigateSource.includes('focusGeneratedPins: true') &&
    typesSource.includes('latitude?: number') &&
    typesSource.includes('longitude?: number') &&
    mapRendererSource.includes('buildDispersedCampingSelectionPayload(feature, event && event.lngLat)') &&
    mapRendererSource.includes("tent.textContent = '\\u26FA';") &&
    campCandidateScoringSource.includes('buildScoutCandidateCoordinates') &&
    campCandidateScoringSource.includes('isEligibleScoutCoordinate') &&
    campCandidateScoringSource.includes('pointInPolygonGeometry(coordinate, region.geometry)') &&
    campCandidateScoringSource.includes('routeDistanceLimitMiles') &&
    campCandidateScoringSource.includes('MAX_SCOUT_RADIUS_MILES = 2') &&
    campCandidateScoringSource.includes('MAX_INFERRED_CANDIDATE_LIMIT = 10') &&
    mapRendererSource.includes('camp-scout-source-ecs_inferred .camp-scout-core') &&
    mapRendererSource.includes('background: #F2C24D') &&
    mapRendererSource.includes('color: #091014') &&
    mapRendererSource.includes('camp-scout-tent'),
  'Selected dispersed camping region scouting should focus generated yellow ECS-inferred camp pins with a black camp icon.',
);

console.log('Dispersed camping eligibility layer checks passed.');
