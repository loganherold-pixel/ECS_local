import assert from 'assert';
import fs from 'fs';
import path from 'path';

import {
  buildCampgroundSearchFeatureCollection,
  filterCampgroundSearchRows,
  parseCampgroundSearchParams,
  type CampgroundDbRow,
  type CampgroundMarkerRecord,
} from '../../supabase/functions/_shared/campgroundApi';
import {
  buildEstablishedCampgroundsCacheKey,
  buildEstablishedCampgroundsSearchRequest,
  mapCampgroundRecordToEstablishedCampsite,
  mapCampgroundSearchRecordsToEstablishedCampsites,
} from '../../lib/map/establishedCampgroundMobile';
import { toEstablishedCampsiteFeatureCollection } from '../../lib/map/establishedCampsiteGeojsonAdapter';
import {
  buildDispersedCampingCacheKey,
  buildDispersedCampingSearchRequest,
  friendlyDispersedCampingError,
  normalizeDispersedCampingSearchResponse,
  normalizeDispersedCampingSearchBbox,
} from '../../lib/map/dispersedCampingMobile';
import {
  CampLayerFetchCoordinator,
  buildCampLayerFetchCacheKey,
  normalizeCampLayerFetchBbox,
} from '../../lib/map/campLayerFetchScheduler';
import {
  logCampLayerFetchFailure,
  summarizeCampLayerFetchResponseShape,
} from '../../lib/map/campLayerFetchDiagnostics';
import {
  createCampLayerUiState,
  setCampLayerEnabled,
  setCampLayerFetchFailed,
  setCampLayerFetchSucceeded,
  setCampLayerLoading,
} from '../../lib/map/campLayerUiState';
import {
  classifyDispersedCampingRegion,
  getDispersedCampingEligibilityLabel,
} from '../../lib/map/dispersedCampingEligibility';
import {
  toDispersedCampingFeatureCollection,
  toDispersedCampingRegions,
} from '../../lib/map/dispersedCampingGeojsonAdapter';
import type { PublicLandEligibilitySourceRecord } from '../../lib/map/publicLandSources';

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function campgroundRow(row: Partial<CampgroundDbRow> & { id: string; name: string }): CampgroundDbRow {
  return {
    latitude: 37.73,
    longitude: -119.57,
    facility_type: 'campground',
    managing_agency: 'USFS',
    managing_org: 'Sierra National Forest',
    reservation_url: 'https://example.test/reserve',
    detail_url: 'https://example.test/detail',
    status: 'open',
    availability_status: 'unknown',
    site_count: 24,
    site_types: ['campground', 'tent_site'],
    amenities: ['water', 'toilets'],
    source_confidence: 92,
    primary_provider: 'ridb',
    attribution: 'Recreation.gov',
    last_synced_at: '2026-05-15T12:00:00.000Z',
    last_verified_at: '2026-05-15T12:00:00.000Z',
    last_availability_checked_at: null,
    ...row,
  };
}

const californiaBbox = {
  minLng: -124.45,
  minLat: 32.53,
  maxLng: -114.13,
  maxLat: 42.01,
};

const californiaCampgroundParams = parseCampgroundSearchParams({
  bbox: '-124.45,32.53,-114.13,42.01',
  limit: 20,
});
assert.ok(californiaCampgroundParams, 'California campground bbox should parse.');
assert.deepStrictEqual(
  californiaCampgroundParams?.bbox,
  californiaBbox,
  'Campground bbox parsing must preserve minLng,minLat,maxLng,maxLat order.',
);

const mockedCampgroundRows = [
  campgroundRow({
    id: 'ridb-yosemite-001',
    name: 'Pine Flat Campground',
    latitude: 37.724,
    longitude: -119.561,
  }),
  campgroundRow({
    id: 'malformed-no-lat',
    name: 'Malformed Missing Latitude Campground',
    latitude: Number.NaN,
    longitude: -119.5,
  }),
  campgroundRow({
    id: 'summit-not-camp',
    name: 'Granite Peak Summit',
    latitude: 37.71,
    longitude: -119.6,
    facility_type: 'summit',
    site_types: ['summit'],
    primary_provider: 'osm',
  }),
  campgroundRow({
    id: 'office-not-camp',
    name: 'Bureau of Land Management Field Office',
    latitude: 37.7,
    longitude: -119.55,
    facility_type: 'administrative_area',
    managing_agency: 'Bureau of Land Management',
    site_types: ['administrative_area'],
    primary_provider: 'osm',
  }),
];

