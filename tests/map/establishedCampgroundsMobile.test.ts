import assert from 'assert';
import fs from 'fs';
import path from 'path';

import {
  buildEstablishedCampgroundsCacheKey,
  buildEstablishedCampgroundsSearchRequest,
  friendlyEstablishedCampgroundError,
  formatCampgroundAvailabilityLabel,
  formatCampgroundStatusLabel,
  isCampgroundAvailabilityFresh,
  mapCampgroundRecordToEstablishedCampsite,
  mapCampgroundSearchRecordsToEstablishedCampsites,
  normalizeEstablishedCampgroundDetailResponse,
  normalizeEstablishedCampgroundsSearchResponse,
} from '../../lib/map/establishedCampgroundMobile';
import {
  ESTABLISHED_CAMPGROUND_PIN_DEDUPE_RADIUS_METERS,
  toEstablishedCampsiteFeatureCollection,
} from '../../lib/map/establishedCampsiteGeojsonAdapter';
import { resolveEstablishedCampgroundScore } from '../../lib/map/establishedCampgroundScore';

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const freshCheckedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const staleCheckedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const bbox = { minLng: -119.8, minLat: 37.6, maxLng: -119.4, maxLat: 37.9 };

const request = buildEstablishedCampgroundsSearchRequest(bbox);
assert.deepStrictEqual(request, {
  bbox: '-119.800000,37.600000,-119.400000,37.900000',
  limit: 250,
  availability: 'any',
  openStatus: 'any',
});
assert.strictEqual(
  buildEstablishedCampgroundsCacheKey(bbox),
  'established-campgrounds:-119.800,37.600,-119.400,37.900:viewport',
);

const campsite = mapCampgroundRecordToEstablishedCampsite({
  id: 'cg-1',
  title: 'Pine Flat Campground',
  latitude: 37.72,
  longitude: -119.62,
  facilityType: 'campground',
  managingAgency: 'USFS',
  managingOrg: 'Sierra National Forest',
  reservationUrl: 'https://example.com/reserve',
  detailUrl: 'https://example.com/detail',
  status: 'unknown',
  availabilityStatus: 'available',
  siteCount: 42,
  siteTypes: ['campground', 'tent_site'],
  amenities: ['water', 'toilets', 'unknown_custom'],
  sourceConfidence: 92,
  primaryProvider: 'ridb',
  attribution: 'Recreation.gov',
  lastSyncedAt: freshCheckedAt,
  lastAvailabilityCheckedAt: freshCheckedAt,
});

assert.ok(campsite, 'Valid endpoint campground should map to existing campsite marker model.');
assert.strictEqual(campsite?.type, 'established_campground');
assert.strictEqual(campsite?.category, 'campground');
assert.strictEqual(campsite?.source, 'RECREATION_GOV');
assert.strictEqual(campsite?.reservationStatus, 'reservable');
assert.strictEqual(campsite?.availabilityStatus, 'available');
assert.strictEqual(campsite?.managingOrg, 'Sierra National Forest');
assert.deepStrictEqual(campsite?.siteTypes, ['campground', 'tent_site']);
assert.ok(campsite?.amenities.includes('water'));
assert.ok(campsite?.tentAllowed, 'Tent allowance should infer from campground/tent site types.');

const collection = toEstablishedCampsiteFeatureCollection(campsite ? [campsite] : []);
assert.strictEqual(collection.features.length, 1, 'Successful search records should render as one map marker.');
assert.strictEqual(collection.features[0].properties.type, 'established_campground');
assert.strictEqual(collection.features[0].properties.category, 'campground');
assert.strictEqual(collection.features[0].properties.availabilityStatus, 'available');

const dedupedNearbyCampgrounds = mapCampgroundSearchRecordsToEstablishedCampsites([
  {
    id: 'cg-duplicate-a',
    name: 'Twin Lakes Campground',
    latitude: 37.72,
    longitude: -119.62,
    facilityType: 'campground',
    status: 'open',
    availabilityStatus: 'unknown',
    siteCount: 10,
    siteTypes: ['campground'],
    amenities: ['water'],
    sourceConfidence: 70,
    primaryProvider: 'osm',
  },
  {
    id: 'cg-duplicate-b',
    name: 'Twin Lakes Campground Loop B',
    latitude: 37.7207,
    longitude: -119.6207,
    facilityType: 'campground',
    status: 'open',
    availabilityStatus: 'unknown',
    siteCount: 24,
    siteTypes: ['campground'],
    amenities: ['water', 'toilets'],
    sourceConfidence: 94,
    primaryProvider: 'ridb',
  },
  {
    id: 'cg-separate',
    name: 'Separate Ridge Campground',
    latitude: 37.74,
    longitude: -119.64,
    facilityType: 'campground',
    status: 'open',
    availabilityStatus: 'unknown',
    siteCount: 8,
    siteTypes: ['campground'],
    amenities: ['toilets'],
    sourceConfidence: 80,
    primaryProvider: 'nps',
  },
]);
assert.strictEqual(ESTABLISHED_CAMPGROUND_PIN_DEDUPE_RADIUS_METERS, 200);
assert.strictEqual(
  dedupedNearbyCampgrounds.length,
  2,
  'Mobile established campground records should suppress duplicate pins inside 200 meters.',
);
assert.strictEqual(
  dedupedNearbyCampgrounds[0].id,
  'cg-duplicate-b',
  'Mobile duplicate suppression should keep the highest confidence campground record.',
);
assert.deepStrictEqual(
  dedupedNearbyCampgrounds[0].nearbyCampgroundIds,
  ['cg-duplicate-a', 'cg-duplicate-b'],
  'Mobile duplicate suppression should preserve nearby campground ids for future detail UI.',
);

