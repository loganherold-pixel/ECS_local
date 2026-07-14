import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EVIDENCE_RESULT_CONTRACT,
  EVIDENCE_SAFE_CODES,
  VERIFICATION_EXIT_CODES,
  classifyEvidenceCheckOutcome,
  createEvidenceCheckResult,
  exitCodeForEvidenceResult,
  validateEvidenceCheckResult,
} from './verification/evidence-result.mjs';
import {
  exitCodeForLaneResult,
  formatVerificationLaneSummary,
  runVerificationLane,
} from './verification/run-verification-lane.mjs';
import { VERIFICATION_PROCESS_FAILURE_CLASSES } from './verification/verification-process-runner.mjs';
import { validateVerificationPolicy } from './verification/verification-policy.mjs';

const NOW = new Date('2026-07-13T12:00:00.000Z');

function evidenceCheck(id) {
  return {
    id,
    workspace: 'root',
    script: `gate:${id}`,
    capabilities: ['devices'],
    classifications: ['evidence-only'],
    scenarios: [],
    lanes: ['test-lane'],
    confidence: 'evidence',
    productionEvidenceRequired: true,
    resultContract: EVIDENCE_RESULT_CONTRACT,
  };
}

function ordinaryCheck(id = 'ordinary-check') {
  return {
    id,
    workspace: 'root',
    script: `test:${id}`,
    capabilities: ['devices'],
    classifications: ['unit'],
    scenarios: [],
    lanes: ['test-lane'],
    confidence: 'behavioral',
  };
}

function policyFor(checks, evidenceBlockers = ['static_real_hardware_requirement']) {
  return validateVerificationPolicy({
    schemaVersion: 1,
    policyVersion: 'test.1',
    capabilities: [{
      id: 'devices',
      label: 'Devices',
      pathPrefixes: ['lib/device'],
      highValueScenarios: [],
      evidenceBlockers,
    }],
    checks,
    lanes: [{
      id: 'test-lane',
      label: 'Test lane',
      maxParallel: 2,
      timeoutMs: 250,
      budgetMs: 5_000,
      purpose: 'Verification result protocol tests.',
    }],
  });
}

function passedEnvelope(checkId) {
  return createEvidenceCheckResult({
    checkId,
    status: 'passed',
    safeCode: EVIDENCE_SAFE_CODES.VERIFIED,
    blockerIds: [],
    summary: 'Evidence is complete and valid.',
  });
}

function blockedEnvelope(checkId, blockerIds = ['real_hardware_missing']) {
  return createEvidenceCheckResult({
    checkId,
    status: 'blocked_external',
    safeCode: EVIDENCE_SAFE_CODES.EXTERNAL_REQUIRED,
    blockerIds,
    summary: 'Required external evidence is not yet available.',
  });
}

function writeResult(context, value) {
  assert.ok(context.evidenceResultFile, 'Evidence checks must receive an isolated result file.');
  fs.mkdirSync(path.dirname(context.evidenceResultFile), { recursive: true });
  fs.writeFileSync(context.evidenceResultFile, `${JSON.stringify(value)}\n`, 'utf8');
}

function processResultFor(envelope, overrides = {}) {
  const exitCode = exitCodeForEvidenceResult(envelope);
  return {
    status: exitCode === VERIFICATION_EXIT_CODES.PASSED ? 'passed' : 'failed',
    exitCode,
    signal: null,
    durationMs: 2,
    stdout: '',
    stderr: '',
    summary: '',
    ...overrides,
  };
}

