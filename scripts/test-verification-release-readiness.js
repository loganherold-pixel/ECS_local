const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

async function load(relativePath) {
  return import(pathToFileURL(path.join(root, relativePath)).href);
}

async function main() {
  const { loadVerificationPolicy } = await load('scripts/verification/verification-policy.mjs');
  const { buildVerificationInventory } = await load('scripts/verification/verification-inventory.mjs');
  const { buildLanePlan, runVerificationLane } = await load('scripts/verification/run-verification-lane.mjs');
  const { createEvidenceCheckResult, EVIDENCE_SAFE_CODES } = await load('scripts/verification/evidence-result.mjs');
  const {
    PGTAP_WORKFLOW_SAFE_CODES,
    computeSupabaseVerificationBinding,
    createPgtapWorkflowEvidence,
  } = await load('scripts/verification/pgtap-workflow-evidence.mjs');

  const policy = loadVerificationPolicy({ rootDir: root });
  const inventory = buildVerificationInventory({
    rootDir: root,
    policy,
    now: new Date('2026-07-13T12:00:00.000Z'),
  });

  const expectedCapabilities = [
    'ai',
    'auth-subscription',
    'automotive',
    'campops',
    'dashboard',
    'devices-telemetry',
    'dispatch',
    'expedition',
    'explore',
    'fleet',
    'garmin',
    'navigate',
    'offline-recovery',
    'supabase-rls',
    'weather-fire',
  ];
  assert.deepStrictEqual(policy.capabilities.map((entry) => entry.id).sort(), expectedCapabilities);
  assert.strictEqual(inventory.policyReferenceErrors.length, 0, 'Verification policy references must resolve.');
  assert.strictEqual(inventory.summary.unresolvedVerificationCommandCount, 0, 'Verification commands must resolve.');
  assert.ok(inventory.summary.packageScriptCount >= 600, 'Inventory must include the broad package-script surface.');
  assert.ok(inventory.summary.sourceContractCount > 0, 'Source contracts must remain explicitly visible.');
  assert.ok(inventory.summary.unmeasuredDurationCount > 0, 'Unmeasured durations must remain unknown, not zero.');
  assert.strictEqual(inventory.productionApproval, 'not_granted_by_inventory');
  assert.strictEqual(inventory.coveragePhase, 'planned');
  assert.strictEqual(inventory.summary.executedScenarioCount, 0);
  assert.strictEqual(inventory.summary.passedScenarioCount, 0);
  assert.strictEqual(inventory.summary.verifiedScenarioCount, 0);
  assert.strictEqual(
    inventory.summary.policyConfidenceMismatchCount,
    0,
    'Curated scenario checks must not claim behavioral confidence without executing runtime behavior.',
  );

  for (const capability of inventory.capabilityMatrix) {
    assert.ok(capability.behavioralCandidateCount > 0, `${capability.capabilityId} needs a behavioral candidate.`);
    assert.strictEqual(capability.coverageSatisfied, false, 'Declarations must not be treated as execution.');
    assert.ok(capability.scenarios.every((scenario) => scenario.state === 'declared'));
    assert.ok(capability.scenarios.every((scenario) => scenario.executedChecks.length === 0));
    assert.strictEqual(capability.productionApproval, 'not_granted_by_coverage_matrix');
  }

  const pr = buildLanePlan({ policy, laneId: 'pr-fast' });
  assert.ok(pr.checks.length > 0);
  assert.ok(pr.checks.every((check) => !check.productionEvidenceRequired));
  assert.ok(pr.checks.every((check) => !check.classifications.includes('evidence-only')));
  for (const requiredCheck of [
    'expo-config',
    'mapbox-session-reuse',
    'verification-readiness',
    'verification-coverage-model',
    'verification-timing-baseline',
    'verification-pgtap-release-evidence',
    'verification-workflow-input-safety',
    'release-smoke-workflow',
    'web-build-typecheck',
    'web-package-typecheck',
    'web-tests',
  ]) {
    assert.ok(pr.checks.some((check) => check.id === requiredCheck), `PR lane must include ${requiredCheck}.`);
  }
  for (const requiredIdentity of [
    'root::test:release-readiness',
    'root::test:release-smoke-ci-workflow',
    'root::test:verification-pgtap-release-evidence',
    'root::test:verification-timing-baseline',
    'root::test:verification-workflow-input-safety',
    'apps/web::build',
    'apps/web::typecheck',
    'apps/web::test:run',
  ]) {
    assert.ok(
      pr.checks.some((check) => check.scriptIdentity === requiredIdentity),
      `Generated PR plan must execute ${requiredIdentity}.`,
    );
  }

  const affected = buildLanePlan({
    policy,
    laneId: 'affected-domain',
    changedFiles: ['components/dispatch/DispatchCadCommandCenter.tsx'],
  });
  assert.ok(affected.capabilities.includes('dispatch'));
  assert.ok(affected.checks.some((check) => check.id === 'dispatch-runtime'));
  assert.ok(!affected.checks.some((check) => check.id === 'fleet-runtime'));

  const unknown = buildLanePlan({
    policy,
    laneId: 'affected-domain',
    changedFiles: ['new-domain/unknown.ts'],
  });
  assert.strictEqual(unknown.capabilities.length, expectedCapabilities.length);

  const nightly = buildLanePlan({ policy, laneId: 'full-nightly' });
  assert.ok(nightly.checks.some((check) => check.id === 'expo-export'));
  assert.ok(nightly.checks.some((check) => check.classifications.includes('migration')));
  assert.ok(nightly.checks.some((check) => check.classifications.includes('offline')));
  assert.ok(nightly.checks.some((check) => check.classifications.includes('performance')));
  for (const requiredIdentity of [
    'root::test:release-readiness',
    'root::test:release-smoke-ci-workflow',
    'root::test:verification-pgtap-release-evidence',
    'root::test:verification-timing-baseline',
    'root::test:verification-workflow-input-safety',
    'apps/web::build',
    'apps/web::typecheck',
    'apps/web::test:run',
  ]) {
    assert.ok(nightly.checks.some((check) => check.scriptIdentity === requiredIdentity));
  }

  const provider = buildLanePlan({ policy, laneId: 'provider-scheduled' });
  assert.ok(provider.checks.some((check) => check.classifications.includes('provider shadow')));
  assert.ok(provider.checks.some((check) => check.productionEvidenceRequired));
  assert.ok(provider.checks
    .filter((check) => check.classifications.includes('evidence-only'))
    .every((check) => check.resultContract === 'ecs-evidence-v1'));

  const release = buildLanePlan({ policy, laneId: 'release-candidate' });
  assert.strictEqual(release.lane.coverageEnforcement, 'strict');
  assert.ok(release.checks.some((check) => check.id === 'expo-export'));
  assert.ok(release.checks.some((check) => check.productionEvidenceRequired));
  assert.ok(release.checks.some((check) => check.id === 'production-visibility-report'));
  assert.ok(release.checks.some((check) => check.id === 'release-evidence-registry'));
  assert.ok(release.checks.some((check) => check.id === 'release-readiness-source-contract'));
  assert.ok(release.checks.some((check) => check.id === 'verification-pgtap-release-evidence'));
  assert.ok(release.checks.some((check) => check.id === 'verification-workflow-input-safety'));
  assert.ok(release.checks.some((check) => check.id === 'verification-timing-baseline'));
  assert.ok(release.checks
    .filter((check) => check.classifications.includes('evidence-only'))
    .every((check) => check.resultContract === 'ecs-evidence-v1'));
  for (const legacyEvidenceCheck of [
    'provider-readiness-evidence',
    'device-release-evidence',
    'automotive-release-evidence',
    'android-evidence',
    'privacy-storage-evidence',
    'closed-field-evidence',
  ]) {
    assert.ok(!release.checks.some((check) => check.id === legacyEvidenceCheck));
  }

  const hardware = buildLanePlan({ policy, laneId: 'manual-hardware' });
  assert.ok(hardware.checks.every((check) =>
    check.classifications.includes('hardware/device') || check.classifications.includes('evidence-only')));
  assert.ok(hardware.checks.some((check) => check.productionEvidenceRequired));

  const pgtap = policy.checks.find((check) => check.id === 'supabase-pgtap-rls');
  assert.strictEqual(pgtap.workflow, '.github/workflows/supabase-db-tests.yml');
  assert.ok(pgtap.classifications.includes('security/RLS'));
  assert.strictEqual(pgtap.confidence, 'behavioral');
  assert.strictEqual(pgtap.evidenceClass, 'behavioral');
  assert.strictEqual(pgtap.evidenceQuality, 'authoritative');
  assert.strictEqual(pgtap.workflowEvidence.resultContract, 'ecs-pgtap-workflow-evidence-v1');
  assert.strictEqual(pgtap.workflowEvidence.requiredSuiteIds.length, 4);
  assert.strictEqual(policy.timingPolicy.baselinePath, 'config/verification-timing-baseline.json');
  assert.ok(policy.timingPolicy.enforceLanes.includes('pr-fast'));
  assert.ok(policy.timingPolicy.enforceLanes.includes('release-candidate'));
  assert.deepStrictEqual(policy.timingPolicy.requiredBaselineLanes, ['release-candidate']);
  assert.deepStrictEqual(policy.timingPolicy.candidateLanes, ['full-nightly']);

  const executor = async (check, context) => {
    if (check.resultContract) {
      const evidence = createEvidenceCheckResult({
        checkId: check.id,
        status: 'passed',
        safeCode: EVIDENCE_SAFE_CODES.VERIFIED,
        blockerIds: [],
        summary: 'Synthetic contract fixture passed.',
      });
      fs.writeFileSync(context.evidenceResultFile, `${JSON.stringify(evidence)}\n`, 'utf8');
    }
    return { status: 'passed', exitCode: 0, durationMs: 1, summary: `${check.id} passed` };
  };
  const commitSha = 'a'.repeat(40);
  const workflowBinding = computeSupabaseVerificationBinding({ rootDir: root, ...pgtap.workflowEvidence });
  const workflowCoverageResults = [createPgtapWorkflowEvidence({
    checkId: pgtap.id,
    workflow: pgtap.workflow,
    status: 'passed',
    safeCode: PGTAP_WORKFLOW_SAFE_CODES.PASSED,
    commitSha,
    binding: workflowBinding,
    testResult: 'passed',
    executedSuiteIds: pgtap.workflowEvidence.requiredSuiteIds,
    durationMs: 1,
    executedAt: '2026-07-13T12:00:00.000Z',
    artifactDigest: 'b'.repeat(64),
    diagnostics: { suiteCount: 4, assertionCount: 121 },
  })];
  const simulatedRelease = await runVerificationLane({
    rootDir: root,
    policy,
    inventory,
    laneId: 'release-candidate',
    now: new Date('2026-07-13T12:00:00.000Z'),
    executor,
    workflowCoverageResults,
    provenance: { commit: commitSha, branch: 'test', dirty: false },
  });
  assert.strictEqual(simulatedRelease.status, 'passed');
  assert.strictEqual(simulatedRelease.coverageChecksPassed, true);
  assert.strictEqual(
    simulatedRelease.coverageMatrix.summary.satisfiedScenarioCount,
    simulatedRelease.coverageMatrix.summary.scenarioCount,
  );
  assert.strictEqual(simulatedRelease.productionApprovalStatus, 'pending');

  const missingWorkflowResult = await runVerificationLane({
    rootDir: root,
    policy,
    inventory,
    laneId: 'release-candidate',
    now: new Date('2026-07-13T12:00:00.000Z'),
    executor,
    provenance: { commit: commitSha, branch: 'test', dirty: false },
  });
  assert.strictEqual(missingWorkflowResult.status, 'failed');
  assert.strictEqual(missingWorkflowResult.coverageChecksPassed, false);
  assert.ok(missingWorkflowResult.coverageStrictFailures.some((entry) =>
    entry.checkId === null && entry.capabilityId === 'supabase-rls'));
  assert.strictEqual(missingWorkflowResult.productionApprovalStatus, 'pending');

  console.log('ECS verification release-readiness checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