const normalizedCampgroundRecords = filterCampgroundSearchRows(
  mockedCampgroundRows,
  new Map(),
  californiaCampgroundParams!,
  new Date('2026-05-15T12:00:00.000Z'),
);
assert.deepStrictEqual(
  normalizedCampgroundRecords.map((record) => record.id),
  ['ridb-yosemite-001'],
  'Established campground normalization should keep real campgrounds and reject malformed/non-camp upstream records.',
);

const campgroundGeojson = buildCampgroundSearchFeatureCollection(normalizedCampgroundRecords);
assert.strictEqual(campgroundGeojson.type, 'FeatureCollection');
assert.strictEqual(campgroundGeojson.features.length, 1);
assert.deepStrictEqual(
  campgroundGeojson.features[0].geometry,
  { type: 'Point', coordinates: [-119.561, 37.724] },
  'Established campground GeoJSON must use [longitude, latitude] coordinate order.',
);
assert.strictEqual(campgroundGeojson.features[0].properties.name, 'Pine Flat Campground');
assert.strictEqual(campgroundGeojson.features[0].properties.source, 'ridb');

const malformedMarkerCollection = buildCampgroundSearchFeatureCollection([
  {
    ...normalizedCampgroundRecords[0],
    id: 'bad-latlng-order',
    latitude: -119.561,
    longitude: 37.724,
  } as CampgroundMarkerRecord,
]);
assert.strictEqual(
  malformedMarkerCollection.features.length,
  0,
  'Established campground feature builder should reject lat/lng-swapped coordinates with invalid latitude.',
);

assert.deepStrictEqual(
  buildCampgroundSearchFeatureCollection([]).features,
  [],
  'Empty established campground upstream responses should produce an empty FeatureCollection.',
);

const mobileCampgrounds = mapCampgroundSearchRecordsToEstablishedCampsites(normalizedCampgroundRecords);
assert.strictEqual(mobileCampgrounds.length, 1);
assert.strictEqual(mobileCampgrounds[0].name, 'Pine Flat Campground');
assert.deepStrictEqual(
  toEstablishedCampsiteFeatureCollection(mobileCampgrounds).features[0].geometry.coordinates,
  [-119.561, 37.724],
  'Frontend established campground adapter must preserve [lng,lat] point geometry.',
);
assert.strictEqual(
  mapCampgroundRecordToEstablishedCampsite({
    id: 'bad-mobile-record',
    name: 'Malformed Mobile Record',
    latitude: 37.7,
    longitude: Number.NaN,
  }),
  null,
  'Frontend established campground adapter should drop malformed upstream records.',
);
assert.deepStrictEqual(
  mapCampgroundSearchRecordsToEstablishedCampsites([]),
  [],
  'Frontend established campground adapter should handle empty upstream responses.',
);

assert.deepStrictEqual(
  buildEstablishedCampgroundsSearchRequest(californiaBbox),
  {
    bbox: '-124.450000,32.530000,-114.130000,42.010000',
    limit: 250,
    availability: 'any',
    openStatus: 'any',
  },
  'Established campground request should pass California bbox as minLng,minLat,maxLng,maxLat.',
);
assert.strictEqual(
  buildEstablishedCampgroundsCacheKey(californiaBbox),
  'established-campgrounds:-124.450,32.530,-114.130,42.010:viewport',
);

const polygon = {
  type: 'Polygon' as const,
  coordinates: [[
    [-119.9, 37.1] as [number, number],
    [-119.7, 37.1] as [number, number],
    [-119.7, 36.9] as [number, number],
    [-119.9, 36.9] as [number, number],
    [-119.9, 37.1] as [number, number],
  ]],
};
const multipolygon = {
  type: 'MultiPolygon' as const,
  coordinates: [
    [[
      [-118.5, 36.4] as [number, number],
      [-118.3, 36.4] as [number, number],
      [-118.3, 36.2] as [number, number],
      [-118.5, 36.2] as [number, number],
      [-118.5, 36.4] as [number, number],
    ]],
    [[
      [-117.8, 35.9] as [number, number],
      [-117.6, 35.9] as [number, number],
      [-117.6, 35.7] as [number, number],
      [-117.8, 35.7] as [number, number],
      [-117.8, 35.9] as [number, number],
    ]],
  ],
};

