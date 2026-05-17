const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const queuePath = path.join(root, 'lib', 'campsites', 'campsiteOfflineQueue.ts');

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
  clearOfflineCampsiteSubmissionsForTest,
  deleteOfflineCampsiteSubmissionDraft,
  getOfflineCampsiteSubmissions,
  getCampsiteOfflineStatusLabel,
  markOfflineCampsiteSubmissionForRetry,
  submitCampsiteReportOfflineSafe,
  syncOfflineCampsiteSubmissions,
  updateOfflineCampsiteSubmissionDraft,
} = require(queuePath);

class FakeCampsiteService {
  constructor() {
    this.calls = 0;
    this.fail = false;
    this.reportsByClientId = new Map();
  }

  async createCampsiteReport(input) {
    this.calls += 1;
    if (this.fail) return { ok: false, code: 'backend_error', error: 'Network unavailable' };

    const clientId = input.client_submission_id;
    if (clientId && this.reportsByClientId.has(clientId)) {
      return { ok: true, data: this.reportsByClientId.get(clientId) };
    }

    const now = new Date().toISOString();
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
      notes: input.notes ?? null,
      visibility_requested: input.visibility_requested,
      moderation_status:
        input.visibility_requested === 'community' ? 'pending' : 'private_saved',
      stewardship_acknowledged: input.stewardship_acknowledged,
      sensitive_area_acknowledged: input.sensitive_area_acknowledged,
      client_submission_id: clientId,
      review_state:
        input.visibility_requested === 'community' ? 'submitted' : 'private_saved',
      created_at: now,
      updated_at: now,
    };
    if (clientId) this.reportsByClientId.set(clientId, report);
    return { ok: true, data: report };
  }
}

function createInput(overrides = {}) {
  return {
    latitude: 38.78,
    longitude: -121.2,
    source_type: 'pin_drop',
    location_accuracy_m: 14,
    user_stayed_here: true,
    verified_in_person: true,
    visited_at: null,
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['full_size_truck'],
    amenities: { fire_ring: false },
    conditions: { cell_signal: 'weak' },
    notes: 'Offline campsite note.',
    visibility_requested: 'private',
    stewardship_acknowledged: false,
    sensitive_area_acknowledged: false,
    ...overrides,
  };
}

