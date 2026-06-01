const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function requireTs(relativePath) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request.startsWith('./')) {
      return requireTs(path.join(path.dirname(relativePath), request).replace(/\\/g, '/'));
    }
    return require(request);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

const {
  buildCampsiteReportInputFromForm,
  createDefaultCampsiteRecommendationFormState,
  validateCampsiteRecommendationForm,
} = requireTs('lib/campsites/campsiteRecommendationForm.ts');

const location = {
  latitude: 38.78071,
  longitude: -121.20761,
  source_type: 'current_location',
  location_accuracy_m: 8.4,
};

const defaults = createDefaultCampsiteRecommendationFormState();
assert.strictEqual(defaults.visibility_requested, 'private', 'Visibility should default to private.');
assert.strictEqual(defaults.verification, 'planning', 'Planning/route suggestion should be the default source posture.');

const invalidCommunity = {
  ...defaults,
  visibility_requested: 'community',
  vehicle_fit: ['van'],
};
const invalidCommunityResult = validateCampsiteRecommendationForm(invalidCommunity);
assert.strictEqual(invalidCommunityResult.ok, false, 'Community submissions should require acknowledgements.');
assert.ok(
  invalidCommunityResult.errors.some((error) => error.includes('stewardship')),
  'Missing stewardship acknowledgement should be reported.',
);
assert.ok(
  invalidCommunityResult.errors.some((error) => error.includes('sensitive-area')),
  'Missing sensitive-area acknowledgement should be reported.',
);

const privateForm = {
  ...defaults,
  vehicle_fit: ['small_vehicle', 'van'],
  notes: 'Quiet durable turnout near the route.',
  cell_signal: 'usable',
};
assert.strictEqual(validateCampsiteRecommendationForm(privateForm).ok, true, 'Private save should validate.');
const privatePayload = buildCampsiteReportInputFromForm(location, privateForm);
assert.strictEqual(privatePayload.visibility_requested, 'private');
assert.strictEqual(privatePayload.latitude, location.latitude);
assert.strictEqual(privatePayload.longitude, location.longitude);
assert.strictEqual(privatePayload.source_type, 'current_location');
assert.strictEqual(privatePayload.location_accuracy_m, location.location_accuracy_m);
assert.deepStrictEqual(privatePayload.vehicle_fit, ['small_vehicle', 'van']);
assert.strictEqual(privatePayload.conditions.cell_signal, 'usable');
assert.strictEqual(privatePayload.notes, 'Quiet durable turnout near the route.');

const communityForm = {
  ...defaults,
  verification: 'verified',
  visibility_requested: 'community',
  vehicle_fit: ['full_size_truck'],
  stewardship_acknowledged: true,
  sensitive_area_acknowledged: true,
};
assert.strictEqual(
  validateCampsiteRecommendationForm(communityForm).ok,
  true,
  'Community submission should validate once both acknowledgements are present.',
);
const communityPayload = buildCampsiteReportInputFromForm(
  { ...location, source_type: 'pin_drop', location_accuracy_m: null },
  communityForm,
);
assert.strictEqual(communityPayload.visibility_requested, 'community');
assert.strictEqual(communityPayload.verified_in_person, true);
assert.strictEqual(communityPayload.user_stayed_here, false);
assert.strictEqual(communityPayload.stewardship_acknowledged, true);
assert.strictEqual(communityPayload.sensitive_area_acknowledged, true);
assert.strictEqual(communityPayload.location_accuracy_m, null);

const missingVehicleFit = validateCampsiteRecommendationForm(defaults);
assert.strictEqual(missingVehicleFit.ok, false, 'Vehicle fit is required.');
assert.ok(
  missingVehicleFit.errors.some((error) => error.includes('vehicle fit')),
  'Missing vehicle fit should produce a validation error.',
);

const invalidNumbers = validateCampsiteRecommendationForm({
  ...defaults,
  vehicle_fit: ['tent_only'],
  max_rig_length_ft: '-1',
  max_group_size: 'zero',
});
assert.strictEqual(invalidNumbers.ok, false, 'Invalid optional numeric fields should fail validation.');
assert.ok(
  invalidNumbers.errors.some((error) => error.includes('Max rig length')),
  'Invalid max rig length should be reported.',
);
assert.ok(
  invalidNumbers.errors.some((error) => error.includes('Max group size')),
  'Invalid max group size should be reported.',
);

const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const formSource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RecommendCampsiteForm.tsx'),
  'utf8',
);
const gpxReviewSource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RecommendCampsiteGpxImportReview.tsx'),
  'utf8',
);

assert.ok(
  navigateSource.includes('<RecommendCampsiteForm') &&
    navigateSource.includes('location={recommendCampsiteLocation}') &&
    navigateSource.includes('onAdjustPin') &&
    navigateSource.includes('Submitted for ECS review.') &&
    navigateSource.includes('Campsite saved privately.'),
  'Navigate popup should mount the recommendation form and surface success copy.',
);

assert.ok(
  formSource.includes('Only submit established, legal, durable campsites.') &&
    formSource.includes('I believe this is a legal, established campsite.') &&
    formSource.includes('I am not sharing a private, closed, culturally sensitive, wildlife-sensitive, or fragile location.') &&
    formSource.includes('submitCampsiteReportOfflineSafe(payload') &&
    formSource.includes('getCampsiteOfflineStatusLabel') &&
    formSource.includes('Saved locally.') &&
    formSource.includes('Syncing campsite recommendation.') &&
    formSource.includes('Campsite saved privately.') &&
    formSource.includes('Submitted for ECS Community Review') &&
    formSource.includes('This campsite is pending review and is not visible to the community yet.'),
  'Form should include stewardship warning, offline-safe submission, and success states.',
);

assert.ok(
  gpxReviewSource.includes('I believe this is a legal, established campsite.') &&
    gpxReviewSource.includes('I am not sharing a private, closed, culturally sensitive, wildlife-sensitive, or fragile location.') &&
    gpxReviewSource.includes('This campsite is pending review and is not visible to the community yet.'),
  'GPX review should use the approved acknowledgement and pending-state copy.',
);

console.log('Campsite recommendation form checks passed.');
