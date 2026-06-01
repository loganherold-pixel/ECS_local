const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  AgencyIngestionMemoryStore,
  BLM_PLAD_LIMITATIONS,
  NPS_AGENCY_LIMITATIONS,
  USFS_MVUM_LIMITATIONS,
  createAgencyFeed,
  normalizeBlmPlad,
  normalizeNpsAlerts,
  normalizeStateDot511,
  normalizeUsfsMvum,
} = loadTypeScriptModule('lib/ecs5AgencyIngestion.ts');

const now = new Date('2026-04-29T18:00:00.000Z');

const mvumFeed = createAgencyFeed({
  id: 'feed-usfs-mvum',
  providerId: 'usfs_mvum',
  name: 'Tahoe MVUM Routes',
  agencyName: 'USFS',
  jurisdiction: 'Tahoe NF',
  sourceType: 'official_gis',
  dataFormat: 'geojson',
  endpointUrl: 'https://example.test/mvum.geojson',
  knownLimitations: [...USFS_MVUM_LIMITATIONS],
});
const mvumFixture = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[-121.2, 38.8], [-121.1, 38.9]] },
    properties: {
      route_id: '16E21',
      vehicle_class: ['high_clearance', 'motorcycle'],
      seasonal: 'open when dry',
      open_date: '2026-05-01',
      close_date: '2026-11-30',
      designation: 'motorized trail',
      forest: 'Tahoe NF',
    },
  }],
};
let mvumRecords = normalizeUsfsMvum(mvumFeed, mvumFixture, now);
assert.strictEqual(mvumRecords.length, 1);
assert.strictEqual(mvumRecords[0].recordType, 'legal_access');
assert.strictEqual(mvumRecords[0].normalizedPayload.roadTrailId, '16E21');
assert.deepStrictEqual(mvumRecords[0].normalizedPayload.vehicleClassAllowance, ['high_clearance', 'motorcycle']);
assert.strictEqual(mvumRecords[0].normalizedPayload.passabilityStatus, 'unknown', 'MVUM legal open must not imply passable.');
assert.ok(mvumRecords[0].knownLimitations.includes('legal_does_not_mean_prudent'));

const blmFeed = createAgencyFeed({
  id: 'feed-blm-plad',
  providerId: 'blm_plad',
  name: 'BLM PLAD Access',
  agencyName: 'BLM',
  jurisdiction: 'California',
  sourceType: 'official_gis',
  dataFormat: 'geojson',
  knownLimitations: [...BLM_PLAD_LIMITATIONS],
});
const blmRecords = normalizeBlmPlad(blmFeed, [{
  geometry: { type: 'LineString', coordinates: [[-120.2, 37.8], [-120.1, 37.9]] },
  access_id: 'plad-22',
  access_type: 'public access easement',
  jurisdiction: 'BLM CA',
  constraints: 'Respect adjacent private land.',
}], now);
assert.strictEqual(blmRecords[0].normalizedPayload.accessType, 'public access easement');
assert.strictEqual(blmRecords[0].normalizedPayload.passabilityStatus, 'unknown');
assert.ok(blmRecords[0].knownLimitations.includes('mapped_access_does_not_allow_general_use_of_non_blm_lands'));

const npsFeed = createAgencyFeed({
  id: 'feed-nps-alerts',
  providerId: 'nps',
  name: 'NPS Alerts',
  agencyName: 'National Park Service',
  jurisdiction: 'YOSE',
  sourceType: 'official_api',
  dataFormat: 'json',
  requiresApiKey: true,
  knownLimitations: [...NPS_AGENCY_LIMITATIONS],
});
const npsRecords = normalizeNpsAlerts(npsFeed, {
  data: [{
    id: 'nps-closure-1',
    title: 'Temporary road closure',
    category: 'Closure',
    parkCode: 'yose',
    description: 'Road closed due to storm damage.',
    url: 'https://www.nps.gov/yose/planyourvisit/conditions.htm',
    lastIndexedDate: '2026-04-29T15:00:00Z',
    expirationDate: '2026-05-02T00:00:00Z',
  }],
}, now);
assert.strictEqual(npsRecords[0].recordType, 'closure');
assert.strictEqual(npsRecords[0].normalizedPayload.legalClosureSignal, true);
assert.ok(npsRecords[0].knownLimitations.includes('applies_to_nps_units'));

