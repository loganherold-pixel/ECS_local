import assert from 'assert';
import {
  buildCampgroundDedupePlan,
  mergeCampgroundRows,
  nameSimilarity,
  normalizeDedupeUrl,
  scoreCampgroundPair,
  type DedupeCampgroundRow,
  type DedupeSourceRecord,
} from '../../supabase/functions/_shared/campgroundDedupe';

function campground(row: Partial<DedupeCampgroundRow> & { id: string; name: string }): DedupeCampgroundRow {
  return {
    latitude: 38.7123,
    longitude: -119.8123,
    facility_type: 'campground',
    managing_agency: null,
    managing_org: null,
    reservation_url: null,
    detail_url: null,
    status: 'unknown',
    availability_status: 'unknown',
    site_count: null,
    site_types: null,
    amenities: null,
    source_confidence: 0,
    primary_provider: 'unknown',
    attribution: null,
    ...row,
  };
}

function source(campgroundId: string, providerId: string, recordId: string, sourceUrl?: string): DedupeSourceRecord {
  return {
    campground_id: campgroundId,
    provider_id: providerId,
    provider_record_id: recordId,
    source_url: sourceUrl ?? null,
    first_seen_at: '2026-01-01T00:00:00.000Z',
    last_seen_at: '2026-05-14T00:00:00.000Z',
  };
}

assert.strictEqual(normalizeDedupeUrl('https://Example.test/campground/100?token=abc#details'), 'https://example.test/campground/100');
assert.ok(nameSimilarity('Juniper Flats Campground', 'Juniper Flats') >= 0.9);

const ridb = campground({
  id: 'ridb-1',
  name: 'Juniper Flats Campground',
  primary_provider: 'ridb',
  source_confidence: 92,
  reservation_url: 'https://www.recreation.gov/camping/campgrounds/1001',
  detail_url: 'https://ridb.recreation.gov/api/v1/facilities/RIDB-1001',
  managing_agency: 'USFS',
  attribution: 'RIDB / Recreation.gov',
  status: 'open',
  amenities: ['water'],
});
const nps = campground({
  id: 'nps-1',
  name: 'Juniper Flats',
  latitude: 38.71235,
  longitude: -119.81235,
  primary_provider: 'nps',
  source_confidence: 86,
  detail_url: 'https://www.nps.gov/example/planyourvisit/juniper-flats.htm',
  managing_agency: 'USFS',
  attribution: 'National Park Service',
  amenities: ['toilets'],
});

const ridbNpsPlan = buildCampgroundDedupePlan([ridb, nps], [source('ridb-1', 'ridb', 'RIDB-1001'), source('nps-1', 'nps', 'nps-1001')]);
assert.strictEqual(ridbNpsPlan.length, 1, 'RIDB + NPS same campground should dedupe.');
assert.strictEqual(ridbNpsPlan[0].canonicalId, 'ridb-1', 'RIDB should win canonical identity over NPS when confidence is higher.');
assert.deepStrictEqual(ridbNpsPlan[0].duplicateIds, ['nps-1']);
assert.ok(ridbNpsPlan[0].mergedCampground.attribution?.includes('RIDB / Recreation.gov'));
assert.ok(ridbNpsPlan[0].mergedCampground.attribution?.includes('National Park Service'));
assert.ok(ridbNpsPlan[0].mergedCampground.amenities?.includes('water'));
assert.ok(ridbNpsPlan[0].mergedCampground.amenities?.includes('toilets'));

const campflare = campground({
  id: 'campflare-1',
  name: 'Juniper Flats Campground',
  latitude: 38.71232,
  longitude: -119.81232,
  primary_provider: 'campflare',
  source_confidence: 70,
  reservation_url: 'https://www.recreation.gov/camping/campgrounds/1001',
  attribution: 'Campflare',
  availability_status: 'available',
});
const ridbCampflarePlan = buildCampgroundDedupePlan([ridb, campflare], [
  source('ridb-1', 'ridb', 'RIDB-1001'),
  source('campflare-1', 'campflare', 'cf-1001', 'https://www.recreation.gov/camping/campgrounds/1001'),
]);
assert.strictEqual(ridbCampflarePlan.length, 1, 'RIDB + Campflare same campground should dedupe by reservation URL.');
assert.strictEqual(ridbCampflarePlan[0].canonicalId, 'ridb-1');
assert.strictEqual(
  ridbCampflarePlan[0].mergedCampground.availability_status,
  'available',
  'Fresh provider-backed availability should survive canonical merge while availability rows remain separate.',
);

