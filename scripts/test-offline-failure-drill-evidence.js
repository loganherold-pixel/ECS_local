const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const evidencePath = path.join(root, 'lib', 'offlineFailureDrillEvidence.ts');
const servicePath = path.join(root, 'lib', 'offlineFailureDrillService.ts');
const panelPath = path.join(root, 'components', 'offline', 'OfflineFailureDrillPanel.tsx');
const runnerPath = path.join(root, 'scripts', 'run-offline-failure-drill-android-evidence.mjs');
const docsPath = path.join(root, 'docs', 'offline-failure-drill-android-evidence.md');
const fixturesDir = path.join(root, 'fixtures', 'offline-failure-drill');

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
  validateOfflineFailureDrillAndroidEvidenceManifest,
  validateOfflineFailureDrillCacheFixtureManifest,
  buildOfflineFailureDrillRuntimeNetworkEvidence,
} = require(evidencePath);

const {
  buildOfflineFailureDrillFromCacheFixture,
} = require(servicePath);

function mkdirp(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeArtifact(filePath, body = 'artifact') {
  mkdirp(filePath);
  fs.writeFileSync(filePath, body, 'utf8');
  return filePath;
}

function validManifest(tempRoot, overrides = {}) {
  const artifactDir = path.join(tempRoot, 'evidence');
  const cacheManifestPath = writeArtifact(path.join(artifactDir, 'cache-manifest.json'), '{}');
  const drillResultPath = writeArtifact(path.join(artifactDir, 'drill-result.json'), '{}');
  const screenshotPath = writeArtifact(path.join(artifactDir, 'offline-drill.png'), 'png');
  const logPath = writeArtifact(path.join(artifactDir, 'offline-drill.log'), 'log');
  const manifestPath = path.join(artifactDir, 'manifest.json');
  return {
    evidenceId: 'offline-drill-test-evidence',
    evidenceKind: 'android_no_network_emulator',
    evidenceSource: 'synthetic',
    generatedAt: '2026-06-13T18:00:00.000Z',
    app: {
      appBuildId: 'test-build',
      appVersion: '1.0.0',
      gitSha: 'test-sha',
      bundleId: 'com.ecs.test',
    },
    platform: {
      os: 'android',
      emulatorName: 'Pixel_API_35',
      osVersion: '15',
      apiLevel: 35,
    },
    networkState: {
      appObservedOffline: true,
      systemNetworkDisabled: true,
      checkedAt: '2026-06-13T18:00:00.000Z',
      runtimeNetworkProbe: 'offline',
      notes: ['App runtime reported offline before the drill ran.'],
    },
    cacheFixtureProfile: 'available',
    cacheManifestPath,
    drillResultPath,
    screenshotPaths: [screenshotPath],
    logPaths: [logPath],
    remoteAttemptSummary: {
      providerUpdateAttempted: true,
      providerUpdateSucceeded: false,
      liveSyncAttempted: true,
      liveSyncSucceeded: false,
      dispatchReplayAttempted: true,
      dispatchReplaySucceeded: true,
      dispatchReplayLocalOnly: true,
      weatherRefreshAttempted: true,
      weatherRefreshSucceeded: false,
      teamSyncAttempted: true,
      teamSyncSucceeded: false,
    },
    resultSummary: {
      capabilityCount: 8,
      statuses: {
        available_offline: 5,
        partially_available: 1,
        cached_but_stale: 1,
        manual_fallback_required: 1,
      },
      productionReadiness: 'blocked',
    },
    ownerAcceptance: {
      accepted: true,
      acceptedBy: 'QA Owner',
      acceptedAt: '2026-06-13T18:30:00.000Z',
      notes: ['Accepted for production evidence review.'],
    },
    artifacts: {
      directory: artifactDir,
      manifestPath,
    },
    validationNotes: ['Synthetic manifest fixture for unit tests only.'],
    ...overrides,
  };
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-offline-drill-evidence-'));
const validationOptions = {
  rootDir: tempRoot,
  artifactExists: fs.existsSync,
};

const synthetic = validateOfflineFailureDrillAndroidEvidenceManifest(validManifest(tempRoot), {
  ...validationOptions,
});
assert.equal(synthetic.structurallyValid, true, 'Synthetic fixture should satisfy structural evidence rules.');
assert.equal(synthetic.productionEligible, false, 'Synthetic evidence must never unblock production.');
assert.ok(synthetic.blockers.includes('android_evidence_source_not_real'), 'Synthetic evidence should be blocked by source type.');

const realAccepted = validateOfflineFailureDrillAndroidEvidenceManifest(validManifest(tempRoot, {
  evidenceSource: 'real',
  resultSummary: {
    capabilityCount: 8,
    statuses: { available_offline: 8 },
    productionReadiness: 'accepted',
  },
}), validationOptions);
assert.equal(realAccepted.structurallyValid, true, 'Real-shaped manifest should be structurally valid.');
assert.equal(realAccepted.productionEligible, true, 'Real accepted evidence with artifacts should be production eligible.');

const noOwner = validateOfflineFailureDrillAndroidEvidenceManifest(validManifest(tempRoot, {
  evidenceSource: 'real',
  ownerAcceptance: { accepted: false, notes: ['Owner review pending.'] },
}), validationOptions);
assert.equal(noOwner.productionEligible, false, 'Owner acceptance is required before production can unblock.');
assert.ok(noOwner.blockers.includes('owner_acceptance_missing'));

const onlineRuntime = validateOfflineFailureDrillAndroidEvidenceManifest(validManifest(tempRoot, {
  networkState: {
    appObservedOffline: false,
    systemNetworkDisabled: true,
    checkedAt: '2026-06-13T18:00:00.000Z',
    runtimeNetworkProbe: 'online',
    notes: [],
  },
}), validationOptions);
assert.equal(onlineRuntime.structurallyValid, false, 'Runtime online evidence must fail closed.');
assert.ok(onlineRuntime.failedRules.includes('networkState.runtimeNetworkProbe_offline_required'));

const remoteSucceeded = validateOfflineFailureDrillAndroidEvidenceManifest(validManifest(tempRoot, {
  remoteAttemptSummary: {
    providerUpdateAttempted: true,
    providerUpdateSucceeded: true,
    liveSyncAttempted: true,
    liveSyncSucceeded: false,
  },
}), validationOptions);
assert.equal(remoteSucceeded.structurallyValid, false, 'Provider update success is contradictory during no-network evidence.');
assert.ok(remoteSucceeded.failedRules.includes('remoteAttemptSummary.providerUpdateSucceeded_must_be_false'));

const missingArtifacts = validateOfflineFailureDrillAndroidEvidenceManifest(validManifest(tempRoot, {
  cacheManifestPath: path.join(tempRoot, 'missing-cache-manifest.json'),
  screenshotPaths: [],
  logPaths: [],
}), validationOptions);
assert.equal(missingArtifacts.structurallyValid, false, 'Missing evidence artifacts must fail validation.');
assert.ok(missingArtifacts.missingArtifacts.some((item) => item.includes('missing-cache-manifest.json')));
assert.ok(missingArtifacts.failedRules.includes('screenshotPaths.at_least_one_required'));
assert.ok(missingArtifacts.failedRules.includes('logPaths.at_least_one_required'));

const runtimeOffline = buildOfflineFailureDrillRuntimeNetworkEvidence({
  checkedAt: '2026-06-13T18:00:00.000Z',
  connectivityState: 'offline',
});
assert.deepEqual(runtimeOffline, {
  checkedAt: '2026-06-13T18:00:00.000Z',
  appObservedOffline: true,
  runtimeNetworkProbe: 'offline',
  providerReachability: 'not_checked_due_to_offline',
  notes: ['Runtime connectivity state reported offline.'],
});

const fixtureProfiles = ['available', 'partial', 'stale', 'unavailable', 'manual_fallback'];
for (const profile of fixtureProfiles) {
  const fixturePath = path.join(fixturesDir, `${profile}.json`);
  assert.ok(fs.existsSync(fixturePath), `Expected cache fixture profile: ${fixturePath}`);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const fixtureValidation = validateOfflineFailureDrillCacheFixtureManifest(fixture);
  assert.equal(fixtureValidation.valid, true, `${profile} fixture should validate: ${fixtureValidation.errors.join(', ')}`);

  const result = buildOfflineFailureDrillFromCacheFixture(fixture, {
    now: '2026-06-13T18:00:00.000Z',
    noNetworkModeVerified: true,
  });
  assert.equal(result.localOnly, true, `${profile} fixture result should remain local-only.`);
  assert.equal(result.runtimeNetworkEvidence.runtimeNetworkProbe, 'offline', `${profile} fixture should carry runtime offline evidence.`);
  assert.equal(result.capabilities.length, 8, `${profile} fixture should classify every drill capability.`);
  for (const capability of result.capabilities) {
    assert.ok(capability.probeEvidence.length > 0, `${profile}/${capability.capabilityId} should include probe evidence.`);
    assert.ok(
      capability.probeEvidence.every((probe) => probe.localOnly === true),
      `${profile}/${capability.capabilityId} probes should all be local-only.`,
    );
    for (const inputId of capability.requiredInputs) {
      assert.ok(
        capability.probeEvidence.some((probe) => probe.inputId === inputId),
        `${profile}/${capability.capabilityId} should trace required input ${inputId}.`,
      );
    }
  }
}

const availableResult = buildOfflineFailureDrillFromCacheFixture(
  JSON.parse(fs.readFileSync(path.join(fixturesDir, 'available.json'), 'utf8')),
  { now: '2026-06-13T18:00:00.000Z', noNetworkModeVerified: true },
);
assert.equal(
  availableResult.capabilities.find((item) => item.capabilityId === 'navigate')?.status,
  'available_offline',
  'Available fixture should keep Navigate available offline.',
);

const staleResult = buildOfflineFailureDrillFromCacheFixture(
  JSON.parse(fs.readFileSync(path.join(fixturesDir, 'stale.json'), 'utf8')),
  { now: '2026-06-13T18:00:00.000Z', noNetworkModeVerified: true },
);
assert.ok(
  staleResult.capabilities.some((item) => item.status === 'cached_but_stale'),
  'Stale fixture should produce cached-but-stale capability status.',
);
assert.ok(
  staleResult.recommendedDownloads.some((item) => item.actionType === 'refresh_weather_packet'),
  'Stale weather fixture should recommend refreshing the weather packet.',
);

const partialResult = buildOfflineFailureDrillFromCacheFixture(
  JSON.parse(fs.readFileSync(path.join(fixturesDir, 'partial.json'), 'utf8')),
  { now: '2026-06-13T18:00:00.000Z', noNetworkModeVerified: true },
);
assert.ok(
  partialResult.recommendedDownloads.some((item) => item.actionType === 'download_route_tiles'),
  'Missing route tiles should derive a route tile download recommendation.',
);
assert.ok(
  partialResult.recommendedDownloads.some((item) => item.actionType === 'download_camp_packet'),
  'Missing camp cache should derive a camp packet download recommendation.',
);

const unavailableResult = buildOfflineFailureDrillFromCacheFixture(
  JSON.parse(fs.readFileSync(path.join(fixturesDir, 'unavailable.json'), 'utf8')),
  { now: '2026-06-13T18:00:00.000Z', noNetworkModeVerified: true },
);
assert.ok(
  unavailableResult.capabilities.some((item) => item.capabilityId === 'incident_recovery' && item.status === 'unavailable'),
  'Missing recovery docs should keep Incident & Recovery unavailable.',
);
assert.ok(
  unavailableResult.recommendedDownloads.some((item) => item.actionType === 'save_recovery_docs'),
  'Missing recovery docs should derive a recovery-doc download recommendation.',
);
assert.ok(
  unavailableResult.recommendedDownloads.some((item) => item.actionType === 'prepare_credential_restore'),
  'Invalid credential restore should derive a credential restore recommendation.',
);

const resultJson = JSON.stringify(unavailableResult);
assert.ok(!resultJson.includes('super-secret-token'), 'Credential tokens must be redacted from drill JSON output.');
assert.ok(!resultJson.includes('restore-code-123'), 'Restore codes must be redacted from drill JSON output.');

const manualFallbackResult = buildOfflineFailureDrillFromCacheFixture(
  JSON.parse(fs.readFileSync(path.join(fixturesDir, 'manual_fallback.json'), 'utf8')),
  { now: '2026-06-13T18:00:00.000Z', noNetworkModeVerified: true },
);
const fieldUtilities = manualFallbackResult.capabilities.find((item) => item.capabilityId === 'field_utilities');
assert.equal(fieldUtilities?.status, 'manual_fallback_required');
assert.match(fieldUtilities?.userMessage ?? '', /manual fallback required/i);
assert.match(fieldUtilities?.userMessage ?? '', /local documents/i);

const dispatch = partialResult.capabilities.find((item) => item.capabilityId === 'dispatch_offline_replay');
assert.match(dispatch?.userMessage ?? '', /queued locally|pending replay|local queue/i);
assert.doesNotMatch(dispatch?.userMessage ?? '', /Dispatch synced|fresh Dispatch|team sync active/i);

const panelSource = fs.readFileSync(panelPath, 'utf8');
[
  'probeEvidence',
  'Available from local cache',
  'Pending Dispatch replay',
  'Not confirmed by source of truth',
  'No-network evidence required before production',
].forEach((fragment) => {
  assert.ok(panelSource.includes(fragment), `Panel should preserve conservative evidence wording: ${fragment}`);
});

[
  'live weather',
  'live route updates',
  'live provider availability',
  'team sync active',
  'Dispatch synced',
  'fresh remote data',
  'provider update succeeded',
  'offline routing guaranteed',
].forEach((forbidden) => {
  assert.ok(!new RegExp(forbidden, 'i').test(panelSource), `Panel must not contain forbidden copy: ${forbidden}`);
});

assert.ok(fs.existsSync(runnerPath), 'Android no-network evidence runner should exist.');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');
[
  'validateOfflineFailureDrillAndroidEvidenceManifest',
  'cacheFixtureProfile',
  'appObservedOffline',
  'systemNetworkDisabled',
  'Do not fabricate Android evidence',
].forEach((fragment) => {
  assert.ok(runnerSource.includes(fragment), `Runner should include evidence harness fragment: ${fragment}`);
});

assert.ok(fs.existsSync(docsPath), 'Operator evidence instructions should exist.');
const docsSource = fs.readFileSync(docsPath, 'utf8');
[
  'Do not fake Android evidence',
  'owner acceptance',
  'screenshots',
  'logs',
  'cache manifest',
  'unit tests do not satisfy',
].forEach((fragment) => {
  assert.ok(docsSource.toLowerCase().includes(fragment.toLowerCase()), `Docs should include: ${fragment}`);
});

console.log('offline failure drill evidence checks passed');
