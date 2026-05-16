import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  buildRidbFacilitiesUrl,
  buildRidbSyncRows,
  dedupeRidbRecords,
  getNextRidbOffset,
  normalizeRidbFacilityRecord,
  ridbProviderError,
  type RidbFacilitiesPage,
  type RidbFacilityRecord,
} from '../../supabase/functions/campgrounds-sync-ridb/ridbAdapter';

const root = path.resolve(__dirname, '..', '..');
const fixture = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'campgrounds', 'ridb', name), 'utf8'));

const validRecord = fixture<RidbFacilityRecord>('valid-campground.json');
const missingCoordinates = fixture<RidbFacilityRecord>('missing-lat-lng.json');
const page1 = fixture<RidbFacilitiesPage>('page-1.json');
const page2 = fixture<RidbFacilitiesPage>('page-2.json');
const providerErrorFixture = fixture<Record<string, unknown>>('provider-error.json');

const normalized = normalizeRidbFacilityRecord(validRecord, {
  attributionText: 'RIDB / Recreation.gov',
  syncedAt: '2026-05-14T12:00:00.000Z',
});

assert.ok(normalized, 'Valid RIDB campground should normalize.');
assert.strictEqual(normalized?.providerRecordId, 'RIDB-1001');
assert.strictEqual(normalized?.campground.name, 'Juniper Flats Campground');
assert.strictEqual(normalized?.campground.latitude, 38.71234);
assert.strictEqual(normalized?.campground.longitude, -119.81234);
assert.strictEqual(normalized?.campground.facility_type, 'campground');
assert.strictEqual(normalized?.campground.managing_agency, 'USFS');
assert.strictEqual(normalized?.campground.availability_status, 'unknown');
assert.strictEqual(normalized?.campground.status, 'unknown');
assert.strictEqual(normalized?.campground.source_confidence, 92);
assert.strictEqual(normalized?.campground.primary_provider, 'ridb');
assert.ok(normalized?.campground.amenities?.includes('water'));
assert.ok(normalized?.campground.amenities?.includes('toilets'));
assert.ok(normalized?.campground.amenities?.includes('picnic_table'));
assert.ok(normalized?.campground.amenities?.includes('fire_ring'));
assert.strictEqual(normalized?.sourceRecord.provider_id, 'ridb');
assert.strictEqual(normalized?.sourceRecord.provider_record_id, 'RIDB-1001');
assert.match(normalized?.sourceRecord.payload_hash ?? '', /^fnv1a32:[0-9a-f]{8}$/);
assert.ok(
  normalized?.sourceRecord.source_url?.includes('/facilities/RIDB-1001'),
  'RIDB source URL should preserve provider record ID without an API key.',
);

assert.strictEqual(
  normalizeRidbFacilityRecord(missingCoordinates, { syncedAt: '2026-05-14T12:00:00.000Z' }),
  null,
  'RIDB records missing lat/lng should be skipped.',
);

const deduped = dedupeRidbRecords(page1.RECDATA ?? []);
assert.strictEqual(deduped.length, 2, 'Duplicate provider IDs should collapse to one record.');
assert.strictEqual(
  deduped.find((record) => record.FacilityID === 'RIDB-DUPLICATE')?.FacilityName,
  'Duplicate Campground Updated',
  'Duplicate provider ID should keep the latest record in the page.',
);

assert.ok(normalized);
const rows = buildRidbSyncRows(
  normalized,
  'canonical-campground-id',
  {
    campground_id: 'canonical-campground-id',
    first_seen_at: '2026-01-01T00:00:00.000Z',
  },
  '2026-05-14T13:00:00.000Z',
);
assert.strictEqual(rows.sourceRecord.campground_id, 'canonical-campground-id');
assert.strictEqual(rows.sourceRecord.first_seen_at, '2026-01-01T00:00:00.000Z');
assert.strictEqual(rows.sourceRecord.last_seen_at, '2026-05-14T13:00:00.000Z');
assert.strictEqual(rows.campground.last_synced_at, '2026-05-14T13:00:00.000Z');

assert.strictEqual(getNextRidbOffset(page1, 0, 3), 3, 'Pagination should advance by current count.');
assert.strictEqual(getNextRidbOffset(page2, 3, 3), null, 'Pagination should stop after the final page.');

const url = buildRidbFacilitiesUrl({
  limit: 100,
  offset: 3,
  query: 'campground',
  state: 'ca',
  latitude: 38.1,
  longitude: -119.1,
  radius: 50,
});
assert.ok(url.includes('/facilities?'), 'RIDB facility URL should target facilities endpoint.');
assert.ok(url.includes('limit=50'), 'RIDB request limit should be clamped to a conservative page size.');
assert.ok(url.includes('offset=3'), 'RIDB request URL should include offset.');
assert.ok(url.includes('full=true'), 'RIDB request URL should request full facility records.');
assert.ok(url.includes('query=campground'), 'RIDB request URL should query campgrounds.');
assert.ok(!url.toLowerCase().includes('apikey'), 'RIDB API key must not be embedded in the URL.');

assert.deepStrictEqual(ridbProviderError(429, providerErrorFixture), {
  code: 'RIDB_RATE_LIMITED',
  message: 'RIDB rate limit reached.',
});
assert.deepStrictEqual(ridbProviderError(403, providerErrorFixture), {
  code: 'RIDB_AUTH_FAILED',
  message: 'RIDB credentials rejected.',
});
assert.strictEqual(ridbProviderError(500, providerErrorFixture).code, 'RIDB_PROVIDER_ERROR');
