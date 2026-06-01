const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

process.env.EXPO_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

const storage = new Map();
global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

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
  clearOfflineGpxImportsForTest,
  getOfflineGpxImports,
  saveGpxCandidateAsOfflineCampsiteDraft,
  submitGpxImportOfflineSafe,
  syncOfflineGpxImports,
} = require(path.join(root, 'lib', 'campsites', 'gpxCampsiteOfflineQueue.ts'));
const {
  clearOfflineCampsiteSubmissionsForTest,
  getOfflineCampsiteSubmissions,
  syncOfflineCampsiteSubmissions,
} = require(path.join(root, 'lib', 'campsites', 'campsiteOfflineQueue.ts'));
const {
  parseGpxCampsiteCandidates,
} = require(path.join(root, 'lib', 'campsites', 'gpxCampsiteImport.ts'));
const {
  filterRenderableCommunityCampSites,
} = require(path.join(root, 'lib', 'campsites', 'communityCampsiteMapLayer.ts'));

const waypointGpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="ECS Offline Test">
  <wpt lat="38.7807" lon="-121.2076">
    <name>Offline Ridge Camp</name>
    <desc>Private candidate from offline GPX.</desc>
  </wpt>
</gpx>`;

class FakeGpxImportService {
  constructor() {
    this.calls = 0;
    this.importsByClientId = new Map();
  }

  async uploadGpxImport(file) {
    this.calls += 1;
    const clientId = file.client_import_id;
    if (clientId && this.importsByClientId.has(clientId)) {
      return { ok: true, data: this.importsByClientId.get(clientId) };
    }
    const parsed = parseGpxCampsiteCandidates(file.name, file.content);
    const result = {
      importRecord: {
        id: `import-${this.importsByClientId.size + 1}`,
        client_import_id: clientId,
        original_filename: file.name,
        file_size_bytes: file.size ?? file.content.length,
        parser_version: 'test-parser',
        waypoint_count: parsed.waypointCount,
        route_count: parsed.routeCount,
        track_count: parsed.trackCount,
        status: 'parsed',
        raw_file_retention: 'delete_after_parse',
        metadata: {
          metadata_name: parsed.parsedName,
          metadata_description: parsed.metadataDescription,
          route_point_count: parsed.routePointCount,
          track_point_count: parsed.trackPointCount,
          route_geometry: parsed.routes,
          track_geometry: parsed.tracks,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      candidates: parsed.candidates.map((candidate, index) => ({
        id: `candidate-${index + 1}`,
        gpx_import_id: `import-${this.importsByClientId.size + 1}`,
        candidate_type: candidate.candidate_type,
        name: candidate.name,
        description: candidate.description,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        elevation_m: candidate.elevation_m,
        recorded_at: candidate.recorded_at,
        source_route_name: null,
        source_track_name: null,
        source_segment_index: null,
        selected_for_save: false,
        selected_for_community_submission: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    };
    if (clientId) this.importsByClientId.set(clientId, result);
    return { ok: true, data: result };
  }
}

class FakeCampsiteService {
  constructor() {
    this.reportsByClientId = new Map();
  }

  async createCampsiteReport(input) {
    const clientId = input.client_submission_id;
    if (clientId && this.reportsByClientId.has(clientId)) {
      return { ok: true, data: this.reportsByClientId.get(clientId) };
    }
    const report = {
      id: `report-${this.reportsByClientId.size + 1}`,
      camp_site_id: null,
      latitude: input.latitude,
      longitude: input.longitude,
      source_type: input.source_type,
      location_accuracy_m: input.location_accuracy_m ?? null,
      user_stayed_here: input.user_stayed_here,
      verified_in_person: input.verified_in_person,
      visited_at: input.visited_at ?? null,
      site_type: input.site_type,
      access_difficulty: input.access_difficulty,
      vehicle_fit: input.vehicle_fit,
      amenities: input.amenities,
      conditions: input.conditions,
      notes: input.notes,
      visibility_requested: input.visibility_requested,
      moderation_status: input.visibility_requested === 'community' ? 'pending' : 'private_saved',
      stewardship_acknowledged: input.stewardship_acknowledged,
      sensitive_area_acknowledged: input.sensitive_area_acknowledged,
      client_submission_id: clientId,
      review_state: input.visibility_requested === 'community' ? 'submitted' : 'private_saved',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (clientId) this.reportsByClientId.set(clientId, report);
    return { ok: true, data: report };
  }
}

async function main() {
  clearOfflineGpxImportsForTest();
  clearOfflineCampsiteSubmissionsForTest();

  const gpxService = new FakeGpxImportService();
  const queued = await submitGpxImportOfflineSafe(
    {
      name: 'offline-camps.gpx',
      type: 'application/gpx+xml',
      size: waypointGpx.length,
      content: waypointGpx,
      client_import_id: 'gpx-offline-1',
    },
    { service: gpxService, online: false },
  );
  assert.strictEqual(queued.ok, true);
  assert.strictEqual(queued.mode, 'queued');
  assert.strictEqual(queued.importItem.status, 'parsed_locally', 'Offline GPX should parse locally when content is available.');
  assert.strictEqual(queued.importItem.parsed_import.candidates.length, 1);
  assert.strictEqual(gpxService.calls, 0, 'Offline GPX selection should not call upload immediately.');
  assert.strictEqual(getOfflineGpxImports().length, 1, 'Offline GPX selection should store a local import.');

  const publicVisible = filterRenderableCommunityCampSites([]);
  assert.deepStrictEqual(publicVisible, [], 'Offline GPX import must not create public campsite records automatically.');

  const firstSync = await syncOfflineGpxImports({ service: gpxService });
  assert.deepStrictEqual(firstSync, { uploaded: 1, failed: 0, remaining: 0 });
  assert.strictEqual(gpxService.calls, 1, 'Reconnect should upload GPX once.');
  assert.strictEqual(getOfflineGpxImports()[0].status, 'uploaded');

  const duplicateSync = await syncOfflineGpxImports({ service: gpxService });
  assert.deepStrictEqual(duplicateSync, { uploaded: 0, failed: 0, remaining: 0 });
  assert.strictEqual(gpxService.calls, 1, 'Uploaded GPX imports should not be uploaded again.');

  const duplicateDirect = await gpxService.uploadGpxImport({
    name: 'offline-camps.gpx',
    type: 'application/gpx+xml',
    size: waypointGpx.length,
    content: waypointGpx,
    client_import_id: 'gpx-offline-1',
  });
  assert.strictEqual(duplicateDirect.ok, true);
  assert.strictEqual(duplicateDirect.data.importRecord.id, 'import-1', 'Duplicate upload returns existing import.');
  assert.strictEqual(gpxService.importsByClientId.size, 1, 'Duplicate import id must not create duplicate imports.');

  const candidate = queued.importItem.parsed_import.candidates[0];
  const privateDraft = saveGpxCandidateAsOfflineCampsiteDraft(candidate, 'private');
  assert.strictEqual(privateDraft.status, 'saved_locally');
  assert.strictEqual(privateDraft.input.source_type, 'gpx_waypoint');
  assert.strictEqual(privateDraft.input.visibility_requested, 'private');

  const communityDraft = saveGpxCandidateAsOfflineCampsiteDraft(candidate, 'community', {
    stewardship_acknowledged: true,
    sensitive_area_acknowledged: true,
    user_stayed_here: false,
    verified_in_person: false,
  });
  assert.strictEqual(communityDraft.input.visibility_requested, 'community');
  assert.strictEqual(getOfflineCampsiteSubmissions().length, 2);

  const campsiteService = new FakeCampsiteService();
  const synced = await syncOfflineCampsiteSubmissions({ service: campsiteService });
  assert.strictEqual(synced.submitted, 2);
  const communityItem = getOfflineCampsiteSubmissions().find(
    (item) => item.input.visibility_requested === 'community',
  );
  assert.strictEqual(communityItem.status, 'submitted');
  assert.strictEqual(communityItem.server_moderation_status, 'pending');
  assert.strictEqual(communityItem.server_review_state, 'submitted');
}

main()
  .then(() => {
    console.log('GPX campsite offline import checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
