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
  CampsiteTriageService,
  evaluateCampsiteTriage,
} = require(path.join(root, 'lib', 'campsites', 'campsiteTriageService.ts'));
const {
  DEFAULT_CAMPSITE_REVIEW_CONFIG,
} = require(path.join(root, 'lib', 'campsites', 'campsiteReviewConfig.ts'));

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
    source_type: 'current_location',
    location_accuracy_m: 12,
    user_stayed_here: true,
    verified_in_person: true,
    visited_at: now,
    site_type: 'established_dispersed',
    access_difficulty: 'high_clearance',
    vehicle_fit: ['full_size_truck'],
    amenities: {},
    conditions: {},
    notes: 'Durable established campsite.',
    visibility_requested: 'community',
    moderation_status: 'pending',
    stewardship_acknowledged: true,
    sensitive_area_acknowledged: true,
    client_submission_id: null,
    review_state: 'submitted',
    triage_score: null,
    triage_summary: null,
    community_review_started_at: null,
    community_review_completed_at: null,
    moderator_review_started_at: null,
    moderator_review_completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

class MemoryTriageBackend {
  constructor() {
    this.currentUser = { id: 'admin-1', isAdmin: true };
    this.reports = [];
    this.duplicates = [];
    this.recentCount = 1;
    this.rejectedCount = 0;
    this.events = [];
  }

  isAvailable() {
    return true;
  }

