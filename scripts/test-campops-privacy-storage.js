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

function installLocalStorageMock() {
  const store = new Map();
  global.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  return store;
}

function debriefInput(overrides = {}) {
  return campops.createDefaultCampOpsDebriefInput({
    campId: 'privacy-camp',
    campName: 'Privacy Camp',
    location: { latitude: 39.123456, longitude: -119.987654, accuracyMeters: 8, label: 'Exact turnout' },
    visitedAtIso: '2026-04-30T18:00:00.000Z',
    submittedAtIso: '2026-04-30T19:00:00.000Z',
    userId: 'user-private-123',
    vehicleProfileId: 'vehicle-private-456',
    allowVehicleProfileAssociation: true,
    source: 'manual',
    notes: 'Private note with user:abc123 vehicle:def456 plate:ABC123 and file:///private/photo.jpg',
    photos: [
      {
        id: 'photo-private',
        localUri: 'file:///private/photo.jpg',
        visibility: 'private',
      },
    ],
    structured: {
      ...campops.DEFAULT_CAMP_OPS_DEBRIEF_STRUCTURED_FIELDS,
      wasCampAccessible: 'yes',
      observedLegalStatus: 'posted_allowed',
      approximateVehicleCapacity: 2,
      trailerTurnaroundDifficulty: 'tight',
    },
    ...overrides,
  });
}

function aiRecommendationSet() {
  const recommendedCamp = {
    id: 'camp-a',
    name: 'Camp A',
    location: { latitude: 39.1, longitude: -119.9 },
    source: 'route_candidate',
    sourceConfidence: 'medium',
  };
  return {
    recommendedCamp,
    backupCamp: null,
    emergencyCamp: null,
    weatherFallbackCamp: null,
    resupplyCamp: null,
    trailerSafeCamp: null,
    rejectedCandidates: [],
    warnings: ['Closure status unknown.'],
    assumptions: ['Recommendation based on limited data.'],
    confidenceSummary: {
      level: 'medium',
      score: 68,
      reasons: ['Medium source confidence.'],
      missingDataFields: ['closureStatus'],
    },
    explanations: {
      whyRecommended: 'Camp A has the best deterministic CampOps balance.',
      keyTradeoffs: ['Legal confidence is medium.'],
    },
    scoresByCandidateId: {},
    enrichmentsByCandidateId: {
      'camp-a': {
        candidateId: 'camp-a',
        legalStatus: 'allowed',
        legalConfidence: 'medium',
        closureStatus: 'unknown',
        publicAccessStatus: 'public',
        accessDifficulty: 'easy',
        vehicleFit: 'fit',
        trailerSuitability: 'unknown',
        turnaroundSuitability: 'unknown',
        weatherExposure: 'unknown',
        fireRestrictionStatus: 'unknown',
        privacyLikelihood: 'unknown',
        occupancyLikelihood: 'unknown',
        lateArrivalRisk: 'unknown',
        dataConfidence: 'medium',
        dataLimitations: ['Closure provider missing.'],
      },
    },
    sourceBundlesByCandidateId: {},
    decisionPoint: null,
  };
}