const dotFeed = createAgencyFeed({
  id: 'feed-state-dot',
  providerId: 'state_dot_511',
  name: 'State 511 Events',
  agencyName: 'State DOT',
  jurisdiction: 'CA',
  sourceType: 'state_agency',
  dataFormat: 'json',
});
const dotRecords = normalizeStateDot511(dotFeed, {
  events: [{
    id: 'dot-closure-80',
    type: 'closure',
    roadName: 'SR 20',
    status: 'closed',
    description: 'Full closure due to slide.',
    latitude: 39.1,
    longitude: -121.0,
    startTime: '2026-04-29T12:00:00Z',
    endTime: '2026-04-30T12:00:00Z',
  }],
}, now);
assert.strictEqual(dotRecords[0].recordType, 'closure');
assert.strictEqual(dotRecords[0].normalizedPayload.backcountryLegalityAuthority, false);
assert.strictEqual(dotRecords[0].geometry.type, 'Point');

const store = new AgencyIngestionMemoryStore();
let result = store.ingest(mvumFeed, mvumFixture, now);
assert.strictEqual(result.run.status, 'success');
assert.strictEqual(result.run.recordsCreated, 1);
assert.strictEqual(result.scopedConflictDetection.triggered, true);
assert.ok(result.scopedConflictDetection.affectedBbox);

result = store.ingest(mvumFeed, mvumFixture, new Date(now.getTime() + 60_000));
assert.strictEqual(result.run.recordsCreated, 0, 'Duplicate content hash should not create records.');
assert.strictEqual(result.run.recordsUpdated, 0);

const changedFixture = JSON.parse(JSON.stringify(mvumFixture));
changedFixture.features[0].properties.seasonal = 'open after snowmelt only';
result = store.ingest(mvumFeed, changedFixture, new Date(now.getTime() + 120_000));
assert.strictEqual(result.run.recordsUpdated, 1, 'Changed closure/legal payload should update existing record.');

const manualFeed = createAgencyFeed({
  id: 'feed-manual',
  providerId: 'manual_agency_ingestion',
  name: 'Manual Agency Entries',
  agencyName: 'ECS Admin',
  jurisdiction: 'field',
  sourceType: 'manual_admin',
  dataFormat: 'manual',
});
const manualClosure = store.addManualObservation({
  feed: manualFeed,
  recordType: 'closure',
  title: 'Temporary forest road closure',
  status: 'closed',
  geometry: { type: 'LineString', coordinates: [[-121.5, 39.0], [-121.4, 39.1]] },
  sourceUrl: 'https://www.fs.usda.gov/alerts/example',
  createdBy: 'admin-1',
  markedOfficial: false,
  effectiveStartAt: '2026-04-29T18:00:00Z',
  expiresAt: '2026-04-29T20:00:00Z',
  notes: 'Entered from agency alert page.',
}, now);
assert.strictEqual(manualClosure.recordType, 'closure');
assert.strictEqual(manualClosure.normalizedPayload.createdBy, 'admin-1');
assert.ok(String(manualClosure.normalizedPayload.sourceCaveat).includes('not official API data'));
assert.ok(store.getBlockingObservations(now).some((observation) => observation.id === manualClosure.id));
store.expireRecords(new Date('2026-04-29T21:00:00.000Z'));
assert.ok(!store.getBlockingObservations(new Date('2026-04-29T21:00:00.000Z')).some((observation) => observation.id === manualClosure.id), 'Expired closure should no longer block.');
assert.ok(store.snapshot().observations.find((observation) => observation.id === manualClosure.id).historical, 'Expired closure remains historical evidence.');

const failed = store.ingest(createAgencyFeed({
  id: 'feed-failed',
  providerId: 'county_emergency',
  name: 'County Feed',
  agencyName: 'County OES',
}), new Error('network timeout'), now);
assert.strictEqual(failed.run.status, 'failed');
assert.ok(failed.run.errorSummary.includes('network timeout'));

const driftFeed = createAgencyFeed({
  id: 'feed-drift',
  providerId: 'state_fire_agency',
  name: 'State Fire',
  agencyName: 'State Fire',
  sourceType: 'state_agency',
});
const drift = store.ingest(driftFeed, { unexpected: { shape: true } }, now);
assert.strictEqual(drift.run.status, 'partial');
assert.strictEqual(store.snapshot().feeds.find((feed) => feed.id === 'feed-drift').healthStatus, 'degraded');

const snapshot = store.snapshot();
assert.ok(snapshot.conflictTriggers.length >= 2, 'Ingestion should trigger scoped conflict detection records.');
assert.ok(snapshot.conflictTriggers.every((trigger) => 'affectedBbox' in trigger));

const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5AgencyIngestion.ts'), 'utf8');
assert.ok(source.includes('MVUM legal designation is separate from current passability'));
assert.ok(source.includes('Manual agency ingestion is not official API data'));
assert.ok(!source.includes('fetch('), 'Agency ingestion core should remain offline/pure for tests.');

console.log('ECS 5.0 agency ingestion tests passed.');
