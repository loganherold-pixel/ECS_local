import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPreClosedFieldTestGateResult } from './run-pre-closed-field-test-gates.mjs';

const rootDir = process.cwd();
const fixedNow = new Date('2026-05-17T12:00:00.000Z');

function stageByName(result, name) {
  return result.stages.find((stage) => stage.name === name);
}

test('pre-closed-field evidence gate passes restricted shadow-only posture while enforcing release overrides', async () => {
  const result = await buildPreClosedFieldTestGateResult({ rootDir, now: fixedNow });
  const overrideStage = stageByName(result, 'release-approval-overrides');
  const providerStage = stageByName(result, 'provider-readiness');
  const noRuntimeMocksStage = stageByName(result, 'no-runtime-mocks');
  const closedFieldStage = stageByName(result, 'closed-field-test');

  assert.equal(result.passed, true);
  assert.equal(result.status, 'ready_with_restrictions');
  assert.equal(result.mode, 'evidence');
  assert.deepEqual(result.failedStages, []);
  assert.deepEqual(result.blockers, []);
  assert.ok(overrideStage, 'release approval override guard stage should be present');
  assert.equal(overrideStage.status, 'passed');
  assert.equal(overrideStage.resultStatus, 'override_guards_enforced');
  assert.ok(noRuntimeMocksStage, 'runtime mock import guard should be present');
  assert.equal(noRuntimeMocksStage.status, 'passed');
  assert.ok(closedFieldStage, 'closed field-test stage should be present');
  assert.equal(closedFieldStage.status, 'passed');
  assert.equal(closedFieldStage.resultStatus, 'ready_with_restrictions');
  assert.ok(providerStage, 'provider readiness stage should be present in evidence mode');
  assert.equal(providerStage.resultStatus, 'shadow_only_acceptable_not_approved_for_influence');
  assert.equal(providerStage.status, 'passed');
});

test('pre-closed-field risk-acceptance mode blocks when risk acceptance is expired', async () => {
  const result = await buildPreClosedFieldTestGateResult({
    rootDir,
    now: fixedNow,
    riskAcceptanceMode: true,
  });
  const overrideStage = stageByName(result, 'release-approval-overrides');
  const noRuntimeMocksStage = stageByName(result, 'no-runtime-mocks');
  const closedFieldStage = stageByName(result, 'closed-field-test');
  const riskAcceptanceStage = stageByName(result, 'risk-acceptance');

  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.mode, 'risk_acceptance');
  assert.equal(result.riskAccepted, false);
  assert.ok(result.failedStages.includes('risk-acceptance'));
  assert.deepEqual(result.blockers, ['risk_acceptance_expired']);
  assert.ok(overrideStage, 'release approval override guard stage should be present in risk-acceptance mode');
  assert.equal(overrideStage.status, 'passed');
  assert.equal(overrideStage.resultStatus, 'override_guards_enforced');
  assert.ok(noRuntimeMocksStage, 'runtime mock import guard should be present in risk-acceptance mode');
  assert.equal(noRuntimeMocksStage.status, 'passed');
  assert.ok(riskAcceptanceStage, 'risk acceptance stage should be present in risk-acceptance mode');
  assert.equal(riskAcceptanceStage.status, 'failed');
  assert.equal(riskAcceptanceStage.resultStatus, 'expired');
  assert.deepEqual(riskAcceptanceStage.blockers, ['risk_acceptance_expired']);
  assert.ok(closedFieldStage, 'closed field-test stage should be present in risk-acceptance mode');
  assert.equal(closedFieldStage.status, 'passed');
  assert.equal(closedFieldStage.resultStatus, 'ready_with_restrictions');
  assert.equal(closedFieldStage.riskAcceptance.accepted, false);
  assert.ok(closedFieldStage.riskAcceptance.blockers.includes('risk_acceptance_expired'));
  assert.ok(
    result.waivedEvidenceGates.every((gate) => gate.name !== 'release-approval-overrides'),
    'release approval override guard must not be risk-acceptance waived',
  );
  assert.ok(
    result.waivedEvidenceGates.every((gate) => gate.status === 'not_waived_risk_acceptance_incomplete'),
    'risk acceptance mode should not waive evidence gates while risk acceptance is expired',
  );
});
