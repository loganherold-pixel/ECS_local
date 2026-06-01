const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const formSource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RecommendCampsiteForm.tsx'),
  'utf8',
);
const gpxReviewSource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RecommendCampsiteGpxImportReview.tsx'),
  'utf8',
);
const gpxImportSource = fs.readFileSync(
  path.join(root, 'lib', 'campsites', 'gpxCampsiteImport.ts'),
  'utf8',
);
const rolloutSource = fs.readFileSync(
  path.join(root, 'lib', 'communityCampsitesRolloutConfig.ts'),
  'utf8',
);

assert.ok(
  rolloutSource.includes("'communityCampsitesEnabled'") &&
    rolloutSource.includes("'campsiteModerationEnabled'") &&
    rolloutSource.includes("'gpxCampsiteImportEnabled'") &&
    rolloutSource.includes("'campsitePhotosEnabled'") &&
    rolloutSource.includes('communityCampsitesEnabled: true') &&
    rolloutSource.includes('campsiteModerationEnabled: true') &&
    rolloutSource.includes('gpxCampsiteImportEnabled: true') &&
    rolloutSource.includes('campsitePhotosEnabled: true'),
  'Recommend Campsite must expose rollout flags for community, moderation, GPX, and photos.',
);

assert.ok(
  navigateSource.includes("activeTopPopup === 'recommendCampsite'") &&
    navigateSource.includes("'RECOMMEND CAMPSITE'") &&
    navigateSource.includes('Recommend Campsite'),
  'Map Tools should render and open a Recommend Campsite popup.',
);

assert.ok(
  navigateSource.includes('openRecommendCampsiteChooser') &&
    navigateSource.includes('communityCampsitesEnabled ?') &&
    navigateSource.includes('Recommend Campsite</Text>'),
  'Map Tools utilities should include a Recommend Campsite action when enabled.',
);

assert.ok(
  navigateSource.includes('Use My Current Location') &&
    navigateSource.includes('handleRecommendCampsiteUseCurrentLocation') &&
    navigateSource.includes("source_type: 'current_location'") &&
    navigateSource.includes('location_accuracy_m:'),
  'Current-location path should pass coordinates, source_type, and accuracy into the form state.',
);

assert.ok(
  navigateSource.includes('Drop a Pin') &&
    navigateSource.includes('handleRecommendCampsiteDropPin') &&
    navigateSource.includes('recommendCampsiteDropMode') &&
    navigateSource.includes("setRecommendCampsiteDropSource('pin_drop')") &&
    navigateSource.includes('source_type: recommendCampsiteDropSource'),
  'Drop-pin path should reuse map tap placement and pass coordinates into the form state.',
);

assert.ok(
  navigateSource.includes('Import GPX / Route') &&
    navigateSource.includes('handleRecommendCampsiteImportRoute') &&
    navigateSource.includes('handleRecommendCampsiteChooseGpxFile') &&
    navigateSource.includes('gpxCampsiteImportEnabled') &&
    navigateSource.includes('submitGpxImportOfflineSafe') &&
    navigateSource.includes('gpxUploadResultToCampsiteImportResult') &&
    navigateSource.includes('Choose GPX File') &&
    navigateSource.includes('Imported GPX data stays private unless you choose specific campsite candidates to save or submit.') &&
    navigateSource.includes('RecommendCampsiteGpxImportReview') &&
    gpxImportSource.includes("source_type: 'gpx_waypoint'"),
  'Import GPX / Route action should open upload flow, store a private import, and open the review surface.',
);

assert.ok(
    gpxReviewSource.includes('SAVE PRIVATELY') &&
    gpxReviewSource.includes('SHARE WITH GROUP') &&
    gpxReviewSource.includes('SUBMIT TO ECS COMMUNITY REVIEW') &&
    gpxReviewSource.includes('source_type = {candidate.source_type}') &&
    gpxReviewSource.includes('Community submissions require stewardship') &&
    gpxReviewSource.includes('Campsite details for selected waypoints') &&
    gpxReviewSource.includes('Waypoints') &&
    gpxReviewSource.includes('Routes') &&
    gpxReviewSource.includes('Tracks') &&
    gpxImportSource.includes('buildCampsiteReportInputFromGpxCandidate'),
  'GPX waypoint review should support selected private saves and acknowledged community submissions.',
);

assert.ok(
  gpxReviewSource.includes('Route and track points are not campsites by default. Select only verified campsite locations.') &&
    gpxReviewSource.includes('ADD CAMPSITE CANDIDATE FROM ROUTE') &&
    gpxReviewSource.includes('ADD CAMPSITE CANDIDATE FROM TRACK') &&
    gpxReviewSource.includes('This creates a campsite candidate only. It will not be public unless submitted and approved.') &&
    navigateSource.includes('createGpxCandidateFromMapSelection') &&
    navigateSource.includes("setRecommendCampsiteDropSource(") &&
    navigateSource.includes("'gpx_track_selected_point'") &&
    navigateSource.includes('source_type: recommendCampsiteDropSource'),
  'Route/track imports should not auto-create campsite reports and should use explicit manual route/track candidate selection.',
);

assert.ok(
  navigateSource.includes('RecommendCampsiteForm') &&
    navigateSource.includes('location={recommendCampsiteLocation}') &&
    navigateSource.includes('onAdjustPin') &&
    formSource.includes("location.latitude.toFixed(5)") &&
    formSource.includes("location.longitude.toFixed(5)"),
  'Selected campsite coordinates should be passed to the recommendation form.',
);

console.log('Recommend Campsite Map Tools wiring checks passed.');
