import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  RELEASE_EVIDENCE_REGISTRY_CONTRACT,
  evaluateReleaseEvidenceRegistry,
  validateReleaseEvidenceRegistry,
} from './verification/release-evidence-registry.mjs';
import {
  buildReleaseEvidenceReport,
  runReleaseEvidenceReportCli,
} from './verification/generate-release-evidence-report.mjs';
import {
  buildVerificationProvenanceArtifact,
  buildVerificationReleaseEvidenceArtifact,
  serializeVerificationArtifact,
} from './verification/verification-artifact-policy.mjs';
import { loadVerificationPolicy } from './verification/verification-policy.mjs';

const ROOT = path.resolve(process.cwd());
const NOW = new Date('2026-07-13T12:00:00.000Z');
const BUILD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_BUILD_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const BUILD_DIGEST = '1'.repeat(64);
const EVIDENCE_DIGEST = '2'.repeat(64);

function requirement(overrides = {}) {
  return {
    evidenceId: 'mobile_android_golden_journey',
    capability: 'mobile-device',
    feature: 'mobile_shell',
    evidenceClass: 'hardware_or_device',
    requiredEnvironment: ['physical_device', 'release_build'],
    requiredDeviceOrProvider: ['android_phone'],
    requiredScenario: 'new_user_vehicle_setup_dashboard',
    targetPlatform: ['android'],
    bindingRequirements: {
      buildSha: 'required',
      buildArtifactDigest: 'required',
      migrationDigest: 'not_applicable',
      providerEnvironment: 'not_applicable',
      deviceModel: 'required',
    },
    initialStatus: 'missing',
    revalidationPolicy: {
      mode: 'per_build',
      maxAgeDays: 30,
    },
    ownerRole: 'mobile_owner',
    reviewerRole: 'qa_reviewer',
    notes: {
      summary: 'Physical Android golden journey evidence is required.',
    },
    ...overrides,
  };
}

function submission(overrides = {}) {
  return {
    evidenceId: 'mobile_android_golden_journey',
    status: 'accepted',
    evidenceClass: 'hardware_or_device',
    environment: ['physical_device', 'release_build'],
    deviceOrProvider: ['android_phone'],
    scenario: 'new_user_vehicle_setup_dashboard',
    targetPlatform: ['android'],
    buildSha: BUILD_SHA,
    buildArtifactDigest: BUILD_DIGEST,
    migrationDigest: null,
    providerEnvironment: null,
    deviceModel: 'pixel_8',
    collectionDate: '2026-07-12T12:00:00.000Z',
    expiresAt: '2026-08-11T12:00:00.000Z',
    artifactDigest: EVIDENCE_DIGEST,
    artifactReference: 'android-golden-journey-001',
    artifactKind: 'device_capture',
    reviewerRole: 'qa_reviewer',
    approvalDecision: 'accepted',
    notes: {
      summary: 'Redacted device evidence metadata.',
    },
    ...overrides,
  };
}

function registry(overrides = {}) {
  return {
    schemaVersion: 1,
    resultContract: RELEASE_EVIDENCE_REGISTRY_CONTRACT,
    registryVersion: 'fixture.1',
    productionApproval: {
      status: 'pending',
      decision: 'not_granted',
      ownerRole: 'release_owner',
      reviewerRole: 'production_owner',
      reviewedAt: null,
      artifactDigest: null,
      artifactReference: null,
      notes: {
        summary: 'Production approval has not been supplied.',
      },
    },
    requirements: [requirement()],
    submissions: [],
    ...overrides,
  };
}

function target(overrides = {}) {
  return {
    buildSha: BUILD_SHA,
    buildArtifactDigest: BUILD_DIGEST,
    migrationDigest: null,
    providerEnvironment: null,
    ...overrides,
  };
}

test('a declaration without a submission remains missing', () => {
  const result = evaluateReleaseEvidenceRegistry({ registry: registry(), target: target(), now: NOW });
  assert.deepEqual(result.missingEvidenceIds, ['mobile_android_golden_journey']);
  assert.deepEqual(result.unresolvedEvidenceIds, ['mobile_android_golden_journey']);
  assert.deepEqual(result.acceptedEvidenceIds, []);
  assert.equal(result.productionApproval.status, 'pending');
  assert.equal(result.productionApproval.decision, 'not_granted');
});

