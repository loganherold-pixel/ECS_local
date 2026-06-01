import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { SAMPLE_ESTABLISHED_CAMPSITES } from '../../lib/map/establishedCampsiteSources';
import {
  ESTABLISHED_CAMPGROUND_PIN_DEDUPE_RADIUS_METERS,
  dedupeEstablishedCampsitesForMap,
  toEstablishedCampsiteFeatureCollection,
} from '../../lib/map/establishedCampsiteGeojsonAdapter';
import {
  DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_CORRIDOR_MILES,
  findEstablishedCampsitesNearRoute,
} from '../../lib/map/establishedCampsiteRouteSearch';
import {
  ESTABLISHED_CAMPSITES_MIN_ZOOM,
  isCampLayerZoomEligible,
} from '../../lib/map/campLayerZoom';

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const navigateSource = read('app/(tabs)/navigate.tsx');
const mapRendererSource = read('components/navigate/MapRenderer.tsx');
const sheetSource = read('components/navigate/EstablishedCampsiteSheet.tsx');
const routeSummarySource = read('components/navigate/EstablishedCampsitesRouteSummary.tsx');
const messagesSource = read('lib/map/mapboxLayerMessages.ts');
const typesSource = read('lib/map/establishedCampsiteTypes.ts');
const sourcesSource = read('lib/map/establishedCampsiteSources.ts');
const adapterSource = read('lib/map/establishedCampsiteGeojsonAdapter.ts');
const routeSearchSource = read('lib/map/establishedCampsiteRouteSearch.ts');
const envSource = read('.env.example');

assert.ok(
  SAMPLE_ESTABLISHED_CAMPSITES.length >= 5 && SAMPLE_ESTABLISHED_CAMPSITES.length <= 10,
  'Established Campsites dev sample should include 5-10 local records.',
);

const collection = toEstablishedCampsiteFeatureCollection(SAMPLE_ESTABLISHED_CAMPSITES);
assert.strictEqual(collection.type, 'FeatureCollection');
assert.strictEqual(collection.features.length, SAMPLE_ESTABLISHED_CAMPSITES.length);
assert.ok(
  collection.features.every((feature) => feature.geometry.type === 'Point' && feature.properties.requiresVerification === true),
  'Established campsite GeoJSON should contain verification-required point features.',
);

const duplicateCampgroundPins = dedupeEstablishedCampsitesForMap([
  {
    ...SAMPLE_ESTABLISHED_CAMPSITES[0],
    id: 'cluster-a',
    name: 'Pine Basin Campground',
    latitude: 37.72,
    longitude: -119.62,
    sourceConfidence: 80,
  },
  {
    ...SAMPLE_ESTABLISHED_CAMPSITES[0],
    id: 'cluster-b',
    name: 'Pine Basin Site Loop',
    latitude: 37.7208,
    longitude: -119.6208,
    sourceConfidence: 92,
  },
  {
    ...SAMPLE_ESTABLISHED_CAMPSITES[0],
    id: 'far-campground',
    name: 'Far Meadow Campground',
    latitude: 37.75,
    longitude: -119.65,
  },
]);
assert.strictEqual(ESTABLISHED_CAMPGROUND_PIN_DEDUPE_RADIUS_METERS, 200);
assert.strictEqual(
  duplicateCampgroundPins.length,
  2,
  'Established campground pins within 200 meters should collapse to one visible map pin.',
);
assert.strictEqual(
  duplicateCampgroundPins[0].id,
  'cluster-b',
  'Collapsed established campground pin should keep the strongest source record for details.',
);
assert.strictEqual(
  duplicateCampgroundPins[0].nearbyCampgroundCount,
  2,
  'Collapsed established campground pin should retain nearby duplicate context.',
);
assert.ok(
  duplicateCampgroundPins[0].latitude > 37.72 && duplicateCampgroundPins[0].latitude < 37.7208,
  'Collapsed established campground pin should be placed at the center of nearby duplicate pins.',
);

const nearRoute = findEstablishedCampsitesNearRoute({
  campsites: SAMPLE_ESTABLISHED_CAMPSITES,
  routeCoordinates: [
    { latitude: 37.68, longitude: -119.82 },
    { latitude: 37.92, longitude: -119.52 },
  ],
  currentLocation: { latitude: 38.7, longitude: -119.86 },
  corridorMiles: DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_CORRIDOR_MILES,
  maxResults: 3,
});
assert.ok(nearRoute.length > 0 && nearRoute.length <= 3, 'Established campsite route summary should cap rows at 3.');
assert.ok(
  nearRoute.every((campsite) => typeof campsite.distanceFromRouteMiles === 'number'),
  'Established campsite route summary should compute route distances.',
);
for (let index = 1; index < nearRoute.length; index += 1) {
  assert.ok(
    (nearRoute[index - 1].distanceFromRouteMiles ?? 0) <= (nearRoute[index].distanceFromRouteMiles ?? 0) ||
      nearRoute[index - 1].distanceFromRouteMiles === nearRoute[index].distanceFromRouteMiles,
    'Established campsite route summary should sort primarily by distance from route.',
  );
}

