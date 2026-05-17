const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campOpsPath = path.join(root, 'lib', 'campops', 'index.ts');

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

const campops = require(campOpsPath);

const input = campops.createDefaultCampOpsDebriefInput({
  campId: 'camp-123',
  campName: 'Granite Wash',
  location: { latitude: 39.1234, longitude: -119.9876 },
  visitedAtIso: '2026-04-30T04:30:00.000-07:00',
  submittedAtIso: '2026-04-30T09:00:00.000-07:00',
  userId: 'user-private',
  vehicleProfileId: 'vehicle-private',
  allowVehicleProfileAssociation: false,
  source: 'marked_visited',
  notes: '  Flat enough for two rigs.\nWind picked up after sunset.  ',
  photos: [
    {
      localUri: 'file:///local/camp.jpg',
      exifStripped: true,
      visibility: 'private',
    },
  ],
  structured: {
    wasCampAccessible: 'yes',
    observedLegalStatus: 'posted_allowed',
    approximateVehicleCapacity: 3,
    flatness: 'mostly_flat',
    trailerTurnaroundDifficulty: 'tight',
    privacy: 'high',
    windExposure: 'caution',
    fireRestrictionSignage: 'posted_restricted',
    hazards: ['wash crossing', ' wash crossing ', 'low branches'],
    lateArrivalSuitability: 'caution',
    petsSuitability: 'yes',
    kidsSuitability: 'yes',
    recommendSoloVehicle: 'yes',
    recommendFamily: 'yes',
    recommendTrailer: 'no',
    recommendLargeGroup: 'no',
  },
});

const validation = campops.validateCampOpsDebriefInput(input);
assert.strictEqual(validation.ok, true);

const record = campops.createCampOpsDebriefRecord(input, '2026-04-30T18:00:00.000Z');
assert.strictEqual(record.campId, 'camp-123');
assert.strictEqual(record.vehicleProfileId, null, 'Vehicle profile association must be explicit opt-in.');
assert.strictEqual(record.visibility, 'private');
assert.strictEqual(record.userId, 'user-private');
assert.strictEqual(record.privacy.preciseLocationStored, true);
assert.strictEqual(record.privacy.userIdStored, true);
assert.strictEqual(record.privacy.photoRefsStored, true);
assert.strictEqual(record.structured.hazards.length, 2);
assert.strictEqual(record.notes, 'Flat enough for two rigs. Wind picked up after sunset.');
assert.strictEqual(record.photos[0].visibility, 'private');

const optedInRecord = campops.createCampOpsDebriefRecord(
  {
    ...input,
    allowVehicleProfileAssociation: true,
  },
  '2026-04-30T18:00:00.000Z',
);
assert.strictEqual(optedInRecord.vehicleProfileId, 'vehicle-private');

const communityWithoutConsent = campops.validateCampOpsDebriefInput({
  ...input,
  visibility: 'community_anonymized',
});
assert.strictEqual(communityWithoutConsent.ok, false, 'Community publishing must require explicit consent.');
assert.ok(communityWithoutConsent.errors.some((error) => error.includes('explicit community publishing consent')));

const communityFlagOff = campops.validateCampOpsDebriefInput({
  ...input,
  visibility: 'community_anonymized',
  publishingConsent: {
    publishCommunityAnonymized: true,
    acceptedAtIso: '2026-04-30T17:59:00.000Z',
    consentVersion: 'campops-community-v1',
  },
});
assert.strictEqual(communityFlagOff.ok, false, 'Community publishing must remain disabled unless the rollout flag is enabled.');
assert.ok(communityFlagOff.errors.some((error) => error.includes('disabled for this CampOps rollout')));

const defensivePrivateRecord = campops.createCampOpsDebriefRecord(
  {
    ...input,
    visibility: 'community_anonymized',
  },
  '2026-04-30T18:00:00.000Z',
);
assert.strictEqual(defensivePrivateRecord.visibility, 'private', 'Direct record creation should not publish without consent.');
assert.strictEqual(defensivePrivateRecord.publishingState, 'private');