const normalizedSuccess = normalizeEstablishedCampgroundsSearchResponse({
  ok: true,
  geojson: collection,
  count: collection.features.length,
  meta: { bbox, source: 'ecs_cached_campgrounds' },
});
assert.strictEqual(normalizedSuccess.ok, true);
assert.strictEqual(
  normalizedSuccess.geojson?.type,
  'FeatureCollection',
  'Successful established campground responses should retain a valid FeatureCollection.',
);
assert.strictEqual(
  normalizedSuccess.geojson?.features.length,
  1,
  'Successful established campground responses should preserve returned GeoJSON features.',
);
assert.strictEqual(
  normalizedSuccess.records?.length,
  1,
  'GeoJSON-only established campground responses should convert into records for the RN layer state.',
);

const normalizedDetail = normalizeEstablishedCampgroundDetailResponse({
  ok: true,
  marker: {
    id: 'cg-detail',
    title: 'Live Detail Campground',
    latitude: 37.72,
    longitude: -119.62,
    type: 'established_campground',
    category: 'campground',
    facilityType: 'campground',
    managingAgency: 'USFS',
    status: 'open',
    availabilityStatus: 'available',
    siteCount: 18,
    siteTypes: ['campground'],
    amenities: ['water', 'toilets'],
    sourceConfidence: 91,
    primaryProvider: 'ridb',
    attribution: 'RIDB / Recreation.gov',
    lastAvailabilityCheckedAt: freshCheckedAt,
  },
  sources: [{ providerId: 'ridb' }, { providerId: 'campflare' }],
  availability: {
    effectiveStatus: 'limited',
    rows: [{ providerId: 'campflare' }],
  },
  freshness: {
    lastAvailabilityCheckedAt: freshCheckedAt,
    lastSyncedAt: freshCheckedAt,
  },
});
assert.strictEqual(normalizedDetail.ok, true);
assert.strictEqual(
  normalizedDetail.campsite?.availabilityStatus,
  'limited',
  'Live campground detail should prefer the effective availability status returned by the backend.',
);
assert.strictEqual(normalizedDetail.campsite?.sourceRecordCount, 2);
assert.strictEqual(normalizedDetail.campsite?.availabilityRecordCount, 1);
assert.ok(normalizedDetail.campsite?.liveDetailFetchedAt, 'Live campground detail should mark when it refreshed.');

const enrichedDetail = normalizeEstablishedCampgroundDetailResponse({
  ok: true,
  marker: {
    id: 'cg-enriched',
    title: 'Provider Enriched Campground',
    latitude: 37.73,
    longitude: -119.63,
    type: 'established_campground',
    category: 'campground',
    facilityType: 'campground',
    status: 'unknown',
    availabilityStatus: 'unknown',
    siteTypes: ['rv park', 'tent site'],
    amenities: ['potable water', 'vault toilet', 'fire pit'],
    primaryProvider: 'ridb',
    sourceConfidence: 88,
  },
  detailEnrichment: {
    managingOrg: 'Provider District Office',
    phone: '555-0199',
    seasonDescription: 'May through October',
    maxVehicleLengthFt: 28,
  },
  availability: {
    effectiveStatus: 'available',
    rows: [{ reservable: true, firstComeFirstServed: true, lastCheckedAt: freshCheckedAt }],
  },
  freshness: {
    lastAvailabilityCheckedAt: freshCheckedAt,
  },
});
assert.strictEqual(enrichedDetail.ok, true);
assert.strictEqual(enrichedDetail.campsite?.availabilityStatus, 'available');
assert.strictEqual(enrichedDetail.campsite?.reservationStatus, 'mixed');
assert.strictEqual(enrichedDetail.campsite?.phone, '555-0199');
assert.strictEqual(enrichedDetail.campsite?.seasonDescription, 'May through October');
assert.strictEqual(enrichedDetail.campsite?.maxVehicleLengthFt, 28);
assert.strictEqual(enrichedDetail.campsite?.rvAllowed, true);
assert.strictEqual(enrichedDetail.campsite?.tentAllowed, true);
assert.ok(enrichedDetail.campsite?.amenities.includes('toilets'), 'Amenity synonyms should normalize into displayed amenities.');
assert.ok(enrichedDetail.campsite?.amenities.includes('fire_ring'), 'Fire pit amenities should normalize into fire ring display.');