[
  'Established Campgrounds',
  'Shows known fixed campgrounds, RV parks, and pay-per-night camping locations.',
].forEach((copy) => {
  assert.ok(navigateSource.includes(copy), `Navigate missing established campsite copy: ${copy}`);
});
assert.ok(
  read('lib/map/establishedCampgroundSearchClient.ts').includes('ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION') &&
    read('lib/map/establishedCampgroundMobile.ts').includes("ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION = 'campgrounds-search'"),
  'Established Campgrounds mobile search should call the ECS-owned campgrounds-search endpoint.',
);

[
  'Established Campground',
  'Availability, fees, seasons, and restrictions may change. Verify current details with the campground operator before travel.',
  'Campground type',
  'Managing agency',
  'Navigate',
  'formatCampgroundAvailabilityLabel',
].forEach((copy) => {
  assert.ok(sheetSource.includes(copy), `Established campsite sheet missing copy: ${copy}`);
});

[
  'Established Campgrounds Near Route',
  'View on map',
].forEach((copy) => {
  assert.ok(routeSummarySource.includes(copy), `Established campsite route summary missing copy: ${copy}`);
});
assert.ok(
  !routeSummarySource.includes('badgeLabel') &&
    !routeSummarySource.includes('badgeStack') &&
    !routeSummarySource.includes('badgeText'),
  'Established campsite route summary should leave room for longer names by omitting fee/reservation badges.',
);

[
  'EstablishedCampsiteSource',
  'EstablishedCampsiteType',
  'EstablishedCampsiteFeeStatus',
  'EstablishedCampsiteReservationStatus',
  'EstablishedCampsiteAmenity',
  'EstablishedCampsite',
].forEach((token) => {
  assert.ok(typesSource.includes(token), `Established campsite type missing: ${token}`);
});

[
  'RECREATION_GOV',
  'NPS',
  'OSM',
  'STATE',
  'COUNTY',
  'PRIVATE',
  'UNKNOWN',
].forEach((source) => {
  assert.ok(typesSource.includes(`'${source}'`), `Established campsite source missing: ${source}`);
});

assert.ok(
  sourcesSource.includes('ESTABLISHED_CAMPSITE_SOURCE_STRATEGY') &&
    sourcesSource.includes('not scraping'),
  'Established campsite source strategy should prepare approved data seams and avoid scraping.',
);

[
  'ecs-established-campsites',
  'ecs-established-campsites-symbol',
  'ecs-established-campsites-backplate',
  'SET_ESTABLISHED_CAMPSITES_LAYER_ENABLED',
  'ESTABLISHED_CAMPSITE_SELECTED',
].forEach((token) => {
  assert.ok(mapRendererSource.includes(token) || messagesSource.includes(token), `Missing Mapbox established campsite token: ${token}`);
});

assert.ok(
  mapRendererSource.includes('cluster: true') &&
    mapRendererSource.includes('clusterMaxZoom') &&
    mapRendererSource.includes('clusterRadius'),
  'Established campsite Mapbox source should cluster pins.',
);

assert.strictEqual(ESTABLISHED_CAMPSITES_MIN_ZOOM, 8);
assert.strictEqual(isCampLayerZoomEligible('established_campgrounds', 3), false);
assert.strictEqual(isCampLayerZoomEligible('established_campgrounds', ESTABLISHED_CAMPSITES_MIN_ZOOM), true);
assert.ok(
  navigateSource.includes('establishedCampsitesZoomReady') &&
    navigateSource.includes("isCampLayerZoomEligible('established_campgrounds', mapZoom)") &&
    navigateSource.includes('establishedCampsitesZoomPrompt') &&
    navigateSource.includes('setCampLayerZoomDeferred') &&
    navigateSource.includes("reason: 'zoom_too_low'"),
  'Navigate should defer established campground fetch/render work until users zoom into campground planning scale.',
);
assert.ok(
  mapRendererSource.includes('ESTABLISHED_CAMPSITES_MIN_ZOOM') &&
    mapRendererSource.includes('minzoom: ${ESTABLISHED_CAMPSITES_MIN_ZOOM}'),
  'Established campground Mapbox layers should also have a minzoom safety net.',
);