test('accepted evidence collected for another build remains unresolved', () => {
  const result = evaluateReleaseEvidenceRegistry({
    registry: registry({ submissions: [submission({ buildSha: OTHER_BUILD_SHA })] }),
    target: target(),
    now: NOW,
  });
  assert.deepEqual(result.wrongBuildEvidenceIds, ['mobile_android_golden_journey']);
  assert.deepEqual(result.unresolvedEvidenceIds, ['mobile_android_golden_journey']);
  assert.equal(result.requirements[0].reasonCode, 'evidence_build_mismatch');
});

test('expired evidence reopens its blocker', () => {
  const result = evaluateReleaseEvidenceRegistry({
    registry: registry({
      submissions: [submission({
        collectionDate: '2026-05-01T00:00:00.000Z',
        expiresAt: '2026-05-31T00:00:00.000Z',
      })],
    }),
    target: target(),
    now: NOW,
  });
  assert.deepEqual(result.expiredEvidenceIds, ['mobile_android_golden_journey']);
  assert.deepEqual(result.unresolvedEvidenceIds, ['mobile_android_golden_journey']);
  assert.equal(result.requirements[0].status, 'expired');
});

test('one accepted matching submission resolves exactly its own requirement', () => {
  const second = requirement({
    evidenceId: 'mobile_ios_golden_journey',
    targetPlatform: ['ios'],
    requiredDeviceOrProvider: ['ios_phone'],
  });
  const result = evaluateReleaseEvidenceRegistry({
    registry: registry({ requirements: [requirement(), second], submissions: [submission()] }),
    target: target(),
    now: NOW,
  });
  assert.deepEqual(result.acceptedEvidenceIds, ['mobile_android_golden_journey']);
  assert.deepEqual(result.unresolvedEvidenceIds, ['mobile_ios_golden_journey']);
  assert.equal(result.requirements.find((entry) => entry.evidenceId === 'mobile_android_golden_journey')?.status, 'accepted');
});

test('rejected evidence remains blocked', () => {
  const result = evaluateReleaseEvidenceRegistry({
    registry: registry({
      submissions: [submission({ status: 'rejected', approvalDecision: 'rejected' })],
    }),
    target: target(),
    now: NOW,
  });
  assert.deepEqual(result.rejectedEvidenceIds, ['mobile_android_golden_journey']);
  assert.deepEqual(result.unresolvedEvidenceIds, ['mobile_android_golden_journey']);
});

test('collected evidence remains unresolved until an explicit reviewer acceptance', () => {
  const result = evaluateReleaseEvidenceRegistry({
    registry: registry({
      submissions: [submission({ status: 'collected', approvalDecision: 'pending' })],
    }),
    target: target(),
    now: NOW,
  });
  assert.deepEqual(result.collectedEvidenceIds, ['mobile_android_golden_journey']);
  assert.deepEqual(result.unresolvedEvidenceIds, ['mobile_android_golden_journey']);
  assert.equal(result.requirements[0].reasonCode, 'evidence_not_accepted');
});

test('malformed evidence metadata fails closed', () => {
  assert.throws(() => validateReleaseEvidenceRegistry(registry({
    submissions: [{ ...submission(), rawProviderResponse: { token: 'not-allowed' } }],
  })), /unsupported field/i);
  assert.throws(() => validateReleaseEvidenceRegistry(registry({
    submissions: [submission({ artifactDigest: 'not-a-digest' })],
  })), /artifactDigest/i);
});