const communityDraftRecord = campops.createCampOpsDebriefRecord(
  {
    ...input,
    visibility: 'community_anonymized',
    publishingConsent: {
      publishCommunityAnonymized: true,
      acceptedAtIso: '2026-04-30T17:59:00.000Z',
      consentVersion: 'campops-community-v1',
    },
    rolloutConfig: {
      campopsDebriefCommunityPublishingEnabled: true,
    },
    allowVehicleProfileAssociation: true,
    privacy: { retentionDays: 30 },
  },
  '2026-04-30T18:00:00.000Z',
);
assert.strictEqual(communityDraftRecord.publishingState, 'community_draft');
assert.strictEqual(
  campops.buildCampOpsCommunitySafeDebrief(communityDraftRecord, {
    rolloutConfig: { campopsDebriefCommunityPublishingEnabled: true },
  }),
  null,
  'Community-safe output requires moderation approval.',
);

const publicCandidateRecord = campops.createCampOpsDebriefRecord(
  {
    ...input,
    visibility: 'community_anonymized',
    publishingState: 'approved_anonymized',
    publishingConsent: {
      publishCommunityAnonymized: true,
      acceptedAtIso: '2026-04-30T17:59:00.000Z',
      consentVersion: 'campops-community-v1',
    },
    rolloutConfig: {
      campopsDebriefCommunityPublishingEnabled: true,
    },
    allowVehicleProfileAssociation: true,
    privacy: { retentionDays: 30 },
  },
  '2026-04-30T18:00:00.000Z',
);
assert.strictEqual(publicCandidateRecord.userId, null, 'Community-visible debriefs should not persist private user ids by default.');
assert.strictEqual(publicCandidateRecord.vehicleProfileId, null, 'Community-visible debriefs should not persist vehicle associations by default.');
assert.strictEqual(publicCandidateRecord.photos.length, 0, 'Community-visible debriefs should not persist raw photo refs by default.');
assert.strictEqual(publicCandidateRecord.location.latitude, 39.12);
assert.strictEqual(publicCandidateRecord.location.longitude, -119.99);
assert.strictEqual(publicCandidateRecord.location.accuracyMeters, null);
assert.strictEqual(publicCandidateRecord.privacy.preciseLocationStored, false);
assert.strictEqual(publicCandidateRecord.privacy.retentionExpiresAtIso, '2026-05-30T18:00:00.000Z');
assert.strictEqual(publicCandidateRecord.privacy.publishingConsent.scope, 'community_anonymized');
assert.strictEqual(publicCandidateRecord.privacy.publishingConsent.consentVersion, 'campops-community-v1');

const publicSafeFlagOff = campops.buildCampOpsCommunitySafeDebrief(publicCandidateRecord, { allowApproximateLocation: true });
assert.strictEqual(publicSafeFlagOff, null, 'Community-safe output also requires the publishing flag at export time.');

const publicSafe = campops.buildCampOpsCommunitySafeDebrief(publicCandidateRecord, {
  allowApproximateLocation: true,
  rolloutConfig: { campopsDebriefCommunityPublishingEnabled: true },
});
assert.strictEqual(publicSafe.campId, 'camp-123');
assert.strictEqual(publicSafe.observedAccess, 'yes');
assert.strictEqual(publicSafe.observedCapacity, 3);
assert.strictEqual(publicSafe.observedTrailerSuitability, 'limited');
assert.strictEqual(publicSafe.observedFireSignage, 'posted_restricted');
assert.strictEqual(publicSafe.dateBucket, '2026-04');
assert.strictEqual(publicSafe.confidence, 'high');
assert.strictEqual(publicSafe.publishingState, 'approved_anonymized');
assert.strictEqual(publicSafe.approximateLocation.latitude, 39.1);
assert.strictEqual(publicSafe.approximateLocation.longitude, -120);
assert.strictEqual(publicSafe.userId, undefined, 'Public-safe debrief must not include user identifiers.');
assert.strictEqual(publicSafe.vehicleProfileId, undefined, 'Public-safe debrief must not include vehicle identifiers.');
assert.strictEqual(publicSafe.photos, undefined, 'Public-safe debrief must not include raw photo refs.');

