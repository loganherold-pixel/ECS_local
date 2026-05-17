import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  buildReservationProviderCampgroundsUrl,
  buildReservationProviderSyncRows,
  getNextReservationProviderCursor,
  getNextReservationProviderOffset,
  getReservationProviderPageRecords,
  mergeReservationProviderIntoExistingCampground,
  normalizeReservationProviderMatchName,
  normalizeReservationProviderRecord,
  reservationProviderError,
  selectBestReservationProviderMatch,
  type ExistingCampgroundCandidate,
  type ReservationProviderPage,
  type ReservationProviderRecord,
} from '../../supabase/functions/_shared/campgroundReservationProviderAdapter';

const root = path.resolve(__dirname, '..', '..');
const fixture = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'campgrounds', 'reservation-providers', name), 'utf8'));

const active = normalizeReservationProviderRecord('active', fixture<ReservationProviderRecord>('active-campground.json'), {
  attributionText: 'ACTIVE',
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(active, 'ACTIVE campground should normalize.');
assert.strictEqual(active?.providerId, 'active');
assert.strictEqual(active?.providerRecordId, 'active-1001');
assert.strictEqual(active?.campground.name, 'Juniper Flats Campground');
assert.strictEqual(active?.campground.latitude, 38.71236);
assert.strictEqual(active?.campground.longitude, -119.81235);
assert.strictEqual(active?.campground.reservation_url, 'https://www.active.com/camping/juniper-flats');
assert.strictEqual(active?.campground.detail_url, 'https://www.active.com/facilities/active-1001');
assert.strictEqual(active?.campground.availability_status, 'unknown');
assert.strictEqual(active?.campground.source_confidence, 82);
assert.strictEqual(active?.campground.primary_provider, 'active');
assert.ok(active?.campground.amenities?.includes('water'));
assert.ok(active?.campground.amenities?.includes('toilets'));
assert.ok(active?.campground.amenities?.includes('picnic_table'));
assert.strictEqual(active?.sourceRecord.provider_id, 'active');
assert.match(active?.sourceRecord.payload_hash ?? '', /^fnv1a32:[0-9a-f]{8}$/);

const reserveAmerica = normalizeReservationProviderRecord(
  'reserveamerica',
  fixture<ReservationProviderRecord>('reserveamerica-campground.json'),
  { attributionText: 'ReserveAmerica', syncedAt: '2026-05-14T12:00:00.000Z' },
);
assert.ok(reserveAmerica, 'ReserveAmerica campground should normalize.');
assert.strictEqual(reserveAmerica?.providerRecordId, 'ra-2001');
assert.strictEqual(reserveAmerica?.campground.latitude, 38.71234);
assert.strictEqual(reserveAmerica?.campground.longitude, -119.81234);
assert.strictEqual(reserveAmerica?.campground.reservation_url, 'https://www.reserveamerica.com/explore/juniper-flats/RA-2001');
assert.strictEqual(reserveAmerica?.campground.source_confidence, 84);
assert.strictEqual(reserveAmerica?.campground.availability_status, 'unknown');

const aspira = normalizeReservationProviderRecord('aspira', fixture<ReservationProviderRecord>('aspira-campground.json'), {
  attributionText: 'Aspira',
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(aspira, 'Aspira campground should normalize.');
assert.strictEqual(aspira?.providerRecordId, 'aspira-3001');
assert.strictEqual(aspira?.campground.facility_type, 'rv_park');
assert.strictEqual(aspira?.campground.status, 'seasonal');
assert.ok(aspira?.campground.amenities?.includes('showers'));
assert.ok(aspira?.campground.amenities?.includes('hookups'));
assert.ok(aspira?.campground.amenities?.includes('dump_station'));

assert.strictEqual(
  normalizeReservationProviderRecord('active', fixture<ReservationProviderRecord>('missing-coordinates.json'), {
    attributionText: 'ACTIVE',
    syncedAt: '2026-05-14T12:00:00.000Z',
  }),
  null,
  'Reservation provider records missing coordinates should be skipped.',
);

assert.strictEqual(normalizeReservationProviderMatchName('Juniper Flats CG'), 'juniper flats');
assert.strictEqual(normalizeReservationProviderMatchName('Juniper Flats RV Resort'), 'juniper flats');

const ridbCandidate: ExistingCampgroundCandidate = {
  id: 'ridb-canonical-1',
  name: 'Juniper Flats Campground',
  latitude: 38.71234,
  longitude: -119.81234,
  managing_agency: 'USFS',
  managing_org: 'USFS',
  primary_provider: 'ridb',
  source_confidence: 92,
  reservation_url: null,
  detail_url: 'https://ridb.recreation.gov/api/v1/facilities/RIDB-1001',
  attribution: 'RIDB / Recreation.gov',
};
assert.strictEqual(
  selectBestReservationProviderMatch(active!, [ridbCandidate])?.id,
  'ridb-canonical-1',
  'ACTIVE should match existing RIDB campground by name and proximity.',
);
assert.strictEqual(
  selectBestReservationProviderMatch(reserveAmerica!, [ridbCandidate])?.id,
  'ridb-canonical-1',
  'ReserveAmerica should dedupe to the same canonical campground as ACTIVE/RIDB.',
);

const urlCandidate: ExistingCampgroundCandidate = {
  id: 'url-canonical-1',
  name: 'Slightly Different Name',
  latitude: 41,
  longitude: -111,
  primary_provider: 'nps',
  source_confidence: 86,
  reservation_url: 'https://aspira.example/reserve/pine-basin',
  detail_url: null,
  attribution: 'National Park Service',
};
assert.strictEqual(
  selectBestReservationProviderMatch(aspira!, [urlCandidate])?.id,
  'url-canonical-1',
  'Aspira should match existing canonical campground by reservation URL.',
);

const merged = mergeReservationProviderIntoExistingCampground(ridbCandidate, reserveAmerica!, '2026-05-14T13:00:00.000Z');
assert.strictEqual(merged.latitude, ridbCandidate.latitude, 'Higher-confidence RIDB latitude should be preserved.');
assert.strictEqual(merged.longitude, ridbCandidate.longitude, 'Higher-confidence RIDB longitude should be preserved.');
assert.strictEqual(
  merged.reservation_url,
  reserveAmerica?.campground.reservation_url,
  'Reservation provider URL should fill an existing missing reservation URL.',
);
assert.strictEqual(merged.availability_status, 'unknown', 'Reservation metadata must not claim live availability.');
assert.strictEqual(merged.primary_provider, 'ridb', 'Existing stronger primary provider should be preserved.');
assert.ok(merged.attribution?.includes('RIDB / Recreation.gov'));
assert.ok(merged.attribution?.includes('ReserveAmerica'));

const existingReservationCandidate: ExistingCampgroundCandidate = {
  ...ridbCandidate,
  reservation_url: 'https://www.recreation.gov/camping/campgrounds/1001',
};
const keepReservation = mergeReservationProviderIntoExistingCampground(
  existingReservationCandidate,
  active!,
  '2026-05-14T13:00:00.000Z',
);
assert.strictEqual(
  keepReservation.reservation_url,
  'https://www.recreation.gov/camping/campgrounds/1001',
  'Existing reservation URL should not be overwritten by a weaker provider URL.',
);

const syncRows = buildReservationProviderSyncRows(
  active!,
  'canonical-campground-id',
  { campground_id: 'canonical-campground-id', first_seen_at: '2026-01-01T00:00:00.000Z' },
  '2026-05-14T13:00:00.000Z',
);
assert.strictEqual(syncRows.sourceRecord.campground_id, 'canonical-campground-id');
assert.strictEqual(syncRows.sourceRecord.provider_id, 'active');
assert.strictEqual(syncRows.sourceRecord.first_seen_at, '2026-01-01T00:00:00.000Z');
assert.strictEqual(syncRows.sourceRecord.last_seen_at, '2026-05-14T13:00:00.000Z');
assert.strictEqual(syncRows.campground.availability_status, 'unknown');

const page1 = fixture<ReservationProviderPage>('page-1.json');
const page2 = fixture<ReservationProviderPage>('page-2.json');
assert.strictEqual(getReservationProviderPageRecords(page1).length, 1);
assert.strictEqual(getNextReservationProviderCursor(page1), 'page-2');
assert.strictEqual(getNextReservationProviderCursor(page2), null);
assert.strictEqual(getNextReservationProviderOffset(page2, 1), null);

const url = buildReservationProviderCampgroundsUrl({
  providerId: 'active',
  baseUrl: 'https://active.example/api/',
  limit: 500,
  cursor: 'cursor-2',
  offset: 25,
  state: 'ca',
  updatedSince: '2026-05-14T00:00:00.000Z',
});
assert.ok(url.startsWith('https://active.example/api/campgrounds?'));
assert.ok(url.includes('limit=100'), 'Reservation provider page size should be clamped.');
assert.ok(url.includes('cursor=cursor-2'));
assert.ok(url.includes('offset=25'));
assert.ok(url.includes('state=CA'));
assert.ok(!url.toLowerCase().includes('api_key'), 'Provider API keys must not be embedded in adapter URLs.');

const providerError = fixture<Record<string, unknown>>('provider-error.json');
assert.deepStrictEqual(reservationProviderError('active', 429, providerError), {
  code: 'ACTIVE_RATE_LIMITED',
  message: 'active rate limit reached.',
});
assert.deepStrictEqual(reservationProviderError('reserveamerica', 403, providerError), {
  code: 'RESERVEAMERICA_AUTH_FAILED',
  message: 'reserveamerica credentials rejected.',
});
const genericError = reservationProviderError('aspira', 500, providerError);
assert.strictEqual(genericError.code, 'ASPIRA_PROVIDER_ERROR');
assert.ok(!genericError.message.includes('ACTIVE_API_SECRET'), 'Provider errors must redact secret ref names.');
