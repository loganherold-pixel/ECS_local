const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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
  CampsiteSubmissionService,
} = require(path.join(root, 'lib', 'campsites', 'campsiteSubmissionService.ts'));

function nowIso() {
  return new Date().toISOString();
}

function createReport(overrides = {}) {
  const now = nowIso();
  return {
    id: overrides.id ?? `report-${Math.random().toString(36).slice(2)}`,
    camp_site_id: null,
    submitted_by_user_id: overrides.submitted_by_user_id ?? 'user-1',
    latitude: 38.7807,
    longitude: -121.2076,
    source_type: 'pin_drop',
    location_accuracy_m: 30,
    user_stayed_here: true,
    verified_in_person: true,
    visited_at: now,
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['full_size_truck'],
    amenities: {},
    conditions: {},
    notes: 'Original notes.',
    visibility_requested: 'community',
    moderation_status: 'pending',
    stewardship_acknowledged: true,
    sensitive_area_acknowledged: true,
    client_submission_id: null,
    review_state: 'community_review',
    triage_score: 90,
    triage_summary: { status: 'passed' },
    community_review_started_at: now,
    community_review_completed_at: null,
    moderator_review_started_at: null,
    moderator_review_completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

class MemorySubmissionBackend {
  constructor() {
    this.currentUser = { id: 'user-1' };
    this.reports = [];
    this.events = [];
  }

  isAvailable() {
    return true;
  }

  async getCurrentUser() {
    return this.currentUser;
  }

  async listReportsByUser(userId, limit) {
    return {
      ok: true,
      data: this.reports
        .filter((report) => report.submitted_by_user_id === userId)
        .slice(0, limit),
    };
  }

  async getReportById(reportId) {
    const report = this.reports.find((item) => item.id === reportId);
    return report
      ? { ok: true, data: report }
      : { ok: false, code: 'not_found', error: 'Report not found.' };
  }

  async updateReport(reportId, changes) {
    const index = this.reports.findIndex((item) => item.id === reportId);
    if (index < 0) return { ok: false, code: 'not_found', error: 'Report not found.' };
    this.reports[index] = { ...this.reports[index], ...changes, updated_at: nowIso() };
    return { ok: true, data: this.reports[index] };
  }

  async insertReviewEvent(row) {
    const event = {
      ...row,
      id: `event-${this.events.length + 1}`,
      created_at: nowIso(),
    };
    this.events.push(event);
    return { ok: true, data: event };
  }

  async listReviewEvents(reportId) {
    return {
      ok: true,
      data: this.events.filter((event) => event.camp_site_report_id === reportId),
    };
  }

  listCommunityReviewReports() {
    return this.reports.filter((report) =>
      ['community_review', 'moderator_review'].includes(report.review_state),
    );
  }
}

async function main() {
  const backend = new MemorySubmissionBackend();
  const service = new CampsiteSubmissionService(backend);
  const own = createReport({ id: 'own-community' });
  const other = createReport({ id: 'other-community', submitted_by_user_id: 'user-2' });
  backend.reports.push(own, other);

  const list = await service.listMyCampsiteSubmissions();
  assert.strictEqual(list.ok, true, 'User should list their own campsite submissions.');
  assert.deepStrictEqual(
    list.data.map((report) => report.id),
    ['own-community'],
    'User listing must not include another submitter reports.',
  );

  const otherDetail = await service.getMyCampsiteSubmission('other-community');
  assert.strictEqual(otherDetail.ok, false, 'User should not open another user submission.');
  assert.strictEqual(otherDetail.code, 'permission_denied');

  const updated = await service.updateMyCampsiteSubmission('own-community', {
    notes: ' Updated note with control\ncharacters ',
    vehicle_fit: ['van', 'van', 'full_size_truck'],
  });
  assert.strictEqual(updated.ok, true, 'User should edit allowed fields.');
  assert.strictEqual(backend.reports[0].notes, 'Updated note with control characters');
  assert.deepStrictEqual(backend.reports[0].vehicle_fit, ['van', 'full_size_truck']);
  assert.ok(
    backend.events.some((event) => event.event_type === 'submitter_updated'),
    'Allowed edits should write a submitter_updated review event.',
  );

  const protectedEdit = await service.updateMyCampsiteSubmission('own-community', {
    moderation_status: 'approved',
  });
  assert.strictEqual(protectedEdit.ok, false, 'Protected moderation fields must not be editable.');
  assert.strictEqual(protectedEdit.code, 'validation_error');
  assert.strictEqual(backend.reports[0].moderation_status, 'pending');

  const withdrawn = await service.withdrawMyCampsiteSubmission('own-community');
  assert.strictEqual(withdrawn.ok, true, 'User should withdraw before publication.');
  assert.strictEqual(backend.reports[0].review_state, 'withdrawn');
  assert.strictEqual(backend.reports[0].moderation_status, 'rejected');
  assert.ok(
    backend.events.some((event) => event.event_type === 'withdrawn'),
    'Withdraw should write a withdrawn review event.',
  );
  assert.deepStrictEqual(
    backend.listCommunityReviewReports().map((report) => report.id),
    ['other-community'],
    'Withdrawn submissions should leave the community review queue.',
  );

  const needsInfo = createReport({
    id: 'needs-info',
    review_state: 'needs_submitter_info',
    moderation_status: 'needs_info',
    community_review_started_at: nowIso(),
  });
  backend.reports.push(needsInfo);
  backend.events.push({
    id: 'event-needs-info',
    camp_site_report_id: 'needs-info',
    actor_user_id: 'reviewer-1',
    event_type: 'needs_info_requested',
    metadata: { reason: 'Please clarify vehicle fit.' },
    created_at: nowIso(),
  });

  const response = await service.respondToNeedsInfo('needs-info', {
    notes: 'Vehicle fit clarified.',
  });
  assert.strictEqual(response.ok, true, 'User should respond to needs-info requests.');
  assert.strictEqual(backend.reports.find((report) => report.id === 'needs-info').review_state, 'community_review');
  assert.strictEqual(backend.reports.find((report) => report.id === 'needs-info').moderation_status, 'pending');
  assert.ok(
    backend.events.some((event) => event.camp_site_report_id === 'needs-info' && event.event_type === 'needs_info_responded'),
    'Needs-info response should write a review event.',
  );

  const privateSave = createReport({
    id: 'private-save',
    visibility_requested: 'private',
    moderation_status: 'private_saved',
    review_state: 'private_saved',
    stewardship_acknowledged: false,
    sensitive_area_acknowledged: false,
  });
  backend.reports.push(privateSave);
  const missingAcks = await service.submitPrivateSaveToCommunity('private-save');
  assert.strictEqual(missingAcks.ok, false, 'Community submission requires acknowledgements.');
  const submitted = await service.submitPrivateSaveToCommunity('private-save', {
    stewardship_acknowledged: true,
    sensitive_area_acknowledged: true,
  });
  assert.strictEqual(submitted.ok, true, 'Private save can be submitted to community review with acknowledgements.');
  assert.strictEqual(backend.reports.find((report) => report.id === 'private-save').review_state, 'submitted');
  assert.strictEqual(backend.reports.find((report) => report.id === 'private-save').visibility_requested, 'community');

  console.log('campsite submission service tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
