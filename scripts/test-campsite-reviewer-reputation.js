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

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
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
    review_state: 'community_review',
    triage_score: 95,
    triage_summary: { status: 'pass' },
    community_review_started_at: now,
    community_review_completed_at: null,
    moderator_review_started_at: null,
    moderator_review_completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createProfile(userId, overrides = {}) {
  const now = nowIso();
  return {
    id: `profile-${userId}`,
    user_id: userId,
    reviewer_status: 'trusted',
    review_region: null,
    review_count: 0,
    helpful_review_count: 0,
    rejected_review_count: 0,
    reputation_score: 60,
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
    this.auditEvents = [];
    this.sites = [];
    this.profiles = new Map();
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
    const site = { ...row, id: `site-${this.sites.length + 1}`, created_at: nowIso(), updated_at: nowIso() };
    this.sites.push(site);
    return { ok: true, data: site };
  }

  async getReviewerProfile(userId) {
    return { ok: true, data: this.profiles.get(userId) ?? null };
  }

  async upsertReviewerProfile(userId, changes) {
    const current = this.profiles.get(userId) ?? createProfile(userId, { reviewer_status: 'none', reputation_score: 0 });
    const next = { ...current, ...changes, updated_at: nowIso() };
    this.profiles.set(userId, next);
    return { ok: true, data: next };
  }

  async updateReviewerProfile(userId, changes) {
    return this.upsertReviewerProfile(userId, changes);
  }

  async listReviewerProfiles(limit) {
    return { ok: true, data: Array.from(this.profiles.values()).slice(0, limit) };
  }

  async getVoteForReviewer(reportId, reviewerUserId) {
    return {
      ok: true,
      data:
        this.votes.find(
          (vote) => vote.camp_site_report_id === reportId && vote.reviewer_user_id === reviewerUserId,
        ) ?? null,
    };
  }

  async insertReviewVote(row) {
    const vote = { ...row, id: `vote-${this.votes.length + 1}`, created_at: nowIso(), updated_at: nowIso() };
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
    return { ok: true, data: this.votes.filter((vote) => vote.camp_site_report_id === reportId) };
  }

  async listReviewerVotes(reviewerUserId, limit) {
    return {
      ok: true,
      data: this.votes
        .filter((vote) => vote.reviewer_user_id === reviewerUserId)
        .slice(-limit)
        .reverse(),
    };
  }

  async listReviewerVotesSince(reviewerUserId, sinceIso) {
    const since = Date.parse(sinceIso);
    return {
      ok: true,
      data: this.votes.filter(
        (vote) => vote.reviewer_user_id === reviewerUserId && Date.parse(vote.updated_at) >= since,
      ),
    };
  }

  async insertReviewEvent(row) {
    const event = { ...row, id: `event-${this.events.length + 1}`, created_at: nowIso() };
    this.events.push(event);
    return { ok: true, data: event };
  }

  async listReviewEvents(reportId) {
    return { ok: true, data: this.events.filter((event) => event.camp_site_report_id === reportId) };
  }

  async insertReviewerAuditEvent(row) {
    const event = { ...row, id: `audit-${this.auditEvents.length + 1}`, created_at: nowIso() };
    this.auditEvents.push(event);
    return { ok: true, data: event };
  }

  async listReviewerAuditEvents(reviewerUserId, limit) {
    return {
      ok: true,
      data: this.auditEvents.filter((event) => event.reviewer_user_id === reviewerUserId).slice(0, limit),
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
}

async function cast(service, backend, reportId, userId, vote, confidence = 'medium') {
  backend.currentUser = { id: userId, isTrustedReviewer: true };
  return service.castReviewVote(reportId, {
    vote,
    confidence,
    reviewer_notes: `${vote} note`,
  });
}

async function main() {
  const backend = new MemoryReviewBackend();
  backend.reports.push(createReport({ id: 'suspended-test' }));
  backend.profiles.set('trusted-1', createProfile('trusted-1'));
  backend.profiles.set('suspended-1', createProfile('suspended-1', { reviewer_status: 'suspended' }));
  const service = new CampsiteReviewService(backend, { maxVotesPerHour: 3, approveOnlyAuditThreshold: 3 });

  backend.currentUser = { id: 'suspended-1', isTrustedReviewer: true };
  const suspendedVote = await service.castReviewVote('suspended-test', {
    vote: 'approve',
    confidence: 'high',
  });
  assert.strictEqual(suspendedVote.ok, false, 'Suspended reviewer cannot vote.');
  assert.ok(
    backend.events.some((event) => event.event_type === 'review_abuse_flagged'),
    'Suspended vote attempt should be audited on the report.',
  );

  const trustedVote = await cast(service, backend, 'suspended-test', 'trusted-1', 'approve', 'high');
  assert.strictEqual(trustedVote.ok, true, 'Trusted reviewer can vote.');

  backend.currentUser = { id: 'submitter-1', isTrustedReviewer: true };
  backend.profiles.set('submitter-1', createProfile('submitter-1'));
  const ownVote = await service.castReviewVote('suspended-test', {
    vote: 'approve',
    confidence: 'high',
  });
  assert.strictEqual(ownVote.ok, false, 'Reviewer cannot vote on own submission.');

  backend.currentUser = { id: 'admin-1', isAdmin: true };
  backend.profiles.set('candidate-1', createProfile('candidate-1', { reviewer_status: 'candidate', reputation_score: 35 }));
  const promoted = await service.promoteReviewer('candidate-1');
  assert.strictEqual(promoted.ok, true, 'Moderator can promote reviewer.');
  assert.strictEqual(backend.profiles.get('candidate-1').reviewer_status, 'trusted');
  const suspended = await service.suspendReviewer('candidate-1', 'low quality votes');
  assert.strictEqual(suspended.ok, true, 'Moderator can suspend reviewer.');
  assert.strictEqual(backend.profiles.get('candidate-1').reviewer_status, 'suspended');
  assert.ok(
    backend.auditEvents.some((event) => event.event_type === 'reviewer_promoted') &&
      backend.auditEvents.some((event) => event.event_type === 'reviewer_suspended'),
    'Reviewer status actions should write audit events.',
  );

  const outcomeBackend = new MemoryReviewBackend();
  outcomeBackend.reports.push(createReport({ id: 'reputation-outcome' }));
  outcomeBackend.profiles.set('blocker-1', createProfile('blocker-1'));
  outcomeBackend.profiles.set('blocker-2', createProfile('blocker-2'));
  outcomeBackend.profiles.set('approver-1', createProfile('approver-1'));
  const outcomeService = new CampsiteReviewService(outcomeBackend, { maxVotesPerHour: 10 });
  await cast(outcomeService, outcomeBackend, 'reputation-outcome', 'approver-1', 'approve', 'high');
  await cast(outcomeService, outcomeBackend, 'reputation-outcome', 'blocker-1', 'private_land', 'medium');
  await cast(outcomeService, outcomeBackend, 'reputation-outcome', 'blocker-2', 'closed_to_camping', 'medium');
  assert.strictEqual(
    outcomeBackend.reports.find((report) => report.id === 'reputation-outcome').review_state,
    'community_rejected',
    'Blocking quorum should create final community rejection.',
  );
  assert.ok(
    outcomeBackend.profiles.get('blocker-1').helpful_review_count > 0 &&
      outcomeBackend.profiles.get('blocker-2').helpful_review_count > 0,
    'Reviewer votes aligned with final outcome should become helpful.',
  );
  assert.ok(
    outcomeBackend.profiles.get('approver-1').rejected_review_count > 0,
    'Reviewer votes conflicting with final outcome should be counted as rejected.',
  );
  assert.ok(
    outcomeBackend.events.some((event) => event.event_type === 'reputation_updated'),
    'Final outcome should write reputation update events.',
  );

  const rateBackend = new MemoryReviewBackend();
  rateBackend.reports.push(createReport({ id: 'rate-limit-test' }));
  rateBackend.profiles.set('fast-1', createProfile('fast-1'));
  rateBackend.votes.push(
    { id: 'old-vote-1', camp_site_report_id: 'a', reviewer_user_id: 'fast-1', vote: 'approve', confidence: 'medium', reviewer_notes: null, created_at: nowIso(), updated_at: nowIso() },
    { id: 'old-vote-2', camp_site_report_id: 'b', reviewer_user_id: 'fast-1', vote: 'approve', confidence: 'medium', reviewer_notes: null, created_at: nowIso(), updated_at: nowIso() },
  );
  const rateService = new CampsiteReviewService(rateBackend, { maxVotesPerHour: 2 });
  const limited = await cast(rateService, rateBackend, 'rate-limit-test', 'fast-1', 'approve', 'medium');
  assert.strictEqual(limited.ok, false, 'Rate limit blocks excessive review votes.');
  assert.ok(
    rateBackend.events.some((event) => event.event_type === 'review_abuse_flagged' && event.metadata.reason === 'review_rate_limit_exceeded'),
    'Rate-limit block should create an audit event.',
  );

  const approveOnlyBackend = new MemoryReviewBackend();
  approveOnlyBackend.profiles.set('approve-only-1', createProfile('approve-only-1'));
  const approveOnlyService = new CampsiteReviewService(approveOnlyBackend, {
    maxVotesPerHour: 10,
    approveOnlyAuditThreshold: 3,
  });
  for (let i = 1; i <= 3; i += 1) {
    approveOnlyBackend.reports.push(createReport({ id: `approve-only-${i}`, submitted_by_user_id: `submitter-${i}` }));
    await cast(approveOnlyService, approveOnlyBackend, `approve-only-${i}`, 'approve-only-1', 'approve', 'medium');
  }
  assert.ok(
    approveOnlyBackend.events.some((event) => event.event_type === 'review_abuse_flagged' && event.metadata.reason === 'approve_only_pattern'),
    'Repeated approve-only behavior should be detected for moderator audit.',
  );

  const list = await service.listReviewerProfiles();
  assert.strictEqual(list.ok, true, 'Moderator can list reviewer profiles.');
  assert.ok(list.data.some((profile) => profile.user_id === 'candidate-1'), 'Reviewer management list should include profiles.');

  console.log('campsite reviewer reputation tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
