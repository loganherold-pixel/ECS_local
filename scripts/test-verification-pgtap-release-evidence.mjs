import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PGTAP_WORKFLOW_EVIDENCE_CONTRACT,
  PGTAP_WORKFLOW_SAFE_CODES,
  computeSupabaseVerificationBinding,
  createPgtapWorkflowEvidence,
  materializePgtapWorkflowResult,
  parseExecutedPgtapSuites,
  validatePgtapWorkflowEvidence,
} from './verification/pgtap-workflow-evidence.mjs';
import { runVerificationLane } from './verification/run-verification-lane.mjs';
import { runPgtapRlsWorkflow } from './verification/run-pgtap-rls-workflow.mjs';
import {
  VERIFICATION_ARTIFACT_SCHEMAS,
  VERIFICATION_ARTIFACT_AUDIENCES,
  buildVerificationLaneArtifact,
} from './verification/verification-artifact-policy.mjs';
import { validateVerificationPolicy } from './verification/verification-policy.mjs';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const COMMIT = 'a'.repeat(40);
const OTHER_COMMIT = 'b'.repeat(40);
const WORKFLOW = '.github/workflows/supabase-db-tests.yml';
const REQUIRED_SUITES = [
  'supabase/tests/database/010-trips-rls.test.sql',
  'supabase/tests/database/020-fleet-rls.test.sql',
];

function write(rootDir, relativePath, content) {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-pgtap-evidence-'));
  write(rootDir, 'package.json', JSON.stringify({
    name: 'ecs-pgtap-fixture',
    scripts: {
      'test:workflow-contract': 'node workflow-contract.mjs',
    },
  }));
  write(rootDir, 'workflow-contract.mjs', 'process.exitCode = 0;\n');
  write(rootDir, 'supabase/config.toml', 'project_id = "ecs-pgtap-fixture"\n');
  write(rootDir, 'supabase/migrations/001_initial.sql', 'create table public.alpha(id uuid primary key);\n');
  write(rootDir, REQUIRED_SUITES[0], 'begin; select plan(1); select pass(\'trip rls\'); select * from finish(); rollback;\n');
  write(rootDir, REQUIRED_SUITES[1], 'begin; select plan(1); select pass(\'fleet rls\'); select * from finish(); rollback;\n');
  return rootDir;
}

function workflowEvidencePolicy() {
  return validateVerificationPolicy({
    schemaVersion: 2,
    policyVersion: 'pgtap-release-fixture.1',
    capabilities: [{
      id: 'supabase-rls',
      label: 'Supabase RLS',
      pathPrefixes: ['supabase/'],
      highValueScenarios: ['migration'],
      scenarioRequirements: [{
        id: 'migration',
        requiredEvidenceClasses: ['behavioral'],
        checkIds: ['supabase-pgtap-rls'],
        enforcedLanes: ['release-candidate'],
        deterministicCi: true,
      }],
      evidenceBlockers: [],
    }],
    checks: [{
      id: 'supabase-workflow-contract',
      workspace: 'root',
      script: 'test:workflow-contract',
      capabilities: ['supabase-rls'],
      classifications: ['contract', 'security/RLS'],
      scenarios: [],
      lanes: ['release-candidate'],
      confidence: 'source-contract',
      evidenceClass: 'workflow_contract',
      evidenceQuality: 'authoritative',
      executionEnvironment: 'static',
    }, {
      id: 'supabase-pgtap-rls',
      workflow: WORKFLOW,
      capabilities: ['supabase-rls'],
      classifications: ['integration', 'migration', 'security/RLS'],
      scenarios: ['migration'],
      lanes: [],
      confidence: 'behavioral',
      evidenceClass: 'behavioral',
      evidenceQuality: 'authoritative',
      executionEnvironment: 'deterministic_ci',
      workflowEvidence: {
        resultContract: PGTAP_WORKFLOW_EVIDENCE_CONTRACT,
        schemaTestConfigVersion: 'ecs-supabase-rls-v1',
        configPaths: ['supabase/config.toml'],
        migrationDirectory: 'supabase/migrations',
        requiredSuiteIds: REQUIRED_SUITES,
        maxAgeMs: 21_600_000,
      },
    }],
    lanes: [{
      id: 'release-candidate',
      label: 'Release candidate',
      maxParallel: 1,
      timeoutMs: 10_000,
      budgetMs: 60_000,
      coverageEnforcement: 'strict',
    }],
  });
}

function passedEvidence(rootDir, overrides = {}) {
  const binding = computeSupabaseVerificationBinding({
    rootDir,
    schemaTestConfigVersion: 'ecs-supabase-rls-v1',
    configPaths: ['supabase/config.toml'],
    migrationDirectory: 'supabase/migrations',
    requiredSuiteIds: REQUIRED_SUITES,
  });
  return createPgtapWorkflowEvidence({
    checkId: 'supabase-pgtap-rls',
    workflow: WORKFLOW,
    status: 'passed',
    safeCode: PGTAP_WORKFLOW_SAFE_CODES.PASSED,
    commitSha: COMMIT,
    binding,
    testResult: 'passed',
    executedSuiteIds: REQUIRED_SUITES,
    durationMs: 125,
    executedAt: NOW.toISOString(),
    artifactDigest: 'c'.repeat(64),
    diagnostics: { suiteCount: 2, assertionCount: 2 },
    ...overrides,
  });
}

