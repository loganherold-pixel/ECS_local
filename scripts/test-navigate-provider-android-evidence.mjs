import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildNavigateProviderAndroidEvidenceManifest,
  validateNavigateProviderAndroidEvidenceManifest,
} from './lib/navigate-provider-android-evidence.mjs';
import { runNavigateProviderAndroidEvidenceCli } from './run-navigate-provider-android-evidence.mjs';

function writeArtifact(filePath, body = 'artifact') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf8');
  return filePath;
}

function providerSummary(overrides = {}) {
  return {
    source: 'real_provider_sanitized_summary',
    capturedAt: '2026-07-08T18:00:00.000Z',
    providerRunId: 'region-001-provider-run-20260708',
    providerSources: [
      {
        providerId: 'ridb',
        providerLabel: 'RIDB',
        candidateCount: 4,
        freshnessState: 'fresh',
        latestCheckedAt: '2026-07-08T17:42:00.000Z',
      },
    ],
    candidateCounts: {
      providerBacked: 4,
      visiblePins: 3,
      actionVerified: 3,
    },
    routeContext: {
      activeRouteLineVisible: true,
      providerCandidatesAnchoredToRoute: true,
      routeLineSource: 'android_capture',
    },
    actions: {
      navigateHere: true,
      saveCamp: true,
      reportUnusable: true,
      dismiss: true,
    },
    redaction: {
      rawProviderPayloadsExcluded: true,
      precisePrivateCoordinatesExcluded: true,
      secretsExcluded: true,
    },
    ...overrides,
  };
}

function validArtifactPaths(tempRoot) {
  return {
    candidatePinScreenshots: [
      writeArtifact(path.join(tempRoot, 'candidate-pin-visible.png'), 'png'),
      writeArtifact(path.join(tempRoot, 'candidate-navigate-here-action.png'), 'png'),
      writeArtifact(path.join(tempRoot, 'candidate-save-camp-action.png'), 'png'),
      writeArtifact(path.join(tempRoot, 'candidate-report-unusable-action.png'), 'png'),
      writeArtifact(path.join(tempRoot, 'candidate-dismiss-action.png'), 'png'),
    ],
    activeRouteLineScreenshots: [
      writeArtifact(path.join(tempRoot, 'active-route-provider-candidates.png'), 'png'),
    ],
    searchFreezeArtifacts: [
      writeArtifact(
        path.join(tempRoot, 'search-freeze-standby-gfxinfo.txt'),
        'destinationSearchMapFrozen=true\nstandbyMapActive=true\nliveWebViewWake=false\n',
      ),
    ],
    logs: [
      writeArtifact(
        path.join(tempRoot, 'navigate-provider-sweep-logcat.txt'),
        'I/ECS: navigate provider sweep completed\nI/ECS: no raw provider payloads emitted\n',
      ),
    ],
  };
}

function validArtifacts(tempRoot) {
  const providerSummaryPath = writeArtifact(
    path.join(tempRoot, 'provider-summary.json'),
    JSON.stringify(providerSummary(), null, 2),
  );
  return {
    providerSummaryPath,
    ...validArtifactPaths(tempRoot),
  };
}

function summaryArtifact(relativePath, role) {
  return { path: relativePath, role };
}

function writePushButtonProviderSummary(tempRoot, overrides = {}) {
  const evidenceRoot = path.join(tempRoot, 'android-sweep');
  const candidateArtifacts = [
    summaryArtifact('captures/candidate-pin-visible.png', 'candidate_pin_visible'),
    summaryArtifact('captures/candidate-navigate-here-action.png', 'navigate_here_action'),
    summaryArtifact('captures/candidate-save-camp-action.png', 'save_camp_action'),
    summaryArtifact('captures/candidate-report-unusable-action.png', 'report_unusable_action'),
    summaryArtifact('captures/candidate-dismiss-action.png', 'dismiss_action'),
  ];
  const activeRouteLineArtifacts = [
    summaryArtifact('captures/active-route-provider-candidates.png', 'active_route_line_with_provider_candidates'),
  ];
  const searchFreezeArtifacts = [
    summaryArtifact('perf/search-freeze-standby.txt', 'search_freeze_standby_runtime'),
  ];
  const logs = [summaryArtifact('logs/logcat.txt', 'logcat_slice')];

  for (const item of [
    ...candidateArtifacts,
    ...activeRouteLineArtifacts,
  ]) {
    writeArtifact(path.join(evidenceRoot, item.path), 'png');
  }
  writeArtifact(
    path.join(evidenceRoot, searchFreezeArtifacts[0].path),
    'destinationSearchMapFrozen=true\nstandbyMapActive=true\nliveWebViewWake=false\n',
  );
  writeArtifact(
    path.join(evidenceRoot, logs[0].path),
    'I/ECS: Navigate provider-backed Android sweep complete\nI/ECS: logcat redacted\n',
  );

  return writeArtifact(
    path.join(evidenceRoot, 'provider-summary.json'),
    JSON.stringify(
      providerSummary({
        androidArtifacts: {
          candidatePinsActions: candidateArtifacts,
          activeRouteLineContext: activeRouteLineArtifacts,
          searchFreezeStandby: searchFreezeArtifacts,
          logs,
        },
        ...overrides,
      }),
      null,
      2,
    ),
  );
}