const noLocationPublicSafe = campops.buildCampOpsCommunitySafeDebrief(publicCandidateRecord, {
  rolloutConfig: { campopsDebriefCommunityPublishingEnabled: true },
});
assert.strictEqual(noLocationPublicSafe.approximateLocation, null, 'Approximate location must be explicit opt-in for public output.');

const rejectedRecord = campops.transitionCampOpsDebriefPublishingState(
  { ...communityDraftRecord, publishingState: 'pending_review' },
  'rejected',
  '2026-04-30T19:00:00.000Z',
);
assert.strictEqual(rejectedRecord.publishingState, 'rejected');
assert.strictEqual(
  campops.buildCampOpsCommunitySafeDebrief(rejectedRecord, {
    rolloutConfig: { campopsDebriefCommunityPublishingEnabled: true },
  }),
  null,
  'Rejected community debriefs must not become public-safe output.',
);
const removedRecord = campops.transitionCampOpsDebriefPublishingState(
  publicCandidateRecord,
  'removed',
  '2026-04-30T19:00:00.000Z',
);
assert.strictEqual(removedRecord.publishingState, 'removed');
assert.strictEqual(
  campops.buildCampOpsCommunitySafeDebrief(removedRecord, {
    rolloutConfig: { campopsDebriefCommunityPublishingEnabled: true },
  }),
  null,
  'Removed community debriefs must not become public-safe output.',
);

const redactedNote = campops.redactCampOpsDebriefNoteForCommunity(
  'Call me at 555-867-5309 or email driver@example.com. vehicle:abc123 file:///private/photo.jpg',
);
assert.ok(redactedNote.includes('[redacted phone]'));
assert.ok(redactedNote.includes('[redacted email]'));
assert.ok(redactedNote.includes('[redacted identifier]'));
assert.ok(redactedNote.includes('[redacted local ref]'));

const patch = campops.buildCampOpsDebriefSuitabilityPatch(record);
assert.strictEqual(patch.candidateId, 'camp-123');
assert.strictEqual(patch.legalConfidence, 'high');
assert.strictEqual(patch.vehicleFit, 'fit');
assert.strictEqual(patch.trailerSuitability, 'limited');
assert.strictEqual(patch.groupCapacityEstimate, 3);
assert.strictEqual(patch.lateArrivalRisk, 'caution');
assert.strictEqual(patch.recommendationHints.trailer, 'no');

const privatePatch = campops.buildCampOpsDebriefSuitabilityPatch(defensivePrivateRecord);
assert.strictEqual(privatePatch.candidateId, 'camp-123', 'Private debriefs still improve personal suitability signals.');

const invalid = campops.validateCampOpsDebriefInput({
  ...input,
  location: { latitude: 200, longitude: -119.9 },
  structured: {
    ...input.structured,
    approximateVehicleCapacity: -1,
  },
});
assert.strictEqual(invalid.ok, false);
assert.ok(invalid.errors.some((error) => error.includes('latitude')));
assert.ok(invalid.errors.some((error) => error.includes('approximateVehicleCapacity')));

const backend = new campops.MemoryCampOpsDebriefBackend();
const service = new campops.CampOpsDebriefService(backend);
service.captureDebrief(input).then((result) => {
  assert.strictEqual(result.ok, true);
  assert.strictEqual(backend.records.length, 1);
  assert.strictEqual(backend.records[0].visibility, 'private');
  assert.strictEqual(backend.records[0].structured.observedLegalStatus, 'posted_allowed');

  campops.clearStoredCampOpsDebriefsForTest();
  const localService = new campops.CampOpsDebriefService();
  return localService.captureDebrief(input);
}).then((result) => {
  assert.strictEqual(result.ok, true);
  const stored = campops.getStoredCampOpsDebriefs();
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(stored[0].structured.flatness, 'mostly_flat');
  campops.clearStoredCampOpsDebriefsForTest();
  console.log('CampOps debrief checks passed.');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