async function runRelease(rootDir, workflowCoverageResults) {
  return runVerificationLane({
    rootDir,
    policy: workflowEvidencePolicy(),
    laneId: 'release-candidate',
    now: NOW,
    workflowCoverageResults,
    executor: async () => ({
      status: 'passed',
      exitCode: 0,
      signal: null,
      durationMs: 1,
      stdout: '',
      stderr: '',
      summary: 'Workflow contract passed.',
    }),
    provenance: { commit: COMMIT, branch: 'test', dirty: false },
  });
}

test('migration and schema/test configuration bindings are deterministic and content-sensitive', () => {
  const rootDir = createFixture();
  try {
    const options = {
      rootDir,
      schemaTestConfigVersion: 'ecs-supabase-rls-v1',
      configPaths: ['supabase/config.toml'],
      migrationDirectory: 'supabase/migrations',
      requiredSuiteIds: REQUIRED_SUITES,
    };
    const first = computeSupabaseVerificationBinding(options);
    const second = computeSupabaseVerificationBinding(options);
    assert.deepEqual(second, first);
    assert.match(first.migrationDigest, /^[a-f0-9]{64}$/);
    assert.match(first.schemaTestConfigDigest, /^[a-f0-9]{64}$/);

    write(rootDir, 'supabase/migrations/001_initial.sql', 'create table public.beta(id uuid primary key);\n');
    const changed = computeSupabaseVerificationBinding(options);
    assert.notEqual(changed.migrationDigest, first.migrationDigest);
    assert.equal(changed.schemaTestConfigDigest, first.schemaTestConfigDigest);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('pgTAP output proves each explicitly required suite executed', () => {
  const output = [
    '/tmp/supabase/tests/database/010-trips-rls.test.sql ........ ok',
    '/tmp/supabase/tests/database/020-fleet-rls.test.sql ........ ok',
    'All tests successful.',
    'Files=2, Tests=2, Result: PASS',
  ].join('\n');
  assert.deepEqual(parseExecutedPgtapSuites(output, REQUIRED_SUITES), REQUIRED_SUITES);
  assert.deepEqual(parseExecutedPgtapSuites(output.split('\n')[0], REQUIRED_SUITES), [REQUIRED_SUITES[0]]);
});

test('the workflow executor invokes real local pgTAP with every required suite', async () => {
  const rootDir = createFixture();
  try {
    let invocation;
    const output = [
      '/tmp/supabase/tests/database/010-trips-rls.test.sql ........ ok',
      '/tmp/supabase/tests/database/020-fleet-rls.test.sql ........ ok',
      'All tests successful.',
      'Files=2, Tests=2, Result: PASS',
    ].join('\n');
    const result = await runPgtapRlsWorkflow({
      rootDir,
      policy: workflowEvidencePolicy(),
      commitSha: COMMIT,
      now: NOW,
      output: '.smoke/verification/pgtap-workflow-evidence.json',
      processRunner: async (command, args, options) => {
        invocation = { command, args, options };
        return {
          exitCode: 0,
          signal: null,
          durationMs: 12,
          output,
          overflow: false,
          artifactDigest: 'd'.repeat(64),
          spawnError: null,
        };
      },
    });
    assert.deepEqual(invocation.args, ['test', 'db', '--local', ...REQUIRED_SUITES]);
    assert.equal(invocation.options.cwd, rootDir);
    assert.equal(result.status, 'passed');
    assert.deepEqual(result.executedSuiteIds, REQUIRED_SUITES);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(rootDir, '.smoke/verification/pgtap-workflow-evidence.json'), 'utf8')),
      result,
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('a pgTAP runner launch failure is not reported as a database assertion failure', async () => {
  const rootDir = createFixture();
  try {
    const result = await runPgtapRlsWorkflow({
      rootDir,
      policy: workflowEvidencePolicy(),
      commitSha: COMMIT,
      now: NOW,
      output: '.smoke/verification/pgtap-workflow-evidence.json',
      processRunner: async () => ({
        exitCode: null,
        signal: null,
        durationMs: 3,
        output: '',
        overflow: false,
        artifactDigest: 'e'.repeat(64),
        spawnError: new Error('synthetic launch failure'),
      }),
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.safeCode, PGTAP_WORKFLOW_SAFE_CODES.JOB_FAILED);
    assert.equal(result.testResult, 'not_executed');
    assert.equal(result.diagnostics.failureStage, 'pgtap_runner');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('matching commit, migrations, config, and passing pgTAP evidence satisfy release coverage', async () => {
  const rootDir = createFixture();
  try {
    const envelope = passedEvidence(rootDir);
    const validated = validatePgtapWorkflowEvidence(envelope, {
      expectedCheckId: 'supabase-pgtap-rls',
      expectedWorkflow: WORKFLOW,
      expectedCommitSha: COMMIT,
      expectedBinding: envelope.binding,
      requiredSuiteIds: REQUIRED_SUITES,
      now: NOW,
      maxAgeMs: 21_600_000,
    });
    assert.deepEqual(validated, envelope);

    const result = await runRelease(rootDir, [envelope]);
    assert.equal(result.status, 'passed');
    assert.equal(result.coverageChecksPassed, true);
    assert.equal(result.productionApprovalStatus, 'pending');
    assert.deepEqual(result.externalEvidenceBlockers, []);
    const artifact = buildVerificationLaneArtifact(result, {
      audience: VERIFICATION_ARTIFACT_AUDIENCES.RELEASE_CANDIDATE,
    });
    assert.equal(artifact.schemaVersion, VERIFICATION_ARTIFACT_SCHEMAS.LANE);
    assert.equal(artifact.workflowEvidence.length, 1);
    assert.equal(artifact.workflowEvidence[0].commitSha, COMMIT);
    assert.equal(artifact.workflowEvidence[0].migrationDigest, envelope.binding.migrationDigest);
    assert.deepEqual(artifact.workflowEvidence[0].executedSuiteIds, REQUIRED_SUITES);
    assert.equal('diagnostics' in artifact.workflowEvidence[0], false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('failed pgTAP evidence fails release even when the source workflow contract passes', async () => {
  const rootDir = createFixture();
  try {
    const failed = passedEvidence(rootDir, {
      status: 'failed',
      safeCode: PGTAP_WORKFLOW_SAFE_CODES.TEST_FAILED,
      testResult: 'failed',
    });
    const result = await runRelease(rootDir, [failed]);
    assert.equal(result.status, 'failed');
    assert.equal(result.codeChecksPassed, false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('absent pgTAP evidence cannot be replaced by workflow-contract verification', async () => {
  const rootDir = createFixture();
  try {
    const result = await runRelease(rootDir, []);
    assert.equal(result.status, 'failed');
    assert.equal(result.coverageChecksPassed, false);
    assert.ok(result.coverageStrictFailures.some((failure) => failure.capabilityId === 'supabase-rls'));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('release dependency materialization fails closed for skipped, absent, malformed, and stale evidence', () => {
  const rootDir = createFixture();
  try {
    const policy = workflowEvidencePolicy();
    const check = policy.checks.find((entry) => entry.id === 'supabase-pgtap-rls');
    const passed = passedEvidence(rootDir);
    const scenarios = [
      { dependencyStatus: 'skipped', rawResult: '', safeCode: PGTAP_WORKFLOW_SAFE_CODES.JOB_SKIPPED },
      { dependencyStatus: 'success', rawResult: '', safeCode: PGTAP_WORKFLOW_SAFE_CODES.RESULT_MISSING },
      { dependencyStatus: 'success', rawResult: '{bad-json', safeCode: PGTAP_WORKFLOW_SAFE_CODES.RESULT_MALFORMED },
      {
        dependencyStatus: 'success',
        rawResult: JSON.stringify(passedEvidence(rootDir, { commitSha: OTHER_COMMIT })),
        safeCode: PGTAP_WORKFLOW_SAFE_CODES.BINDING_MISMATCH,
      },
      {
        dependencyStatus: 'success',
        rawResult: JSON.stringify(passedEvidence(rootDir, {
          binding: { ...passed.binding, migrationDigest: 'd'.repeat(64) },
        })),
        safeCode: PGTAP_WORKFLOW_SAFE_CODES.BINDING_MISMATCH,
      },
      {
        dependencyStatus: 'success',
        rawResult: JSON.stringify(passedEvidence(rootDir, { executedSuiteIds: [REQUIRED_SUITES[0]] })),
        safeCode: PGTAP_WORKFLOW_SAFE_CODES.REQUIRED_SUITE_MISSING,
      },
    ];

    for (const scenario of scenarios) {
      const result = materializePgtapWorkflowResult({
        rootDir,
        check,
        dependencyStatus: scenario.dependencyStatus,
        rawResult: scenario.rawResult,
        expectedCommitSha: COMMIT,
        now: NOW,
      });
      assert.equal(result.status, 'failed', scenario.safeCode);
      assert.equal(result.safeCode, scenario.safeCode, scenario.safeCode);
    }
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('a failed reusable pgTAP job remains failed even if it emitted no result', () => {
  const rootDir = createFixture();
  try {
    const check = workflowEvidencePolicy().checks.find((entry) => entry.id === 'supabase-pgtap-rls');
    const result = materializePgtapWorkflowResult({
      rootDir,
      check,
      dependencyStatus: 'failure',
      rawResult: '',
      expectedCommitSha: COMMIT,
      now: NOW,
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.safeCode, PGTAP_WORKFLOW_SAFE_CODES.JOB_FAILED);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