function writeDefaultReferenceArtifacts(tempRoot) {
  [
    '.smoke/campops-android-qa/candidate-viewport-entry.png',
    '.smoke/campops-android-qa/candidate-viewport-navigate-here-action.png',
    '.smoke/campops-android-qa/candidate-viewport-save-camp-action.png',
    '.smoke/campops-android-qa/candidate-viewport-report-unusable-action.png',
    '.smoke/campops-android-qa/phone-candidate-viewport-popup-actions.png',
    '.smoke/navigate-deep/04-start-guidance.png',
    '.smoke/navigate-deep/08-minimized-guidance.png',
    '.smoke/navigate-deep/09-active-readiness-reopen.png',
    '.smoke/campops-android-qa/candidate-viewport-actions-logcat.txt',
    '.smoke/navigate-deep/final-navigate-log-errors.txt',
  ].forEach((relativePath) => writeArtifact(path.join(tempRoot, relativePath), 'reference artifact'));
}

test('Navigate provider Android evidence validates sanitized provider-backed candidate/action and active-route context', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-navigate-provider-evidence-'));
  const manifest = buildNavigateProviderAndroidEvidenceManifest({
    rootDir: tempRoot,
    generatedAt: '2026-07-08T18:10:00.000Z',
    evidenceSource: 'real_android_provider_sweep',
    ...validArtifacts(tempRoot),
  });
  const validation = validateNavigateProviderAndroidEvidenceManifest(manifest, {
    rootDir: tempRoot,
    artifactExists: fs.existsSync,
  });

  assert.equal(manifest.schemaVersion, 'navigate-provider-android-sweep/v1');
  assert.equal(manifest.status, 'ready_for_handoff_review');
  assert.equal(manifest.productionAccepted, false);
  assert.equal(manifest.providerBackedCandidateEvidence.status, 'captured_sanitized_provider_summary');
  assert.equal(manifest.runtimeAssertions.providerBackedCandidatePinsVisible, true);
  assert.equal(manifest.runtimeAssertions.candidateActionsCaptured, true);
  assert.equal(manifest.runtimeAssertions.activeRouteLineContextCaptured, true);
  assert.equal(manifest.runtimeAssertions.searchFreezeStandbyCovered, true);
  assert.equal(validation.structurallyValid, true);
  assert.equal(validation.repeatableSweepReady, true);
  assert.equal(validation.productionAccepted, false);
  assert.deepEqual(validation.blockers, []);

  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /raw_json|provider_record_id|must-not-appear|api[_-]?key/i);
  assert.doesNotMatch(serialized, /"latitude"|"longitude"|"lat"|"lng"/i);
});

test('Navigate provider Android evidence ingests artifact paths and roles from sanitized provider summaries', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-navigate-provider-push-button-'));
  const providerSummaryPath = writePushButtonProviderSummary(tempRoot);
  const manifest = buildNavigateProviderAndroidEvidenceManifest({
    rootDir: tempRoot,
    generatedAt: '2026-07-08T18:10:00.000Z',
    evidenceSource: 'real_android_provider_sweep',
    providerSummaryPath,
  });
  const validation = validateNavigateProviderAndroidEvidenceManifest(manifest, {
    rootDir: tempRoot,
    artifactExists: fs.existsSync,
    artifactRead: (filePath) => fs.readFileSync(filePath, 'utf8'),
  });

  assert.equal(manifest.status, 'ready_for_handoff_review');
  assert.equal(manifest.androidArtifacts.candidatePinsActions.length, 5);
  assert.equal(manifest.androidArtifacts.searchFreezeStandby.length, 1);
  assert.deepEqual(manifest.androidArtifactValidation.candidatePinsActions.missingRoles, []);
  assert.equal(manifest.androidArtifactValidation.searchFreezeStandby.status, 'verified');
  assert.equal(manifest.androidArtifactValidation.logs.status, 'verified');
  assert.equal(validation.repeatableSweepReady, true);
  assert.deepEqual(validation.blockers, []);
});

