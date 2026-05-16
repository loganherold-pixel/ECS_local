import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  buildCampflareAvailabilityRows,
  buildCampflareAvailabilityUrl,
  campflareProviderError,
  effectiveCampflareAvailabilityStatus,
  getCampflarePageRecords,
  getNextCampflareCursor,
  isCampflareAvailabilityFresh,
  normalizeCampflareRecord,
  selectBestCampflareMatch,
  type CampflareApiPage,
  type CampflareRecord,
  type ExistingCampgroundCandidate,
} from '../../supabase/functions/campgrounds-sync-campflare/campflareAdapter';

const root = path.resolve(__dirname, '..', '..');
const fixture = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'campgrounds', 'campflare', name), 'utf8'));

const available = normalizeCampflareRecord(fixture<CampflareRecord>('available-campground.json'), {
  syncedAt: '2026-05-14T12:00:00.000Z',
  ttlSeconds: 900,
});
assert.ok(available, 'Available Campflare record should normalize.');
assert.strictEqual(available?.providerRecordId, 'cf-available-1001');
assert.strictEqual(available?.normalizedName, 'juniper flats');
assert.strictEqual(available?.availabilityStatus, 'available');
assert.strictEqual(available?.availableSiteCount, 4);
assert.strictEqual(available?.reservable, true);
assert.strictEqual(available?.firstComeFirstServed, false);
assert.strictEqual(
  effectiveCampflareAvailabilityStatus(available!, '2026-05-14T12:05:00.000Z'),
  'available',
  'Fresh available data should drive available status.',
);
assert.strictEqual(available?.sourceRecord.provider_id, 'campflare');
assert.match(available?.sourceRecord.payload_hash ?? '', /^fnv1a32:[0-9a-f]{8}$/);

const soldOut = normalizeCampflareRecord(fixture<CampflareRecord>('sold-out-campground.json'), {
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(soldOut, 'Sold-out Campflare record should normalize.');
assert.strictEqual(soldOut?.availabilityStatus, 'unavailable');
assert.strictEqual(soldOut?.availableSiteCount, 0);

const firstCome = normalizeCampflareRecord(fixture<CampflareRecord>('first-come-campground.json'), {
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(firstCome, 'First-come Campflare record should normalize.');
assert.strictEqual(firstCome?.firstComeFirstServed, true);
assert.strictEqual(firstCome?.reservable, false);
assert.strictEqual(
  firstCome?.availabilityStatus,
  'unknown',
  'First-come-first-served should not be promoted into a live available label.',
);

const expired = normalizeCampflareRecord(fixture<CampflareRecord>('expired-availability.json'), {
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(expired, 'Expired Campflare record should normalize.');
assert.strictEqual(isCampflareAvailabilityFresh(expired!, '2026-05-14T12:00:00.000Z'), false);
assert.strictEqual(
  effectiveCampflareAvailabilityStatus(expired!, '2026-05-14T12:00:00.000Z'),
  'unknown',
  'Expired availability must degrade to unknown instead of stale available.',
);

const expiredRows = buildCampflareAvailabilityRows(expired!, 'canonical-expired', '2026-05-14T12:00:00.000Z');
assert.strictEqual(expiredRows.availability.availability_status, 'unknown');
assert.strictEqual(expiredRows.availability.available_site_count, null);
assert.strictEqual(expiredRows.canonicalAvailabilityStatus, 'unknown');
assert.strictEqual(expiredRows.canonicalLastAvailabilityCheckedAt, null);

const ridbCandidate: ExistingCampgroundCandidate = {
  id: 'ridb-canonical-1',
  name: 'Juniper Flats Campground',
  latitude: 38.71234,
  longitude: -119.81234,
  reservation_url: 'https://www.recreation.gov/camping/campgrounds/1001',
  detail_url: 'https://ridb.recreation.gov/api/v1/facilities/RIDB-1001',
  primary_provider: 'ridb',
  source_confidence: 92,
  attribution: 'RIDB / Recreation.gov',
};
assert.strictEqual(
  selectBestCampflareMatch(available!, [ridbCandidate])?.id,
  'ridb-canonical-1',
  'Campflare availability should match and enrich an existing RIDB canonical campground.',
);

const npsCandidate: ExistingCampgroundCandidate = {
  id: 'nps-canonical-1',
  name: 'Pine Basin Campground',
  latitude: 39.1002,
  longitude: -120.2001,
  reservation_url: null,
  detail_url: 'https://www.nps.gov/example/planyourvisit/pine-basin.htm',
  primary_provider: 'nps',
  source_confidence: 86,
  attribution: 'National Park Service',
};
assert.strictEqual(
  selectBestCampflareMatch(soldOut!, [npsCandidate])?.id,
  'nps-canonical-1',
  'Campflare availability should match and enrich an existing NPS canonical campground.',
);

const unmatched = normalizeCampflareRecord(fixture<CampflareRecord>('unmatched-campground.json'), {
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(unmatched, 'Unmatched Campflare record should still normalize for source provenance.');
assert.strictEqual(selectBestCampflareMatch(unmatched!, [ridbCandidate, npsCandidate]), null);

const freshRows = buildCampflareAvailabilityRows(available!, 'canonical-campground-id', '2026-05-14T12:05:00.000Z');
assert.strictEqual(freshRows.sourceRecord.campground_id, 'canonical-campground-id');
assert.strictEqual(freshRows.availability.provider_id, 'campflare');
assert.strictEqual(freshRows.availability.availability_status, 'available');
assert.strictEqual(freshRows.availability.last_checked_at, '2026-05-14T12:00:00.000Z');
assert.strictEqual(freshRows.canonicalAvailabilityStatus, 'available');
assert.strictEqual(freshRows.canonicalLastAvailabilityCheckedAt, '2026-05-14T12:00:00.000Z');

const page1 = fixture<CampflareApiPage>('page-1.json');
const page2 = fixture<CampflareApiPage>('page-2.json');
assert.strictEqual(getCampflarePageRecords(page1).length, 1);
assert.strictEqual(getNextCampflareCursor(page1), 'next-page');
assert.strictEqual(getNextCampflareCursor(page2), null);

const url = buildCampflareAvailabilityUrl({
  baseUrl: 'https://campflare.example/api/',
  limit: 500,
  cursor: 'next-page',
  state: 'ca',
  updatedSince: '2026-05-14T00:00:00.000Z',
});
assert.ok(url.startsWith('https://campflare.example/api/campgrounds/availability?'));
assert.ok(url.includes('limit=100'), 'Campflare page size should be clamped.');
assert.ok(url.includes('cursor=next-page'));
assert.ok(url.includes('state=CA'));
assert.ok(url.includes('updated_since=2026-05-14T00%3A00%3A00.000Z'));
assert.ok(!url.toLowerCase().includes('api_key'), 'Campflare API key must not be embedded in adapter URLs.');

const providerError = fixture<Record<string, unknown>>('provider-error.json');
assert.deepStrictEqual(campflareProviderError(429, providerError), {
  code: 'CAMPFLARE_RATE_LIMITED',
  message: 'Campflare rate limit reached.',
});
assert.deepStrictEqual(campflareProviderError(401, providerError), {
  code: 'CAMPFLARE_AUTH_FAILED',
  message: 'Campflare credentials rejected.',
});
const genericError = campflareProviderError(500, providerError);
assert.strictEqual(genericError.code, 'CAMPFLARE_PROVIDER_ERROR');
assert.ok(!genericError.message.includes('CAMPFLARE_API_KEY'), 'Provider errors must redact secret ref names.');
