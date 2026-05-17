const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const typesPath = path.join(root, 'lib', 'campsites', 'campsiteRecommendationTypes.ts');
const dbPath = path.join(root, 'lib', 'db.ts');
const migrationPath = path.join(root, 'supabase', 'migrations', '007_campsite_community_review.sql');
const servicePath = path.join(root, 'lib', 'campsites', 'campsiteRecommendationService.ts');

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

const campsiteTypes = require(typesPath);
const typeSource = fs.readFileSync(typesPath, 'utf8');
const dbSource = fs.readFileSync(dbPath, 'utf8');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');

for (const tableName of [
  'camp_site_review_votes',
  'camp_site_review_events',
  'camp_site_reviewer_profiles',
]) {
  assert.match(
    migrationSource,
    new RegExp(`create table if not exists public\\.${tableName}`),
    `${tableName} table must be created by the community review migration.`,
  );
  assert.match(
    dbSource,
    new RegExp(`${tableName}!: Table`),
    `${tableName} must be available as a local IndexedDB collection.`,
  );
}

for (const requiredReportColumn of [
  'review_state text not null default',
  'triage_score double precision',
  'triage_summary jsonb',
  'community_review_started_at timestamptz',
  'community_review_completed_at timestamptz',
  'moderator_review_started_at timestamptz',
  'moderator_review_completed_at timestamptz',
]) {
  assert.ok(
    migrationSource.includes(requiredReportColumn),
    `Migration must add report review column: ${requiredReportColumn}`,
  );
}

for (const enumValue of [
  'approve',
  'reject',
  'needs_info',
  'duplicate',
  'sensitive',
  'private_land',
  'closed_to_camping',
  'bad_coordinates',
  'low',
  'medium',
  'high',
  'submitted',
  'community_review',
  'triage_passed',
  'triage_failed',
  'vote_added',
  'vote_changed',
  'needs_info_requested',
  'community_approved',
  'community_rejected',
  'moderator_review',
  'moderator_approved',
  'moderator_rejected',
  'merged',
  'hidden',
  'published',
  'candidate',
  'trusted',
  'suspended',
  'auto_triage_failed',
  'needs_submitter_info',
  'community_review',
  'moderator_review',
  'approved',
  'rejected',
  'archived',
]) {
  assert.ok(typeSource.includes(`'${enumValue}'`), `Type module must include ${enumValue}.`);
  assert.ok(migrationSource.includes(`'${enumValue}'`), `Migration constraints must include ${enumValue}.`);
}

for (const indexName of [
  'idx_camp_site_review_votes_report_id',
  'idx_camp_site_review_votes_reviewer_user_id',
  'idx_camp_site_review_votes_report_reviewer',
  'idx_camp_site_review_events_report_id',
  'idx_camp_site_reviewer_profiles_user_id',
  'idx_camp_site_reports_review_state',
]) {
  assert.ok(migrationSource.includes(indexName), `${indexName} index must be present.`);
}

assert.match(
  migrationSource,
  /create unique index if not exists idx_camp_site_review_votes_report_reviewer/,
  'One active vote per reviewer/report must be enforced by a unique index.',
);
assert.match(
  dbSource,
  /&\[camp_site_report_id\+reviewer_user_id\]/,
  'Local review vote collection should use the same one-vote-per-reviewer compound uniqueness.',
);
assert.match(
  migrationSource,
  /create or replace function public\.is_camp_site_trusted_reviewer/,
  'Migration should add a trusted reviewer helper for review-wall RLS.',
);
assert.match(
  migrationSource,
  /review_state in \('community_review', 'needs_submitter_info', 'community_approved', 'community_rejected'\)/,
  'Trusted reviewers should only see reports routed to the community review wall.',
);
assert.match(
  serviceSource,
  /getInitialCampSiteReportReviewState\(input\.visibility_requested\)/,
  'Report creation should initialize review_state from requested visibility.',
);

const sanitizedNotes = campsiteTypes.sanitizeCampSiteReviewNotes('  Looks good.\n\nNo issues.\u0000  ');
assert.strictEqual(sanitizedNotes, 'Looks good. No issues.', 'Reviewer notes should be sanitized.');

const validVote = campsiteTypes.validateCampSiteReviewVoteRecord({
  id: 'vote-1',
  camp_site_report_id: 'report-1',
  reviewer_user_id: 'reviewer-1',
  vote: 'approve',
  confidence: 'high',
  reviewer_notes: sanitizedNotes,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
assert.strictEqual(validVote.ok, true, 'A valid review vote should validate.');

const invalidVote = campsiteTypes.validateCampSiteReviewVoteRecord({
  id: 'vote-2',
  camp_site_report_id: 'report-1',
  reviewer_user_id: 'reviewer-1',
  vote: 'maybe',
  confidence: 'certain',
  reviewer_notes: 'Bad\u0000note',
});
assert.strictEqual(invalidVote.ok, false, 'Invalid vote/confidence/sanitization must fail validation.');
assert.ok(
  invalidVote.errors.some((error) => error.includes('vote')) &&
    invalidVote.errors.some((error) => error.includes('confidence')) &&
    invalidVote.errors.some((error) => error.includes('reviewer_notes')),
  'Invalid vote errors should name vote, confidence, and reviewer_notes.',
);

const validEvent = campsiteTypes.validateCampSiteReviewEventRecord({
  id: 'event-1',
  camp_site_report_id: 'report-1',
  actor_user_id: 'reviewer-1',
  event_type: 'vote_added',
  metadata: { vote: 'approve' },
  created_at: new Date().toISOString(),
});
assert.strictEqual(validEvent.ok, true, 'A review event should validate.');

const defaultProfile = campsiteTypes.createDefaultCampSiteReviewerProfile('user-1', '2026-04-28T00:00:00.000Z');
assert.deepStrictEqual(
  {
    user_id: defaultProfile.user_id,
    reviewer_status: defaultProfile.reviewer_status,
    review_count: defaultProfile.review_count,
    helpful_review_count: defaultProfile.helpful_review_count,
    rejected_review_count: defaultProfile.rejected_review_count,
    reputation_score: defaultProfile.reputation_score,
  },
  {
    user_id: 'user-1',
    reviewer_status: 'none',
    review_count: 0,
    helpful_review_count: 0,
    rejected_review_count: 0,
    reputation_score: 0,
  },
  'Reviewer profile defaults should be conservative.',
);
assert.strictEqual(
  campsiteTypes.validateCampSiteReviewerProfileRecord(defaultProfile).ok,
  true,
  'Default reviewer profile should validate.',
);

assert.strictEqual(
  campsiteTypes.getInitialCampSiteReportReviewState('private'),
  'private_saved',
  'Private saves should stay private_saved.',
);
assert.strictEqual(
  campsiteTypes.getInitialCampSiteReportReviewState('community'),
  'submitted',
  'Community submissions should start submitted, not public.',
);
assert.strictEqual(
  campsiteTypes.canTransitionCampSiteReportReviewState('submitted', 'community_review'),
  true,
  'Submitted reports can enter community review.',
);
assert.strictEqual(
  campsiteTypes.canTransitionCampSiteReportReviewState('community_review', 'approved'),
  false,
  'Community review cannot skip community/moderator approval directly to approved.',
);
assert.strictEqual(
  campsiteTypes.canTransitionCampSiteReportReviewState('community_approved', 'approved'),
  true,
  'Community-approved reports can become approved after approval policy passes.',
);

console.log('Campsite community review data model checks passed.');
