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
  CampsiteLandUseReviewService,
  sanitizeLandUseReviewResult,
} = require(path.join(root, 'lib', 'campsites', 'campsiteLandUseReviewService.ts'));
const {
  CampsiteTriageService,
} = require(path.join(root, 'lib', 'campsites', 'campsiteTriageService.ts'));
const {
  DEFAULT_CAMPSITE_REVIEW_CONFIG,
} = require(path.join(root, 'lib', 'campsites', 'campsiteReviewConfig.ts'));
const {
  filterRenderableCommunityCampSites,
} = require(path.join(root, 'lib', 'campsites', 'communityCampsiteMapLayer.ts'));
const {
  validateLandUseReviewResultRecord,
} = require(path.join(root, 'lib', 'campsites', 'campsiteRecommendationTypes.ts'));

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

function createMatch(overrides = {}) {
  return {
    layerType: 'private_land',
    layerId: 'parcel-123',
    label: 'Private parcel exact layer',
    effect: 'block',
    sensitivity: 'restricted',
    provider: 'test-provider',
    distanceMeters: 0,
    publicReason: 'Potential private land or access uncertainty',
    details: { owner_hint: 'redacted in reviewer view' },
    ...overrides,
  };
}

class MemoryLandUseBackend {
  constructor(reports = []) {
    this.available = true;
    this.reports = reports;
    this.results = [];
  }

  isAvailable() {
    return this.available;
  }

  async insertReviewResult(row) {
    const result = {
      ...row,
      id: `land-use-${this.results.length + 1}`,
      created_at: nowIso(),
      deleted_at: null,
    };
    this.results.push(result);
    return { ok: true, data: result };
  }

  async updateReport(reportId, changes) {
    const index = this.reports.findIndex((report) => report.id === reportId);
    if (index < 0) return { ok: false, code: 'not_found', error: 'Report not found.' };
    this.reports[index] = { ...this.reports[index], ...changes, updated_at: nowIso() };
    return { ok: true, data: this.reports[index] };
  }

  async getLatestReviewResult(reportId) {
    const results = this.results.filter((result) => result.camp_site_report_id === reportId);
    return { ok: true, data: results.at(-1) ?? null };
  }
}

class MemoryTriageBackend {
  constructor(reports = []) {
    this.currentUser = { id: 'admin-1', isAdmin: true };
    this.reports = reports;
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
    return report ? { ok: true, data: report } : { ok: false, code: 'not_found', error: 'Report not found.' };
  }

  async updateReport(reportId, changes) {
    const index = this.reports.findIndex((item) => item.id === reportId);
    if (index < 0) return { ok: false, code: 'not_found', error: 'Report not found.' };
    this.reports[index] = { ...this.reports[index], ...changes, updated_at: nowIso() };
    return { ok: true, data: this.reports[index] };
  }

  async listDuplicateCandidates() {
    return { ok: true, data: [] };
  }

  async countRecentCommunityReportsByUser() {
    return { ok: true, data: 1 };
  }

  async countRejectedReportsByUser() {
    return { ok: true, data: 0 };
  }

  async insertReviewEvent(row) {
    const event = { ...row, id: `event-${this.events.length + 1}`, created_at: nowIso() };
    this.events.push(event);
    return { ok: true, data: event };
  }
}

function provider(key, matches = [], options = {}) {
  return {
    key,
    async reviewPoint() {
      return {
        providerVersion: options.providerVersion ?? 'test-provider-v1',
        unavailable: options.unavailable ?? false,
        warnings: options.warnings ?? [],
        matches,
      };
    },
  };
}

async function reviewWith(matches, config = {}, providerKey = 'private_land') {
  const report = createReport();
  const reports = [report];
  const backend = new MemoryLandUseBackend(reports);
  const service = new CampsiteLandUseReviewService(backend, [provider(providerKey, matches)], config);
  const result = await service.reviewCampSiteReport(report);
  assert.strictEqual(result.ok, true);
  return { result: result.data, backend, reports };
}