test('Navigate provider Android evidence reports precise blockers for incomplete Android artifact lanes', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-navigate-provider-artifact-blockers-'));
  const providerSummaryPath = writePushButtonProviderSummary(tempRoot, {
    androidArtifacts: {
      candidatePinsActions: [
        summaryArtifact('captures/candidate-pin-visible.png', 'candidate_pin_visible'),
        summaryArtifact('captures/candidate-navigate-here-action.png', 'navigate_here_action'),
      ],
      activeRouteLineContext: [],
      searchFreezeStandby: [
        summaryArtifact('perf/search-freeze-standby.txt', 'search_freeze_standby_runtime'),
      ],
      logs: [summaryArtifact('logs/logcat.txt', 'logcat_slice')],
    },
  });
  fs.writeFileSync(
    path.join(tempRoot, 'android-sweep', 'perf', 'search-freeze-standby.txt'),
    'gfxinfo captured without map freeze markers\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(tempRoot, 'android-sweep', 'logs', 'logcat.txt'),
    'E AndroidRuntime: FATAL EXCEPTION: main\nAuthorization: Bearer should-not-ship\n',
    'utf8',
  );

  const manifest = buildNavigateProviderAndroidEvidenceManifest({
    rootDir: tempRoot,
    generatedAt: '2026-07-08T18:10:00.000Z',
    evidenceSource: 'real_android_provider_sweep',
    providerSummaryPath,
  });
  const validation = validateNavigateProviderAndroidEvidenceManifest(manifest, {
    rootDir: tempRoot,
    artifactExists: fs.existsSync,
    artifactRead: (filePath) => fs.readFileSync(filePath, 'utf8'),
  });

  assert.equal(validation.repeatableSweepReady, false);
  assert.ok(validation.blockers.includes('candidate_pin_action_artifact_roles_incomplete'));
  assert.ok(validation.blockers.includes('active_route_line_context_artifact_missing'));
  assert.ok(validation.blockers.includes('search_freeze_standby_artifact_unverified'));
  assert.ok(validation.blockers.includes('navigate_android_logcat_contains_fatal_or_redbox'));
  assert.ok(validation.blockers.includes('navigate_android_logcat_contains_secret_or_raw_payload'));
  assert.match(
    validation.blockerMessages.join('\n'),
    /Candidate pin\/action artifacts missing roles: save_camp_action, report_unusable_action, dismiss_action/,
  );
  assert.match(validation.blockerMessages.join('\n'), /Logcat artifact contains fatal\/redbox markers/);
});

test('Navigate provider Android evidence does not accept old reference artifacts for a real provider sweep', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-navigate-provider-reference-blocked-'));
  writeDefaultReferenceArtifacts(tempRoot);
  const providerSummaryPath = writePushButtonProviderSummary(tempRoot, {
    androidArtifacts: {
      searchFreezeStandby: [
        summaryArtifact('perf/search-freeze-standby.txt', 'search_freeze_standby_runtime'),
      ],
    },
  });

  const manifest = buildNavigateProviderAndroidEvidenceManifest({
    rootDir: tempRoot,
    generatedAt: '2026-07-08T18:10:00.000Z',
    evidenceSource: 'real_android_provider_sweep',
    providerSummaryPath,
  });
  const validation = validateNavigateProviderAndroidEvidenceManifest(manifest, {
    rootDir: tempRoot,
    artifactExists: fs.existsSync,
    artifactRead: (filePath) => fs.readFileSync(filePath, 'utf8'),
  });

  assert.equal(validation.repeatableSweepReady, false);
  assert.ok(validation.blockers.includes('candidate_pin_action_same_run_artifacts_missing'));
  assert.ok(validation.blockers.includes('active_route_line_same_run_artifact_missing'));
  assert.ok(validation.blockers.includes('navigate_android_logcat_same_run_artifact_missing'));
  assert.equal(manifest.androidArtifactValidation.candidatePinsActions.status, 'blocked');
  assert.equal(manifest.androidArtifactValidation.activeRouteLineContext.status, 'blocked');
  assert.equal(manifest.androidArtifactValidation.logs.status, 'blocked');
});

