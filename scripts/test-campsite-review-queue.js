const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const moreSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'more.tsx'), 'utf8');
const reviewSource = fs.readFileSync(
  path.join(root, 'components', 'admin', 'CampsiteRecommendationsReview.tsx'),
  'utf8',
);
const serviceTestSource = fs.readFileSync(
  path.join(root, 'scripts', 'test-campsite-recommendation-service.js'),
  'utf8',
);
const serviceSource = fs.readFileSync(
  path.join(root, 'lib', 'campsites', 'campsiteRecommendationService.ts'),
  'utf8',
);

assert.ok(
  moreSource.includes("key: 'campsite-review'") &&
    moreSource.includes('hasAdminAccess') &&
    moreSource.includes('<CampsiteRecommendationsReview'),
  'More tab should expose the campsite review queue only inside the existing admin surface.',
);

assert.ok(
  reviewSource.includes('Campsite Recommendations Review') &&
    reviewSource.includes('listPendingReports(50)') &&
    reviewSource.includes('Approve as new campsite') &&
    reviewSource.includes('Merge with existing campsite') &&
    reviewSource.includes('Needs more info') &&
    reviewSource.includes('Hide / mark sensitive'),
  'Review queue should list pending reports and expose moderation actions.',
);

assert.ok(
  reviewSource.includes('submitted') || reviewSource.includes('Submitted'),
  'Review queue should show submitted date context.',
);

assert.ok(
  reviewSource.includes('coordinates') ||
    reviewSource.includes('Coordinates') &&
      reviewSource.includes('source_type') &&
      reviewSource.includes('visited_at') &&
      reviewSource.includes('user_stayed_here') &&
      reviewSource.includes('verified_in_person') &&
      reviewSource.includes('vehicle_fit') &&
      reviewSource.includes('stewardship_acknowledged') &&
      reviewSource.includes('sensitive_area_acknowledged'),
  'Review queue should render the requested report fields.',
);

assert.ok(
  reviewSource.includes('approveReport({ reportId })') &&
    reviewSource.includes('mergeReportIntoCampSite') &&
    reviewSource.includes('rejectReport') &&
    reviewSource.includes('markReportNeedsInfo'),
  'Review queue actions should call the campsite moderation service methods.',
);

assert.ok(
  serviceSource.includes('requireAdminUser(this.backend)') &&
    serviceSource.includes('async rejectReport('),
  'Moderation service methods should remain admin-gated and support reject reason input.',
);

assert.ok(
  serviceTestSource.includes('Normal users cannot access the review queue') &&
    serviceTestSource.includes('Rejecting a pending report must not publish') &&
    serviceTestSource.includes('mergeReportIntoCampSite'),
  'Role and moderation behavior tests should cover access, reject, and merge.',
);

console.log('Campsite review queue checks passed.');
