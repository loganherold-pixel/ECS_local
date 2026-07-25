import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildPlannedTerrainChecklist,
  sanitizeTerrainManualEvidencePackage,
  validateTerrainManualEvidencePackage,
} from './verification/terrain-intelligence-manual-evidence.mjs';
import {
  evaluateReleaseEvidenceRegistry,
} from './verification/release-evidence-registry.mjs';

const root = path.resolve(import.meta.dirname, '..');
const scenarios = JSON.parse(fs.readFileSync(path.join(root, 'config', 'terrain-intelligence-validation-scenarios.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'config', 'release-evidence-registry.json'), 'utf8'));
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const DIGEST = 'c'.repeat(64);
const EVIDENCE_DIGEST = 'd'.repeat(64);
const NOW = '2026-07-25T20:00:00.000Z';

function planned() {
  return buildPlannedTerrainChecklist({
    scenarios,
    commitSha: SHA,
    appArtifactDigest: null,
    appVersion: '5.0.0',
    versionCode: '50',
    generatedAt: NOW,
  });
}

function androidRequirement() {
  return registry.requirements.find((entry) => entry.evidenceId === 'mobile_android_golden_journey');
}

test('planned checklist is complete but cannot imply collection or acceptance', () => {
  const checklist = planned();
  const registryIds = new Set(registry.requirements.map((requirement) => requirement.evidenceId));
  assert.equal(checklist.collectionState, 'planned');
  assert(checklist.records.every((record) => record.status === 'planned' && record.actualResult === 'not_collected'));
  assert(checklist.records.every((record) => Object.hasOwn(record, 'deviceModel') && Object.hasOwn(record, 'appArtifactDigest')));
  assert(checklist.records.flatMap((record) => record.evidenceIds).every((evidenceId) => registryIds.has(evidenceId)));
  assert.equal(JSON.stringify(checklist).includes('"accepted"'), false);
});

test('wrong-build evidence remains unresolved in the authoritative registry', () => {
  const requirement = androidRequirement();
  const isolatedRegistry = {
    ...registry,
    requirements: [requirement],
    submissions: [{
      evidenceId: requirement.evidenceId,
      status: 'accepted',
      evidenceClass: requirement.evidenceClass,
      environment: requirement.requiredEnvironment,
      deviceOrProvider: requirement.requiredDeviceOrProvider,
      scenario: requirement.requiredScenario,
      targetPlatform: requirement.targetPlatform,
      buildSha: OTHER_SHA,
      buildArtifactDigest: DIGEST,
      migrationDigest: null,
      providerEnvironment: null,
      deviceModel: 'pixel_8',
      collectionDate: NOW,
      expiresAt: '2026-08-24T20:00:00.000Z',
      artifactDigest: EVIDENCE_DIGEST,
      artifactReference: 'restricted_terrain_android_qa',
      artifactKind: 'device_capture',
      reviewerRole: requirement.reviewerRole,
      approvalDecision: 'accepted',
      notes: { summary: 'Sanitized test fixture.' }
    }]
  };
  const result = evaluateReleaseEvidenceRegistry({
    registry: isolatedRegistry,
    target: { buildSha: SHA, buildArtifactDigest: DIGEST, migrationDigest: null, providerEnvironment: null },
    now: new Date(NOW),
  });
  assert.deepEqual(result.acceptedEvidenceIds, []);
  assert.equal(result.requirements[0].reasonCode, 'evidence_build_mismatch');
});

test('missing required device model remains unresolved', () => {
  const requirement = androidRequirement();
  const isolatedRegistry = {
    ...registry,
    requirements: [requirement],
    submissions: [{
      evidenceId: requirement.evidenceId,
      status: 'accepted',
      evidenceClass: requirement.evidenceClass,
      environment: requirement.requiredEnvironment,
      deviceOrProvider: requirement.requiredDeviceOrProvider,
      scenario: requirement.requiredScenario,
      targetPlatform: requirement.targetPlatform,
      buildSha: SHA,
      buildArtifactDigest: DIGEST,
      migrationDigest: null,
      providerEnvironment: null,
      deviceModel: null,
      collectionDate: NOW,
      expiresAt: '2026-08-24T20:00:00.000Z',
      artifactDigest: EVIDENCE_DIGEST,
      artifactReference: 'restricted_terrain_android_qa',
      artifactKind: 'device_capture',
      reviewerRole: requirement.reviewerRole,
      approvalDecision: 'accepted',
      notes: { summary: 'Sanitized test fixture.' }
    }]
  };
  const result = evaluateReleaseEvidenceRegistry({
    registry: isolatedRegistry,
    target: { buildSha: SHA, buildArtifactDigest: DIGEST, migrationDigest: null, providerEnvironment: null },
    now: new Date(NOW),
  });
  assert.deepEqual(result.acceptedEvidenceIds, []);
  assert.equal(result.requirements[0].reasonCode, 'evidence_device_model_missing');
});

test('malformed collection artifacts fail closed', () => {
  const checklist = planned();
  delete checklist.records[0].expectedResult;
  assert.throws(() => validateTerrainManualEvidencePackage(checklist), /expectedResult is required/);
  const accepted = planned();
  accepted.records[0].status = 'accepted';
  assert.throws(() => validateTerrainManualEvidencePackage(accepted), /cannot grant acceptance/);
});

test('restricted coordinates and route traces are removed before export', () => {
  const unsafe = {
    ...planned(),
    debug: {
      coordinates: [[-104.990251, 39.739236]],
      routeTrace: [{ latitude: 39.739236, longitude: -104.990251 }],
    },
  };
  const sanitized = sanitizeTerrainManualEvidencePackage(unsafe);
  const text = JSON.stringify(sanitized);
  assert.equal(text.includes('-104.990251'), false);
  assert.equal(text.includes('39.739236'), false);
  assert.equal(text.includes('routeTrace'), false);
});

test('collected state remains separate from reviewer acceptance', () => {
  const checklist = planned();
  checklist.collectionState = 'collected';
  checklist.records[0] = {
    ...checklist.records[0],
    status: 'collected',
    actualResult: 'passed',
    appArtifactDigest: DIGEST,
    os: 'android_16',
    deviceModel: 'pixel_8',
    sanitizedEvidenceReference: 'restricted_terrain_android_qa',
    collector: 'mobile_owner',
  };
  const validated = validateTerrainManualEvidencePackage(checklist);
  assert.equal(validated.records[0].status, 'collected');
  assert.equal(JSON.stringify(validated).includes('"accepted"'), false);
});

test('review-pending records enforce the registry reviewer role', () => {
  const checklist = planned();
  const recordIndex = checklist.records.findIndex((record) => record.evidenceIds.includes('mobile_android_golden_journey'));
  checklist.records[recordIndex] = {
    ...checklist.records[recordIndex],
    status: 'review_pending',
    actualResult: 'passed',
    appArtifactDigest: DIGEST,
    os: 'android_16',
    deviceModel: 'pixel_8',
    sanitizedEvidenceReference: 'restricted_terrain_android_qa',
    collector: 'mobile_owner',
    reviewer: 'assigned_qa',
    reviewerRole: 'mobile_owner',
  };
  assert.throws(
    () => validateTerrainManualEvidencePackage(checklist, {
      expectedReviewerRoles: { mobile_android_golden_journey: 'qa_reviewer' },
    }),
    /reviewerRole does not match/,
  );
});
