import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  buildOsmOverpassQuery,
  buildOsmSyncRows,
  getOsmElements,
  mergeOsmIntoExistingCampground,
  normalizeOsmElement,
  osmProviderError,
  selectBestOsmCampgroundMatch,
  validateOsmBbox,
  type ExistingCampgroundCandidate,
  type OsmElement,
  type OsmOverpassResponse,
} from '../../supabase/functions/campgrounds-sync-osm/osmAdapter';

const root = path.resolve(__dirname, '..', '..');
const fixture = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'campgrounds', 'osm', name), 'utf8'));

const nodeCamp = normalizeOsmElement(fixture<OsmElement>('node-camp-site.json'), {
  attributionText: '© OpenStreetMap contributors',
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(nodeCamp, 'OSM tourism=camp_site node should normalize.');
assert.strictEqual(nodeCamp?.providerRecordId, 'node/101');
assert.strictEqual(nodeCamp?.campground.name, 'Juniper Flats Campground');
assert.strictEqual(nodeCamp?.campground.latitude, 38.1001);
assert.strictEqual(nodeCamp?.campground.longitude, -120.1001);
assert.strictEqual(nodeCamp?.campground.facility_type, 'campground');
assert.strictEqual(nodeCamp?.campground.managing_agency, 'USFS');
assert.strictEqual(nodeCamp?.campground.status, 'unknown');
assert.strictEqual(nodeCamp?.campground.availability_status, 'unknown');
assert.strictEqual(nodeCamp?.campground.source_confidence, 58);
assert.strictEqual(nodeCamp?.campground.primary_provider, 'osm');
assert.strictEqual(nodeCamp?.campground.attribution, '© OpenStreetMap contributors');
assert.ok(nodeCamp?.campground.amenities?.includes('toilets'));
assert.ok(nodeCamp?.campground.amenities?.includes('water'));
assert.ok(nodeCamp?.campground.amenities?.includes('picnic_table'));
assert.ok(nodeCamp?.campground.amenities?.includes('fire_ring'));
assert.strictEqual(nodeCamp?.sourceRecord.provider_id, 'osm');
assert.strictEqual(nodeCamp?.sourceRecord.provider_record_id, 'node/101');
assert.strictEqual(nodeCamp?.sourceRecord.source_url, 'https://www.openstreetmap.org/node/101');
assert.match(nodeCamp?.sourceRecord.payload_hash ?? '', /^fnv1a32:[0-9a-f]{8}$/);

const wayCamp = normalizeOsmElement(fixture<OsmElement>('way-camp-site.json'), {
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(wayCamp, 'OSM tourism=camp_site way with center should normalize.');
assert.strictEqual(wayCamp?.providerRecordId, 'way/102');
assert.strictEqual(wayCamp?.campground.name, 'Pine Bowl Camp');
assert.strictEqual(wayCamp?.campground.latitude, 38.2002);
assert.ok(wayCamp?.campground.amenities?.includes('showers'));
assert.ok(wayCamp?.campground.amenities?.includes('trash'));

const relationCamp = normalizeOsmElement(fixture<OsmElement>('relation-camp-site.json'), {
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(relationCamp, 'OSM tourism=camp_site relation with center should normalize.');
assert.strictEqual(relationCamp?.providerRecordId, 'relation/103');
assert.strictEqual(relationCamp?.campground.site_count, 12);

const pitch = normalizeOsmElement(fixture<OsmElement>('camp-pitch.json'), {
  syncedAt: '2026-05-14T12:00:00.000Z',
});
assert.ok(pitch, 'OSM tourism=camp_pitch should normalize.');
assert.strictEqual(pitch?.campground.facility_type, 'tent_site');
assert.deepStrictEqual(pitch?.campground.site_types, ['tent_site']);

assert.strictEqual(
  normalizeOsmElement(fixture<OsmElement>('invalid-geometry.json'), {
    syncedAt: '2026-05-14T12:00:00.000Z',
  }),
  null,
  'OSM ways/relations missing center geometry should be skipped.',
);

const ridbCandidate: ExistingCampgroundCandidate = {
  id: 'ridb-canonical-1',
  name: 'Juniper Flats Campground',
  latitude: 38.10012,
  longitude: -120.10012,
  facility_type: 'campground',
  managing_agency: 'USFS',
  managing_org: 'USFS',
  reservation_url: 'https://www.recreation.gov/camping/campgrounds/1001',
  detail_url: 'https://ridb.recreation.gov/api/v1/facilities/RIDB-1001',
  status: 'open',
  availability_status: 'available',
  site_count: 20,
  site_types: ['campground'],
  amenities: ['water'],
  primary_provider: 'ridb',
  source_confidence: 92,
  attribution: 'RIDB / Recreation.gov',
};

assert.ok(nodeCamp);
assert.strictEqual(
  selectBestOsmCampgroundMatch(nodeCamp, [ridbCandidate])?.id,
  'ridb-canonical-1',
  'OSM duplicate near a stronger RIDB/NPS record should match canonical campground.',
);

const merged = mergeOsmIntoExistingCampground(ridbCandidate, nodeCamp, '2026-05-14T13:00:00.000Z');
assert.strictEqual(merged.primary_provider, 'ridb', 'OSM should not displace a stronger primary provider.');
assert.strictEqual(merged.source_confidence, 92, 'OSM should not lower canonical source confidence.');
assert.strictEqual(merged.status, 'open', 'OSM must not overwrite provider-backed open/closed status.');
assert.strictEqual(merged.availability_status, 'available', 'OSM must not overwrite provider-backed availability.');
assert.strictEqual(merged.latitude, ridbCandidate.latitude, 'OSM should preserve stronger provider coordinates.');
assert.ok(merged.attribution?.includes('RIDB / Recreation.gov'));
assert.ok(merged.attribution?.includes('OpenStreetMap'));

const unmatchedCandidate: ExistingCampgroundCandidate = {
  id: 'far-away',
  name: 'Different Campground',
  latitude: 39.5,
  longitude: -121.5,
  primary_provider: 'ridb',
  source_confidence: 92,
};
assert.strictEqual(selectBestOsmCampgroundMatch(nodeCamp, [unmatchedCandidate]), null);

const rows = buildOsmSyncRows(
  nodeCamp,
  'canonical-osm-id',
  {
    campground_id: 'canonical-osm-id',
    first_seen_at: '2026-01-01T00:00:00.000Z',
  },
  '2026-05-14T13:00:00.000Z',
);
assert.strictEqual(rows.sourceRecord.campground_id, 'canonical-osm-id');
assert.strictEqual(rows.sourceRecord.first_seen_at, '2026-01-01T00:00:00.000Z');
assert.strictEqual(rows.sourceRecord.last_seen_at, '2026-05-14T13:00:00.000Z');
assert.strictEqual(rows.campground.status, 'unknown');
assert.strictEqual(rows.campground.availability_status, 'unknown');

const validBbox = validateOsmBbox({
  minLat: 38.5,
  minLng: -120.9,
  maxLat: 38.9,
  maxLng: -120.2,
});
assert.deepStrictEqual(validBbox, {
  minLat: 38.5,
  minLng: -120.9,
  maxLat: 38.9,
  maxLng: -120.2,
});
assert.strictEqual(validateOsmBbox({ minLat: 0, minLng: 0, maxLat: 0, maxLng: 0 }), null);
assert.strictEqual(
  validateOsmBbox({ minLat: 30, minLng: -125, maxLat: 40, maxLng: -115 }),
  null,
  'OSM sync must reject overly broad regional/global bounding boxes.',
);

assert.ok(validBbox);
const query = buildOsmOverpassQuery(validBbox);
assert.ok(query.includes('node["tourism"~"^(camp_site|camp_pitch)$"]'));
assert.ok(query.includes('way["tourism"~"^(camp_site|camp_pitch)$"]'));
assert.ok(query.includes('relation["tourism"~"^(camp_site|camp_pitch)$"]'));
assert.ok(query.includes('out center tags;'));

const page = fixture<OsmOverpassResponse>('overpass-page.json');
assert.strictEqual(getOsmElements(page).length, 2);
assert.deepStrictEqual(osmProviderError(429, fixture<Record<string, unknown>>('overpass-error.json')), {
  code: 'OSM_RATE_LIMITED',
  message: 'OpenStreetMap Overpass rate limit or timeout reached.',
});
assert.strictEqual(osmProviderError(500, fixture<Record<string, unknown>>('overpass-error.json')).code, 'OSM_PROVIDER_ERROR');