async function main() {
  const noProviderReport = createReport();
  const noProviderBackend = new MemoryLandUseBackend([noProviderReport]);
  const noProviderService = new CampsiteLandUseReviewService(noProviderBackend, []);
  const unavailable = await noProviderService.reviewCampSiteReport(noProviderReport);
  assert.strictEqual(unavailable.ok, true);
  assert.strictEqual(unavailable.data.status, 'unknown', 'Unavailable providers should return unknown.');
  assert.ok(unavailable.data.warnings.some((warning) => warning.includes('provider unavailable')));
  assert.strictEqual(noProviderBackend.results.length, 1, 'Unavailable result should be stored.');
  assert.strictEqual(
    validateLandUseReviewResultRecord(unavailable.data).ok,
    true,
    'Stored land-use review records should pass model validation.',
  );

  const privateBlocked = await reviewWith([createMatch()]);
  assert.strictEqual(privateBlocked.result.status, 'blocked', 'Private land should block by default.');
  assert.ok(privateBlocked.result.blocking_reasons.includes('Potential private land or access uncertainty'));
  assert.strictEqual(
    privateBlocked.reports[0].triage_summary.land_use_status,
    'blocked',
    'Stored result should be summarized into report triage summary.',
  );

  const privateWarn = await reviewWith([createMatch()], { blockPrivateLandMatches: false });
  assert.strictEqual(privateWarn.result.status, 'warning', 'Private land can warn when config does not block it.');
  assert.strictEqual(privateWarn.result.blocking_reasons.length, 0);
  assert.ok(privateWarn.result.warnings.includes('Potential private land or access uncertainty'));

  const sensitive = await reviewWith([
    createMatch({
      layerType: 'sensitive_habitat_cultural',
      label: 'Sensitive cultural resource layer',
      sensitivity: 'sensitive',
      publicReason: 'Potential sensitive or restricted area',
    }),
  ], {}, 'sensitive_area');
  assert.strictEqual(sensitive.result.status, 'blocked', 'Sensitive matches should block.');

  const warning = await reviewWith([
    createMatch({
      layerType: 'protected_area',
      label: 'Protected area advisory',
      effect: 'warn',
      sensitivity: 'restricted',
      publicReason: 'Potential managed-area restriction; verify camping rules.',
    }),
  ], {}, 'protected_area');
  assert.strictEqual(warning.result.status, 'warning', 'Warning layers should create warning results.');

  const sharedReports = [createReport()];
  const landUseBackend = new MemoryLandUseBackend(sharedReports);
  const landUseService = new CampsiteLandUseReviewService(landUseBackend, [provider('private_land', [createMatch()])]);
  const triageBackend = new MemoryTriageBackend(sharedReports);
  const triageService = new CampsiteTriageService(
    triageBackend,
    DEFAULT_CAMPSITE_REVIEW_CONFIG,
    landUseService,
  );
  const triage = await triageService.runTriage(sharedReports[0].id);
  assert.strictEqual(triage.ok, true);
  assert.strictEqual(sharedReports[0].review_state, 'auto_triage_failed', 'Blocked land-use review should block triage.');
  assert.strictEqual(sharedReports[0].triage_summary.land_use_status, 'blocked');
  assert.strictEqual(
    sharedReports[0].triage_summary.land_use_review.status,
    'blocked',
    'Triage summary should include land-use result.',
  );

  const reviewerSafe = sanitizeLandUseReviewResult(sensitive.result, 'reviewer');
  const moderatorFull = sanitizeLandUseReviewResult(sensitive.result, 'moderator');
  assert.strictEqual(reviewerSafe.public_reason, 'Potential sensitive or restricted area');
  assert.ok(
    !JSON.stringify(reviewerSafe.matched_layers).includes('Sensitive cultural resource layer'),
    'Reviewer-safe land-use details should not expose exact sensitive layer names.',
  );
  assert.ok(
    JSON.stringify(moderatorFull.matched_layers).includes('Sensitive cultural resource layer'),
    'Moderator land-use details should include exact matched layer details.',
  );

  const publicVisible = filterRenderableCommunityCampSites([
    {
      id: 'approved-public',
      canonical_name: null,
      latitude: 38,
      longitude: -121,
      status: 'approved',
      visibility: 'community',
      site_type: 'established_dispersed',
      access_difficulty: 'high_clearance',
      vehicle_fit: [],
      trailer_friendly: null,
      max_rig_length_ft: null,
      max_group_size: null,
      amenities: {},
      conditions: {},
      trust_score: 70,
      legal_confidence: 'medium',
      last_confirmed_at: null,
      confirmation_count: 0,
      flag_count: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: 'hidden-sensitive',
      canonical_name: null,
      latitude: 38,
      longitude: -121,
      status: 'hidden',
      visibility: 'community',
      site_type: 'established_dispersed',
      access_difficulty: 'high_clearance',
      vehicle_fit: [],
      trailer_friendly: null,
      max_rig_length_ft: null,
      max_group_size: null,
      amenities: {},
      conditions: {},
      trust_score: 0,
      legal_confidence: 'unknown',
      last_confirmed_at: null,
      confirmation_count: 0,
      flag_count: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ]);
  assert.deepStrictEqual(
    publicVisible.map((site) => site.id),
    ['approved-public'],
    'Public map filtering should exclude hidden/sensitive records.',
  );

  const recommendationSource = fs.readFileSync(
    path.join(root, 'lib', 'campsites', 'campsiteRecommendationService.ts'),
    'utf8',
  );
  assert.ok(
    recommendationSource.includes(".eq('status', 'approved')") &&
      recommendationSource.includes(".eq('visibility', 'community')"),
    'Public campsite endpoints should only query approved community campsites.',
  );

  const configSource = fs.readFileSync(
    path.join(root, 'lib', 'campsites', 'campsiteLandUseReviewConfig.ts'),
    'utf8',
  );
  [
    'enabled',
    'blockPrivateLandMatches',
    'blockSensitiveMatches',
    'waterBufferMeters',
    'providers',
  ].forEach((key) => {
    assert.ok(configSource.includes(key), `campsiteLandUseReview.${key} should be configurable.`);
  });
}

main()
  .then(() => {
    console.log('Campsite land-use review checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