test('technical evidence cannot substitute for privacy approval', () => {
  const privacyRequirement = requirement({
    evidenceId: 'privacy_convoy_coordinates',
    capability: 'privacy',
    feature: 'dispatch_team_position_sharing',
    evidenceClass: 'privacy_approval',
    requiredEnvironment: ['privacy_review'],
    requiredDeviceOrProvider: ['privacy_board'],
    requiredScenario: 'restricted_convoy_coordinate_handling',
    targetPlatform: ['all'],
    bindingRequirements: {
      buildSha: 'required',
      buildArtifactDigest: 'not_applicable',
      migrationDigest: 'not_applicable',
      providerEnvironment: 'not_applicable',
      deviceModel: 'not_applicable',
    },
    reviewerRole: 'privacy_reviewer',
  });
  const result = evaluateReleaseEvidenceRegistry({
    registry: registry({
      requirements: [privacyRequirement],
      submissions: [submission({
        evidenceId: 'privacy_convoy_coordinates',
        evidenceClass: 'behavioral',
        environment: ['privacy_review'],
        deviceOrProvider: ['privacy_board'],
        scenario: 'restricted_convoy_coordinate_handling',
        targetPlatform: ['all'],
        buildArtifactDigest: null,
        deviceModel: null,
        artifactKind: 'automated_test',
        reviewerRole: 'privacy_reviewer',
      })],
    }),
    target: target(),
    now: NOW,
  });
  assert.deepEqual(result.unresolvedEvidenceIds, ['privacy_convoy_coordinates']);
  assert.equal(result.requirements[0].reasonCode, 'evidence_class_mismatch');
});

test('owner approval remains explicit and cannot be inferred from technical success', () => {
  const ownerRequirement = requirement({
    evidenceId: 'owner_release_product',
    capability: 'owner-approval',
    feature: 'ecs_release',
    evidenceClass: 'owner_approval',
    requiredEnvironment: ['owner_review'],
    requiredDeviceOrProvider: ['product_owner'],
    requiredScenario: 'public_release_decision',
    targetPlatform: ['all'],
    bindingRequirements: {
      buildSha: 'required',
      buildArtifactDigest: 'required',
      migrationDigest: 'not_applicable',
      providerEnvironment: 'not_applicable',
      deviceModel: 'not_applicable',
    },
    reviewerRole: 'product_owner',
  });
  const result = evaluateReleaseEvidenceRegistry({
    registry: registry({ requirements: [requirement(), ownerRequirement], submissions: [submission()] }),
    target: target(),
    now: NOW,
  });
  assert.deepEqual(result.acceptedEvidenceIds, ['mobile_android_golden_journey']);
  assert.deepEqual(result.ownerApprovalsPendingIds, ['owner_release_product']);
  assert.equal(result.productionApproval.decision, 'not_granted');
});

test('a static document cannot satisfy executable or field evidence', () => {
  const result = evaluateReleaseEvidenceRegistry({
    registry: registry({
      submissions: [submission({
        artifactKind: 'static_declaration',
        artifactReference: 'docs-field-test-plan',
      })],
    }),
    target: target(),
    now: NOW,
  });
  assert.deepEqual(result.unresolvedEvidenceIds, ['mobile_android_golden_journey']);
  assert.equal(result.requirements[0].reasonCode, 'static_declaration_only');
});

test('the repository registry exposes Garmin requirements and serializes a privacy-safe report', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'release-evidence-registry.json'), 'utf8'));
  const validated = validateReleaseEvidenceRegistry(raw);
  const garminIds = validated.requirements
    .filter((entry) => entry.capability === 'garmin')
    .map((entry) => entry.evidenceId)
    .sort();
  assert.deepEqual(garminIds, [
    'garmin_data_transfer',
    'garmin_disconnect',
    'garmin_offline_behavior',
    'garmin_pairing',
    'garmin_permissions',
  ]);
  assert.equal(validated.submissions.length, 0, 'No external evidence may be fabricated in the registry.');

  const policy = loadVerificationPolicy({ rootDir: ROOT });
  assert.ok(policy.capabilities.some((entry) => entry.id === 'garmin'));
  assert.ok(policy.checks.some((entry) => entry.id === 'release-evidence-registry'));

  const evaluated = evaluateReleaseEvidenceRegistry({
    registry: validated,
    target: target(),
    now: NOW,
  });
  const artifact = buildVerificationReleaseEvidenceArtifact(evaluated, { audience: 'release_candidate' });
  const serialized = serializeVerificationArtifact(artifact);
  assert.match(serialized, /ecs\.verification-release-evidence-artifact\.v1/);
  assert.match(serialized, /garmin_pairing/);
  assert.doesNotMatch(serialized, /rawProviderResponse|authorization|latitude|longitude/i);
});