(async () => {
  installLocalStorageMock();
  campops.clearStoredCampOpsDebriefs();

  const privateRecord = campops.createCampOpsDebriefRecord(
    debriefInput(),
    '2026-04-30T19:00:00.000Z',
  );
  assert.strictEqual(privateRecord.visibility, 'private', 'Debriefs default to private.');
  assert.strictEqual(privateRecord.privacy.retentionExpiresAtIso, '2027-04-30T19:00:00.000Z');
  assert.strictEqual(campops.buildCampOpsCommunitySafeDebrief(privateRecord), null);

  const publicSafeFromPrivate = campops.buildCampOpsCommunitySafeDebrief(privateRecord, {
    allowApproximateLocation: true,
  });
  assert.strictEqual(publicSafeFromPrivate, null, 'Community export must not read private-only debrief fields.');

  const communityRecord = campops.createCampOpsDebriefRecord(
    debriefInput({
      visibility: 'community_anonymized',
      publishingState: 'approved_anonymized',
      publishingConsent: {
        publishCommunityAnonymized: true,
        acceptedAtIso: '2026-04-30T18:55:00.000Z',
        consentVersion: 'campops-community-v1',
      },
      rolloutConfig: {
        campopsDebriefCommunityPublishingEnabled: true,
      },
    }),
    '2026-04-30T19:00:00.000Z',
  );
  assert.strictEqual(communityRecord.userId, null);
  assert.strictEqual(communityRecord.vehicleProfileId, null);
  assert.strictEqual(communityRecord.photos.length, 0);
  assert.strictEqual(communityRecord.location.accuracyMeters, null);
  assert.strictEqual(communityRecord.privacy.retentionExpiresAtIso, '2026-07-29T19:00:00.000Z');
  const communitySafe = campops.buildCampOpsCommunitySafeDebrief(communityRecord, {
    allowApproximateLocation: true,
    rolloutConfig: { campopsDebriefCommunityPublishingEnabled: true },
  });
  assert.strictEqual(communitySafe.userId, undefined);
  assert.strictEqual(communitySafe.vehicleProfileId, undefined);
  assert.strictEqual(communitySafe.notes, undefined);
  assert.strictEqual(communitySafe.approximateLocation.accuracyMeters, null);

  const communityFlagOffRecord = campops.createCampOpsDebriefRecord(
    debriefInput({
      visibility: 'community_anonymized',
      publishingState: 'approved_anonymized',
      publishingConsent: {
        publishCommunityAnonymized: true,
        acceptedAtIso: '2026-04-30T18:55:00.000Z',
        consentVersion: 'campops-community-v1',
      },
    }),
    '2026-04-30T19:00:00.000Z',
  );
  assert.strictEqual(communityFlagOffRecord.visibility, 'private');
  assert.strictEqual(communityFlagOffRecord.publishingState, 'private');

  const pendingReviewRecord = campops.createCampOpsDebriefRecord(
    debriefInput({
      visibility: 'community_anonymized',
      publishingState: 'pending_review',
      publishingConsent: {
        publishCommunityAnonymized: true,
        acceptedAtIso: '2026-04-30T18:55:00.000Z',
        consentVersion: 'campops-community-v1',
      },
      rolloutConfig: {
        campopsDebriefCommunityPublishingEnabled: true,
      },
    }),
    '2026-04-30T19:00:00.000Z',
  );
  assert.strictEqual(
    campops.buildCampOpsCommunitySafeDebrief(pendingReviewRecord, {
      rolloutConfig: { campopsDebriefCommunityPublishingEnabled: true },
    }),
    null,
    'Moderation approval is required before public-safe community output.',
  );
  const rejectedRecord = { ...communityRecord, publishingState: 'rejected' };
  const removedRecord = { ...communityRecord, publishingState: 'removed' };
  assert.strictEqual(
    campops.buildCampOpsCommunitySafeDebrief(rejectedRecord, {
      rolloutConfig: { campopsDebriefCommunityPublishingEnabled: true },
    }),
    null,
    'Rejected moderation state must not be public visible.',
  );
  assert.strictEqual(
    campops.buildCampOpsCommunitySafeDebrief(removedRecord, {
      rolloutConfig: { campopsDebriefCommunityPublishingEnabled: true },
    }),
    null,
    'Removed moderation state must not be public visible.',
  );

  const service = new campops.CampOpsDebriefService();
  const capture = await service.captureDebrief(debriefInput({ campId: 'delete-me' }));
  assert.strictEqual(capture.ok, true);
  assert.strictEqual(campops.getStoredCampOpsDebriefs().length, 1);
  assert.strictEqual(campops.deleteStoredCampOpsDebrief(capture.data.id), true);
  assert.strictEqual(campops.getStoredCampOpsDebriefs().length, 0, 'Stored debrief delete path should remove one record.');
  await service.captureDebrief(debriefInput({ campId: 'clear-me' }));
  assert.strictEqual(campops.getStoredCampOpsDebriefs().length, 1);
  campops.clearStoredCampOpsDebriefs();
  assert.strictEqual(campops.getStoredCampOpsDebriefs().length, 0, 'Stored debrief clear path should remove all records.');

  const expired = campops.createCampOpsDebriefRecord(
    debriefInput({ campId: 'expired', privacy: { retentionDays: 1 } }),
    '2020-01-01T00:00:00.000Z',
  );
  await new campops.LocalCampOpsDebriefBackend().insertDebrief(expired);
  assert.strictEqual(campops.getStoredCampOpsDebriefs().length, 0, 'Expired debrief records should be pruned on read.');

  const redactedSummary = campops.redactCampOpsSourceSummaryForOfflineCache(
    'Observed by user:abc123 in vehicle:def456 near 39.123456,-119.987654. Call 555-867-5309 file:///private/source.json',
  );
  assert.ok(!redactedSummary.includes('user:abc123'));
  assert.ok(!redactedSummary.includes('vehicle:def456'));
  assert.ok(!redactedSummary.includes('39.123456,-119.987654'));
  assert.ok(!redactedSummary.includes('555-867-5309'));
  assert.ok(!redactedSummary.includes('file:///private/source.json'));

  const cachedSignal = campops.redactCampOpsSourceSignalForOfflineCache({
    source: 'offline_dataset',
    confidence: 'medium',
    observedAtIso: '2026-04-30T16:00:00.000Z',
    legalStatus: 'allowed',
    dataLimitations: [
      'Legal source from user:abc123 at 39.123456,-119.987654 with vehicle:def456.',
    ],
  });
  assert.ok(!JSON.stringify(cachedSignal).includes('user:abc123'));
  assert.ok(!JSON.stringify(cachedSignal).includes('vehicle:def456'));

  const providerResult = campops.redactCampOpsProviderResultForOfflineCache({
    candidateId: 'camp-a',
    providerId: 'privacy-provider',
    providerDisplayName: 'Privacy Provider',
    sourceCategory: 'legal',
    sourceConfidence: 'medium',
    sourceFreshness: 'fresh',
    sourceTimestampIso: '2026-04-30T16:00:00.000Z',
    rawProviderStatus: {
      sourceSummary: 'Report from user:abc123',
      apiKey: 'do-not-store',
      coordinate: '39.123456,-119.987654',
    },
    signal: cachedSignal,
    warnings: ['Provider warning for vehicle:def456'],
    errors: [],
    missingDataReason: null,
  });
  assert.strictEqual(providerResult.rawProviderStatus.apiKey, undefined);
  assert.ok(!JSON.stringify(providerResult).includes('user:abc123'));
  assert.ok(!JSON.stringify(providerResult).includes('vehicle:def456'));
  assert.ok(!JSON.stringify(providerResult).includes('39.123456,-119.987654'));

  const normalizedBundle = await campops.collectCampOpsSourceProviderBundle({
    context: {
      id: 'privacy-source-context',
      currentTimeIso: '2026-04-30T18:00:00.000Z',
      riskTolerance: 'balanced',
      offlineMode: 'online',
    },
    candidates: [
      {
        id: 'camp-a',
        name: 'Camp A',
        location: { latitude: 39.1, longitude: -119.9 },
        source: 'route_candidate',
        sourceConfidence: 'medium',
      },
    ],
    providers: [
      {
        id: 'privacy-normalizer',
        displayName: 'Privacy Normalizer',
        sourceCategory: 'legal',
        sourceConfidence: 'medium',
        collectSignals: () => [
          {
            candidateId: 'camp-a',
            signal: {
              source: 'offline_dataset',
              confidence: 'medium',
              observedAtIso: '2026-04-30T17:30:00.000Z',
              legalStatus: 'allowed',
              dataLimitations: ['Legal source from user:abc123 at 39.123456,-119.987654.'],
            },
            warnings: ['Warning contains vehicle:def456.'],
            errors: ['Error contains user:abc123.'],
            missingDataReason: 'Missing closure for trip:secret123.',
          },
        ],
      },
    ],
  });
  const normalizedJson = JSON.stringify(normalizedBundle);
  assert.ok(!normalizedJson.includes('user:abc123'));
  assert.ok(!normalizedJson.includes('vehicle:def456'));
  assert.ok(!normalizedJson.includes('trip:secret123'));
  assert.ok(!normalizedJson.includes('39.123456,-119.987654'));

  const prompt = campops.buildCampOpsAiAssistPrompt({
    context: {
      id: 'ctx-privacy',
      routeId: 'route-private',
      currentTimeIso: '2026-04-30T16:00:00.000Z',
      riskTolerance: 'balanced',
      offlineMode: 'online',
      vehicleProfile: {
        vehicleId: 'vehicle-private-ai',
        label: 'Private Rig Name',
        vehicleType: 'truck',
        trailerAttached: true,
        confidence: 'medium',
      },
      convoyProfile: {
        groupId: 'convoy-private-ai',
        groupLabel: 'Private Convoy Name',
        peopleCount: 4,
        vehicleCount: 2,
        source: 'manual',
        confidence: 'medium',
        medicalOrAccessibilityConstraint: true,
      },
      resourceState: {
        fuelReserveMiles: 80,
        waterGallons: 8,
        source: 'manual',
        confidence: 'medium',
      },
    },
    recommendationSet: aiRecommendationSet(),
    mode: 'field',
  });
  assert.ok(!prompt.includes('vehicle-private-ai'));
  assert.ok(!prompt.includes('Private Rig Name'));
  assert.ok(!prompt.includes('convoy-private-ai'));
  assert.ok(!prompt.includes('Private Convoy Name'));
  assert.ok(!prompt.includes('medicalOrAccessibilityConstraint'));

  const privacyReviewPath = path.join(root, 'docs', 'campops', 'privacy_storage_review.md');
  const privacyReview = fs.readFileSync(privacyReviewPath, 'utf8');
  const requiredRiskCopy = [
    'CampOps does not provide encryption for `localStorage` debrief persistence.',
    'No dedicated durable source cache exists yet.',
    'If another app layer persists recommendation sets, endpoint outputs, or AI summaries',
    'Broad community pipelines still require a separate privacy review.',
    'Draft, pending-review, rejected, and removed records are not public-visible.',
    'Retention, encryption, deletion, and access-control owners are still TBD for broad real trip/debrief field data.',
  ];
  for (const expected of requiredRiskCopy) {
    assert.ok(
      privacyReview.includes(expected),
      `Privacy storage review must retain remaining-risk copy: ${expected}`,
    );
  }

  console.log('CampOps privacy storage checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
