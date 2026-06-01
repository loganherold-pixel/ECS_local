const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migrationSource = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '008_campsite_gpx_imports.sql'),
  'utf8',
);
const routeTrackMigrationSource = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '009_campsite_gpx_route_track_candidates.sql'),
  'utf8',
);
const idempotencyMigrationSource = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '013_gpx_import_idempotency.sql'),
  'utf8',
);
const dbSource = fs.readFileSync(path.join(root, 'lib', 'db.ts'), 'utf8');
const typesSource = fs.readFileSync(
  path.join(root, 'lib', 'campsites', 'campsiteRecommendationTypes.ts'),
  'utf8',
);

process.env.EXPO_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  buildCampsiteReportInputFromGpxCandidate,
  CAMPSITE_GPX_IMPORT_PARSER_VERSION,
  DEFAULT_GPX_RAW_FILE_RETENTION,
  GpxCampsiteImportService,
  MAX_CAMPSITE_GPX_IMPORT_BYTES,
  gpxImportCandidateToCampsiteCandidate,
  parseGpxCampsiteCandidates,
  validateGpxCampsiteImportFile,
} = require(path.join(root, 'lib', 'campsites', 'gpxCampsiteImport.ts'));
const { CampsiteRecommendationService } = require(path.join(
  root,
  'lib',
  'campsites',
  'campsiteRecommendationService.ts',
));

class MemoryBackend {
  constructor() {
    this.currentUser = { id: 'user-1' };
    this.reports = [];
  }

  isAvailable() {
    return true;
  }

  async getCurrentUser() {
    return this.currentUser;
  }

  async insertReport(row) {
    const now = new Date().toISOString();
    const report = {
      id: `report-${this.reports.length + 1}`,
      created_at: now,
      updated_at: now,
      ...row,
    };
    this.reports.push(report);
    return { ok: true, data: report };
  }
}

class MemoryGpxImportBackend {
  constructor() {
    this.currentUser = { id: 'user-1' };
    this.imports = [];
    this.candidates = [];
  }

  isAvailable() {
    return true;
  }

  async getCurrentUser() {
    return this.currentUser;
  }

  async insertImport(row) {
    const now = new Date().toISOString();
    const record = {
      ...row,
      id: `import-${this.imports.length + 1}`,
      created_at: now,
      updated_at: now,
    };
    this.imports.push(record);
    return { ok: true, data: record };
  }

  async getImportByClientImportId(clientImportId, userId) {
    const record = this.imports.find(
      (item) =>
        item.client_import_id === clientImportId &&
        item.user_id === userId &&
        item.status !== 'deleted',
    );
    return { ok: true, data: record ?? null };
  }

  async insertCandidates(rows) {
    const now = new Date().toISOString();
    const inserted = rows.map((row, index) => ({
      ...row,
      id: `candidate-${this.candidates.length + index + 1}`,
      created_at: now,
      updated_at: now,
    }));
    this.candidates.push(...inserted);
    return { ok: true, data: inserted };
  }

  async listImportsByUser(userId) {
    return {
      ok: true,
      data: this.imports.filter((item) => item.user_id === userId && item.status !== 'deleted'),
    };
  }

  async getImportById(importId, userId) {
    const record = this.imports.find(
      (item) => item.id === importId && item.user_id === userId && item.status !== 'deleted',
    );
    return record
      ? { ok: true, data: record }
      : { ok: false, code: 'not_found', error: 'GPX import was not found.' };
  }

  async listCandidatesByImport(importId, userId) {
    return {
      ok: true,
      data: this.candidates.filter(
        (candidate) => candidate.gpx_import_id === importId && candidate.user_id === userId,
      ),
    };
  }

  async markImportDeleted(importId, userId) {
    const index = this.imports.findIndex(
      (item) => item.id === importId && item.user_id === userId,
    );
    if (index < 0) return { ok: false, code: 'not_found', error: 'GPX import was not found.' };
    this.imports[index] = {
      ...this.imports[index],
      status: 'deleted',
      updated_at: new Date().toISOString(),
    };
    return { ok: true, data: this.imports[index] };
  }
}

const waypointGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="ECS Test">
  <metadata><name>Camp Candidates</name><desc>Waypoint import test</desc></metadata>
  <wpt lat="38.7807" lon="-121.2076">
    <name>Ridge Camp</name>
    <desc>Flat durable pullout near route.</desc>
    <ele>425</ele>
    <time>2026-04-20T12:00:00Z</time>
  </wpt>
  <wpt lat="38.7900" lon="-121.2200">
    <name>Creek Camp</name>
  </wpt>
</gpx>`;

const gpx10Waypoint = `<?xml version="1.0"?>
<gpx version="1.0" creator="ECS Test">
  <wpt lat="38.1" lon="-121.1"><name>GPX 1.0 Camp</name></wpt>
</gpx>`;

const routeTrackOnlyGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="ECS Test">
  <rte><name>Route</name><rtept lat="38.1" lon="-121.1" /><rtept lat="38.2" lon="-121.2" /></rte>
  <trk><name>Track</name><trkseg><trkpt lat="38.3" lon="-121.3" /><trkpt lat="38.4" lon="-121.4" /></trkseg></trk>
</gpx>`;

async function main() {
  for (const tableName of ['gpx_imports', 'gpx_import_candidates']) {
    assert.match(
      migrationSource,
      new RegExp(`create table if not exists public\\.${tableName}`),
      `${tableName} table must be created by the GPX import migration.`,
    );
    assert.match(
      dbSource,
      new RegExp(`${tableName}!: Table`),
      `${tableName} must be available as a local IndexedDB collection.`,
    );
  }
  assert.ok(
    migrationSource.includes("raw_file_retention text not null default 'delete_after_parse'") &&
      migrationSource.includes("status text not null default 'parsed'"),
    'GPX imports should default to parsed status and delete-after-parse raw retention.',
  );
  assert.ok(
    migrationSource.includes('auth.uid() = user_id') &&
      migrationSource.includes('gpx_imports_select_own') &&
      migrationSource.includes('gpx_import_candidates_select_own'),
    'GPX imports and candidates must be owner-scoped by RLS.',
  );
  assert.ok(
    routeTrackMigrationSource.includes("'route_selected_point'") &&
      routeTrackMigrationSource.includes("'track_selected_point'") &&
      routeTrackMigrationSource.includes('source_route_name') &&
      routeTrackMigrationSource.includes('source_track_name') &&
      routeTrackMigrationSource.includes("'gpx_track_selected_point'"),
    'Route/track-selected GPX candidates and report source type should be added by migration.',
  );
  assert.ok(
    idempotencyMigrationSource.includes('client_import_id') &&
      idempotencyMigrationSource.includes('idx_gpx_imports_user_client_import_id'),
    'GPX import migration should add client_import_id idempotency.',
  );
  assert.ok(
    typesSource.includes('export interface GpxImport') &&
      typesSource.includes('client_import_id') &&
      typesSource.includes('export interface GpxImportCandidate') &&
      typesSource.includes("'route_selected_point'") &&
      typesSource.includes("'track_selected_point'") &&
      typesSource.includes('validateGpxImportRecord') &&
      typesSource.includes('validateGpxImportCandidateRecord'),
    'GPX import domain types and validators should be defined.',
  );

  const validation = validateGpxCampsiteImportFile('camps.gpx', 1024);
  assert.strictEqual(validation.ok, true, 'Valid GPX file metadata should pass.');
  assert.strictEqual(
    validateGpxCampsiteImportFile('camps.gpx', 1024, 'application/gpx+xml').ok,
    true,
    'GPX content type should pass.',
  );
  assert.strictEqual(
    validateGpxCampsiteImportFile('camps.kml', 1024).ok,
    false,
    'Only .gpx files should be accepted for campsite imports.',
  );
  assert.strictEqual(
    validateGpxCampsiteImportFile('camps.gpx', 1024, 'application/json').ok,
    false,
    'Non-GPX content types should be rejected even when extension is GPX.',
  );
  assert.strictEqual(
    validateGpxCampsiteImportFile('camps.gpx', MAX_CAMPSITE_GPX_IMPORT_BYTES + 1).ok,
    false,
    'Oversized GPX uploads should be rejected.',
  );

  const imported = parseGpxCampsiteCandidates('camps.gpx', waypointGpx);
  assert.strictEqual(imported.candidates.length, 2, 'Valid GPX waypoints should become candidates.');
  assert.strictEqual(imported.candidates[0].name, 'Ridge Camp');
  assert.strictEqual(imported.candidates[0].source_type, 'gpx_waypoint');
  assert.strictEqual(imported.candidates[0].description, 'Flat durable pullout near route.');
  assert.strictEqual(imported.candidates[0].elevation_m, 425);
  assert.strictEqual(imported.candidates[0].recorded_at, '2026-04-20T12:00:00Z');
  assert.strictEqual(imported.routeCount, 0);
  assert.strictEqual(imported.trackCount, 0);
  assert.strictEqual(imported.metadataDescription, 'Waypoint import test');

  const imported10 = parseGpxCampsiteCandidates('camps-v10.gpx', gpx10Waypoint);
  assert.strictEqual(imported10.candidates.length, 1, 'GPX 1.0 waypoints should parse.');

  assert.throws(
    () => parseGpxCampsiteCandidates('bad.gpx', '<not-gpx />'),
    /Invalid GPX/,
    'Invalid GPX content should be rejected.',
  );
  assert.throws(
    () => parseGpxCampsiteCandidates('bad.gpx', '<gpx><wpt lat="1" lon="2"></gpx>'),
    /malformed/,
    'Malformed XML should be rejected.',
  );
  assert.throws(
    () =>
      parseGpxCampsiteCandidates(
        'xxe.gpx',
        '<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><gpx><wpt lat="1" lon="2"><name>&xxe;</name></wpt></gpx>',
      ),
    /External entities|DOCTYPE/,
    'XXE and entity expansion payloads should be rejected.',
  );

  const routeOnly = parseGpxCampsiteCandidates('route-only.gpx', routeTrackOnlyGpx);
  assert.strictEqual(
    routeOnly.candidates.length,
    0,
    'Route and track points must not automatically become campsite candidates.',
  );
  assert.strictEqual(routeOnly.routeCount, 1);
  assert.strictEqual(routeOnly.trackCount, 1);
  assert.strictEqual(routeOnly.routePointCount, 2);
  assert.strictEqual(routeOnly.trackPointCount, 2);
  assert.strictEqual(routeOnly.routes.length, 1, 'Route geometry preview should be retained privately for manual selection.');
  assert.strictEqual(routeOnly.tracks.length, 1, 'Track geometry preview should be retained privately for manual selection.');

  const gpxBackend = new MemoryGpxImportBackend();
  const gpxService = new GpxCampsiteImportService(gpxBackend);
  const upload = await gpxService.uploadGpxImport({
    name: '../My <Camp> Candidates.gpx',
    type: 'application/gpx+xml',
    content: waypointGpx,
  });
  assert.strictEqual(upload.ok, true, 'Valid GPX upload should create an import record.');
  assert.strictEqual(upload.data.importRecord.parser_version, CAMPSITE_GPX_IMPORT_PARSER_VERSION);
  assert.strictEqual(upload.data.importRecord.raw_file_retention, DEFAULT_GPX_RAW_FILE_RETENTION);
  assert.strictEqual(upload.data.importRecord.waypoint_count, 2);
  assert.strictEqual(upload.data.importRecord.route_count, 0);
  assert.strictEqual(upload.data.importRecord.track_count, 0);
  assert.strictEqual(upload.data.candidates[0].candidate_type, 'waypoint');
  assert.strictEqual(
    upload.data.importRecord.original_filename.includes('<'),
    false,
    'Original filenames should be sanitized before storage.',
  );
  assert.strictEqual(upload.data.candidates.length, 2);
  assert.strictEqual(upload.data.candidates[0].selected_for_save, false);
  assert.strictEqual(upload.data.candidates[0].selected_for_community_submission, false);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(upload.data.importRecord, 'user_id'),
    false,
    'Public import responses should not expose user_id.',
  );
  const duplicateUpload = await gpxService.uploadGpxImport({
    name: 'duplicate.gpx',
    type: 'application/gpx+xml',
    content: waypointGpx,
    client_import_id: 'offline-import-1',
  });
  assert.strictEqual(duplicateUpload.ok, true);
  const duplicateUploadRetry = await gpxService.uploadGpxImport({
    name: 'duplicate.gpx',
    type: 'application/gpx+xml',
    content: waypointGpx,
    client_import_id: 'offline-import-1',
  });
  assert.strictEqual(duplicateUploadRetry.ok, true);
  assert.strictEqual(
    duplicateUploadRetry.data.importRecord.id,
    duplicateUpload.data.importRecord.id,
    'Duplicate GPX upload with the same client_import_id should return the existing import.',
  );
  assert.strictEqual(
    gpxBackend.imports.filter((item) => item.client_import_id === 'offline-import-1').length,
    1,
    'client_import_id retries must not create duplicate GPX imports.',
  );

  const routeUpload = await gpxService.uploadGpxImport({
    name: 'route-only.gpx',
    type: 'application/gpx+xml',
    content: routeTrackOnlyGpx,
  });
  assert.strictEqual(routeUpload.ok, true, 'Route/track GPX should create an import summary.');
  assert.strictEqual(
    routeUpload.data.candidates.length,
    0,
    'Route/track GPX should not create candidates from every geometry point.',
  );
  assert.ok(
    Array.isArray(routeUpload.data.importRecord.metadata.route_geometry) &&
      Array.isArray(routeUpload.data.importRecord.metadata.track_geometry),
    'Route/track geometry preview should be stored privately on the import record.',
  );
  const routeCandidate = await gpxService.createGpxCandidateFromMapSelection(
    routeUpload.data.importRecord.id,
    {
      latitude: 38.15,
      longitude: -121.15,
      candidate_type: 'route_selected_point',
      name: 'Manual route camp',
      source_route_name: 'Route',
    },
  );
  assert.strictEqual(routeCandidate.ok, true, 'Owner should create route-selected GPX candidate.');
  assert.strictEqual(routeCandidate.data.candidate_type, 'route_selected_point');
  assert.strictEqual(routeCandidate.data.source_route_name, 'Route');
  const trackCandidate = await gpxService.createGpxCandidateFromMapSelection(
    routeUpload.data.importRecord.id,
    {
      latitude: 38.35,
      longitude: -121.35,
      candidate_type: 'track_selected_point',
      name: 'Manual track camp',
      source_track_name: 'Track',
      source_segment_index: 0,
    },
  );
  assert.strictEqual(trackCandidate.ok, true, 'Owner should create track-selected GPX candidate.');
  assert.strictEqual(trackCandidate.data.candidate_type, 'track_selected_point');
  assert.strictEqual(trackCandidate.data.source_segment_index, 0);
  const invalidCandidate = await gpxService.createGpxCandidateFromMapSelection(
    routeUpload.data.importRecord.id,
    {
      latitude: 95,
      longitude: -121.35,
      candidate_type: 'route_selected_point',
    },
  );
  assert.strictEqual(invalidCandidate.ok, false, 'Invalid route/track candidate coordinates should be rejected.');
  assert.strictEqual(
    gpxBackend.candidates.length,
    6,
    'Creating route/track import candidates should only add private GPX candidates.',
  );

  const importId = upload.data.importRecord.id;
  const ownerCandidates = await gpxService.listGpxImportCandidates(importId);
  assert.strictEqual(ownerCandidates.ok, true);
  assert.strictEqual(ownerCandidates.data.length, 2);
  gpxBackend.currentUser = { id: 'user-2' };
  const otherUserCandidates = await gpxService.listGpxImportCandidates(importId);
  assert.strictEqual(
    otherUserCandidates.ok,
    false,
    'Imported candidates should be private to the owner.',
  );
  const otherUserRouteCandidate = await gpxService.createGpxCandidateFromMapSelection(
    routeUpload.data.importRecord.id,
    {
      latitude: 38.2,
      longitude: -121.2,
      candidate_type: 'route_selected_point',
    },
  );
  assert.strictEqual(
    otherUserRouteCandidate.ok,
    false,
    'Non-owners should not create candidates on another user GPX import.',
  );
  gpxBackend.currentUser = { id: 'user-1' };
  const deleted = await gpxService.deleteGpxImport(importId);
  assert.strictEqual(deleted.ok, true, 'Owner should be able to delete their GPX import.');
  const afterDelete = await gpxService.getMyGpxImport(importId);
  assert.strictEqual(afterDelete.ok, false, 'Deleted imports should not be returned to the owner list/detail APIs.');

  const backend = new MemoryBackend();
  const service = new CampsiteRecommendationService(backend);
  const privatePayload = buildCampsiteReportInputFromGpxCandidate(
    imported.candidates[0],
    'private',
  );
  const privateResult = await service.createCampsiteReport(privatePayload);
  assert.strictEqual(privateResult.ok, true, 'Selected GPX waypoint should save privately.');
  assert.strictEqual(privateResult.data.source_type, 'gpx_waypoint');
  assert.strictEqual(privateResult.data.moderation_status, 'private_saved');
  assert.strictEqual(
    backend.reports.length,
    1,
    'Uploading GPX imports must not create campsite reports automatically.',
  );

  const communityMissingAck = await service.createCampsiteReport(
    buildCampsiteReportInputFromGpxCandidate(imported.candidates[1], 'community'),
  );
  assert.strictEqual(
    communityMissingAck.ok,
    false,
    'Community GPX waypoint submissions should require acknowledgements.',
  );

  const communityResult = await service.createCampsiteReport(
    buildCampsiteReportInputFromGpxCandidate(imported.candidates[1], 'community', {
      stewardship_acknowledged: true,
      sensitive_area_acknowledged: true,
    }),
  );
  assert.strictEqual(
    communityResult.ok,
    true,
    'Acknowledged GPX waypoint community submission should be accepted.',
  );
  assert.strictEqual(communityResult.data.moderation_status, 'pending');

  const privateRouteResult = await service.createCampsiteReport(
    buildCampsiteReportInputFromGpxCandidate(
      gpxImportCandidateToCampsiteCandidate(routeCandidate.data),
      'private',
    ),
  );
  assert.strictEqual(privateRouteResult.ok, true, 'Selected route candidate should become a private report.');
  assert.strictEqual(privateRouteResult.data.source_type, 'gpx_route');

  const communityTrackResult = await service.createCampsiteReport(
    buildCampsiteReportInputFromGpxCandidate(
      gpxImportCandidateToCampsiteCandidate(trackCandidate.data),
      'community',
      {
        stewardship_acknowledged: true,
        sensitive_area_acknowledged: true,
      },
    ),
  );
  assert.strictEqual(
    communityTrackResult.ok,
    true,
    'Selected track candidate should enter community review as an acknowledged submission.',
  );
  assert.strictEqual(communityTrackResult.data.source_type, 'gpx_track_selected_point');
  assert.strictEqual(communityTrackResult.data.moderation_status, 'pending');
}

main()
  .then(() => {
    console.log('GPX campsite import checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
