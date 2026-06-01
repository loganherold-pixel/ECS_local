const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const docsSource = fs.readFileSync(
  path.join(root, 'docs', 'campsite-recommendations.md'),
  'utf8',
);
const reviewPolicySource = fs.readFileSync(
  path.join(root, 'docs', 'campsite-review-policy.md'),
  'utf8',
);
const featureFlagsSource = fs.readFileSync(
  path.join(root, 'docs', 'campsite-feature-flags.md'),
  'utf8',
);
const rolloutSource = fs.readFileSync(
  path.join(root, 'lib', 'communityCampsitesRolloutConfig.ts'),
  'utf8',
);
const serviceSource = fs.readFileSync(
  path.join(root, 'lib', 'campsites', 'campsiteRecommendationService.ts'),
  'utf8',
);
const migrationSource = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '006_campsite_recommendations.sql'),
  'utf8',
);
const uploadSource = fs.readFileSync(
  path.join(root, 'lib', 'campsites', 'campsitePhotoUpload.ts'),
  'utf8',
);
const gpxImportSource = fs.readFileSync(
  path.join(root, 'lib', 'campsites', 'gpxCampsiteImport.ts'),
  'utf8',
);
const reviewSource = fs.readFileSync(
  path.join(root, 'components', 'admin', 'CampsiteRecommendationsReview.tsx'),
  'utf8',
);

for (const flag of [
  'communityCampsitesEnabled',
  'campsiteCommunityReviewEnabled',
  'campsiteReviewerQuorumEnabled',
  'campsiteAutoPublishAfterQuorumEnabled',
  'campsiteModerationEnabled',
  'gpxCampsiteImportEnabled',
  'campsitePhotosEnabled',
  'campsiteGroupSharingEnabled',
  'campsiteOfflineQueueEnabled',
  'campsiteLandUseReviewEnabled',
  'campsitePostPublicationReviewEnabled',
]) {
  assert.ok(rolloutSource.includes(`'${flag}'`), `${flag} must be a typed rollout flag.`);
  assert.match(rolloutSource, new RegExp(`${flag}: (true|false)`), `${flag} should have a default value.`);
  assert.ok(docsSource.includes(flag), `${flag} must be documented.`);
  assert.ok(featureFlagsSource.includes(flag), `${flag} must be documented in feature flag docs.`);
}

assert.ok(
  rolloutSource.includes('PRODUCTION_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG') &&
    rolloutSource.includes('campsiteLandUseReviewEnabled: false') &&
    rolloutSource.includes('campsiteAutoPublishAfterQuorumEnabled: false'),
  'Rollout config must expose conservative production defaults.',
);

for (const requiredDocSection of [
  '## User Flow',
  '## Moderation Flow',
  '## Data Model',
  '## Permissions',
  '## Privacy',
]) {
  assert.ok(docsSource.includes(requiredDocSection), `${requiredDocSection} must be documented.`);
}

for (const requiredPolicySection of [
  '## What Reviewers Should Approve',
  '## What Reviewers Should Reject',
  '## Sensitive Location Policy',
  '## Private Land Policy',
  '## Duplicate Handling',
  '## Closed or No-Camping Handling',
  '## Needs-Info Examples',
  '## Reviewer Abuse and Suspension Policy',
]) {
  assert.ok(reviewPolicySource.includes(requiredPolicySection), `${requiredPolicySection} must be documented.`);
}

for (const requiredUiCopy of [
  'Campsite saved privately.',
  'Submitted for ECS review.',
  'This campsite is pending review and is not visible to the community yet.',
  'This campsite is now visible on the ECS Community Campsites layer.',
  'I believe this is a legal, established campsite.',
  'I am not sharing a private, closed, culturally sensitive, wildlife-sensitive, or fragile location.',
]) {
  assert.ok(docsSource.includes(requiredUiCopy), `${requiredUiCopy} must be documented.`);
}

assert.ok(
  migrationSource.includes('camp_sites_select_visible') &&
    migrationSource.includes("visibility = 'community'") &&
    migrationSource.includes("status = 'approved'"),
  'Public campsite RLS must be limited to approved community campsites.',
);

assert.ok(
  migrationSource.includes('camp_site_reports_select_own') &&
    migrationSource.includes('auth.uid() = submitted_by_user_id') &&
    migrationSource.includes('public.is_ecs_super_admin()'),
  'Report RLS must scope normal users to their own reports and admins to review access.',
);

assert.ok(
  migrationSource.includes('camp_site_reports_insert_own') &&
    migrationSource.includes('with check (auth.uid() = submitted_by_user_id)'),
  'Normal users must be able to create their own private/community report rows.',
);

assert.ok(
  serviceSource.includes('omitReportPii') &&
    serviceSource.includes('omitCampSitePrivateFields') &&
    serviceSource.includes("'submitted_by_user_id'") &&
    serviceSource.includes("'owner_user_id'"),
  'Service responses must strip contributor/user identifiers from public/report responses.',
);

assert.ok(
  serviceSource.includes('reportStatusForVisibility') &&
    serviceSource.includes("visibility === 'community'") &&
    serviceSource.includes("'pending'") &&
    serviceSource.includes('listPendingReports') &&
    serviceSource.includes('requireAdminUser'),
  'Service must keep community submissions pending and require admin access for moderation.',
);

assert.ok(
  uploadSource.includes('stripCampsitePhotoMetadata') &&
    uploadSource.includes('canvas.toBlob') &&
    uploadSource.includes('exif_stripped: true') &&
    !uploadSource.includes('file.name}`'),
  'Photo handling must strip metadata and avoid raw original filenames.',
);

assert.ok(
  gpxImportSource.includes('routePointCount') &&
    gpxImportSource.includes('trackPointCount') &&
    gpxImportSource.includes("source_type: 'gpx_waypoint'"),
  'GPX import must preserve route/track context without auto-publishing campsites.',
);

assert.ok(
  reviewSource.includes('campsiteModerationEnabled') &&
    reviewSource.includes('Campsite moderation is paused for this rollout.'),
  'Moderation UI must honor the campsiteModerationEnabled flag.',
);

console.log('Campsite final audit checks passed.');
