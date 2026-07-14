const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

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

const {
  buildOfflineFailureDrillFromCacheFixture,
} = require(path.join(root, 'lib', 'offlineFailureDrillService.ts'));
const {
  validateOfflineFailureDrillAndroidEvidenceManifest,
} = require(path.join(root, 'lib', 'offlineFailureDrillEvidence.ts'));
const {
  buildExpeditionReadiness,
} = require(path.join(root, 'lib', 'readiness', 'expeditionReadinessScoring.ts'));
const {
  buildOfflineFailureDrillEvidenceCaptureBundle,
  buildOfflineFailureDrillAndroidManifestFromCapture,
  buildOfflineFailureDrillCaptureArtifactPayloads,
  summarizeOfflineFailureDrillResultForEvidence,
} = require(path.join(root, 'lib', 'offlineFailureDrillEvidenceCapture.ts'));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

const now = '2026-06-14T18:00:00.000Z';
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'offline-failure-drill', 'partial.json'), 'utf8'));
const drillResult = buildOfflineFailureDrillFromCacheFixture(fixture, {
  now,
  noNetworkModeVerified: true,
});
const readiness = buildExpeditionReadiness({
  capturedAt: now,
  route: {
    routeId: 'qa-route-01',
    name: 'QA offline shelf route',
    distanceMiles: 42,
    riskLevel: 'high',
    routeConfidence: 'medium',
    source: 'cached',
    updatedAt: now,
  },
  activeVehicle: {
    vehicleId: 'veh-qa',
    label: 'QA Wrangler',
    operatingWeightLbs: 5200,
    gvwrUsagePct: 72,
    recoveryGearReady: true,
    source: 'manual',
    updatedAt: now,
  },
  offline: {
    packageStatus: 'partial',
    routeGeometryCached: true,
    mapTilesCachedForRoute: false,
    mapsDownloaded: false,
    routeDownloaded: true,
    campCandidatesCached: false,
    bailoutPointsCached: true,
    routeBailoutPointCount: 2,
    weatherSnapshotAvailable: true,
    fuelTownRoadReferencesCached: false,
    emergencyPacketAvailable: true,
    currentRoutePackageFresh: true,
    cachedTileCount: 128,
    cachedRegionCount: 1,
    isRemoteRoute: true,
    isOnline: false,
    source: 'cached',
    updatedAt: now,
  },
  fuel: {
    rangeRemainingMiles: 160,
    routeDistanceRemainingMiles: 42,
    reserveMiles: 80,
    source: 'manual',
    updatedAt: now,
  },
  recovery: {
    bailoutRoutesAvailable: true,
    routeBailoutOptionCount: 2,
    currentCoordinatesAvailable: true,
    emergencyCoordinatePacketReady: true,
    recoveryGearReady: true,
    recoveryAccessConfidence: 'high',
    source: 'manual',
    updatedAt: now,
  },
  communications: {
    signalConfidence: 'low',
    satelliteCommsReady: true,
    teamCheckInPlanReady: true,
    source: 'manual',
    updatedAt: now,
  },
});

const summary = summarizeOfflineFailureDrillResultForEvidence(drillResult);
assert.equal(summary.capabilityCount, 8, 'Evidence summary should count every drill capability.');
assert.equal(summary.statuses.partially_available, 3, 'Partial fixture status counts should be preserved.');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-offline-drill-capture-'));
const artifactDir = path.join(tempRoot, 'android-evidence');
const bundle = buildOfflineFailureDrillEvidenceCaptureBundle({
  captureId: 'capture-test-001',
  capturedAt: now,
  source: 'app_runtime_export',
  systemNetworkDisabled: true,
  cacheFixtureProfile: 'partial',
  drillResult,
  readinessAssessment: readiness,
  app: { appBuildId: 'android-dev-client', gitSha: 'abc123' },
  platform: { os: 'android', emulatorName: 'Pixel_8_API_35', apiLevel: 35 },
});

assert.equal(bundle.captureVersion, 1, 'Capture bundles should be versioned.');
assert.equal(bundle.source, 'app_runtime_export', 'The app export should label its source truthfully.');
assert.equal(bundle.offlineAssertions.appObservedOffline, true, 'Runtime offline assertion should come from the drill result.');
assert.equal(bundle.offlineAssertions.runtimeNetworkProbe, 'offline', 'Runtime probe should be captured.');
assert.equal(bundle.resultSummary.capabilityCount, 8, 'Bundle should include drill result summary.');
assert.equal(bundle.readinessMetadata.status, readiness.status, 'Readiness status should be copied from the assessment.');
assert.equal(bundle.readinessMetadata.departureAudit.length, readiness.departureAudit.length, 'Departure Audit item count should be captured.');
assert.ok(
  bundle.readinessMetadata.departureAudit.some((item) => item.itemId === 'offline-map-package' && item.status === 'caution'),
  'Departure Audit statuses should be captured without rewriting them.',
);
assert.equal(
  bundle.readinessMetadata.sourceFreshness.offline.state,
  readiness.sourceFreshness.offline.state,
  'Offline freshness state should be captured for audit review.',
);
assert.ok(
  bundle.productionReadiness.blockers.includes('android_evidence_manifest_missing'),
  'Capture bundle should not pretend production evidence exists.',
);