const normalizedEmpty = normalizeEstablishedCampgroundsSearchResponse({
  ok: true,
  geojson: { type: 'FeatureCollection', features: [] },
  count: 0,
});
assert.strictEqual(normalizedEmpty.ok, true);
assert.deepStrictEqual(
  normalizedEmpty.geojson?.features,
  [],
  'Empty successful established campground FeatureCollections should remain success-empty, not unavailable.',
);
assert.deepStrictEqual(normalizedEmpty.records, []);

const normalizedBackendFailure = normalizeEstablishedCampgroundsSearchResponse({
  ok: false,
  error: 'Edge Function returned a non-2xx status code',
});
assert.strictEqual(normalizedBackendFailure.ok, false);
assert.strictEqual(
  friendlyEstablishedCampgroundError(normalizedBackendFailure.error),
  'Established campground search is temporarily unavailable. Try again after refreshing the map.',
  'Backend established campground failures should preserve the current user-facing unavailable copy.',
);

const normalizedMalformed = normalizeEstablishedCampgroundsSearchResponse({
  ok: true,
  geojson: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} }],
  },
});
assert.strictEqual(normalizedMalformed.ok, false);
assert.strictEqual(
  normalizedMalformed.error,
  'Malformed established campground search response.',
  'Malformed established campground responses should become diagnostic errors instead of empty success.',
);

assert.deepStrictEqual(
  mapCampgroundSearchRecordsToEstablishedCampsites([]),
  [],
  'Empty campground response should become an empty marker array.',
);
assert.strictEqual(
  mapCampgroundRecordToEstablishedCampsite({
    id: 'bad',
    name: 'Missing position',
    latitude: Number.NaN,
    longitude: -119,
  }),
  null,
  'Invalid campground coordinates should not render a marker.',
);
assert.strictEqual(
  mapCampgroundRecordToEstablishedCampsite({
    id: 'summit-1',
    name: 'Mount Bailey Summit',
    latitude: 37.7,
    longitude: -119.6,
    facilityType: 'summit',
    siteTypes: ['summit'],
    primaryProvider: 'osm',
  }),
  null,
  'Summits should not render as established campground markers.',
);
assert.strictEqual(
  mapCampgroundRecordToEstablishedCampsite({
    id: 'blm-office-1',
    name: 'Bureau of Land Management Field Office',
    latitude: 37.71,
    longitude: -119.61,
    facilityType: 'administrative_area',
    managingAgency: 'Bureau of Land Management',
    primaryProvider: 'osm',
  }),
  null,
  'Generic land management offices should not render as established campground markers.',
);

const weakScoreCamp = mapCampgroundRecordToEstablishedCampsite({
  id: 'score-weak',
  name: 'Sparse OSM Campground',
  latitude: 37.71,
  longitude: -119.61,
  facilityType: 'campground',
  status: 'unknown',
  availabilityStatus: 'unknown',
  sourceConfidence: 58,
  primaryProvider: 'osm',
  amenities: ['unknown'],
});
const strongScoreCamp = mapCampgroundRecordToEstablishedCampsite({
  id: 'score-strong',
  name: 'Live Recreation.gov Campground',
  latitude: 37.72,
  longitude: -119.62,
  facilityType: 'campground',
  status: 'open',
  availabilityStatus: 'available',
  sourceConfidence: 92,
  primaryProvider: 'ridb',
  reservationUrl: 'https://example.com/reserve',
  managingAgency: 'USFS',
  siteCount: 24,
  amenities: ['water', 'toilets', 'trash'],
  lastAvailabilityCheckedAt: freshCheckedAt,
  lastSyncedAt: freshCheckedAt,
});
assert.ok(weakScoreCamp && strongScoreCamp);
const weakScore = resolveEstablishedCampgroundScore(weakScoreCamp, Date.now());
const strongScore = resolveEstablishedCampgroundScore(strongScoreCamp, Date.now());
assert.notStrictEqual(
  weakScore.score,
  strongScore.score,
  'Established campground ECS score should be derived from live campground fields instead of a fixed placeholder.',
);
assert.ok(strongScore.score > weakScore.score, 'Fresh open campground data should score higher than sparse unknown OSM data.');
assert.ok(
  strongScore.dataBasis.some((basis) => basis.includes('fresh availability')) &&
    strongScore.dataBasis.some((basis) => basis.includes('source confidence')),
  'Established campground score should expose the live-data basis used to calculate the score.',
);
assert.ok(
  strongScore.explanation.includes(`ECS score is ${strongScore.score}/100`),
  'Established campground confidence copy should anchor explanation to the displayed ECS score.',
);

