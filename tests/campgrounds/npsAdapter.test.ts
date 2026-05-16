import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  buildNpsAlertsUrl,
  buildNpsCampgroundsUrl,
  buildNpsParksUrl,
  buildNpsSyncRows,
  getNextNpsStart,
  mergeNpsIntoExistingCampground,
  normalizeMatchName,
  normalizeNpsCampgroundRecord,
  npsProviderError,
  selectBestNpsCampgroundMatch,
  type ExistingCampgroundCandidate,
  type NpsAlertRecord,
  type NpsApiPage,
  type NpsCampgroundRecord,
  type NpsParkRecord,
} from '../../supabase/functions/campgrounds-sync-nps/npsAdapter';

const root = path.resolve(__dirname, '..', '..');
const fixture = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'campgrounds', 'nps', name), 'utf8'));

const npsOnly = fixture<NpsCampgroundRecord>('nps-only-campground.json');
const npsRidbMatch = fixture<NpsCampgroundRecord>('nps-ridb-match.json');
const missingLocation = fixture<NpsCampgroundRecord>('nps-missing-location.json');
const park = fixture<NpsParkRecord>('nps-park-context.json');
const alerts = fixture<NpsAlertRecord[]>('nps-alert-context.json');
const page1 = fixture<NpsApiPage<NpsCampgroundRecord>>('nps-page-1.json');
const page2 = fixture<NpsApiPage<NpsCampgroundRecord>>('nps-page-2.json');
const providerError = fixture<Record<string, unknown>>('nps-provider-error.json');

const normalized = normalizeNpsCampgroundRecord(
  npsOnly,
  { park, alerts },
  { attributionText: 'National Park Service', syncedAt: '2026-05-14T12:00:00.000Z' },
);

assert.ok(normalized, 'NPS-only campground should normalize.');
assert.strictEqual(normalized?.providerRecordId, 'nps-cg-1001');
assert.strictEqual(normalized?.parkCode, 'yose');
assert.strictEqual(normalized?.campground.name, 'North Pines Campground');
assert.strictEqual(normalized?.campground.latitude, 37.7442);
assert.strictEqual(normalized?.campground.longitude, -119.5657);
assert.strictEqual(normalized?.campground.managing_agency, 'National Park Service');
assert.strictEqual(normalized?.campground.managing_org, 'Yosemite National Park');
assert.strictEqual(normalized?.campground.source_confidence, 86);
assert.strictEqual(normalized?.campground.primary_provider, 'nps');
assert.strictEqual(normalized?.campground.availability_status, 'unknown');
assert.strictEqual(normalized?.campground.status, 'unknown');
assert.ok(normalized?.campground.amenities?.includes('water'));
assert.ok(normalized?.campground.amenities?.includes('toilets'));
assert.ok(normalized?.campground.amenities?.includes('picnic_table'));
assert.ok(normalized?.campground.amenities?.includes('fire_ring'));
assert.strictEqual(normalized?.sourceRecord.provider_id, 'nps');
assert.strictEqual(normalized?.sourceRecord.provider_record_id, 'nps-cg-1001');
assert.match(normalized?.sourceRecord.payload_hash ?? '', /^fnv1a32:[0-9a-f]{8}$/);
assert.ok(
  JSON.stringify(normalized?.sourceRecord.raw_json).includes('Seasonal road advisory'),
  'NPS source raw_json should preserve alert/context enrichment.',
);

assert.strictEqual(
  normalizeNpsCampgroundRecord(missingLocation, { park, alerts }, { syncedAt: '2026-05-14T12:00:00.000Z' }),
  null,
  'NPS record missing location should be skipped.',
);

assert.strictEqual(normalizeMatchName('Juniper Flats Campground'), 'juniper flats');
assert.strictEqual(normalizeMatchName('Juniper Flats CG'), 'juniper flats');