test('the lane producer emits exact unresolved IDs through the typed evidence envelope', () => {
  const smokeRoot = path.join(ROOT, '.smoke');
  fs.mkdirSync(smokeRoot, { recursive: true });
  const temporaryDirectory = fs.mkdtempSync(path.join(smokeRoot, 'release-evidence-test-'));
  const relativeOutput = path.relative(ROOT, path.join(temporaryDirectory, 'report.json')).replaceAll('\\', '/');
  const resultFile = path.join(temporaryDirectory, 'lane-result.json');
  const output = [];
  try {
    const exitCode = runReleaseEvidenceReportCli({
      rootDir: ROOT,
      args: ['--output', relativeOutput],
      environment: {
        ...process.env,
        ECS_VERIFICATION_CHECK_ID: 'release-evidence-registry',
        ECS_VERIFICATION_RESULT_FILE: resultFile,
      },
      now: NOW,
      stdout: { write: (value) => output.push(value) },
    });
    assert.equal(exitCode, 20);
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, relativeOutput), 'utf8'));
    assert.equal(result.status, 'blocked_external');
    assert.equal(result.safeCode, 'external_evidence_required');
    assert.deepEqual(result.blockerIds, report.unresolvedEvidenceIds);
    assert.equal(result.blockerIds.length, 67);
    assert.equal(report.productionApproval.decision, 'not_granted');
    assert.match(output.join(''), /Production approval: pending\/not_granted/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('release artifact provenance must match the target commit before its digest is used', () => {
  const smokeRoot = path.join(ROOT, '.smoke');
  fs.mkdirSync(smokeRoot, { recursive: true });
  const temporaryDirectory = fs.mkdtempSync(path.join(smokeRoot, 'release-binding-test-'));
  const provenancePath = path.join(temporaryDirectory, 'provenance.json');
  const outputPath = path.join(temporaryDirectory, 'report.json');
  const relativeProvenance = path.relative(ROOT, provenancePath).replaceAll('\\', '/');
  const relativeOutput = path.relative(ROOT, outputPath).replaceAll('\\', '/');
  const makeProvenance = (sourceCommit) => buildVerificationProvenanceArtifact({
    audience: 'release_candidate',
    generatedAt: NOW.toISOString(),
    commandId: 'manual-release-artifact',
    workspaceId: 'root',
    artifactId: 'supplied-release-artifact',
    artifactKind: 'release-binary',
    fileCount: 1,
    sizeBytes: 1024,
    artifactDigest: BUILD_DIGEST,
    ci: {
      provider: 'github-actions',
      runId: '123',
      runAttempt: '1',
      sourceCommit,
    },
  });
  try {
    fs.writeFileSync(provenancePath, serializeVerificationArtifact(makeProvenance(BUILD_SHA)), 'utf8');
    const result = buildReleaseEvidenceReport({
      rootDir: ROOT,
      args: ['--output', relativeOutput],
      environment: {
        ...process.env,
        ECS_RELEASE_ARTIFACT_PROVENANCE: relativeProvenance,
        ECS_RELEASE_BUILD_SHA: BUILD_SHA,
      },
      now: NOW,
    });
    assert.equal(result.report.target.buildArtifactDigest, BUILD_DIGEST);

    fs.writeFileSync(provenancePath, serializeVerificationArtifact(makeProvenance(OTHER_BUILD_SHA)), 'utf8');
    assert.throws(() => buildReleaseEvidenceReport({
      rootDir: ROOT,
      args: ['--output', relativeOutput],
      environment: {
        ...process.env,
        ECS_RELEASE_ARTIFACT_PROVENANCE: relativeProvenance,
        ECS_RELEASE_BUILD_SHA: BUILD_SHA,
      },
      now: NOW,
    }), /different commit/i);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
