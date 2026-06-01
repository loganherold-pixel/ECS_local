const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const uploadPath = path.join(root, 'lib', 'campsites', 'campsitePhotoUpload.ts');
const servicePath = path.join(root, 'lib', 'campsites', 'campsiteRecommendationService.ts');
const formPath = path.join(root, 'components', 'navigate', 'RecommendCampsiteForm.tsx');
const detailPath = path.join(root, 'components', 'navigate', 'CommunityCampsiteDetailCard.tsx');
const reviewPath = path.join(root, 'components', 'admin', 'CampsiteRecommendationsReview.tsx');
const migrationPath = path.join(root, 'supabase', 'migrations', '006_campsite_recommendations.sql');
const photoStatusMigrationPath = path.join(root, 'supabase', 'migrations', '010_campsite_photo_privacy_statuses.sql');
const rolloutPath = path.join(root, 'lib', 'communityCampsitesRolloutConfig.ts');

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

const { validateCampsitePhotoFile, MAX_CAMPSITE_PHOTO_BYTES } = require(uploadPath);

function fakeFile(overrides = {}) {
  return {
    type: 'image/jpeg',
    size: 1024,
    name: 'original-with-gps-name.jpg',
    ...overrides,
  };
}

assert.strictEqual(validateCampsitePhotoFile(fakeFile()), null);
assert.match(
  validateCampsitePhotoFile(fakeFile({ type: 'application/pdf' })),
  /Only JPEG/,
);
assert.match(
  validateCampsitePhotoFile(fakeFile({ type: 'image/svg+xml' })),
  /Only JPEG/,
);
assert.match(
  validateCampsitePhotoFile(fakeFile({ size: MAX_CAMPSITE_PHOTO_BYTES + 1 })),
  /too large/,
);

const uploadSource = fs.readFileSync(uploadPath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const formSource = fs.readFileSync(formPath, 'utf8');
const detailSource = fs.readFileSync(detailPath, 'utf8');
const reviewSource = fs.readFileSync(reviewPath, 'utf8');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');
const photoStatusMigrationSource = fs.readFileSync(photoStatusMigrationPath, 'utf8');
const rolloutSource = fs.readFileSync(rolloutPath, 'utf8');

assert.ok(
  uploadSource.includes('stripCampsitePhotoMetadata') &&
    uploadSource.includes('createCampsitePhotoThumbnail') &&
    uploadSource.includes('canvas.toBlob') &&
    uploadSource.includes('image/jpeg') &&
    uploadSource.includes('exif_stripped: true') &&
    uploadSource.includes('safeStorageSegment') &&
    !uploadSource.includes('file.name}`'),
  'Photo upload should re-encode images, create safe thumbnails, mark EXIF stripped, and avoid raw original filenames.',
);

assert.ok(
  serviceSource.includes('attachPhotoToReport') &&
    serviceSource.includes('photoStatusForReport') &&
    serviceSource.includes("'private'") &&
    serviceSource.includes("'group_visible'") &&
    serviceSource.includes('moderatePhoto') &&
    serviceSource.includes('listApprovedPhotosForCampSite') &&
    serviceSource.includes('updatePhotosForReport') &&
    !serviceSource.includes("moderation_status: 'approved',\\n      });"),
  'Campsite service should attach report-linked photos and keep public approval separate from report approval.',
);

assert.ok(
  formSource.includes('ATTACH PHOTOS') &&
    formSource.includes('campsitePhotosEnabled') &&
    rolloutSource.includes('campsitePhotosEnabled: true') &&
    formSource.includes('uploadCampsitePhotoForReport') &&
    formSource.includes('attachPhotoToReport') &&
    formSource.includes('Photos are stripped of metadata before public use.') &&
    formSource.includes('ECS strips photo metadata before upload'),
  'Recommendation form should expose optional photo attachment and metadata-stripping copy.',
);

assert.ok(
  detailSource.includes('Approved Photos') &&
    detailSource.includes('photoThumb') &&
    reviewSource.includes('Photo Preview') &&
    reviewSource.includes('EXIF stripped') &&
    reviewSource.includes('Campsite photo approved.') &&
    reviewSource.includes('Campsite photo rejected.'),
  'Approved photos should render in the detail card and pending photos should preview with moderation actions.',
);

assert.ok(
  migrationSource.includes('camp_site_photos_select_approved_public') &&
    photoStatusMigrationSource.includes("'private'") &&
    photoStatusMigrationSource.includes("'group_visible'") &&
    photoStatusMigrationSource.includes("moderation_status = 'approved'") &&
    photoStatusMigrationSource.includes('exif_stripped = true') &&
    migrationSource.includes("camp_sites.visibility = 'community'"),
  'RLS should expose only approved community campsite photos publicly.',
);

console.log('Campsite photo support checks passed.');