async function main() {
  clearOfflineCampsiteSubmissionsForTest();
  const service = new FakeCampsiteService();

  const queued = await submitCampsiteReportOfflineSafe(createInput(), {
    service,
    online: false,
    photoCount: 2,
    photoLocalRefs: ['local-photo-1', 'local-photo-2'],
  });
  assert.strictEqual(queued.ok, true);
  assert.strictEqual(queued.mode, 'queued');
  assert.strictEqual(service.calls, 0, 'Offline submissions should not call the API immediately.');

  let queue = getOfflineCampsiteSubmissions();
  assert.strictEqual(queue.length, 1, 'Offline form submission should create a local item.');
  assert.strictEqual(queue[0].status, 'saved_locally');
  assert.strictEqual(getCampsiteOfflineStatusLabel(queue[0].status), 'Saved locally');
  assert.strictEqual(queue[0].input.latitude, 38.78);
  assert.strictEqual(queue[0].input.source_type, 'pin_drop');
  assert.strictEqual(queue[0].photo_count, 2);
  assert.deepStrictEqual(queue[0].photo_local_refs, ['local-photo-1', 'local-photo-2']);
  assert.ok(queue[0].client_submission_id, 'Queued submissions need an idempotency key.');

  const edited = updateOfflineCampsiteSubmissionDraft(queue[0].client_submission_id, {
    notes: 'Edited while offline.',
  });
  assert.strictEqual(edited.input.notes, 'Edited while offline.', 'Unsynced drafts should be editable.');

  const deletedDraft = await submitCampsiteReportOfflineSafe(
    createInput({ client_submission_id: 'delete-me', notes: 'Draft to delete.' }),
    { service, online: false },
  );
  assert.strictEqual(deletedDraft.ok, true);
  assert.strictEqual(
    deleteOfflineCampsiteSubmissionDraft('delete-me'),
    true,
    'User can delete unsynced local drafts.',
  );
  assert.strictEqual(
    getOfflineCampsiteSubmissions().some((item) => item.client_submission_id === 'delete-me'),
    false,
  );

  let observedSyncing = false;
  const unsubscribe = require(queuePath).subscribeOfflineCampsiteSubmissions((items) => {
    observedSyncing ||= items.some((item) => item.status === 'syncing');
  });
  const firstSync = await syncOfflineCampsiteSubmissions({ service });
  unsubscribe();
  assert.deepStrictEqual(firstSync, { submitted: 1, failed: 0, remaining: 0 });
  assert.strictEqual(observedSyncing, true, 'Sync should expose a Syncing local status.');
  assert.strictEqual(service.calls, 1, 'Reconnect sync should submit once.');
  queue = getOfflineCampsiteSubmissions();
  assert.strictEqual(queue[0].status, 'submitted');
  assert.strictEqual(queue[0].submitted_report_id, 'report-1');
  assert.strictEqual(queue[0].input.notes, 'Edited while offline.');
  assert.strictEqual(
    deleteOfflineCampsiteSubmissionDraft(queue[0].client_submission_id),
    false,
    'Synced submissions should not be deleted as unsynced drafts.',
  );

  const duplicateSync = await syncOfflineCampsiteSubmissions({ service });
  assert.deepStrictEqual(duplicateSync, { submitted: 0, failed: 0, remaining: 0 });
  assert.strictEqual(
    service.calls,
    1,
    'Already-submitted local items should not be resubmitted on later retries.',
  );

  const failingService = new FakeCampsiteService();
  failingService.fail = true;
  const queuedForRetry = await submitCampsiteReportOfflineSafe(
    createInput({ client_submission_id: 'retry-client-1', notes: 'Retry me.' }),
    { service: failingService, online: false },
  );
  assert.strictEqual(queuedForRetry.ok, true);
  assert.strictEqual(queuedForRetry.mode, 'queued');

  const failedSync = await syncOfflineCampsiteSubmissions({ service: failingService });
  assert.strictEqual(failedSync.failed, 1, 'Failed sync should be tracked.');
  queue = getOfflineCampsiteSubmissions();
  const retryItem = queue.find((item) => item.client_submission_id === 'retry-client-1');
  assert.strictEqual(retryItem.status, 'sync_failed');
  assert.strictEqual(retryItem.retry_count, 1);
  assert.strictEqual(markOfflineCampsiteSubmissionForRetry('retry-client-1').status, 'waiting_to_sync');

  failingService.fail = false;
  const retrySync = await syncOfflineCampsiteSubmissions({ service: failingService });
  assert.strictEqual(retrySync.submitted, 1, 'Failed sync can be retried successfully.');
  queue = getOfflineCampsiteSubmissions();
  const submittedRetryItem = queue.find((item) => item.client_submission_id === 'retry-client-1');
  assert.strictEqual(submittedRetryItem.status, 'submitted');

  const retryAgain = await syncOfflineCampsiteSubmissions({ service: failingService });
  assert.deepStrictEqual(retryAgain, { submitted: 0, failed: 0, remaining: 0 });
  assert.strictEqual(
    failingService.reportsByClientId.size,
    1,
    'Duplicate retries must not create duplicate reports.',
  );

  const communityService = new FakeCampsiteService();
  const communityQueued = await submitCampsiteReportOfflineSafe(
    createInput({
      client_submission_id: 'community-client-1',
      visibility_requested: 'community',
      stewardship_acknowledged: true,
      sensitive_area_acknowledged: true,
    }),
    { service: communityService, online: false },
  );
  assert.strictEqual(communityQueued.ok, true);
  assert.strictEqual(communityQueued.submission.input.visibility_requested, 'community');
  const triaged = [];
  const communitySync = await syncOfflineCampsiteSubmissions({
    service: communityService,
    afterSubmit(report, submission) {
      if (submission.input.visibility_requested === 'community') {
        triaged.push(report.id);
      }
    },
  });
  assert.strictEqual(communitySync.submitted, 1);
  const communityItem = getOfflineCampsiteSubmissions().find(
    (item) => item.client_submission_id === 'community-client-1',
  );
  assert.strictEqual(communityItem.status, 'submitted');
  assert.strictEqual(communityItem.server_moderation_status, 'pending');
  assert.strictEqual(communityItem.server_review_state, 'submitted');
  assert.deepStrictEqual(triaged, ['report-1'], 'Community sync should allow triage/community review handoff.');

  console.log('Campsite offline queue checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
