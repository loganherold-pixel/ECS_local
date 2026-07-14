import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';

import { EVIDENCE_RESULT_CONTRACT } from './verification/evidence-result.mjs';
import { runVerificationLane } from './verification/run-verification-lane.mjs';
import { loadVerificationPolicy } from './verification/verification-policy.mjs';

const rootDir = path.resolve(process.cwd());
const policy = loadVerificationPolicy({ rootDir });
const evidenceChecks = policy.checks.filter((check) => check.classifications.includes('evidence-only'));
const laneId = 'evidence-producer-contracts';
const contractPolicy = {
  ...policy,
  lanes: [{
    id: laneId,
    label: 'Evidence producer contracts',
    maxParallel: 2,
    timeoutMs: 120_000,
    budgetMs: 600_000,
    purpose: 'Executes every evidence producer and validates its typed result envelope.',
  }],
  checks: evidenceChecks.map((check) => ({
    ...check,
    lanes: [laneId],
  })),
};

const result = await runVerificationLane({
  rootDir,
  policy: contractPolicy,
  laneId,
  now: new Date('2026-07-13T12:00:00.000Z'),
  provenance: { commit: 'contract-test', branch: 'contract-test', dirty: false },
});

assert.ok(evidenceChecks.length > 0, 'At least one evidence producer must be registered.');
assert.equal(result.results.length, evidenceChecks.length);
assert.notEqual(result.status, 'failed', JSON.stringify(result.results, null, 2));
assert.deepEqual(
  result.results.map((check) => check.checkId).sort(),
  evidenceChecks.map((check) => check.id).sort(),
);
for (const check of result.results) {
  assert.equal(check.resultContract, EVIDENCE_RESULT_CONTRACT, `${check.checkId} must declare the evidence contract.`);
  assert.ok(check.evidenceResult, `${check.checkId} must emit a schema-valid evidence result.`);
  assert.equal(check.evidenceResult.checkId, check.checkId);
  assert.ok(['passed', 'blocked_external'].includes(check.status), `${check.checkId} must not fail internally.`);
}

console.log(`Verification evidence producer contracts passed for ${result.results.length} checks (${result.status}).`);