assert.strictEqual(formatCampgroundStatusLabel('unknown'), 'Status unknown');
assert.strictEqual(formatCampgroundStatusLabel('seasonal'), 'Seasonal');
assert.strictEqual(isCampgroundAvailabilityFresh(freshCheckedAt), true);
assert.strictEqual(isCampgroundAvailabilityFresh(staleCheckedAt), false);
assert.strictEqual(
  formatCampgroundAvailabilityLabel('available', freshCheckedAt),
  'Available reported - verify with operator',
);
assert.strictEqual(
  formatCampgroundAvailabilityLabel('available', staleCheckedAt),
  'Availability unknown',
);
assert.strictEqual(
  formatCampgroundAvailabilityLabel('sold_out', freshCheckedAt),
  'Availability unknown',
);

const navigateSource = read('app/(tabs)/navigate.tsx');
const sheetSource = read('components/navigate/EstablishedCampsiteSheet.tsx');
const searchClientSource = read('lib/map/establishedCampgroundSearchClient.ts');
const mobileSource = read('lib/map/establishedCampgroundMobile.ts');
const supabaseSource = read('lib/supabase.ts');
const mapRendererSource = read('components/navigate/MapRenderer.tsx');

[
  'Established Campgrounds',
  'Loading established campgrounds from ECS cache.',
  'No results in this map area.',
  'campgrounds-search',
].forEach((copy) => {
  assert.ok(
    navigateSource.includes(copy) || searchClientSource.includes(copy) || mobileSource.includes(copy),
    `Missing mobile integration copy/token: ${copy}`,
  );
});

assert.ok(
  navigateSource.includes('fetchEstablishedCampgroundsForMap({ bbox: request.bbox, logFailures: false })') &&
    navigateSource.includes('fetchEstablishedCampgroundDetail({ id: selectedId })') &&
    navigateSource.includes("layer: 'established_campgrounds'") &&
    navigateSource.includes('CampLayerFetchCoordinator') &&
    navigateSource.includes('toEstablishedCampsiteFeatureCollection(establishedCampgroundsForMap)'),
  'Navigate should schedule ECS-owned campground fetches, refresh tapped campground detail, cache by stable bbox key, and feed MapRenderer GeoJSON.',
);
assert.ok(
  !navigateSource.includes('setEstablishedCampsitesEnabled((current) => {'),
  'Established Campgrounds toggle should not perform toast or sibling state updates inside a state updater.',
);
assert.ok(
  !navigateSource.includes('setDispersedCampingEligibilityEnabled((current) => {'),
  'Dispersed Camping toggle should not perform toast updates inside a state updater.',
);

[
  'Established Campground',
  'Managing agency',
  'Managing org',
  'Source / attribution',
  'Reservation / info',
  'Navigate',
  'formatCampgroundAvailabilityLabel',
  'resolveEstablishedCampgroundScore',
].forEach((copy) => {
  assert.ok(sheetSource.includes(copy), `Established campground detail sheet missing: ${copy}`);
});

assert.ok(
  mapRendererSource.includes("type: props.type ? String(props.type) : 'established_campground'") &&
    mapRendererSource.includes('managingAgency') &&
    mapRendererSource.includes('lastAvailabilityCheckedAt'),
  'MapRenderer should preserve canonical campground fields in tap payloads.',
);

assert.ok(
  supabaseSource.includes('"campgrounds-search"'),
  'Supabase client should allow invoking the ECS-owned campgrounds-search endpoint.',
);
assert.ok(
  searchClientSource.includes('friendlyEstablishedCampgroundError') &&
    mobileSource.includes('non-2xx') &&
    mobileSource.includes('Established campground search is temporarily unavailable'),
  'Mobile campground search should replace raw Edge Function failures with user-friendly copy.',
);

const clientBundleSources = [navigateSource, sheetSource, searchClientSource, mobileSource].join('\n');
[
  'RIDB_API_KEY',
  'NPS_API_KEY',
  'CAMPFLARE_API_KEY',
  'ACTIVE_API_KEY',
  'ACTIVE_API_SECRET',
  'RESERVEAMERICA_API_KEY',
  'ASPIRA_API_KEY',
  'OSM_USER_AGENT',
  'OSM_ATTRIBUTION',
].forEach((secretRef) => {
  assert.ok(!clientBundleSources.includes(secretRef), `Mobile integration must not reference provider secret: ${secretRef}`);
});

assert.ok(
  ![navigateSource, sheetSource, mobileSource].join('\n').toLowerCase().includes('available now'),
  'Mobile UI should not say available now from cached campground data.',
);