  async getCurrentUser() {
    return this.currentUser;
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

  async listDuplicateCandidates() {
    return { ok: true, data: this.duplicates };
  }

  async countRecentCommunityReportsByUser() {
    return { ok: true, data: this.recentCount };
  }

  async countRejectedReportsByUser() {
    return { ok: true, data: this.rejectedCount };
  }

  async insertReviewEvent(row) {
    const event = { ...row, id: `event-${this.events.length + 1}`, created_at: nowIso() };
    this.events.push(event);
    return { ok: true, data: event };
  }
}

async function runWith(report, backendSetup) {
  const backend = new MemoryTriageBackend();
  backend.reports.push(report);
  backendSetup?.(backend);
  const service = new CampsiteTriageService(backend, DEFAULT_CAMPSITE_REVIEW_CONFIG);
  const result = await service.runTriage(report.id);
  return { backend, result };
}

async function main() {
  const invalidCoordinate = evaluateCampsiteTriage(
    createReport({ latitude: 0, longitude: 0 }),
    { recentCommunitySubmissionCount: 1, rejectedSubmissionCount: 0, landUseStatus: 'clear' },
  );
  assert.strictEqual(invalidCoordinate.triage_status, 'blocked', 'Null island should be blocked.');
  assert.strictEqual(invalidCoordinate.triage_summary.recommended_next_state, 'auto_triage_failed');

  const missingAck = evaluateCampsiteTriage(
    createReport({ stewardship_acknowledged: false }),
    { recentCommunitySubmissionCount: 1, rejectedSubmissionCount: 0, landUseStatus: 'clear' },
  );
  assert.strictEqual(missingAck.triage_status, 'blocked', 'Missing community acknowledgements should block.');

  const duplicate = evaluateCampsiteTriage(
    createReport(),
    {
      duplicateCandidates: [
        { id: 'site-1', source: 'camp_site', distance_meters: 42, status: 'approved' },
      ],
      recentCommunitySubmissionCount: 1,
      rejectedSubmissionCount: 0,
      landUseStatus: 'clear',
    },
  );
  assert.strictEqual(duplicate.triage_status, 'warning', 'Duplicate candidates should create warning triage.');
  assert.strictEqual(duplicate.triage_summary.recommended_next_state, 'moderator_review');

  const highConfidence = evaluateCampsiteTriage(
    createReport(),
    { recentCommunitySubmissionCount: 1, rejectedSubmissionCount: 0, landUseStatus: 'clear' },
  );
  assert.strictEqual(highConfidence.triage_status, 'passed', 'High-confidence current location should pass.');
  assert.strictEqual(highConfidence.triage_summary.recommended_next_state, 'community_review');

  const gpxWaypoint = evaluateCampsiteTriage(
    createReport({
      source_type: 'gpx_waypoint',
      user_stayed_here: false,
      verified_in_person: false,
      visited_at: null,
    }),
    { recentCommunitySubmissionCount: 1, rejectedSubmissionCount: 0, landUseStatus: 'clear' },
  );
  assert.strictEqual(gpxWaypoint.triage_status, 'warning', 'GPX waypoint without in-person confirmation should warn.');

  const gpxRouteUnselected = evaluateCampsiteTriage(
    createReport({
      source_type: 'gpx_route',
      conditions: {},
    }),
    { recentCommunitySubmissionCount: 1, rejectedSubmissionCount: 0, landUseStatus: 'clear' },
  );
  assert.strictEqual(gpxRouteUnselected.triage_status, 'blocked', 'Route-derived points require explicit selection.');

  const gpxRouteSelected = evaluateCampsiteTriage(
    createReport({
      source_type: 'gpx_route',
      conditions: { explicit_user_selection: true },
    }),
    { recentCommunitySubmissionCount: 1, rejectedSubmissionCount: 0, landUseStatus: 'clear' },
  );
  assert.strictEqual(gpxRouteSelected.triage_status, 'warning', 'Explicitly selected route-derived points still need review.');

  const privateSave = await runWith(createReport({
    visibility_requested: 'private',
    moderation_status: 'private_saved',
    review_state: 'private_saved',
  }));
  assert.strictEqual(privateSave.result.ok, true);
  assert.strictEqual(privateSave.result.data.triage_status, 'passed');
  assert.strictEqual(
    privateSave.backend.reports[0].triage_score,
    null,
    'Private saves should skip persisted community triage changes.',
  );

  const blocked = await runWith(createReport({ latitude: 0, longitude: 0 }));
  assert.strictEqual(blocked.result.ok, true);
  assert.strictEqual(blocked.backend.reports[0].review_state, 'auto_triage_failed');
  assert.strictEqual(blocked.backend.reports[0].moderation_status, 'pending');
  assert.ok(
    blocked.backend.events.some((event) => event.event_type === 'triage_failed'),
    'Blocked triage should log triage_failed.',
  );

  const warning = await runWith(createReport(), (backend) => {
    backend.duplicates = [
      { id: 'report-nearby', source: 'camp_site_report', distance_meters: 35, review_state: 'community_review' },
    ];
  });
  assert.strictEqual(warning.result.ok, true);
  assert.strictEqual(warning.backend.reports[0].review_state, 'moderator_review');
  assert.ok(
    warning.backend.reports[0].triage_summary.warnings.some((warningText) =>
      warningText.includes('Nearby campsite'),
    ),
    'Duplicate warning should be persisted in triage summary.',
  );

  const passed = await runWith(createReport(), (backend) => {
    backend.listDuplicateCandidates = async () => ({ ok: true, data: [] });
  });
  assert.strictEqual(passed.result.ok, true);
  assert.strictEqual(
    passed.backend.reports[0].review_state,
    'moderator_review',
    'Unavailable land-use hook keeps service-run triage in moderator review.',
  );
  assert.strictEqual(
    passed.backend.reports[0].camp_site_id,
    null,
    'Automated triage must not publish public campsite records.',
  );
  assert.ok(
    passed.backend.events.some((event) => event.event_type === 'triage_passed'),
    'Non-blocked triage should log triage_passed.',
  );

  const source = fs.readFileSync(path.join(root, 'lib', 'campsites', 'campsiteReviewConfig.ts'), 'utf8');
  for (const configKey of [
    'autoPublishAfterCommunityQuorum',
    'minTrustedApprovals',
    'duplicateRadiusMeters',
    'maxCommunitySubmissionsPerDay',
  ]) {
    assert.ok(source.includes(configKey), `${configKey} should be part of campsite review config.`);
  }
}

main()
  .then(() => {
    console.log('Campsite triage service checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
