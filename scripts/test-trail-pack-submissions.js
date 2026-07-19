const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const {
  TRAIL_PACK_SUBMISSION_CERTIFICATION_COPY,
  createPendingTrailPackSubmission,
  detectTrailPackPrivacyWarnings,
  sanitizeTrailPackSubmissionGeometry,
  trailPackRouteInputFromNavigationPayload,
  trailPackRouteInputFromSubmission,
  trailPackRouteInputFromSavedTrail,
  trailPackSubmissionStore,
  validateTrailPackSubmission,
} = require(path.join(root, 'lib', 'explore', 'trailPackSubmissions.ts'));
const { getDiscoverableTrailPacks } = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

const baseRouteInput = {
  id: 'route-1',
  title: 'Shelf Road Loop',
  subtitle: 'Saved preview route',
  sourceEntryPoint: 'navigate_route_preview',
  routeGeometry: [
    { latitude: 39.0000, longitude: -105.0000 },
    { latitude: 39.0200, longitude: -105.0200 },
    { latitude: 39.0500, longitude: -105.0500 },
  ],
  distanceMiles: 8.4,
  estimatedDurationMinutes: 65,
  routeType: 'loop',
  difficulty: 'moderate',
  sourceFormat: 'gpx',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const validValues = {
  name: 'Shelf Road Loop',
  description: 'Compact overland loop with useful scenery and access notes.',
  difficulty: 'moderate',
  vehicleUsed: 'Tacoma',
  recommendedVehicleType: 'High clearance 4x4',
  routeType: 'loop',
  seasonNotes: 'Avoid heavy snow.',
  hazardNotes: 'One loose shelf section.',
  acknowledgesPrivateLandOrClosures: true,
  certifiesPermissionToShare: true,
  tags: ['scenic', '4x4_recommended'],
};

assert(
  TRAIL_PACK_SUBMISSION_CERTIFICATION_COPY.includes('I confirm I have the right to share this route'),
  'Required certification copy should be available to the UI',
);

const missingCertificationErrors = validateTrailPackSubmission(baseRouteInput, {
  ...validValues,
  certifiesPermissionToShare: false,
});
assert(
  missingCertificationErrors.some((error) => /Certification/.test(error)),
  'Submission should require the certification checkbox',
);

const missingGeometryErrors = validateTrailPackSubmission(
  { ...baseRouteInput, routeGeometry: [] },
  validValues,
);
assert(
  missingGeometryErrors.some((error) => /Route geometry/.test(error)),
  'Submission should be guarded when route geometry is unavailable',
);

const currentLocation = { latitude: 39.0000, longitude: -105.0000 };
const privacyWarnings = detectTrailPackPrivacyWarnings(baseRouteInput, currentLocation);
assert(
  privacyWarnings.some((warning) => /Route start is near/.test(warning)),
  'Submission should warn when a route starts near the current location',
);

const sanitized = sanitizeTrailPackSubmissionGeometry(baseRouteInput, currentLocation);
assert.strictEqual(sanitized.length, 2, 'Privacy sanitization should trim the near start point');
assert.notDeepStrictEqual(
  sanitized[0],
  baseRouteInput.routeGeometry[0],
  'Sanitized geometry should not expose the near-home start point',
);

trailPackSubmissionStore.clearForTests();
const result = trailPackSubmissionStore.submit(baseRouteInput, validValues, { currentLocation });
assert.strictEqual(result.submission.trailPack.source, 'ecs_submitted');
assert.strictEqual(result.submission.trailPack.reviewStatus, 'pending_review');
assert.strictEqual(result.submission.sourceEntryPoint, 'navigate_route_preview');
assert.strictEqual(result.submission.sanitizedRoutePointCount, 2);
assert.deepStrictEqual(
  getDiscoverableTrailPacks(
    [result.submission.trailPack],
    { latitude: 39.01, longitude: -105.01 },
    50,
  ),
  [],
  'Pending Trail Pack submissions must not appear in public Explore discovery',
);
assert.strictEqual(
  trailPackSubmissionStore.getSnapshot().submissions.length,
  1,
  'Submitted Trail Pack should be retained in the local pending submission store',
);

const revisionRouteInput = trailPackRouteInputFromSubmission(result.submission);
assert(revisionRouteInput, 'Pending Trail Pack submissions should normalize back into an editable route input');
const revisionResult = trailPackSubmissionStore.update(result.submission.id, revisionRouteInput, {
  ...validValues,
  name: 'Shelf Road Loop Revision',
  description: 'Updated submitter notes for the pending review packet.',
  hazardNotes: 'Loose shelf section updated after field review.',
}, { currentLocation: null });
assert.strictEqual(revisionResult.submission.id, result.submission.id, 'Trail Pack revisions should preserve the submission id');
assert.strictEqual(revisionResult.submission.trailPack.id, result.submission.trailPack.id, 'Trail Pack revisions should preserve the pending route id');
assert.strictEqual(revisionResult.submission.revisionCount, 1, 'Trail Pack revisions should record a revision count');
assert.strictEqual(
  trailPackSubmissionStore.getSnapshot().submissions[0].trailPack.name,
  'Shelf Road Loop Revision',
  'Updated Trail Pack revision should replace the pending local submission',
);
const withdrawn = trailPackSubmissionStore.withdraw(result.submission.id);
assert(withdrawn, 'Pending Trail Pack submissions should be withdrawable by the owner');
assert.strictEqual(
  trailPackSubmissionStore.getSnapshot().submissions.length,
  0,
  'Withdrawn Trail Pack submissions should leave the pending owner list',
);

const payloadInput = trailPackRouteInputFromNavigationPayload(
  {
    id: 'nav-route-1',
    source: 'explore',
    type: 'trail',
    title: 'Explore Saved Route',
    subtitle: 'Preview',
    coordinate: null,
    trailheadCoordinate: null,
    roadDestinationCoordinate: null,
    trailGeometry: [
      { lat: 38.1, lng: -109.1 },
      { lat: 38.2, lng: -109.2 },
    ],
    trailLengthMiles: 11.2,
    trailCategory: 'technical',
    tripMode: 'trail',
    routeSource: 'gpx',
    trailWaypoints: [],
    trailDecisionPoints: [],
    routeMetadata: { privateNote: 'not copied into submission route input' },
    landmarkMetadata: null,
    raw: null,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
  'explore_saved_route',
);
assert(payloadInput, 'Navigation payload should normalize into a submission route input');
assert.strictEqual(payloadInput.sourceEntryPoint, 'explore_saved_route');
assert.strictEqual(payloadInput.sourceFormat, 'gpx');
assert.strictEqual(payloadInput.routeGeometry.length, 2);

const savedTrailInput = trailPackRouteInputFromSavedTrail({
  id: 'trail-1',
  session_id: 'session-1',
  expedition_id: null,
  expedition_name: null,
  vehicle_id: null,
  name: 'Completed Trail',
  started_at: '2026-01-03T00:00:00.000Z',
  ended_at: '2026-01-03T01:00:00.000Z',
  distance_miles: 5,
  distance_km: 8,
  elapsed_seconds: 3600,
  avg_speed_mph: 5,
  max_speed_mph: 12,
  point_count: 2,
  segment_count: 1,
  elevation_gain_ft: 0,
  elevation_loss_ft: 0,
  has_elevation: false,
  points: [
    { id: 'p1', expedition_id: null, vehicle_id: null, lat: 37, lng: -110, elevation: null, speed: null, heading: null, timestamp: 'raw-trip-time', segment_id: 's1' },
    { id: 'p2', expedition_id: null, vehicle_id: null, lat: 37.1, lng: -110.1, elevation: null, speed: null, heading: null, timestamp: 'raw-trip-time', segment_id: 's1' },
  ],
  segments: [],
  analytics: null,
  storage_bytes: 100,
  saved_at: '2026-01-03T01:00:00.000Z',
  expires_at: '2026-04-03T01:00:00.000Z',
});
assert(savedTrailInput, 'Completed saved trail should normalize into a submission route input');
assert.strictEqual(savedTrailInput.sourceEntryPoint, 'completed_route_summary');
assert.deepStrictEqual(savedTrailInput.routeGeometry[0], { latitude: 37, longitude: -110 });

const submissionModule = fs.readFileSync(
  path.join(root, 'lib', 'explore', 'trailPackSubmissions.ts'),
  'utf8',
);
assert(
  !/CampOps|campops/i.test(submissionModule),
  'Trail Pack submission module should remain standalone from CampOps',
);

const navigateSource = fs
  .readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const toolsPopupStart = navigateSource.indexOf("renderMapPopup(\n    toolsPopupVisible");
const toolsPopupEnd = navigateSource.indexOf("renderMapPopup(\n    campScoutIntroVisible", toolsPopupStart);
assert(toolsPopupStart >= 0 && toolsPopupEnd > toolsPopupStart, 'Navigate should render Tools and Camp Scout popup sections.');
const toolsPopupSource = navigateSource.slice(toolsPopupStart, toolsPopupEnd);
assert(
  !toolsPopupSource.includes('SUBMIT AS TRAIL PACK'),
  'Primary Navigate Tools should no longer expose Submit as Trail Pack directly.',
);
assert(
  navigateSource.includes('handleSubmitActiveRouteAsTrailPack') &&
    navigateSource.includes('<TrailPackSubmissionModal') &&
    navigateSource.includes('trailPackSubmissionRoute'),
  'Navigate route preview Trail Pack submission wiring should remain present behind the Recommend Route flow.',
);
assert(
  navigateSource.includes('CREATE TRAIL PACK FROM IMPORT'),
  'Imported GPX/KML route entry point should be present',
);
assert(
  navigateSource.includes('onRecommendTrailPack={handleRecommendCompletedTrailAsTrailPack}'),
  'Completed route summary entry point should be wired',
);

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
assert(
  discoverSource.includes('trailPackSubmissionStore') &&
    discoverSource.includes('trailPackSubmissionSnapshot') &&
    discoverSource.includes('handleTrailPackSubmitted'),
  'Discover should keep pending Trail Pack route recommendation store and submission callback wiring',
);
assert(
  discoverSource.includes("'explore_saved_route'"),
  'Explore saved route detail should submit through the saved-route entry point',
);
assert(
  discoverSource.includes('handleSubmitFavoriteTrailPack') &&
    discoverSource.includes('<TrailPackSubmissionModal') &&
    discoverSource.includes('trailPackSubmissionRoute'),
  'Explore saved route detail should keep Trail Pack submission modal wiring.',
);
const favoriteSubmissionCall = discoverSource.indexOf('handleSubmitFavoriteTrailPack(favorite);');
const favoriteSubmissionActionStart = discoverSource.lastIndexOf('<TouchableOpacity', favoriteSubmissionCall);
const favoriteSubmissionActionEnd = discoverSource.indexOf('</TouchableOpacity>', favoriteSubmissionCall);
assert.ok(
  favoriteSubmissionCall > 0 &&
    favoriteSubmissionActionStart >= 0 &&
    favoriteSubmissionActionEnd > favoriteSubmissionCall,
  'Explore should expose a saved-route submission action.',
);
const favoriteSubmissionAction = discoverSource.slice(favoriteSubmissionActionStart, favoriteSubmissionActionEnd);
assert.ok(
  favoriteSubmissionAction.includes('accessibilityRole="button"') &&
    favoriteSubmissionAction.includes('accessibilityLabel=') &&
    favoriteSubmissionAction.includes('accessibilityHint=') &&
    favoriteSubmissionAction.includes('handleSubmitFavoriteTrailPack(favorite);'),
  'The saved-route submission action should have button semantics and execute the supported submission handler.',
);
assert.ok(
  favoriteSubmissionAction.includes('does not publish automatically'),
  'The action accessibility contract should disclose that submission is not automatic publication.',
);
assert.strictEqual(
  payloadInput.sourceEntryPoint,
  'explore_saved_route',
  'Executing the saved-route transformation should produce the semantic Explore submission entry point.',
);

const trailPackModalSource = fs.readFileSync(
  path.join(root, 'components', 'trailPacks', 'TrailPackSubmissionModal.tsx'),
  'utf8',
);
assert(
  trailPackModalSource.includes('editingSubmission'),
  'Trail Pack submission modal should support editing an existing pending submission',
);
assert(
  trailPackModalSource.includes('SUBMIT UPDATED REVISION'),
  'Trail Pack edit mode should expose updated revision copy',
);

const trailPackPreviewModalSource = fs.readFileSync(
  path.join(root, 'components', 'trailPacks', 'TrailPackPreviewModal.tsx'),
  'utf8',
);
assert(
  trailPackPreviewModalSource.includes('EDIT SUBMISSION'),
  'Pending owner Trail Pack preview should expose edit action',
);
assert(
  trailPackPreviewModalSource.includes('WITHDRAW'),
  'Pending owner Trail Pack preview should expose withdraw action',
);

console.log('Trail Pack submission checks passed');
