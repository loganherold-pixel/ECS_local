import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPreClosedFieldTestGateResult } from './run-pre-closed-field-test-gates.mjs';

const rootDir = process.cwd();
const fixedNow = new Date('2026-05-17T12:00:00.000Z');

function stageByName(result, name) {
  return result.stages.find((stage) => stage.name === name);
}

test('pre-closed-field evidence gate includes release approval override guard', async () => {
  const result = await buildPreClosedFieldTestGateResult({ rootDir, now: fixedNow });
  const overrideStage = stageByName(result, 'release-approval-overrides');
  const providerStage = stageByName(result, 'provider-readiness');

  assert.equal(result.passed, true);
  assert.equal(result.mode, 'evidence');
  assert.ok(overrideStage, 'release approval override guard stage should be present');
  assert.equal(overrideStage.status, 'passed');
  assert.equal(overrideStage.resultStatus, 'override_guards_enforced');
  assert.ok(providerStage, 'provider readiness stage should be present in evidence mode');
  assert.equal(providerStage.resultStatus, 'shadow_only_acceptable_not_approved_for_influence');
});

test('pre-closed-field risk-acceptance gate still includes release approval override guard', async () => {
  const result = await buildPreClosedFieldTestGateResult({
    rootDir,
    now: fixedNow,
    riskAcceptanceMode: true,
  });
  const overrideStage = stageByName(result, 'release-approval-overrides');

  assert.equal(result.passed, true);
  assert.equal(result.mode, 'risk_acceptance');
  assert.ok(overrideStage, 'release approval override guard stage should be present in risk-acceptance mode');
  assert.equal(overrideStage.status, 'passed');
  assert.equal(overrideStage.resultStatus, 'override_guards_enforced');
  assert.ok(
    result.waivedEvidenceGates.every((gate) => gate.name !== 'release-approval-overrides'),
    'release approval override guard must not be risk-acceptance waived',
  );
});