const mockedDispersedSources: PublicLandEligibilitySourceRecord[] = [
  {
    id: 'padus-blm-ca-001',
    name: 'Mock BLM Public Land Unit',
    geometry: polygon,
    landManager: 'BLM',
    accessType: 'Open public access in PAD-US',
    knownClosure: false,
    permitRequired: false,
    fireRestriction: false,
    sourceNames: ['Mock PAD-US source'],
    source: 'pad_us_manager_name',
    sourceProvider: 'USGS PAD-US',
  },
  {
    id: 'padus-usfs-ca-001',
    name: 'Mock USFS Public Land Unit',
    geometry: multipolygon,
    landManager: 'USFS',
    accessType: 'Open public access in PAD-US',
    knownClosure: false,
    permitRequired: false,
    fireRestriction: false,
    sourceNames: ['Mock PAD-US source'],
    source: 'pad_us_manager_name',
    sourceProvider: 'USGS PAD-US',
  },
  {
    id: 'padus-private-ca-001',
    name: 'Mock Private Restricted Area',
    geometry: polygon,
    landManager: 'PRIVATE',
    privateOrTribal: true,
    sourceNames: ['Mock PAD-US source'],
  },
  {
    id: 'padus-unknown-ca-001',
    name: 'Mock Unknown Manager Area',
    geometry: polygon,
    landManager: 'UNKNOWN',
    sourceNames: ['Mock PAD-US source'],
  },
];

const dispersedRegions = toDispersedCampingRegions(mockedDispersedSources);
const dispersedGeojson = toDispersedCampingFeatureCollection(dispersedRegions);
assert.strictEqual(dispersedGeojson.type, 'FeatureCollection');
assert.strictEqual(dispersedGeojson.features.length, mockedDispersedSources.length);
assert.strictEqual(dispersedGeojson.features[0].geometry.type, 'Polygon');
assert.strictEqual(dispersedGeojson.features[1].geometry.type, 'MultiPolygon');
assert.deepStrictEqual(
  (dispersedGeojson.features[0].geometry as typeof polygon).coordinates[0][0],
  [-119.9, 37.1],
  'Dispersed camping polygon adapter must preserve [lng,lat] coordinate order.',
);
assert.strictEqual(dispersedGeojson.features[0].properties.source, 'pad_us_manager_name');
assert.strictEqual(dispersedGeojson.features[0].properties.sourceProvider, 'USGS PAD-US');
assert.strictEqual(dispersedGeojson.features[0].properties.eligibilityLabel, 'Likely eligible');
assert.strictEqual(dispersedGeojson.features[2].properties.confidence, 'restricted');
assert.strictEqual(dispersedGeojson.features[2].properties.eligibilityLabel, 'Restricted / unavailable');
assert.strictEqual(dispersedGeojson.features[3].properties.confidence, 'verify');
assert.strictEqual(dispersedGeojson.features[3].properties.eligibilityLabel, 'Verify locally');
assert.notStrictEqual(
  getDispersedCampingEligibilityLabel(classifyDispersedCampingRegion({ landManager: 'UNKNOWN' })),
  'Likely eligible',
  'Unknown dispersed camping areas must not be classified as allowed/likely.',
);
assert.ok(
  !['high', 'medium'].includes(classifyDispersedCampingRegion({ landManager: 'PRIVATE', privateOrTribal: true })),
  'Restricted/private dispersed camping areas must not be classified as allowed/likely.',
);
assert.deepStrictEqual(
  toDispersedCampingFeatureCollection(toDispersedCampingRegions([])).features,
  [],
  'Empty dispersed camping upstream responses should produce an empty FeatureCollection.',
);
assert.deepStrictEqual(
  normalizeDispersedCampingSearchBbox({
    minLng: -114.13,
    minLat: 42.01,
    maxLng: -124.45,
    maxLat: 32.53,
  }),
  californiaBbox,
  'Dispersed camping bbox normalization should safely reorder California bbox bounds.',
);
assert.deepStrictEqual(
  buildDispersedCampingSearchRequest(californiaBbox),
  {
    bbox: '-124.450000,32.530000,-114.130000,42.010000',
    limit: 80,
  },
  'Dispersed camping request should pass bbox as minLng,minLat,maxLng,maxLat.',
);
assert.strictEqual(
  buildDispersedCampingCacheKey(californiaBbox),
  '-124.450,32.530,-114.130,42.010',
);

const scheduledBbox = normalizeCampLayerFetchBbox({
  minLng: -119.804,
  minLat: 37.604,
  maxLng: -119.404,
  maxLat: 37.904,
});
assert.deepStrictEqual(
  scheduledBbox,
  { minLng: -119.81, minLat: 37.6, maxLng: -119.4, maxLat: 37.91 },
  'Camp layer scheduler should bucket bbox bounds to suppress tiny viewport jitter.',
);
assert.strictEqual(
  buildCampLayerFetchCacheKey('established_campgrounds', scheduledBbox!),
  'established_campgrounds:-119.81:37.60:-119.40:37.91',
);