const payloads = buildOfflineFailureDrillCaptureArtifactPayloads(bundle, {
  artifactDir,
});
assert.equal(payloads.captureBundle.filePath, path.join(artifactDir, 'capture-bundle.json'));
assert.equal(payloads.drillResult.filePath, path.join(artifactDir, 'drill-result.json'));
assert.equal(payloads.offlineAssertions.fileName, 'offline-assertions.json');
assert.equal(payloads.readinessMetadata.fileName, 'readiness-metadata.json');
assert.ok(payloads.readinessMetadata.body.includes('departureAudit'), 'Readiness metadata payload should include Departure Audit details.');

writeJson(payloads.captureBundle.filePath, JSON.parse(payloads.captureBundle.body));
writeJson(payloads.drillResult.filePath, JSON.parse(payloads.drillResult.body));
writeJson(payloads.offlineAssertions.filePath, JSON.parse(payloads.offlineAssertions.body));
writeJson(payloads.readinessMetadata.filePath, JSON.parse(payloads.readinessMetadata.body));
const cacheManifestPath = writeJson(path.join(artifactDir, 'cache-manifest.json'), fixture);

const draftManifest = buildOfflineFailureDrillAndroidManifestFromCapture(bundle, {
  artifactDir,
  manifestPath: path.join(artifactDir, 'manifest.json'),
  cacheManifestPath,
  evidenceSource: 'real',
  systemNetworkDisabled: true,
});
assert.equal(draftManifest.networkState.appObservedOffline, true);
assert.equal(draftManifest.networkState.systemNetworkDisabled, true);
assert.equal(draftManifest.drillResultPath, payloads.drillResult.filePath);
assert.equal(draftManifest.offlineAssertionsPath, payloads.offlineAssertions.filePath);
assert.equal(draftManifest.readinessMetadataPath, payloads.readinessMetadata.filePath);
assert.equal(draftManifest.resultSummary.statuses.partially_available, 3);
assert.equal(draftManifest.resultSummary.productionReadiness, 'blocked', 'Manifest helper should stay blocked without owner acceptance.');

const blockedValidation = validateOfflineFailureDrillAndroidEvidenceManifest(draftManifest, {
  rootDir: tempRoot,
  artifactExists: fs.existsSync,
  artifactRead: (artifactPath) => fs.readFileSync(artifactPath, 'utf8'),
  artifactSize: (artifactPath) => fs.statSync(artifactPath).size,
});
assert.equal(blockedValidation.productionEligible, false, 'Missing screenshots/logs/owner acceptance must keep production blocked.');
assert.ok(blockedValidation.failedRules.includes('screenshotPaths.at_least_one_required'));
assert.ok(blockedValidation.failedRules.includes('logPaths.at_least_one_required'));
assert.ok(blockedValidation.blockers.includes('owner_acceptance_missing'));

const screenshot = writeJson(path.join(artifactDir, 'offline-drill-screenshot.png'), { placeholder: 'test artifact' });
const log = writeJson(path.join(artifactDir, 'offline-drill.log'), { placeholder: 'test log' });
const acceptedManifest = buildOfflineFailureDrillAndroidManifestFromCapture(bundle, {
  artifactDir,
  manifestPath: path.join(artifactDir, 'manifest.json'),
  cacheManifestPath,
  evidenceSource: 'real',
  systemNetworkDisabled: true,
  screenshotPaths: [screenshot],
  logPaths: [log],
  ownerAcceptance: {
    accepted: true,
    acceptedBy: 'QA Owner',
    acceptedAt: now,
    notes: ['Reviewed test artifacts for unit coverage only.'],
  },
});
const acceptedValidation = validateOfflineFailureDrillAndroidEvidenceManifest(acceptedManifest, {
  rootDir: tempRoot,
  artifactExists: fs.existsSync,
  artifactRead: (artifactPath) => fs.readFileSync(artifactPath, 'utf8'),
  artifactSize: (artifactPath) => fs.statSync(artifactPath).size,
});
assert.equal(
  acceptedValidation.structurallyValid,
  true,
  `Accepted real-shaped manifest should validate structurally: ${acceptedValidation.failedRules.join(', ')}`,
);
assert.equal(acceptedValidation.productionEligible, true, 'Real accepted manifest with required artifacts should be production eligible.');

console.log('offline failure drill evidence capture checks passed');
