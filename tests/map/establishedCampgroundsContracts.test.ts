import assert from 'assert';
import {
  buildCampgroundMarker,
  computePayloadHash,
  normalizeAmenity,
  normalizeAvailabilityStatus,
  normalizeCampgroundName,
  normalizeCampgroundStatus,
  normalizeSiteType,
  safeProviderError,
  type EstablishedCampground,
  type ProviderId,
} from '../../lib/map/establishedCampgrounds';

const providerIds: ProviderId[] = [
  'ridb',
  'nps',
  'campflare',
  'active',
  'reserveamerica',
  'aspira',
  'osm',
  'manual',
];

assert.deepStrictEqual(providerIds, [
  'ridb',
  'nps',
  'campflare',
  'active',
  'reserveamerica',
  'aspira',
  'osm',
  'manual',
]);

assert.strictEqual(normalizeCampgroundName('  Juniper   Flats Campground  '), 'Juniper Flats Campground');
assert.strictEqual(normalizeCampgroundName(''), 'Unknown campground');

assert.strictEqual(normalizeAmenity('Drinking Water'), 'water');
assert.strictEqual(normalizeAmenity('Vault Toilet'), 'toilets');
assert.strictEqual(normalizeAmenity('RV Hookups'), 'hookups');
assert.strictEqual(normalizeAmenity('Dump Station'), 'dump_station');
assert.strictEqual(normalizeAmenity('Picnic Tables'), 'picnic_table');
assert.strictEqual(normalizeAmenity('Cell Service'), 'cell_service');
assert.strictEqual(normalizeAmenity('Horse Corral'), 'horse_corral');
assert.strictEqual(normalizeAmenity(null), 'unknown');

assert.strictEqual(normalizeSiteType('Camp Site'), 'campground');
assert.strictEqual(normalizeSiteType('caravan site'), 'rv_park');
assert.strictEqual(normalizeSiteType('Tent Only'), 'tent_site');
assert.strictEqual(normalizeSiteType('group campground'), 'group_site');
assert.strictEqual(normalizeSiteType('Yurt'), 'cabin');
assert.strictEqual(normalizeSiteType('primitive'), 'primitive_developed');
assert.strictEqual(normalizeSiteType('unmapped provider value'), 'unknown');

assert.strictEqual(normalizeCampgroundStatus('Active'), 'open');
assert.strictEqual(normalizeCampgroundStatus('temporary closure'), 'temporarily_closed');
assert.strictEqual(normalizeCampgroundStatus('seasonal'), 'seasonal');
assert.strictEqual(normalizeCampgroundStatus('retired'), 'removed');
assert.strictEqual(normalizeCampgroundStatus('verify locally'), 'verify');
assert.strictEqual(normalizeCampgroundStatus(undefined), 'unknown');

assert.strictEqual(normalizeAvailabilityStatus('available now'), 'available');
assert.strictEqual(normalizeAvailabilityStatus('available tonight'), 'available');
assert.strictEqual(normalizeAvailabilityStatus('cancellation'), 'available');
assert.strictEqual(normalizeAvailabilityStatus('few available'), 'limited');
assert.strictEqual(normalizeAvailabilityStatus('sold out'), 'unavailable');
assert.strictEqual(normalizeAvailabilityStatus('cached'), 'stale');
assert.strictEqual(normalizeAvailabilityStatus('not open'), 'closed');
assert.strictEqual(normalizeAvailabilityStatus('provider omitted field'), 'unknown');

const campground: EstablishedCampground = {
  id: 'campground-1',
  name: '  Pine   Basin ',
  latitude: 39.1,
  longitude: -120.2,
  facilityType: 'campground',
  managingAgency: 'USFS',
  managingOrg: null,
  reservationUrl: 'https://example.test/reserve',
  detailUrl: null,
  status: 'open',
  availabilityStatus: 'limited',
  siteCount: 24,
  siteTypes: ['campground'],
  amenities: ['water', 'toilets'],
  sourceConfidence: 120,
  primaryProvider: 'ridb',
  attribution: 'RIDB / Recreation.gov',
  lastSyncedAt: '2026-05-14T12:00:00Z',
  lastVerifiedAt: null,
  sources: [
    {
      providerId: 'ridb',
      providerRecordId: 'RIDB-1',
      sourceUrl: 'https://example.test/source',
      rawJson: { id: 'RIDB-1' },
      payloadHash: 'fnv1a32:test',
      firstSeenAt: '2026-05-14T12:00:00Z',
      lastSeenAt: '2026-05-14T12:00:00Z',
    },
  ],
};

const marker = buildCampgroundMarker(campground);
assert.deepStrictEqual(marker, {
  id: 'campground-1',
  latitude: 39.1,
  longitude: -120.2,
  title: 'Pine Basin',
  subtitle: 'RIDB · limited',
  type: 'established_campground',
  category: 'campground',
  availabilityStatus: 'limited',
  sourceConfidence: 100,
  attribution: 'RIDB / Recreation.gov',
});

const firstHash = computePayloadHash({ b: 2, a: 1, nested: { z: true, y: null } });
const secondHash = computePayloadHash({ nested: { y: null, z: true }, a: 1, b: 2 });
assert.strictEqual(firstHash, secondHash, 'Payload hash should be stable regardless of object key order.');
assert.match(firstHash, /^fnv1a32:[0-9a-f]{8}$/);
assert.notStrictEqual(firstHash, computePayloadHash({ a: 1, b: 3 }));

const error = safeProviderError(
  new Error('Provider failed https://api.example.test?apikey=abc123&token=secret Bearer live-token RIDB_API_KEY'),
);
assert.ok(!error.message.includes('abc123'), 'safeProviderError should redact api key values.');
assert.ok(!error.message.includes('live-token'), 'safeProviderError should redact bearer values.');
assert.ok(!error.message.includes('RIDB_API_KEY'), 'safeProviderError should redact secret ref names.');
assert.ok(error.message.includes('[redacted]') || error.message.includes('[secret_ref]'));

const objectError = safeProviderError({ message: 'ACTIVE_API_SECRET rejected', code: '401' });
assert.strictEqual(objectError.message, '[secret_ref] rejected');
assert.strictEqual(objectError.code, '401');