test('Navigate provider Android evidence blocks fixture-only or missing real provider summaries', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-navigate-provider-blocked-'));
  const manifest = buildNavigateProviderAndroidEvidenceManifest({
    rootDir: tempRoot,
    generatedAt: '2026-07-08T18:10:00.000Z',
    evidenceSource: 'existing_android_partial',
    candidatePinScreenshots: [writeArtifact(path.join(tempRoot, 'candidate-actions.png'), 'png')],
    activeRouteLineScreenshots: [writeArtifact(path.join(tempRoot, 'active-route-line.png'), 'png')],
    searchFreezeArtifacts: [writeArtifact(path.join(tempRoot, 'search-freeze-gfxinfo.txt'), 'gfxinfo')],
    logs: [writeArtifact(path.join(tempRoot, 'navigate-provider-sweep.log'), 'log')],
  });
  const validation = validateNavigateProviderAndroidEvidenceManifest(manifest, {
    rootDir: tempRoot,
    artifactExists: fs.existsSync,
  });

  assert.equal(manifest.status, 'blocked_missing_provider_evidence');
  assert.equal(manifest.providerBackedCandidateEvidence.status, 'blocked_missing_real_provider_summary');
  assert.equal(manifest.existingAndroidEvidenceMode, 'partial_local_android_reference');
  assert.equal(validation.structurallyValid, false);
  assert.equal(validation.repeatableSweepReady, false);
  assert.ok(validation.blockers.includes('provider_candidate_summary_missing'));
  assert.ok(validation.notClaimed.includes('provider-backed Android acceptance'));
});

test('Navigate provider Android evidence rejects raw payloads, precise coordinates, and missing action coverage', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-navigate-provider-redaction-'));
  const unsafeProviderSummaryPath = writeArtifact(
    path.join(tempRoot, 'unsafe-provider-summary.json'),
    JSON.stringify(
      providerSummary({
        candidateCounts: { providerBacked: 2, visiblePins: 1, actionVerified: 1 },
        actions: { navigateHere: true, saveCamp: false, reportUnusable: false, dismiss: true },
        rawProviderPayload: { provider_record_id: 'abc123' },
        privateCoordinate: { latitude: 39.987654, longitude: -119.123456 },
        apiKey: 'must-not-appear',
      }),
      null,
      2,
    ),
  );
  const manifest = buildNavigateProviderAndroidEvidenceManifest({
    rootDir: tempRoot,
    generatedAt: '2026-07-08T18:10:00.000Z',
    evidenceSource: 'real_android_provider_sweep',
    ...validArtifacts(tempRoot),
    providerSummaryPath: unsafeProviderSummaryPath,
  });
  const validation = validateNavigateProviderAndroidEvidenceManifest(manifest, {
    rootDir: tempRoot,
    artifactExists: fs.existsSync,
  });

  assert.equal(validation.structurallyValid, false);
  assert.equal(validation.repeatableSweepReady, false);
  assert.ok(validation.blockers.includes('provider_summary_contains_raw_payload_or_secret'));
  assert.ok(validation.blockers.includes('provider_summary_contains_precise_coordinates'));
  assert.ok(validation.blockers.includes('candidate_actions_incomplete'));
});

test('Navigate provider Android evidence CLI prints actionable strict-gate blocker messages', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-navigate-provider-cli-blockers-'));
  const manifestPath = path.join(tempRoot, 'manifest.json');
  let output = '';

  const exitCode = runNavigateProviderAndroidEvidenceCli({
    args: ['--strict', `--out=${manifestPath}`, '--evidence-source=existing_android_partial'],
    rootDir: tempRoot,
    stdout: {
      write(chunk) {
        output += chunk;
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.match(output, /Navigate provider Android evidence: BLOCKED/);
  assert.match(output, /Provider summary missing: pass --provider-summary=<sanitized-summary\.json>/);
  assert.match(output, /Search freeze\/standby runtime artifact missing/);
  assert.match(output, /Logcat artifact missing/);
});
