const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const componentSource = read('components/admin/CommunityCampsiteReview.tsx');
const moreSource = read('app/(tabs)/more.tsx');
const reviewServiceSource = read('lib/campsites/campsiteReviewService.ts');
const mapLayerSource = read('lib/campsites/communityCampsiteMapLayer.ts');
const recommendationServiceSource = read('lib/campsites/campsiteRecommendationService.ts');

assert.ok(
  componentSource.includes('Community Campsite Review'),
  'Community review UI should render the requested screen title.',
);

assert.ok(
  componentSource.includes('listCommunityReviewQueue') &&
    componentSource.includes('getCommunityReviewReportDetails') &&
    componentSource.includes('castReviewVote'),
  'Community review UI should use the community review service for queue, detail, and vote actions.',
);

[
  'Approve',
  'Reject',
  'Needs more info',
  'Duplicate',
  'Sensitive location',
  'Private land',
  'Closed to camping',
  'Bad coordinates',
].forEach((label) => {
  assert.ok(componentSource.includes(label), `Community review UI should expose ${label}.`);
});

assert.ok(
  componentSource.includes('One sensitive/private/closed vote may escalate this to moderator review.') &&
    componentSource.includes('Community approval does not publish until quorum is met.'),
  'Community review UI should explain escalation and quorum behavior.',
);

assert.ok(
  componentSource.includes('ineligible_reason') &&
    componentSource.includes('can_vote') &&
    componentSource.includes('You are not eligible to vote'),
  'Community review UI should show a disabled state when a reviewer cannot vote.',
);

assert.ok(
  componentSource.includes('GPX source') &&
    componentSource.includes('Land-use warning') &&
    componentSource.includes('Exact sensitive-layer details are not shown here.') &&
    componentSource.includes('Potential sensitive or restricted area') &&
    componentSource.includes('Moderator land-use details'),
  'Detail UI should show GPX, generic land-use warnings, and permission-gated moderator land-use details.',
);

assert.ok(
  componentSource.includes('Vote summary') &&
    componentSource.includes('voteSummaryText') &&
    componentSource.includes('details.events'),
  'Detail UI should show vote summary and review history when available.',
);

assert.ok(
  moreSource.includes("import CommunityCampsiteReview") &&
    moreSource.includes('campsiteReviewService') &&
    moreSource.includes('communityReviewNavVisible') &&
    moreSource.includes("'community-campsite-review'") &&
    moreSource.includes("label: 'Community Review'") &&
    moreSource.includes('<CommunityCampsiteReview'),
  'More tab should add a permission-checked entry point for community campsite review.',
);

assert.ok(
  reviewServiceSource.includes('Only trusted reviewers or moderators can view the community review queue.') &&
    reviewServiceSource.includes("report.review_state === 'community_review'") &&
    reviewServiceSource.includes('You cannot vote on your own campsite submission.'),
  'Community review service should gate normal users, hide moderator review from non-admin reviewers, and block self-review.',
);

assert.ok(
  reviewServiceSource.includes('vote_summary') &&
    reviewServiceSource.includes('can_vote') &&
    reviewServiceSource.includes('ineligible_reason') &&
    reviewServiceSource.includes('sanitizeLandUseReviewResult') &&
    reviewServiceSource.includes('getLatestLandUseReviewResult'),
  'Community review service queue items should carry vote summary, eligibility, and sanitized land-use state for the UI.',
);

assert.ok(
  mapLayerSource.includes("site.status === 'approved'") &&
    mapLayerSource.includes("site.visibility === 'community'") &&
    recommendationServiceSource.includes(".eq('status', 'approved')") &&
    recommendationServiceSource.includes(".eq('visibility', 'community')"),
  'Public campsite map must only render approved community camp_sites, not pending review reports.',
);

console.log('Community campsite review UI checks passed.');
