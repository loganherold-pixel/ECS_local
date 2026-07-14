import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  VERIFICATION_ARTIFACT_AUDIENCES,
  VERIFICATION_ARTIFACT_SCHEMAS,
  buildVerificationCheckDiagnostic,
  buildVerificationInventoryArtifact,
  buildVerificationLaneArtifact,
  sanitizeVerificationArtifactValue,
  serializeVerificationArtifact,
} from './verification/verification-artifact-policy.mjs';
import { buildArtifactProvenance } from './verification/run-verification-lane.mjs';

function emptyCoverageMatrix(phase, laneId = null) {
  return {
    schemaVersion: 1,
    phase,
    laneId,
    capabilities: [],
    summary: {
      capabilityCount: 0,
      scenarioCount: 0,
      satisfiedScenarioCount: 0,
      strictFailureCount: 0,
      provisionalScenarioCount: 0,
      mismatchScenarioCount: 0,
    },
    productionApproval: 'not_granted_by_coverage_matrix',
  };
}

const secrets = {
  accessToken: 'access-token-field-secret-123456',
  bearer: 'bearer-field-secret-654321',
  commandSecret: 'command-line-secret-abcdef',
  email: 'field.member@example.com',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaWVsZC1tZW1iZXIifQ.signature123',
  mapbox: 'pk.eyJ1IjoiZWNzLWZpZWxkIn0.mapbox-secret-value',
  providerBody: 'provider-member-private-record',
  signedUrlSecret: 'signed-url-secret-987654',
  supabase: 'sb_secret_field_test_service_role_123456789',
};

const restrictedFixture = {
  safeLabel: 'Provider refresh failed; cached data remains available.',
  restrictedConvoyPosition: {
    latitude: 39.739236,
    longitude: -104.990251,
  },
  routePoints: [
    { lat: 39.739236, lng: -104.990251 },
    { lat: 39.740111, lng: -104.991222 },
  ],
  boundingBox: [-104.991222, 39.739236, -104.990251, 39.740111],
  geojson: {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [[-104.990251, 39.739236], [-104.991222, 39.740111]],
    },
  },
  gpxTrace: '<trkpt lat="39.739236" lon="-104.990251"><name>Private camp</name></trkpt>',
  completeTripTrace: [[-104.990251, 39.739236], [-104.991222, 39.740111]],
  authorization: `Bearer ${secrets.bearer}`,
  accessToken: secrets.accessToken,
  providerResponseBody: {
    member: secrets.providerBody,
    mapboxToken: secrets.mapbox,
    supabaseServiceRoleKey: secrets.supabase,
  },
  signedUrl: `https://storage.example.test/private/report.json?token=${secrets.accessToken}&key=map-key&secret=${secrets.signedUrlSecret}&sig=signature-secret&auth=auth-secret&password=password-secret`,
  command: `node check.mjs --token=${secrets.commandSecret} --api-key cli-api-secret`,
  contact: {
    email: secrets.email,
    phone: '+1 (303) 555-0184',
  },
  nested: [{ message: secrets.jwt }],
  unstructuredExcerpt: `Provider error ${secrets.mapbox} ${secrets.supabase} Bearer ${secrets.bearer} ${secrets.email}`,
  error: new Error(`Provider failed with ${secrets.jwt}`, {
    cause: new Error(`Authorization: Bearer ${secrets.bearer}`),
  }),
};

const sanitizedFixture = sanitizeVerificationArtifactValue(restrictedFixture);
const sanitizedText = serializeVerificationArtifact(sanitizedFixture);
for (const value of [
  ...Object.values(secrets),
  '39.739236',
  '-104.990251',
  '39.740111',
  '-104.991222',
  '303) 555-0184',
  'Private camp',
]) {
  assert.equal(sanitizedText.includes(value), false, `Sanitized artifacts must not contain ${value}.`);
}
assert.match(sanitizedText, /Provider refresh failed; cached data remains available\./);
assert.match(sanitizedText, /redacted|omitted/);

