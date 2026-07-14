const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const {
    buildOfflineFailureDrillProductionReadinessResult,
  } = await import('./check-offline-failure-drill-production-readiness.mjs');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-offline-drill-gate-'));

  function writeArtifact(filePath, body = 'artifact') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body, 'utf8');
    return filePath;
  }

  function writeManifest(name, overrides = {}) {
    const artifactDir = path.join(tempRoot, name);
    const evidenceSource = overrides.evidenceSource ?? 'synthetic';
    const offlineAssertions = {
      source: 'app_runtime_export',
      appObservedOffline: true,
      systemNetworkDisabled: true,
      runtimeNetworkProbe: 'offline',
      providerReachability: 'not_checked_due_to_offline',
    };
    const cacheManifestPath = writeArtifact(
      path.join(artifactDir, 'cache-manifest.json'),
      JSON.stringify({ inputs: [] }),
    );
    const drillResultPath = writeArtifact(
      path.join(artifactDir, 'drill-result.json'),
      JSON.stringify({
        localOnly: true,
        runtimeNetworkEvidence: {
          appObservedOffline: true,
          runtimeNetworkProbe: 'offline',
        },
      }),
    );
    const offlineAssertionsPath = writeArtifact(
      path.join(artifactDir, 'offline-assertions.json'),
      JSON.stringify(offlineAssertions),
    );
    const readinessMetadataPath = writeArtifact(
      path.join(artifactDir, 'readiness-metadata.json'),
      JSON.stringify({ captured: true }),
    );
    const captureBundlePath = writeArtifact(
      path.join(artifactDir, 'capture-bundle.json'),
      JSON.stringify({
        source: 'app_runtime_export',
        evidenceSource,
        platform: { os: 'android' },
        offlineAssertions,
      }),
    );
    const screenshotPath = writeArtifact(path.join(artifactDir, 'screen.png'), 'png');
    const logPath = writeArtifact(path.join(artifactDir, 'run.log'), 'log');
    const manifestPath = path.join(artifactDir, 'manifest.json');
    const manifest = {
      evidenceId: `offline-drill-${name}`,
      evidenceKind: 'android_no_network_emulator',
      evidenceSource,
      generatedAt: '2026-06-13T19:00:00.000Z',
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
        checkedAt: '2026-06-13T19:00:00.000Z',
        runtimeNetworkProbe: 'offline',
        notes: [],
      },
      runtimeNoNetworkAssertions: {
        assertionSource: 'app_runtime_export',
        appObservedOffline: true,
        systemNetworkDisabled: true,
        runtimeNetworkProbe: 'offline',
        providerReachability: 'not_checked_due_to_offline',
      },
      cacheFixtureProfile: 'available',
      cacheManifestPath,
      drillResultPath,
      offlineAssertionsPath,
      readinessMetadataPath,
      captureBundlePath,
      screenshotPaths: [screenshotPath],
      logPaths: [logPath],
      remoteAttemptSummary: {
        providerUpdateAttempted: true,
        providerUpdateSucceeded: false,
        liveSyncAttempted: true,
        liveSyncSucceeded: false,
        weatherRefreshAttempted: true,
        weatherRefreshSucceeded: false,
        teamSyncAttempted: true,
        teamSyncSucceeded: false,
      },
      resultSummary: {
        capabilityCount: 8,
        statuses: { available_offline: 8 },
        productionReadiness: 'blocked',
      },
      ownerAcceptance: {
        accepted: true,
        acceptedBy: 'QA Owner',
        acceptedAt: '2026-06-13T19:30:00.000Z',
        notes: ['Accepted for test.'],
      },
      artifacts: {
        directory: artifactDir,
        manifestPath,
      },
      validationNotes: ['Unit-test manifest.'],
      ...overrides,
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifestPath;
  }

  const result = buildOfflineFailureDrillProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'offline_failure_drill');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.evidenceManifestPath, null);
  assert.ok(result.blockers.includes('android_evidence_manifest_missing'));
  assert.ok(result.failedValidationRules.includes('manifest_path_missing'));

  [
    'offline_drill_service_contract_present',
    'offline_drill_user_facing_panel_present',
    'offline_drill_test_script_registered',
    'offline_drill_capture_helper_present',
    'offline_drill_local_only_safety_copy_present',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before Android evidence blockers remain`);
  });

  [
    'android_evidence_manifest_valid',
    'android_evidence_artifacts_complete',
    'android_no_remote_update_or_live_sync_confirmed',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until Android no-network drill evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be an active production blocker`);
  });

  const malformedPath = path.join(tempRoot, 'malformed.json');
  fs.writeFileSync(malformedPath, '{ malformed', 'utf8');
  const malformed = buildOfflineFailureDrillProductionReadinessResult({
    rootDir: process.cwd(),
    evidenceManifestPath: malformedPath,
  });
  assert.equal(malformed.status, 'blocked');
  assert.ok(malformed.failedValidationRules.includes('manifest_json_malformed'));
  assert.equal(malformed.evidenceManifestPath, malformedPath);

  const fixtureOnly = buildOfflineFailureDrillProductionReadinessResult({
    rootDir: process.cwd(),
    evidenceManifestPath: writeManifest('fixture-only'),
  });
  assert.equal(fixtureOnly.validation.structurallyValid, true);
  assert.equal(fixtureOnly.validation.productionEligible, false);
  assert.ok(fixtureOnly.blockers.includes('android_evidence_source_not_real'));

  const runtimeOnline = buildOfflineFailureDrillProductionReadinessResult({
    rootDir: process.cwd(),
    evidenceManifestPath: writeManifest('runtime-online', {
      networkState: {
        appObservedOffline: false,
        systemNetworkDisabled: true,
        checkedAt: '2026-06-13T19:00:00.000Z',
        runtimeNetworkProbe: 'online',
        notes: [],
      },
    }),
  });
  assert.equal(runtimeOnline.status, 'blocked');
  assert.ok(runtimeOnline.failedValidationRules.includes('networkState.runtimeNetworkProbe_offline_required'));

  const providerUpdateSucceeded = buildOfflineFailureDrillProductionReadinessResult({
    rootDir: process.cwd(),
    evidenceManifestPath: writeManifest('provider-update-succeeded', {
      remoteAttemptSummary: {
        providerUpdateAttempted: true,
        providerUpdateSucceeded: true,
        liveSyncAttempted: true,
        liveSyncSucceeded: false,
      },
    }),
  });
  assert.equal(providerUpdateSucceeded.status, 'blocked');
  assert.ok(providerUpdateSucceeded.failedValidationRules.includes('remoteAttemptSummary.providerUpdateSucceeded_must_be_false'));

  const missingArtifactManifest = writeManifest('missing-artifacts', {
    cacheManifestPath: path.join(tempRoot, 'missing-cache-manifest.json'),
    screenshotPaths: [],
    logPaths: [],
  });
  const missingArtifacts = buildOfflineFailureDrillProductionReadinessResult({
    rootDir: process.cwd(),
    evidenceManifestPath: missingArtifactManifest,
  });
  assert.equal(missingArtifacts.status, 'blocked');
  assert.ok(missingArtifacts.missingArtifacts.some((item) => item.includes('missing-cache-manifest.json')));
  assert.ok(missingArtifacts.failedValidationRules.includes('screenshotPaths.at_least_one_required'));
  assert.ok(missingArtifacts.failedValidationRules.includes('logPaths.at_least_one_required'));

  const ownerMissing = buildOfflineFailureDrillProductionReadinessResult({
    rootDir: process.cwd(),
    evidenceManifestPath: writeManifest('owner-missing', {
      evidenceSource: 'real',
      ownerAcceptance: { accepted: false, notes: ['Owner review pending.'] },
    }),
  });
  assert.equal(ownerMissing.status, 'blocked');
  assert.equal(ownerMissing.ownerAcceptance.accepted, false);
  assert.ok(ownerMissing.blockers.includes('owner_acceptance_missing'));

  const acceptedReal = buildOfflineFailureDrillProductionReadinessResult({
    rootDir: process.cwd(),
    evidenceManifestPath: writeManifest('accepted-real', {
      evidenceSource: 'real',
      resultSummary: {
        capabilityCount: 8,
        statuses: { available_offline: 8 },
        productionReadiness: 'accepted',
      },
    }),
  });
  assert.equal(
    acceptedReal.validation.structurallyValid,
    true,
    `Accepted evidence should be structurally valid: ${acceptedReal.validation.failedRules.join(', ')}`,
  );
  assert.equal(acceptedReal.validation.productionEligible, true);
  assert.equal(acceptedReal.status, 'accepted');
  assert.equal(acceptedReal.passed, true);

  console.log('offline failure drill production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