const debounceScheduler = new CampLayerFetchCoordinator({ debounceMs: 500 });
const debouncePlan = debounceScheduler.plan({
  layer: 'established_campgrounds',
  bbox: { minLng: -119.804, minLat: 37.604, maxLng: -119.404, maxLat: 37.904 },
  enabled: true,
  online: true,
  now: 1000,
});
assert.strictEqual(debouncePlan.type, 'schedule');
assert.strictEqual(debouncePlan.type === 'schedule' ? debouncePlan.dueAt : null, 1500);
assert.strictEqual(
  debounceScheduler.consumeDue('established_campgrounds', 1499),
  null,
  'Camp layer scheduler should debounce viewport-triggered fetches.',
);
const debounceStart = debounceScheduler.consumeDue('established_campgrounds', 1500);
assert.ok(debounceStart, 'Camp layer scheduler should release a fetch after the debounce window.');

const duplicateScheduler = new CampLayerFetchCoordinator({ debounceMs: 500 });
const duplicateFirst = duplicateScheduler.plan({
  layer: 'dispersed_camping',
  bbox: { minLng: -119.804, minLat: 37.604, maxLng: -119.404, maxLat: 37.904 },
  enabled: true,
  online: true,
  now: 2000,
});
const duplicateSecond = duplicateScheduler.plan({
  layer: 'dispersed_camping',
  bbox: { minLng: -119.8039, minLat: 37.6041, maxLng: -119.4039, maxLat: 37.9041 },
  enabled: true,
  online: true,
  now: 2050,
});
assert.strictEqual(duplicateFirst.type, 'schedule');
assert.strictEqual(duplicateSecond.type, 'skip');
assert.strictEqual(
  duplicateSecond.type === 'skip' ? duplicateSecond.reason : null,
  'duplicate_pending',
  'Camp layer scheduler should suppress duplicate cache keys from tiny bbox jitter.',
);

const staleScheduler = new CampLayerFetchCoordinator({ debounceMs: 0 });
staleScheduler.plan({
  layer: 'established_campgrounds',
  bbox: { minLng: -119.8, minLat: 37.6, maxLng: -119.4, maxLat: 37.9 },
  enabled: true,
  online: true,
  now: 3000,
});
const staleStart = staleScheduler.consumeDue('established_campgrounds', 3000)!;
staleScheduler.plan({
  layer: 'established_campgrounds',
  bbox: { minLng: -118.8, minLat: 36.6, maxLng: -118.4, maxLat: 36.9 },
  enabled: true,
  online: true,
  now: 3001,
});
assert.strictEqual(
  staleScheduler.complete(staleStart),
  false,
  'Camp layer scheduler should ignore stale in-flight responses after a newer bbox supersedes them.',
);

const disabledScheduler = new CampLayerFetchCoordinator({ debounceMs: 0 });
disabledScheduler.plan({
  layer: 'dispersed_camping',
  bbox: { minLng: -119.8, minLat: 37.6, maxLng: -119.4, maxLat: 37.9 },
  enabled: true,
  online: true,
  now: 4000,
});
const disabledStart = disabledScheduler.consumeDue('dispersed_camping', 4000)!;
const disabledPlan = disabledScheduler.plan({
  layer: 'dispersed_camping',
  bbox: { minLng: -119.8, minLat: 37.6, maxLng: -119.4, maxLat: 37.9 },
  enabled: false,
  online: true,
  now: 4001,
});
assert.strictEqual(disabledPlan.type, 'skip');
assert.strictEqual(disabledPlan.type === 'skip' ? disabledPlan.reason : null, 'layer_disabled');
assert.strictEqual(
  disabledScheduler.complete(disabledStart),
  false,
  'Camp layer scheduler should invalidate in-flight requests when the layer is disabled.',
);

const uiBbox = { minLng: -119.81, minLat: 37.6, maxLng: -119.4, maxLat: 37.91 };
const toggleFailureState = setCampLayerFetchFailed(
  setCampLayerLoading(setCampLayerEnabled(createCampLayerUiState(false), true)),
  'backend unavailable',
);
assert.strictEqual(toggleFailureState.enabled, true);
assert.strictEqual(toggleFailureState.status, 'error');
assert.strictEqual(toggleFailureState.errorMessage, 'backend unavailable');