const safeDiagnostic = buildVerificationCheckDiagnostic({
  checkId: 'provider-contract',
  status: 'failed',
  safeCode: 'PROVIDER_CONTRACT_FAILED',
  failureCode: 'process_exit_nonzero',
  durationMs: 321,
  workspaceId: 'root',
  packageId: 'test:provider-contract',
  attemptCount: 1,
  summary: `Provider contract failed. ${restrictedFixture.signedUrl} ${secrets.jwt}`,
  blockerIds: [],
  commitSha: '282eb1a6',
  evidenceDigest: 'a'.repeat(64),
});
assert.equal(safeDiagnostic.checkId, 'provider-contract');
assert.equal(safeDiagnostic.safeCode, 'PROVIDER_CONTRACT_FAILED');
assert.equal(safeDiagnostic.durationMs, 321);
assert.equal(safeDiagnostic.packageId, 'test:provider-contract');
assert.equal(JSON.stringify(safeDiagnostic).includes(secrets.signedUrlSecret), false);

assert.throws(
  () => buildVerificationCheckDiagnostic({
    ...safeDiagnostic,
    providerResponseBody: restrictedFixture.providerResponseBody,
  }),
  /unsupported|allowlist/i,
  'Malformed or unapproved diagnostic fields must fail closed.',
);

const laneResult = {
  schemaVersion: 1,
  policyVersion: 'test-policy',
  laneId: 'pr-fast',
  status: 'failed',
  codeChecksPassed: false,
  coverageChecksPassed: true,
  coverageEnforcement: 'report',
  coverageMatrix: emptyCoverageMatrix('executed', 'pr-fast'),
  coverageStrictFailures: [],
  productionApproval: 'not_granted_by_code_checks',
  productionApprovalStatus: 'pending',
  generatedAt: '2026-07-13T12:00:00.000Z',
  durationMs: 321,
  laneBudgetMs: 1_000,
  budgetStatus: 'within_budget',
  maxParallel: 2,
  selectionReason: 'lane_policy',
  externalEvidenceBlockers: [],
  provenance: {
    commit: '282eb1a6',
    branch: `field/${secrets.email}`,
    dirty: true,
    packageLockSha256: 'b'.repeat(64),
    ci: { provider: 'github-actions', runId: '42', runAttempt: '1' },
  },
  results: [{
    checkId: safeDiagnostic.checkId,
    packageScript: safeDiagnostic.packageId,
    packageScriptKey: `package.json::${safeDiagnostic.packageId}`,
    status: safeDiagnostic.status,
    safeCode: safeDiagnostic.safeCode,
    failureCode: safeDiagnostic.failureCode,
    exitCode: 1,
    signal: null,
    durationMs: safeDiagnostic.durationMs,
    summary: `Provider failed near 39.739236,-104.990251 with ${secrets.jwt}`,
    evidenceBlockers: [],
    evidenceResult: {
      commitSha: safeDiagnostic.commitSha,
      evidenceDigest: safeDiagnostic.evidenceDigest,
    },
    stdout: `raw provider response ${secrets.providerBody}`,
    stderr: `command failed --token=${secrets.commandSecret}`,
    command: `node provider-check.mjs --token=${secrets.commandSecret}`,
    args: ['--latitude', '39.739236'],
  }],
};
const laneArtifact = buildVerificationLaneArtifact(laneResult, {
  audience: VERIFICATION_ARTIFACT_AUDIENCES.PULL_REQUEST,
});
const laneSerialized = serializeVerificationArtifact(laneArtifact);
assert.equal(laneArtifact.schemaVersion, VERIFICATION_ARTIFACT_SCHEMAS.LANE);
assert.equal(laneArtifact.coverage.phase, 'executed');
assert.equal(laneArtifact.checks[0].safeCode, safeDiagnostic.safeCode);
assert.equal(laneArtifact.checks[0].durationMs, 321);
assert.equal('branch' in laneArtifact.provenance, false);
assert.equal(laneSerialized.includes(secrets.email), false);
assert.equal(laneSerialized.includes(secrets.jwt), false);
assert.equal(laneSerialized.includes(secrets.providerBody), false);
assert.equal(laneSerialized.includes(secrets.commandSecret), false);
assert.equal(laneSerialized.includes('39.739236'), false);
assert.equal('stdout' in laneArtifact.checks[0], false);
assert.equal('stderr' in laneArtifact.checks[0], false);
assert.equal(Object.isFrozen(laneArtifact.checks[0]), true, 'Validated artifact envelopes must be immutable before serialization.');
assert.throws(
  () => { laneArtifact.checks[0].summary = secrets.providerBody; },
  TypeError,
  'Validated artifacts must not accept sensitive fields after allowlist validation.',
);

