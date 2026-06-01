import assert from 'assert';
import {
  buildCampgroundSearchFeatureCollection,
  buildCampgroundDetailResponse,
  filterCampgroundSearchRows,
  groupAvailabilityRows,
  parseCampgroundSearchParams,
  type CampgroundAvailabilityRow,
  type CampgroundDbRow,
  type CampgroundSourceSummaryRow,
} from '../../supabase/functions/_shared/campgroundApi';

const now = new Date('2026-05-14T12:00:00.000Z');

function campground(row: Partial<CampgroundDbRow> & { id: string; name: string }): CampgroundDbRow {
  return {
    latitude: 38.7,
    longitude: -119.8,
    facility_type: 'campground',
    managing_agency: 'USFS',
    managing_org: 'USFS',
    reservation_url: null,
    detail_url: null,
    status: 'open',
    availability_status: 'unknown',
    site_count: null,
    site_types: ['campground'],
    amenities: ['water', 'toilets'],
    source_confidence: 90,
    primary_provider: 'ridb',
    attribution: 'RIDB / Recreation.gov',
    last_synced_at: '2026-05-14T10:00:00.000Z',
    last_verified_at: null,
    last_availability_checked_at: null,
    ...row,
  };
}

function availability(row: Partial<CampgroundAvailabilityRow> & { campground_id: string }): CampgroundAvailabilityRow {
  return {
    provider_id: 'campflare',
    date: null,
    availability_status: 'available',
    available_site_count: 4,
    reservable: true,
    first_come_first_served: false,
    last_checked_at: '2026-05-14T11:45:00.000Z',
    expires_at: '2026-05-14T12:30:00.000Z',
    ...row,
  };
}

const searchParams = parseCampgroundSearchParams(
  new URLSearchParams('bbox=-120,38,-119,39&siteTypes=campground&amenities=water,toilets&availability=available_now&openStatus=open&minSourceConfidence=80&limit=10'),
);
assert.ok(searchParams, 'bbox search params should parse.');
assert.deepStrictEqual(searchParams?.bbox, {
  minLng: -120,
  minLat: 38,
  maxLng: -119,
  maxLat: 39,
});
assert.deepStrictEqual(searchParams?.siteTypes, ['campground']);
assert.deepStrictEqual(searchParams?.amenities, ['water', 'toilets']);
assert.strictEqual(searchParams?.availability, 'available_now');
assert.strictEqual(searchParams?.openStatus, 'open');
assert.strictEqual(searchParams?.minSourceConfidence, 80);
assert.strictEqual(searchParams?.limit, 10);
assert.strictEqual(parseCampgroundSearchParams(new URLSearchParams('bbox=-120,38,-120,38')), null);

const rows: CampgroundDbRow[] = [
  campground({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Juniper Flats Campground',
    reservation_url: 'https://www.recreation.gov/camping/campgrounds/1001',
    site_count: 24,
  }),
  campground({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Filtered Low Confidence Campground',
    latitude: 38.75,
    longitude: -119.75,
    source_confidence: 40,
  }),
  campground({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    name: 'Removed Duplicate Campground',
    latitude: 38.76,
    longitude: -119.76,
    status: 'removed',
  }),
  campground({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    name: 'Mount Bailey Summit',
    latitude: 38.77,
    longitude: -119.77,
    facility_type: 'summit',
    site_types: ['summit'],
    amenities: [],
    source_confidence: 95,
    primary_provider: 'osm',
    attribution: 'OpenStreetMap',
  }),
  campground({
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    name: 'Bureau of Land Management Field Office',
    latitude: 38.78,
    longitude: -119.78,
    facility_type: 'administrative_area',
    site_types: ['administrative_area'],
    amenities: [],
    source_confidence: 95,
    primary_provider: 'osm',
    attribution: 'OpenStreetMap',
  }),
  campground({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Duplicate Row Same ID',
  }),
];