const toggleOffDuringFetchState = setCampLayerEnabled(
  setCampLayerLoading(setCampLayerEnabled(createCampLayerUiState(false), true)),
  false,
);
assert.strictEqual(toggleOffDuringFetchState.enabled, false);
assert.strictEqual(toggleOffDuringFetchState.status, 'idle');
assert.strictEqual(toggleOffDuringFetchState.errorMessage, undefined);

const emptySuccessState = setCampLayerFetchSucceeded(setCampLayerEnabled(createCampLayerUiState(false), true), {
  bbox: uiBbox,
  cacheKey: 'dispersed_camping:-119.81:37.60:-119.40:37.91',
  featureCount: 0,
});
assert.strictEqual(emptySuccessState.status, 'empty');
assert.strictEqual(emptySuccessState.featureCount, 0);
assert.strictEqual(emptySuccessState.lastSuccessfulCacheKey, 'dispersed_camping:-119.81:37.60:-119.40:37.91');

const cachedSuccessState = setCampLayerFetchSucceeded(setCampLayerEnabled(createCampLayerUiState(false), true), {
  bbox: uiBbox,
  cacheKey: 'established_campgrounds:-119.81:37.60:-119.40:37.91',
  featureCount: 3,
});
assert.strictEqual(cachedSuccessState.status, 'ready');
assert.strictEqual(cachedSuccessState.featureCount, 3);
assert.deepStrictEqual(cachedSuccessState.lastSuccessfulBbox, uiBbox);

const retryState = setCampLayerLoading(setCampLayerFetchFailed(cachedSuccessState, 'temporary failure'));
assert.strictEqual(retryState.enabled, true);
assert.strictEqual(retryState.status, 'loading');
assert.strictEqual(retryState.errorMessage, undefined);
assert.strictEqual(
  retryState.featureCount,
  3,
  'Camp layer retry should preserve cached successful feature count while refreshing.',
);
const retrySuccessState = setCampLayerFetchSucceeded(retryState, {
  bbox: uiBbox,
  cacheKey: 'established_campgrounds:-119.81:37.60:-119.40:37.91',
  featureCount: 4,
});
assert.strictEqual(retrySuccessState.status, 'ready');
assert.strictEqual(retrySuccessState.errorMessage, undefined);
assert.strictEqual(retrySuccessState.featureCount, 4);

const retryFailureState = setCampLayerFetchFailed(retryState, 'temporary failure', {
  bbox: uiBbox,
  cacheKey: 'established_campgrounds:-119.81:37.60:-119.40:37.91',
  diagnostic: {
    layer: 'established_campgrounds',
    endpoint: 'campgrounds-search',
    method: 'POST',
    status: 503,
    statusText: 'Service Unavailable',
    errorName: 'FunctionsHttpError',
    errorCode: '503',
    errorMessage: 'Edge Function returned a non-2xx status code',
  },
});
assert.strictEqual(retryFailureState.enabled, true);
assert.strictEqual(retryFailureState.status, 'error');
assert.strictEqual(retryFailureState.featureCount, 3);
assert.strictEqual(retryFailureState.diagnostic?.endpoint, 'campgrounds-search');

const normalizedDispersedSuccess = normalizeDispersedCampingSearchResponse({
  ok: true,
  geojson: dispersedGeojson,
  count: dispersedGeojson.features.length,
  meta: { bbox: californiaBbox, source: 'pad_us_manager_name' },
});
assert.strictEqual(normalizedDispersedSuccess.ok, true);
assert.strictEqual(
  normalizedDispersedSuccess.geojson?.type,
  'FeatureCollection',
  'Successful dispersed camping responses should retain a valid FeatureCollection.',
);
assert.strictEqual(
  normalizedDispersedSuccess.geojson?.features.length,
  dispersedGeojson.features.length,
  'Successful dispersed camping responses should preserve returned GeoJSON features.',
);
assert.strictEqual(
  normalizedDispersedSuccess.regions?.length,
  dispersedGeojson.features.length,
  'GeoJSON-only dispersed camping responses should convert into regions for the RN layer state.',
);

const normalizedDispersedEmpty = normalizeDispersedCampingSearchResponse({
  ok: true,
  geojson: { type: 'FeatureCollection', features: [] },
  count: 0,
});
assert.strictEqual(normalizedDispersedEmpty.ok, true);
assert.deepStrictEqual(
  normalizedDispersedEmpty.geojson?.features,
  [],
  'Empty successful dispersed camping FeatureCollections should remain success-empty, not unavailable.',
);
assert.deepStrictEqual(normalizedDispersedEmpty.regions, []);

