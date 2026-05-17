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
  normalizeEstablishedCampgroundsSearchResponse,
} from '../../lib/map/establishedCampgroundMobile';
import { toEstablishedCampsiteFeatureCollection } from '../../lib/map/establishedCampsiteGeojsonAdapter';

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

const collection = toEstablishedCampsiteFeatureCollection(campsite ? [campsite] : []);
assert.strictEqual(collection.features.length, 1, 'Successful search records should render as one map marker.');
assert.strictEqual(collection.features[0].properties.type, 'established_campground');
assert.strictEqual(collection.features[0].properties.category, 'campground');
assert.strictEqual(collection.features[0].properties.availabilityStatus, 'available');

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
  navigateSource.includes('fetchEstablishedCampgroundsForMap({ bbox: request.bbox })') &&
    navigateSource.includes("layer: 'established_campgrounds'") &&
    navigateSource.includes('CampLayerFetchCoordinator') &&
    navigateSource.includes('toEstablishedCampsiteFeatureCollection(establishedCampgrounds)'),
  'Navigate should schedule ECS-owned campground fetches, cache by stable bbox key, and feed MapRenderer GeoJSON.',
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
  'formatCampgroundAvailabilityLabel',
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
