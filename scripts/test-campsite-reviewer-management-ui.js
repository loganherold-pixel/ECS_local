const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const componentPath = path.join(root, 'components', 'admin', 'CampsiteReviewerManagement.tsx');
const servicePath = path.join(root, 'lib', 'campsites', 'campsiteReviewService.ts');
const moreTabPath = path.join(root, 'app', '(tabs)', 'more.tsx');
const migrationPath = path.join(root, 'supabase', 'migrations', '015_campsite_reviewer_reputation.sql');

const component = fs.readFileSync(componentPath, 'utf8');
const service = fs.readFileSync(servicePath, 'utf8');
const moreTab = fs.readFileSync(moreTabPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

assert.ok(component.includes('Campsite Reviewer Management'), 'Reviewer management screen should have the requested title.');
assert.ok(component.includes('Promote'), 'Reviewer management should expose promote action.');
assert.ok(component.includes('Suspend'), 'Reviewer management should expose suspend action.');
assert.ok(component.includes('review_count'), 'Reviewer management should show review count.');
assert.ok(component.includes('helpful_review_count'), 'Reviewer management should show helpful review count.');
assert.ok(component.includes('rejected_review_count'), 'Reviewer management should show rejected review count.');
assert.ok(component.includes('reputation_score'), 'Reviewer management should show reputation score.');
assert.ok(component.includes('Review history'), 'Reviewer detail should show review history.');
assert.ok(component.includes('Audit events'), 'Reviewer detail should show audit events.');
assert.ok(component.includes('Approve-only pattern detected'), 'Reviewer UI should surface approve-only audit signals.');

assert.ok(service.includes('checkReviewerEligibility'), 'Review service should check reviewer eligibility before voting.');
assert.ok(service.includes("reviewer_status === 'suspended'"), 'Suspended reviewers should be blocked.');
assert.ok(service.includes('listReviewerVotesSince'), 'Review service should support vote rate limiting.');
assert.ok(service.includes('review_rate_limit_exceeded'), 'Review service should audit rate-limit abuse.');
assert.ok(service.includes('approve_only_pattern'), 'Review service should detect approve-only behavior.');
assert.ok(service.includes('updateReputationForFinalOutcome'), 'Review service should update reputation after final outcomes.');
assert.ok(service.includes('isSafetyMinorityVote'), 'Safety minority votes should be preserved instead of aggressively penalized.');
assert.ok(service.includes('promoteReviewer'), 'Review service should expose moderator promotion.');
assert.ok(service.includes('suspendReviewer'), 'Review service should expose moderator suspension.');

assert.ok(moreTab.includes('CampsiteReviewerManagement'), 'More tab should import reviewer management.');
assert.ok(moreTab.includes("'reviewer-management'"), 'More tab should include reviewer-management subtab.');
assert.ok(moreTab.includes('<CampsiteReviewerManagement'), 'More tab should render reviewer management for admins.');

assert.ok(migration.includes('camp_site_reviewer_audit_events'), 'Migration should add reviewer audit events table.');
assert.ok(migration.includes('review_abuse_flagged'), 'Migration should allow abuse audit events.');
assert.ok(migration.includes('reputation_updated'), 'Migration should allow reputation update events.');
assert.ok(migration.includes('reviewer_promoted'), 'Migration should allow promotion audit events.');
assert.ok(migration.includes('reviewer_suspended'), 'Migration should allow suspension audit events.');

console.log('campsite reviewer management UI tests passed');