const availabilityRows = [
  availability({ campground_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
  availability({
    campground_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    availability_status: 'available',
    last_checked_at: '2026-05-14T08:00:00.000Z',
    expires_at: '2026-05-14T09:00:00.000Z',
  }),
];
const availabilityById = groupAvailabilityRows(availabilityRows);

const searchResults = filterCampgroundSearchRows(rows, availabilityById, searchParams!, now);
assert.strictEqual(searchResults.length, 1, 'Search should apply bbox, filters, confidence, TTL, removed-row, and duplicate-id handling.');
assert.strictEqual(searchResults[0].id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
assert.strictEqual(searchResults[0].type, 'established_campground');
assert.strictEqual(searchResults[0].category, 'campground');
assert.strictEqual(searchResults[0].title, 'Juniper Flats Campground');
assert.ok(searchResults[0].subtitle.includes('RIDB'));
assert.strictEqual(searchResults[0].availabilityStatus, 'available');
assert.strictEqual(searchResults[0].siteCount, 24);
assert.strictEqual(searchResults[0].attribution, 'RIDB / Recreation.gov');
const searchGeojson = buildCampgroundSearchFeatureCollection(searchResults);
assert.strictEqual(searchGeojson.type, 'FeatureCollection');
assert.strictEqual(searchGeojson.features.length, 1);
assert.deepStrictEqual(searchGeojson.features[0].geometry, {
  type: 'Point',
  coordinates: [-119.8, 38.7],
});
assert.strictEqual(searchGeojson.features[0].id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
assert.strictEqual(searchGeojson.features[0].properties.name, 'Juniper Flats Campground');
assert.strictEqual(searchGeojson.features[0].properties.source, 'ridb');
assert.ok(
  !searchResults.some((row) => /summit|bureau of land management/i.test(row.title)),
  'Established campground search must not return summits or generic BLM/administrative areas.',
);

const identityParams = parseCampgroundSearchParams(new URLSearchParams('bbox=-120,38,-119,39&limit=20'));
const identityResults = filterCampgroundSearchRows(rows, new Map(), identityParams!, now);
assert.ok(
  identityResults.every((row) => !/summit|bureau of land management|field office/i.test(row.title)),
  'Broad bbox searches should still exclude non-camp POI identities.',
);

const staleParams = parseCampgroundSearchParams(new URLSearchParams('bbox=-120,38,-119,39&availability=available_now&limit=10'));
const staleResults = filterCampgroundSearchRows(
  [campground({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    name: 'Stale Availability Campground',
    availability_status: 'available',
    last_availability_checked_at: '2026-05-14T08:00:00.000Z',
  })],
  new Map(),
  staleParams!,
  now,
);
assert.strictEqual(staleResults.length, 0, 'Expired canonical availability must not satisfy available_now.');

const reservableParams = parseCampgroundSearchParams(new URLSearchParams('bbox=-120,38,-119,39&availability=reservable'));
assert.strictEqual(filterCampgroundSearchRows(rows, availabilityById, reservableParams!, now).length, 1);

const firstComeParams = parseCampgroundSearchParams(new URLSearchParams('bbox=-120,38,-119,39&availability=first_come_first_served'));
const firstComeRows = [availability({
  campground_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  availability_status: 'unknown',
  reservable: false,
  first_come_first_served: true,
})];
assert.strictEqual(filterCampgroundSearchRows(rows, groupAvailabilityRows(firstComeRows), firstComeParams!, now).length, 1);

const sources: CampgroundSourceSummaryRow[] = [
  {
    provider_id: 'ridb',
    provider_record_id: 'RIDB-1001',
    source_url: 'https://ridb.recreation.gov/api/v1/facilities/RIDB-1001',
    payload_hash: 'fnv1a32:12345678',
    first_seen_at: '2026-01-01T00:00:00.000Z',
    last_seen_at: '2026-05-14T10:00:00.000Z',
  },
  {
    provider_id: 'osm',
    provider_record_id: 'node/101',
    source_url: 'https://www.openstreetmap.org/node/101',
    payload_hash: 'fnv1a32:87654321',
    first_seen_at: '2026-02-01T00:00:00.000Z',
    last_seen_at: '2026-05-14T10:00:00.000Z',
  },
];
const detail = buildCampgroundDetailResponse(rows[0], sources, availabilityRows.slice(0, 1), now);
assert.strictEqual(detail.campground.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
assert.strictEqual(detail.marker.type, 'established_campground');
assert.strictEqual(detail.sources.length, 2);
assert.ok(!JSON.stringify(detail).includes('raw_json'), 'Detail response must not expose raw provider payloads.');
assert.strictEqual(detail.availability.effectiveStatus, 'available');
assert.strictEqual(detail.availability.rows[0].isFresh, true);
assert.strictEqual(detail.attribution, 'RIDB / Recreation.gov');
assert.strictEqual(detail.reservationUrl, 'https://www.recreation.gov/camping/campgrounds/1001');
