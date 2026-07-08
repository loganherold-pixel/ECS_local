import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildNavigateProviderAndroidEvidenceManifest,
  validateNavigateProviderAndroidEvidenceManifest,
} from './lib/navigate-provider-android-evidence.mjs';

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

function validArtifacts(tempRoot) {
  const providerSummaryPath = writeArtifact(
    path.join(tempRoot, 'provider-summary.json'),
    JSON.stringify(providerSummary(), null, 2),
  );
  return {
    providerSummaryPath,
    candidatePinScreenshots: [
      writeArtifact(path.join(tempRoot, 'candidate-pins.png'), 'png'),
      writeArtifact(path.join(tempRoot, 'candidate-actions.png'), 'png'),
    ],
    activeRouteLineScreenshots: [
      writeArtifact(path.join(tempRoot, 'active-route-line.png'), 'png'),
    ],
    searchFreezeArtifacts: [
      writeArtifact(path.join(tempRoot, 'search-freeze-gfxinfo.txt'), 'gfxinfo'),
    ],
    logs: [writeArtifact(path.join(tempRoot, 'navigate-provider-sweep.log'), 'log')],
  };
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