async function inTempRoot(run) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-verification-outcomes-'));
  try {
    fs.writeFileSync(path.join(rootDir, 'package.json'), `${JSON.stringify({
      name: 'ecs-outcome-fixture',
      scripts: {
        'test:ordinary-check': 'node ordinary.mjs',
        'gate:device-evidence': 'node evidence.mjs',
        'gate:blocked-evidence': 'node evidence.mjs',
        'gate:broken-evidence': 'node evidence.mjs',
      },
    })}\n`, 'utf8');
    return await run(rootDir);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

test('evidence result schema and dedicated exit semantics are explicit', () => {
  const passed = passedEnvelope('device-evidence');
  const blocked = blockedEnvelope('device-evidence');
  assert.deepEqual(validateEvidenceCheckResult(passed, { expectedCheckId: 'device-evidence' }), passed);
  assert.equal(exitCodeForEvidenceResult(passed), VERIFICATION_EXIT_CODES.PASSED);
  assert.equal(exitCodeForEvidenceResult(blocked), VERIFICATION_EXIT_CODES.BLOCKED_EXTERNAL);
  assert.equal(exitCodeForLaneResult('passed'), VERIFICATION_EXIT_CODES.PASSED);
  assert.equal(exitCodeForLaneResult('blocked_external'), VERIFICATION_EXIT_CODES.BLOCKED_EXTERNAL);
  assert.equal(exitCodeForLaneResult('blocked_external', { allowBlockedExternal: true }), VERIFICATION_EXIT_CODES.PASSED);
  assert.equal(exitCodeForLaneResult('failed'), VERIFICATION_EXIT_CODES.FAILED);
  assert.throws(() => validateEvidenceCheckResult({ ...blocked, safeCode: 'made_up_code' }));
});

test('only explicitly allowlisted producer blockers can report blocked_external', () => {
  assert.deepEqual(classifyEvidenceCheckOutcome({
    passed: false,
    blockerIds: ['real_hardware_missing'],
    externalBlockerIds: ['real_hardware_missing'],
  }), {
    status: 'blocked_external',
    safeCode: EVIDENCE_SAFE_CODES.EXTERNAL_REQUIRED,
    blockerIds: ['real_hardware_missing'],
    internalFailureIds: [],
  });
  assert.deepEqual(classifyEvidenceCheckOutcome({
    passed: false,
    blockerIds: ['runtime_contract_broken'],
    externalBlockerIds: ['real_hardware_missing'],
  }), {
    status: 'failed',
    safeCode: EVIDENCE_SAFE_CODES.CHECK_FAILED,
    blockerIds: [],
    internalFailureIds: ['runtime_contract_broken'],
  });
});

test('ordinary and evidence checks can pass without static capability blockers becoming unresolved', async () => {
  await inTempRoot(async (rootDir) => {
    const policy = policyFor([ordinaryCheck(), evidenceCheck('device-evidence')]);
    const result = await runVerificationLane({
      rootDir,
      policy,
      laneId: 'test-lane',
      now: NOW,
      executor: async (check, context) => {
        if (check.resultContract) {
          const envelope = passedEnvelope(check.id);
          writeResult(context, envelope);
          return processResultFor(envelope);
        }
        return { status: 'passed', exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '', summary: 'passed' };
      },
      provenance: { commit: 'abc1234', branch: 'test', dirty: false },
    });

    assert.equal(result.status, 'passed');
    assert.equal(result.codeChecksPassed, true);
    assert.deepEqual(result.externalEvidenceBlockers, []);
    assert.equal(result.productionApproval, 'not_granted_by_code_checks');
    assert.equal(result.productionApprovalStatus, 'pending');
    const summary = formatVerificationLaneSummary(result);
    assert.match(summary, /Lane outcome: \*\*passed\*\*/);
    assert.match(summary, /Production approval: \*\*pending\*\*/);
  });
});

test('a valid missing-evidence envelope produces blocked_external with exact blocker IDs', async () => {
  await inTempRoot(async (rootDir) => {
    const policy = policyFor([evidenceCheck('device-evidence')]);
    const result = await runVerificationLane({
      rootDir,
      policy,
      laneId: 'test-lane',
      now: NOW,
      executor: async (check, context) => {
        const envelope = blockedEnvelope(check.id, ['android_background_reconnect']);
        writeResult(context, envelope);
        return processResultFor(envelope);
      },
    });

    assert.equal(result.status, 'blocked_external');
    assert.equal(result.codeChecksPassed, true);
    assert.deepEqual(result.externalEvidenceBlockers, ['android_background_reconnect']);
    assert.equal(result.results[0].safeCode, EVIDENCE_SAFE_CODES.EXTERNAL_REQUIRED);
  });
});

test('a crashing evidence process remains failed even when output says evidence required', async () => {
  await inTempRoot(async (rootDir) => {
    const policy = policyFor([evidenceCheck('device-evidence')]);
    const result = await runVerificationLane({
      rootDir,
      policy,
      laneId: 'test-lane',
      now: NOW,
      executor: async (check, context) => {
        writeResult(context, blockedEnvelope(check.id));
        return {
          status: 'failed',
          exitCode: 1,
          signal: null,
          durationMs: 2,
          stdout: 'evidence required',
          stderr: 'Error: parser crashed\n    at evidence-check.mjs:12:3',
          summary: 'evidence required',
        };
      },
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.codeChecksPassed, false);
    assert.deepEqual(result.externalEvidenceBlockers, []);
    assert.equal(result.results[0].failureCode, 'evidence_process_stderr');
  });
});

test('malformed JSON and an unknown safeCode fail closed', async () => {
  await inTempRoot(async (rootDir) => {
    for (const scenario of ['malformed', 'unknown-safe-code']) {
      const policy = policyFor([evidenceCheck('device-evidence')]);
      const result = await runVerificationLane({
        rootDir,
        policy,
        laneId: 'test-lane',
        now: NOW,
        executor: async (check, context) => {
          if (scenario === 'malformed') {
            fs.writeFileSync(context.evidenceResultFile, '{not-json\n', 'utf8');
          } else {
            writeResult(context, {
              ...blockedEnvelope(check.id),
              safeCode: 'unknown_external_state',
            });
          }
          return {
            status: 'failed',
            exitCode: VERIFICATION_EXIT_CODES.BLOCKED_EXTERNAL,
            signal: null,
            durationMs: 1,
            stdout: '',
            stderr: '',
            summary: '',
          };
        },
      });
      assert.equal(result.status, 'failed', scenario);
      assert.equal(result.results[0].status, 'failed', scenario);
    }
  });
});

test('timeout and signal termination always fail', async () => {
  await inTempRoot(async (rootDir) => {
    for (const processFailure of [
      { status: 'timeout', exitCode: null, signal: null, failureCode: 'process_timeout' },
      { status: 'failed', exitCode: null, signal: 'SIGTERM', failureCode: 'process_signal' },
    ]) {
      const result = await runVerificationLane({
        rootDir,
        policy: policyFor([evidenceCheck('device-evidence')]),
        laneId: 'test-lane',
        now: NOW,
        executor: async () => ({
          ...processFailure,
          durationMs: 250,
          stdout: '',
          stderr: '',
          summary: 'Evidence required',
        }),
      });
      assert.equal(result.status, 'failed', processFailure.failureCode);
      assert.equal(result.results[0].status, 'failed', processFailure.failureCode);
    }
  });
});

test('an environment process-spawn restriction remains an internal lane failure', async () => {
  await inTempRoot(async (rootDir) => {
    const result = await runVerificationLane({
      rootDir,
      policy: policyFor([ordinaryCheck()]),
      laneId: 'test-lane',
      now: NOW,
      executor: async () => ({
        status: 'failed',
        exitCode: null,
        signal: null,
        failureCode: 'process_spawn_restricted',
        failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.ENVIRONMENT_PROCESS_SPAWN_RESTRICTION,
        durationMs: 1,
        stdout: '',
        stderr: '',
        summary: 'The environment denied child process creation.',
      }),
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.codeChecksPassed, false);
    assert.equal(result.results[0].status, 'failed');
    assert.equal(
      result.results[0].failureClass,
      VERIFICATION_PROCESS_FAILURE_CLASSES.ENVIRONMENT_PROCESS_SPAWN_RESTRICTION,
    );
    assert.deepEqual(result.externalEvidenceBlockers, []);
  });
});

test('internal failure takes precedence over a valid external blocker', async () => {
  await inTempRoot(async (rootDir) => {
    const policy = policyFor([
      evidenceCheck('blocked-evidence'),
      evidenceCheck('broken-evidence'),
    ]);
    const result = await runVerificationLane({
      rootDir,
      policy,
      laneId: 'test-lane',
      now: NOW,
      executor: async (check, context) => {
        if (check.id === 'blocked-evidence') {
          const envelope = blockedEnvelope(check.id, ['provider_shadow_missing']);
          writeResult(context, envelope);
          return processResultFor(envelope);
        }
        return {
          status: 'failed',
          exitCode: 1,
          signal: null,
          durationMs: 1,
          stdout: 'blocked evidence required',
          stderr: '',
          summary: 'crashed before writing a result',
        };
      },
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.codeChecksPassed, false);
    assert.deepEqual(result.externalEvidenceBlockers, ['provider_shadow_missing']);
  });
});

test('policy requires the versioned result contract for every evidence-only check', () => {
  const invalid = evidenceCheck('device-evidence');
  delete invalid.resultContract;
  assert.throws(
    () => policyFor([invalid]),
    /resultContract/,
  );
});