const normalizedRidbMatch = normalizeNpsCampgroundRecord(npsRidbMatch, { park, alerts }, {
  attributionText: 'National Park Service',
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(normalizedRidbMatch);

const ridbCandidate: ExistingCampgroundCandidate = {
  id: 'ridb-canonical-1',
  name: 'Juniper Flats Campground',
  latitude: 38.71234,
  longitude: -119.81234,
  managing_agency: 'USFS',
  managing_org: 'USFS',
  primary_provider: 'ridb',
  source_confidence: 92,
  reservation_url: 'https://www.recreation.gov/camping/campgrounds/1001',
  detail_url: 'https://ridb.recreation.gov/api/v1/facilities/RIDB-1001',
  attribution: 'RIDB / Recreation.gov',
};

const match = selectBestNpsCampgroundMatch(normalizedRidbMatch, [ridbCandidate]);
assert.strictEqual(match?.id, 'ridb-canonical-1', 'NPS record should match nearby same-name RIDB campground.');

const merged = mergeNpsIntoExistingCampground(
  ridbCandidate,
  normalizedRidbMatch,
  '2026-05-14T13:00:00.000Z',
);
assert.strictEqual(merged.latitude, ridbCandidate.latitude, 'NPS must not overwrite higher-confidence RIDB latitude.');
assert.strictEqual(merged.longitude, ridbCandidate.longitude, 'NPS must not overwrite higher-confidence RIDB longitude.');
assert.strictEqual(
  merged.reservation_url,
  ridbCandidate.reservation_url,
  'NPS must not overwrite stronger reservation URL with weaker/empty value.',
);
assert.strictEqual(merged.source_confidence, 92);
assert.strictEqual(merged.primary_provider, 'ridb');
assert.ok(merged.attribution?.includes('RIDB / Recreation.gov'));
assert.ok(merged.attribution?.includes('National Park Service'));

const syncRows = buildNpsSyncRows(
  normalizedRidbMatch,
  'ridb-canonical-1',
  { campground_id: 'ridb-canonical-1', first_seen_at: '2026-01-01T00:00:00.000Z' },
  '2026-05-14T13:00:00.000Z',
);
assert.strictEqual(syncRows.sourceRecord.campground_id, 'ridb-canonical-1');
assert.strictEqual(syncRows.sourceRecord.first_seen_at, '2026-01-01T00:00:00.000Z');
assert.strictEqual(syncRows.sourceRecord.last_seen_at, '2026-05-14T13:00:00.000Z');

assert.strictEqual(getNextNpsStart(page1, 0), 1, 'NPS pagination should advance by page limit/current count.');
assert.strictEqual(getNextNpsStart(page2, 1), null, 'NPS pagination should stop after final page.');

const campgroundsUrl = buildNpsCampgroundsUrl({
  limit: 100,
  start: 1,
  parkCode: 'YOSE',
  stateCode: 'ca',
  query: 'campground',
});
assert.ok(campgroundsUrl.includes('/campgrounds?'), 'NPS campground URL should target campgrounds endpoint.');
assert.ok(campgroundsUrl.includes('limit=50'), 'NPS request limit should be clamped.');
assert.ok(campgroundsUrl.includes('start=1'), 'NPS request URL should include start.');
assert.ok(campgroundsUrl.includes('parkCode=yose'), 'NPS request URL should include park code.');
assert.ok(campgroundsUrl.includes('stateCode=CA'), 'NPS request URL should include state code.');
assert.ok(!campgroundsUrl.toLowerCase().includes('api_key'), 'NPS API key must not be embedded by adapter URL builders.');

const parksUrl = buildNpsParksUrl(['YOSE', 'yose', 'zion']);
const alertsUrl = buildNpsAlertsUrl(['YOSE', 'zion']);
assert.ok(parksUrl?.includes('/parks?parkCode=yose%2Czion'));
assert.ok(alertsUrl?.includes('/alerts?parkCode=yose%2Czion'));

assert.deepStrictEqual(npsProviderError(429, providerError), {
  code: 'NPS_RATE_LIMITED',
  message: 'NPS rate limit reached.',
});
assert.deepStrictEqual(npsProviderError(403, providerError), {
  code: 'NPS_AUTH_FAILED',
  message: 'NPS credentials rejected.',
});
assert.strictEqual(npsProviderError(500, providerError).code, 'NPS_PROVIDER_ERROR');