const normalizedDispersedBackendError = normalizeDispersedCampingSearchResponse({
  ok: false,
  error: 'Edge Function returned a non-2xx status code',
});
assert.strictEqual(normalizedDispersedBackendError.ok, false);
assert.strictEqual(
  friendlyDispersedCampingError(normalizedDispersedBackendError.error),
  'Dispersed camping eligibility is temporarily unavailable. Try again after refreshing the map.',
  'Backend dispersed camping failures should preserve the current user-facing unavailable copy.',
);

const normalizedMalformedDispersed = normalizeDispersedCampingSearchResponse({
  ok: true,
  geojson: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-119, 37] }, properties: {} }],
  },
});
assert.strictEqual(normalizedMalformedDispersed.ok, false);
assert.strictEqual(
  normalizedMalformedDispersed.error,
  'Malformed dispersed camping eligibility response.',
  'Malformed dispersed camping responses should become diagnostic errors instead of empty success.',
);

assert.deepStrictEqual(
  summarizeCampLayerFetchResponseShape({
    ok: false,
    error: 'backend failure',
    geojson: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: null, properties: {} }],
    },
  }),
  {
    isFeatureCollection: true,
    featureCount: 1,
    topLevelKeys: ['error', 'geojson', 'ok'],
  },
  'Camp layer fetch diagnostics should summarize response shape without logging response bodies.',
);

const capturedWarnings: unknown[] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  capturedWarnings.push(args);
};
try {
  logCampLayerFetchFailure({
    layer: 'dispersed_camping',
    bbox: californiaBbox,
    cacheKey: buildDispersedCampingCacheKey(californiaBbox),
    method: 'POST',
    endpoint: 'dispersed-camping-eligibility',
    status: 503,
    supabaseError: {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      code: 'FUNCTIONS_HTTP_ERROR',
      context: { status: 503 },
    },
    response: { ok: false, error: 'temporary failure' },
  });
} finally {
  console.warn = originalWarn;
}
assert.strictEqual(capturedWarnings.length, 1, 'Camp layer fetch failures should emit one structured warning.');
const diagnosticPayload = (capturedWarnings[0] as unknown[])[1] as Record<string, unknown>;
assert.strictEqual(diagnosticPayload.endpoint, 'dispersed-camping-eligibility');
assert.strictEqual(diagnosticPayload.method, 'POST');
assert.deepStrictEqual(diagnosticPayload.bbox, californiaBbox);
assert.ok(
  !JSON.stringify(diagnosticPayload).toLowerCase().includes('authorization') &&
    !JSON.stringify(diagnosticPayload).toLowerCase().includes('cookie') &&
    !JSON.stringify(diagnosticPayload).toLowerCase().includes('api_key'),
  'Camp layer fetch diagnostics must not log secret-bearing request metadata.',
);

const navigateSource = read('app/(tabs)/navigate.tsx');
const mapRendererSource = read('components/navigate/MapRenderer.tsx');
const dispersedSearchClientSource = read('lib/map/dispersedCampingSearchClient.ts');
const establishedSearchClientSource = read('lib/map/establishedCampgroundSearchClient.ts');
const fetchDiagnosticsSource = read('lib/map/campLayerFetchDiagnostics.ts');
const offlineCacheSource = read('lib/map/campLayerOfflineCache.ts');
const dispersedEdgeSource = read('supabase/functions/dispersed-camping-eligibility/index.ts');
const campgroundSearchSource = read('supabase/functions/campgrounds-search/index.ts');
const supabaseConfigSource = read('supabase/config.toml');
const envExampleSource = read('.env.example');
const endpointProbeSource = read('scripts/test-camp-layer-endpoints.mjs');