assert.ok(
  mapRendererSource.includes('ensureEstablishedCampsiteImages') &&
    mapRendererSource.includes('ESTABLISHED_CAMPSITE_ICON_ID') &&
    mapRendererSource.includes("'icon-image'") &&
    mapRendererSource.includes("['coalesce', ['get', 'name'], ['get', 'title'], 'Campground']") &&
    mapRendererSource.includes("expectedGeometry: 'Point'"),
  'Established campsite Mapbox layer should register a campground icon, validate point GeoJSON, and label individual campgrounds by name.',
);

assert.ok(
  navigateSource.includes('[CAMP_LAYER_DEBUG]') &&
    navigateSource.includes('layer: \'established_campgrounds\'') &&
    mapRendererSource.includes('map_source_update') &&
    mapRendererSource.includes('symbolLayerVisible'),
  'Established campsite layer should expose dev-gated diagnostics for fetch counts and map layer visibility.',
);

assert.ok(
  mapRendererSource.includes("sendCampLayerDebug('queued_until_style_loaded'") &&
    mapRendererSource.includes("sendCampLayerDebug('applied_after_style_load'") &&
    mapRendererSource.includes("sendCampLayerDebug('skipped_stale_payload'") &&
    mapRendererSource.includes("sendCampLayerDebug('source_set_data'") &&
    mapRendererSource.includes("sendCampLayerDebug('source_created'") &&
    mapRendererSource.includes("applyEstablishedCampsitesDesiredState('style_load')"),
  'Established campsite WebView lifecycle should queue updates until style load and apply the latest desired state once.',
);

assert.ok(
  mapRendererSource.includes('removeEstablishedCampsitesLayer') &&
    mapRendererSource.includes('removeMapLayer(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID)') &&
    mapRendererSource.includes('removeMapSource(ESTABLISHED_CAMPSITES_SOURCE_ID)'),
  'Established campsite layer should remove symbol/backplate/source when disabled.',
);

assert.ok(
  mapRendererSource.includes("map.on('click', ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID") &&
    mapRendererSource.includes('send(ESTABLISHED_CAMPSITE_SELECTED_MESSAGE_TYPE'),
  'Established campsite symbol layer should post selected campsite payloads.',
);

assert.ok(
  navigateSource.includes('establishedCampsitesEnabled') &&
    navigateSource.includes('establishedCampgroundsStatus') &&
    navigateSource.includes('mapCampgroundSearchRecordsToEstablishedCampsites') &&
    navigateSource.includes('selectedEstablishedCampsite') &&
    navigateSource.includes('setSelectedEstablishedCampsite(null)') &&
    navigateSource.includes('<EstablishedCampsiteSheet') &&
    navigateSource.includes('<EstablishedCampsitesRouteSummary') &&
    navigateSource.includes('handleEstablishedCampsiteViewOnMap') &&
    navigateSource.includes('establishedCampsites={establishedCampsitesLayer}') &&
    navigateSource.includes('onEstablishedCampsiteTap={handleEstablishedCampsiteTap}'),
  'Navigate should own independent established campsite toggle, selection, sheet, and MapRenderer props.',
);

assert.ok(
  routeSearchSource.includes('DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_CORRIDOR_MILES = 5') &&
    routeSearchSource.includes('distancePointToRouteMiles') &&
    routeSearchSource.includes('getReservationRank') &&
    routeSearchSource.includes('MAX_ESTABLISHED_CAMPSITE_ROUTE_ANALYSIS_POINTS') &&
    routeSearchSource.includes('getSourceReliabilityRank'),
  'Established campsite route summary should use configurable corridor distance and explicit sorting ranks.',
);

assert.ok(
  envSource.includes('EXPO_PUBLIC_ECS_ESTABLISHED_CAMPSITES_LAYER=false'),
  'Established Campgrounds layer should preserve the internal/dev feature flag.',
);

['legal campsite', 'guaranteed available', 'you can camp here tonight', 'confirmed availability'].forEach((forbidden) => {
  const haystack = [
    navigateSource,
    sheetSource,
    routeSummarySource,
    mapRendererSource,
    typesSource,
    sourcesSource,
    adapterSource,
    routeSearchSource,
  ].join('\n').toLowerCase();
  assert.ok(!haystack.includes(forbidden), `Established Campsites copy should avoid banned certainty phrase: ${forbidden}`);
});