const active = campground({
  id: 'active-1',
  name: 'Lake Basin Campground',
  latitude: 37.5,
  longitude: -118.5,
  primary_provider: 'active',
  source_confidence: 82,
  reservation_url: 'https://reserve.example.test/lake-basin',
  attribution: 'ACTIVE',
});
const reserveAmerica = campground({
  id: 'ra-1',
  name: 'Lake Basin Campground',
  latitude: 37.5001,
  longitude: -118.5001,
  primary_provider: 'reserveamerica',
  source_confidence: 84,
  reservation_url: 'https://reserve.example.test/lake-basin?utm=provider',
  attribution: 'ReserveAmerica',
});
const reservationPlan = buildCampgroundDedupePlan([active, reserveAmerica], [
  source('active-1', 'active', 'A-100'),
  source('ra-1', 'reserveamerica', 'RA-100'),
]);
assert.strictEqual(reservationPlan.length, 1, 'ACTIVE + ReserveAmerica duplicate should dedupe.');
assert.strictEqual(reservationPlan[0].canonicalId, 'ra-1', 'ReserveAmerica/Aspira priority should beat ACTIVE.');

const osmDuplicate = campground({
  id: 'osm-1',
  name: 'Juniper Flats Camp',
  latitude: 38.71234,
  longitude: -119.81234,
  primary_provider: 'osm',
  source_confidence: 58,
  attribution: 'OpenStreetMap contributors',
});
const osmOfficialPlan = buildCampgroundDedupePlan([ridb, osmDuplicate], [
  source('ridb-1', 'ridb', 'RIDB-1001'),
  source('osm-1', 'osm', 'node/101'),
]);
assert.strictEqual(osmOfficialPlan.length, 1, 'OSM duplicate near official campground should dedupe.');
assert.strictEqual(osmOfficialPlan[0].canonicalId, 'ridb-1');
assert.ok(osmOfficialPlan[0].mergedCampground.attribution?.includes('OpenStreetMap'));

const osmOnly = campground({
  id: 'osm-only-1',
  name: 'Remote Meadow Camp',
  latitude: 40.1,
  longitude: -121.1,
  primary_provider: 'osm',
  source_confidence: 58,
});
assert.strictEqual(buildCampgroundDedupePlan([osmOnly], [source('osm-only-1', 'osm', 'node/200')]).length, 0, 'OSM-only campground should remain canonical by itself.');

const farSameName = campground({
  id: 'far-1',
  name: 'Juniper Flats Campground',
  latitude: 41.0,
  longitude: -122.0,
  primary_provider: 'nps',
  source_confidence: 86,
});
assert.strictEqual(buildCampgroundDedupePlan([ridb, farSameName]).length, 0, 'Same name but far apart should not merge.');

const nearDifferentName = campground({
  id: 'near-different-1',
  name: 'Cedar Wash Trailhead',
  latitude: 38.71231,
  longitude: -119.81231,
  primary_provider: 'nps',
  source_confidence: 86,
  managing_agency: 'USFS',
});
const nearDifferentScore = scoreCampgroundPair(ridb, nearDifferentName);
assert.strictEqual(nearDifferentScore.shouldMerge, false, 'Near coordinates with different names should require stronger evidence.');
assert.strictEqual(buildCampgroundDedupePlan([ridb, nearDifferentName]).length, 0);

const manual = campground({
  id: 'manual-1',
  name: 'Juniper Flats Basecamp',
  latitude: 38.71236,
  longitude: -119.81236,
  primary_provider: 'manual',
  source_confidence: 98,
  attribution: 'ECS manual override',
});
const manualPlan = buildCampgroundDedupePlan([ridb, manual], [
  source('ridb-1', 'ridb', 'RIDB-1001'),
  source('manual-1', 'manual', 'manual-1001'),
]);
assert.strictEqual(manualPlan.length, 1, 'Manual override near same campground should dedupe.');
assert.strictEqual(manualPlan[0].canonicalId, 'manual-1', 'Manual ECS override should win canonical identity.');

const merged = mergeCampgroundRows([ridb, nps, osmDuplicate], 'ridb-1');
assert.strictEqual(merged.name, 'Juniper Flats Campground');
assert.strictEqual(merged.reservation_url, 'https://www.recreation.gov/camping/campgrounds/1001');
assert.strictEqual(merged.status, 'open');
assert.ok(Number(merged.source_confidence) >= 92);