assert.ok(
  navigateSource.includes('toggleEstablishedCampsites') &&
    navigateSource.includes('toggleDispersedCampingEligibility') &&
    navigateSource.includes('checkbox_change') &&
    navigateSource.includes('frontend_fetch_start') &&
    navigateSource.includes('frontend_fetch_empty'),
  'Navigate should log checkbox and fetch lifecycle diagnostics for both camp layers.',
);
assert.ok(
  navigateSource.includes('isCampLayerVerboseDebugEnabled') &&
    navigateSource.includes('EXPO_PUBLIC_ECS_CAMP_LAYER_DEBUG') &&
    navigateSource.includes('isCampLayerFailureDebugStage') &&
    mapRendererSource.includes('EXPO_PUBLIC_ECS_CAMP_LAYER_DEBUG') &&
    envExampleSource.includes('EXPO_PUBLIC_ECS_CAMP_LAYER_DEBUG=0'),
  'Verbose camp layer lifecycle logs should require an explicit debug flag while preserving failure diagnostics.',
);
assert.ok(
  navigateSource.includes('retryDispersedCampingEligibility') &&
    navigateSource.includes('retryEstablishedCampgrounds') &&
    navigateSource.includes('No results in this map area.') &&
    navigateSource.includes('formatCampLayerErrorDiagnostic') &&
    navigateSource.includes('campLayerRetryButton'),
  'Navigate should show empty-success copy, dev diagnostics, and retry actions for failed camp layers.',
);
assert.ok(
    navigateSource.includes('establishedCampsites={establishedCampsitesLayer}') &&
    navigateSource.includes('dispersedCampingEligibility={dispersedCampingEligibilityLayer}') &&
    navigateSource.includes('toEstablishedCampsiteFeatureCollection(establishedCampgroundsForMap)') &&
    navigateSource.includes('toDispersedCampingFeatureCollection(dispersedCampingRegionsForMap'),
  'Navigate should pass normalized GeoJSON layer state into MapRenderer.',
);
assert.ok(
  mapRendererSource.includes("if (!map.getSource(ESTABLISHED_CAMPSITES_SOURCE_ID))") &&
    mapRendererSource.includes("if (!map.getLayer(ESTABLISHED_CAMPSITES_BACKPLATE_LAYER_ID))") &&
    mapRendererSource.includes("if (!map.getLayer(ESTABLISHED_CAMPSITES_SYMBOL_LAYER_ID))") &&
    mapRendererSource.includes("if (!map.getLayer(DISPERSED_CAMPING_FILL_LAYER_ID))") &&
    mapRendererSource.includes("if (!map.getLayer(DISPERSED_CAMPING_OUTLINE_LAYER_ID))"),
  'MapRenderer should guard source/layer registration so repeated toggles do not create duplicates.',
);
assert.ok(
  mapRendererSource.includes("geometryType === 'Point'") &&
    mapRendererSource.includes("geometryType === 'Polygon' || geometryType === 'MultiPolygon'") &&
    mapRendererSource.includes('invalid_geojson_filtered'),
  'MapRenderer should validate campground point and dispersed polygon geometry before rendering.',
);
assert.ok(
  mapRendererSource.includes('removeEstablishedCampsitesLayer') &&
    mapRendererSource.includes('removeDispersedCampingEligibilityLayer') &&
    mapRendererSource.includes('map_layer_removed') &&
    mapRendererSource.includes('map_source_update'),
  'MapRenderer should expose clean layer removal and registration diagnostics.',
);
assert.ok(
  mapRendererSource.includes('isMapStyleReady()') &&
    mapRendererSource.includes("sendCampLayerDebug('queued_until_style_loaded'") &&
    mapRendererSource.includes("sendCampLayerDebug('applied_after_style_load'") &&
    mapRendererSource.includes("sendCampLayerDebug('skipped_stale_payload'") &&
    mapRendererSource.includes("sendCampLayerDebug('source_set_data'") &&
    mapRendererSource.includes("sendCampLayerDebug('source_created'") &&
    mapRendererSource.includes("sendCampLayerDebug('layer_removed'") &&
    mapRendererSource.includes("applyDispersedCampingDesiredState('style_load')") &&
    mapRendererSource.includes("applyEstablishedCampsitesDesiredState('style_load')"),
  'MapRenderer should queue camp layers until style load, apply the latest desired state once, and emit lifecycle diagnostics.',
);
assert.ok(
  dispersedEdgeSource.includes("Mang_Name in ('BLM','USFS')") &&
    dispersedEdgeSource.includes('esriRingsToGeoJson') &&
    dispersedEdgeSource.includes("classification.confidence === 'restricted'") &&
    dispersedEdgeSource.includes('Source metadata indicates restricted or unavailable public access.'),
  'Dispersed camping edge source should query public land managers, parse polygon rings, and preserve restricted states.',
);
assert.ok(
  campgroundSearchSource.includes("from('campgrounds')") &&
    campgroundSearchSource.includes("from('campground_availability')") &&
    campgroundSearchSource.includes('buildCampgroundSearchFeatureCollection(records)') &&
    !campgroundSearchSource.includes('fetchOsmFallbackCampgrounds') &&
    !campgroundSearchSource.includes('OSM_USER_AGENT') &&
    !campgroundSearchSource.includes('OSM_OVERPASS_URL'),
  'Established campground endpoint should return cached canonical GeoJSON without fetching providers from mobile map requests.',
);
assert.ok(
    supabaseConfigSource.includes('[functions.campgrounds-search]') &&
    supabaseConfigSource.includes('entrypoint = "./functions/campgrounds-search/index.ts"') &&
    supabaseConfigSource.includes('[functions.dispersed-camping-eligibility]') &&
    supabaseConfigSource.includes('entrypoint = "./functions/dispersed-camping-eligibility/index.ts"') &&
    supabaseConfigSource.includes('verify_jwt = false'),
  'Supabase config should explicitly deploy both public camp layer functions without gateway JWT verification.',
);
assert.ok(
  dispersedEdgeSource.includes("if (req.method === 'OPTIONS')") &&
    dispersedEdgeSource.includes("'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'") &&
    campgroundSearchSource.includes("if (req.method === 'OPTIONS')") &&
    campgroundSearchSource.includes("'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'"),
  'Camp layer Edge Functions should handle CORS preflight and GET/POST consistently.',
);
assert.ok(
  /return\s+jsonResponse\(\{\s*ok:\s*true[\s\S]*count:\s*records\.length/.test(campgroundSearchSource) &&
    /return\s+jsonResponse\(\{\s*ok:\s*true[\s\S]*count:\s*regions\.length/.test(dispersedEdgeSource),
  'Camp layer Edge Functions should return HTTP 200 ok=true for successful empty FeatureCollections.',
);
assert.ok(
  offlineCacheSource.includes("'ecs_camp_layer_offline_cache_v1'") &&
    offlineCacheSource.includes('createPersistedKeyValueCache(CAMP_LAYER_OFFLINE_CACHE_FILE_KEY)') &&
    offlineCacheSource.includes('resolveCampLayerOfflineCacheLookup') &&
    offlineCacheSource.includes('readDispersedCampingOfflineCache') &&
    offlineCacheSource.includes('readEstablishedCampgroundsOfflineCache') &&
    offlineCacheSource.includes('writeDispersedCampingOfflineCache') &&
    offlineCacheSource.includes('writeEstablishedCampgroundsOfflineCache'),
  'Camp layers should persist established/dispersed map data for later offline rendering.',
);
assert.ok(
  navigateSource.includes("resolveCampLayerOfflineCacheLookup('dispersed_camping'") &&
    navigateSource.includes('readDispersedCampingOfflineCache(lookup.cacheKey)') &&
    navigateSource.includes('writeDispersedCampingOfflineCache({') &&
    navigateSource.includes("resolveCampLayerOfflineCacheLookup('established_campgrounds'") &&
    navigateSource.includes('readEstablishedCampgroundsOfflineCache(lookup.cacheKey)') &&
    navigateSource.includes('writeEstablishedCampgroundsOfflineCache({') &&
    navigateSource.includes('cached established campground') &&
    navigateSource.includes('cached public-land eligibility area'),
  'Navigate should use persisted camp layer cache while offline and label cached camp data honestly.',
);
assert.ok(
  envExampleSource.includes('ECS_SERVICE_ROLE_KEY=') &&
    envExampleSource.includes('SUPABASE_SERVICE_ROLE_KEY=') &&
    envExampleSource.includes('PAD_US_MANAGER_FEATURE_URL=') &&
    envExampleSource.includes('OSM_USER_AGENT=') &&
    envExampleSource.includes('RIDB_API_KEY='),
  'Camp layer backend env names should be documented with placeholders only.',
);
assert.ok(
  endpointProbeSource.includes('dispersed-camping-eligibility') &&
    endpointProbeSource.includes('campgrounds-search') &&
    endpointProbeSource.includes('EXPO_PUBLIC_SUPABASE_ANON_KEY') &&
    !endpointProbeSource.includes('SERVICE_ROLE'),
  'Camp layer endpoint probe should test both public functions without service-role secrets.',
);
assert.ok(
  dispersedSearchClientSource.includes('logCampLayerFetchFailure') &&
    establishedSearchClientSource.includes('logCampLayerFetchFailure') &&
    fetchDiagnosticsSource.includes('[CAMP_LAYER_FETCH_FAILURE]'),
  'Camp layer fetch clients should log safe structured diagnostics for hidden Edge Function failures.',
);

console.log('Camp layer data regression checks passed.');