const inventoryInput = {
  schemaVersion: 1,
  policyVersion: 'test-policy',
  generatedAt: '2026-07-13T12:00:00.000Z',
  productionApproval: 'not_granted_by_inventory',
  summary: { packageCount: 1, packageScriptCount: 1 },
  coveragePhase: 'planned',
  coverageMatrix: emptyCoverageMatrix('planned'),
  capabilityMatrix: [],
  scripts: [{
    key: 'package.json::test:provider-contract',
    packagePath: 'package.json',
    name: 'test:provider-contract',
    command: `node provider-check.mjs --token=${secrets.commandSecret}`,
    kind: 'test',
    executionModel: 'runtime_behavior',
    capabilities: ['weather-fire'],
    classifications: ['integration'],
    duration: { state: 'measured', sampleCount: 1, medianMs: 321, p95Ms: 321 },
    policyCheckId: 'provider-contract',
    policyConfidence: 'behavioral',
    productionApproval: 'not_granted_by_code_checks',
    falseConfidenceRisks: [],
  }],
};
const inventoryArtifact = buildVerificationInventoryArtifact(inventoryInput, {
  audience: VERIFICATION_ARTIFACT_AUDIENCES.PULL_REQUEST,
});
const inventorySerialized = serializeVerificationArtifact(inventoryArtifact);
assert.equal(inventoryArtifact.schemaVersion, VERIFICATION_ARTIFACT_SCHEMAS.INVENTORY);
assert.equal(inventoryArtifact.coverage.phase, 'planned');
assert.equal(inventorySerialized.includes(secrets.commandSecret), false);
assert.equal(inventorySerialized.includes('node provider-check.mjs'), false);
assert.match(inventorySerialized, /test:provider-contract/);
assert.throws(
  () => buildVerificationInventoryArtifact(inventoryInput, {
    audience: VERIFICATION_ARTIFACT_AUDIENCES.RESTRICTED_FIELD_TEST,
  }),
  /not approved for audience/i,
  'Restricted field-test uploads must fail closed for non-approved artifact kinds.',
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-verification-artifact-security-'));
try {
  const sensitiveArtifactPath = path.join('artifacts', `${secrets.email}-${secrets.commandSecret}.apk`);
  fs.mkdirSync(path.join(tempRoot, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, sensitiveArtifactPath), 'deterministic-build-bytes', 'utf8');
  const provenance = buildArtifactProvenance({
    rootDir: tempRoot,
    artifactPath: sensitiveArtifactPath,
    artifactId: 'android-release-apk',
    commandId: 'eas-android-release-build',
    command: `eas build --token=${secrets.commandSecret}`,
    workspaceId: 'root',
    audience: VERIFICATION_ARTIFACT_AUDIENCES.RELEASE_CANDIDATE,
    now: new Date('2026-07-13T12:00:00.000Z'),
  });
  const provenanceSerialized = serializeVerificationArtifact(provenance);
  assert.equal(provenance.schemaVersion, VERIFICATION_ARTIFACT_SCHEMAS.PROVENANCE);
  assert.equal(provenance.commandId, 'eas-android-release-build');
  assert.equal(provenance.artifact.id, 'android-release-apk');
  assert.equal('command' in provenance, false);
  assert.equal('relativePath' in provenance.artifact, false);
  assert.equal(provenanceSerialized.includes(secrets.commandSecret), false);
  assert.equal(provenanceSerialized.includes(secrets.email), false);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const stableLeft = serializeVerificationArtifact({ z: 1, a: { y: true, x: 'safe' } });
const stableRight = serializeVerificationArtifact({ a: { x: 'safe', y: true }, z: 1 });
assert.equal(stableLeft, stableRight, 'Artifact serialization must be stable and deterministic.');

const malformed = new Proxy({}, {
  ownKeys() {
    throw new Error('unsafe proxy payload');
  },
});
assert.equal(
  sanitizeVerificationArtifactValue(malformed),
  '[omitted_unserializable]',
  'Malformed recursive payloads must fail closed to an omission marker.',
);

console.log('Verification artifact sanitizer checks passed.');
