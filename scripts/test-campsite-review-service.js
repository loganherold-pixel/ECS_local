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
  CampsiteReviewService,
} = require(path.join(root, 'lib', 'campsites', 'campsiteReviewService.ts'));

function nowIso() {
  return new Date().toISOString();
}

function createReport(overrides = {}) {
  const now = nowIso();
  return {
    id: overrides.id ?? `report-${Math.random().toString(36).slice(2)}`,
    camp_site_id: null,
    submitted_by_user_id: overrides.submitted_by_user_id ?? 'submitter-1',
    latitude: 38.7807,
    longitude: -121.2076,
    source_type: 'pin_drop',
    location_accuracy_m: 20,
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
    triage_score: 95,
    triage_summary: { status: 'pass' },
    community_review_started_at: null,
    community_review_completed_at: null,
    moderator_review_started_at: null,
    moderator_review_completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

class MemoryReviewBackend {
  constructor() {
    this.currentUser = { id: 'admin-1', isAdmin: true };
    this.reports = [];
    this.votes = [];
    this.events = [];
    this.sites = [];
    this.photos = [];
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

  async insertCampSite(row) {
    const site = {
      ...row,
      id: `site-${this.sites.length + 1}`,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.sites.push(site);
    return { ok: true, data: site };
  }

  async updatePhotosForReport() {
    return { ok: true, data: [] };
  }

  async countApprovedPhotosForReport() {
    return { ok: true, data: 0 };
  }

  async getReviewerProfile(userId) {
    return {
      ok: true,
      data: {
        id: `profile-${userId}`,
        user_id: userId,
        reviewer_status: this.currentUser?.isTrustedReviewer ? 'trusted' : 'none',
        review_region: null,
        review_count: 0,
        helpful_review_count: 0,
        rejected_review_count: 0,
        reputation_score: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    };
  }

  async getVoteForReviewer(reportId, reviewerUserId) {
    return {
      ok: true,
      data:
        this.votes.find(
          (vote) =>
            vote.camp_site_report_id === reportId &&
            vote.reviewer_user_id === reviewerUserId,
        ) ?? null,
    };
  }

  async insertReviewVote(row) {
    if (
      this.votes.some(
        (vote) =>
          vote.camp_site_report_id === row.camp_site_report_id &&
          vote.reviewer_user_id === row.reviewer_user_id,
      )
    ) {
      return { ok: false, code: 'backend_error', error: 'Duplicate vote.' };
    }
    const vote = {
      ...row,
      id: `vote-${this.votes.length + 1}`,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.votes.push(vote);
    return { ok: true, data: vote };
  }

  async updateReviewVote(voteId, changes) {
    const index = this.votes.findIndex((vote) => vote.id === voteId);
    if (index < 0) return { ok: false, code: 'not_found', error: 'Vote not found.' };
    this.votes[index] = { ...this.votes[index], ...changes, updated_at: nowIso() };
    return { ok: true, data: this.votes[index] };
  }

  async listReviewVotes(reportId) {
    return {
      ok: true,
      data: this.votes.filter((vote) => vote.camp_site_report_id === reportId),
    };
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

  async listCommunityReviewReports(limit) {
    return {
      ok: true,
      data: this.reports
        .filter((report) => ['community_review', 'moderator_review'].includes(report.review_state))
        .slice(0, limit),
    };
  }

  async listPhotosForReport(reportId) {
    return {
      ok: true,
      data: this.photos.filter((photo) => photo.camp_site_report_id === reportId),
    };
  }

  async listNearbyApprovedCampSites() {
    return { ok: true, data: this.sites };
  }
}

async function withReview(reportOverrides, callback, config) {
  const backend = new MemoryReviewBackend();
  const report = createReport(reportOverrides);
  backend.reports.push(report);
  const service = new CampsiteReviewService(backend, config);
  const start = await service.startCommunityReview(report.id);
  assert.strictEqual(start.ok, true, 'Admin should be able to start community review.');
  await callback({ backend, service, reportId: report.id });
}

async function cast(service, backend, reportId, userId, vote, confidence = 'medium') {
  backend.currentUser = { id: userId, isTrustedReviewer: true };
  return service.castReviewVote(reportId, {
    vote,
    confidence,
    reviewer_notes: ` ${vote} note\n `,
  });
}

async function main() {
  await withReview({}, async ({ backend, service, reportId }) => {
    assert.ok(
      backend.events.some((event) => event.event_type === 'community_review'),
      'Starting review should create a community_review event.',
    );

    backend.currentUser = { id: 'normal-1' };
    const normalVote = await service.castReviewVote(reportId, {
      vote: 'approve',
      confidence: 'high',
    });
    assert.strictEqual(normalVote.ok, false, 'Normal users cannot vote.');
    assert.strictEqual(normalVote.code, 'admin_required');

    backend.currentUser = { id: 'submitter-1', isTrustedReviewer: true };
    const ownVote = await service.castReviewVote(reportId, {
      vote: 'approve',
      confidence: 'high',
    });
    assert.strictEqual(ownVote.ok, false, 'Submitter cannot vote on their own report.');

    const firstVote = await cast(service, backend, reportId, 'reviewer-1', 'approve', 'high');
    assert.strictEqual(firstVote.ok, true, 'Trusted reviewer can vote.');
    assert.strictEqual(firstVote.data.vote.reviewer_notes, 'approve note');
    const changedVote = await cast(service, backend, reportId, 'reviewer-1', 'approve', 'medium');
    assert.strictEqual(changedVote.ok, true, 'Reviewer can change their one active vote.');
    assert.strictEqual(
      backend.votes.filter((vote) => vote.reviewer_user_id === 'reviewer-1').length,
      1,
      'One reviewer cannot create duplicate active votes.',
    );
    assert.ok(
      backend.events.some((event) => event.event_type === 'vote_changed'),
      'Vote changes should be logged.',
    );
  });

  await withReview({}, async ({ backend, service, reportId }) => {
    await cast(service, backend, reportId, 'reviewer-1', 'approve', 'high');
    await cast(service, backend, reportId, 'reviewer-2', 'approve', 'high');
    const third = await cast(service, backend, reportId, 'reviewer-3', 'approve', 'high');
    assert.strictEqual(third.ok, true);
    const report = backend.reports.find((item) => item.id === reportId);
    assert.strictEqual(
      report.review_state,
      'moderator_review',
      'Three trusted approve votes should move the report forward to moderator review by default.',
    );
    assert.strictEqual(report.moderation_status, 'pending');
    assert.strictEqual(backend.sites.length, 0, 'Community quorum should not publish without moderator approval by default.');
    assert.ok(
      backend.events.some((event) => event.event_type === 'community_approved'),
      'Community approval transition should be logged.',
    );
  });

  await withReview({}, async ({ backend, service, reportId }) => {
    const sensitive = await cast(service, backend, reportId, 'reviewer-1', 'sensitive', 'high');
    assert.strictEqual(sensitive.ok, true);
    assert.strictEqual(
      backend.reports.find((item) => item.id === reportId).review_state,
      'moderator_review',
      'High-confidence sensitive vote should escalate to moderator review.',
    );
  });

  await withReview({}, async ({ backend, service, reportId }) => {
    await cast(service, backend, reportId, 'reviewer-1', 'private_land', 'medium');
    await cast(service, backend, reportId, 'reviewer-2', 'closed_to_camping', 'medium');
    assert.strictEqual(
      backend.reports.find((item) => item.id === reportId).review_state,
      'community_rejected',
      'Two trusted legal/closure blockers should community reject the report.',
    );
    assert.ok(
      backend.events.some((event) => event.event_type === 'community_rejected'),
      'Community rejection should be logged.',
    );
  });

  await withReview({}, async ({ backend, service, reportId }) => {
    const duplicate = await cast(service, backend, reportId, 'reviewer-1', 'duplicate', 'medium');
    assert.strictEqual(duplicate.ok, true);
    assert.strictEqual(
      backend.reports.find((item) => item.id === reportId).review_state,
      'moderator_review',
      'Duplicate vote should escalate to moderator review.',
    );
  });

  await withReview({ triage_score: 50 }, async ({ backend, service, reportId }) => {
    await cast(service, backend, reportId, 'reviewer-1', 'approve', 'high');
    await cast(service, backend, reportId, 'reviewer-2', 'approve', 'high');
    await cast(service, backend, reportId, 'reviewer-3', 'approve', 'high');
    assert.strictEqual(
      backend.reports.find((item) => item.id === reportId).review_state,
      'moderator_review',
      'Unknown triage should prevent direct community publication.',
    );
    assert.strictEqual(backend.sites.length, 0);
  });

  await withReview({}, async ({ backend, service, reportId }) => {
    const queue = await service.listCommunityReviewQueue();
    assert.strictEqual(queue.ok, true);
    assert.strictEqual(queue.data.length, 1);
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(queue.data[0], 'submitted_by_user_id'),
      false,
      'Review queue should not expose submitter user id.',
    );
    const details = await service.getCommunityReviewReportDetails(reportId);
    assert.strictEqual(details.ok, true);
    assert.ok(details.data.vote_summary);
    assert.strictEqual(
      backend.sites.filter((site) => site.status === 'approved' && site.visibility === 'community').length,
      0,
      'Reports in community_review should not appear as public camp_sites.',
    );
  });
}

main()
  .then(() => {
    console.log('Campsite review service checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
