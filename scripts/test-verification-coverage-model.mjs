import assert from 'node:assert/strict';

import {
  buildVerificationCoverageMatrix,
  collectCoverageStrictFailures,
} from './verification/verification-coverage.mjs';
import { collectVerificationInventoryStrictFailures } from './verification/verification-inventory.mjs';

const CAPABILITY_ID = 'navigate';
const SCENARIO_ID = 'offline_route';
const LANE_ID = 'test-lane';

function check(overrides = {}) {
  return {
    id: 'runtime-check',
    scriptIdentity: 'root::test:runtime-check',
    capabilities: [CAPABILITY_ID],
    capabilityWildcard: false,
    scenarios: [SCENARIO_ID],
    evidenceClass: 'behavioral',
    evidenceQuality: 'authoritative',
    executionEnvironment: 'deterministic_ci',
    ...overrides,
  };
}

function scriptRecord(overrides = {}) {
  return {
    policyCheckId: 'runtime-check',
    scriptIdentity: 'root::test:runtime-check',
    executionModel: 'runtime_behavior',
    executesAssertions: true,
    importsRuntimeCode: true,
    usesFixturesOrMocks: false,
    networkDependency: 'none',
    ...overrides,
  };
}

function requirement(overrides = {}) {
  return {
    id: SCENARIO_ID,
    requiredEvidenceClasses: ['behavioral'],
    checkIds: ['runtime-check'],
    enforcedLanes: [LANE_ID],
    deterministicCi: true,
    requiresLiveProvider: false,
    requiresRealDevice: false,
    requiresMultiClient: false,
    requiresManualField: false,
    ...overrides,
  };
}

function policy(checks, scenarioRequirement = requirement()) {
  return {
    capabilities: [{
      id: CAPABILITY_ID,
      label: 'Navigate',
      highValueScenarios: [SCENARIO_ID],
      scenarioRequirements: [scenarioRequirement],
      evidenceBlockers: [],
    }],
    checks,
  };
}

function result(checkId = 'runtime-check', status = 'passed', overrides = {}) {
  return {
    checkId,
    status,
    durationMs: 5,
    ...overrides,
  };
}

function evaluate({
  checks = [check()],
  scripts = [scriptRecord()],
  scenarioRequirement = requirement(),
  selectedCheckIds = ['runtime-check'],
  results = [result()],
  phase = 'executed',
} = {}) {
  return buildVerificationCoverageMatrix({
    policy: policy(checks, scenarioRequirement),
    scripts,
    laneId: LANE_ID,
    selectedCheckIds,
    results,
    phase,
  });
}

function scenario(matrix) {
  return matrix.capabilities[0].scenarios[0];
}

{
  const planned = scenario(evaluate({ selectedCheckIds: [], results: undefined, phase: 'planned' }));
  assert.equal(planned.state, 'declared');
  assert.equal(planned.coverageSatisfied, false);
  assert.deepEqual(planned.executedChecks, []);
  assert.ok(planned.remainingEvidence.includes('execution_result_required'));
}

{
  const verified = scenario(evaluate());
  assert.equal(verified.state, 'behavioral_verified');
  assert.equal(verified.coverageSatisfied, true);
  assert.deepEqual(verified.coverageStates, ['declared', 'scheduled', 'executed', 'passed', 'behavioral_verified']);
  assert.deepEqual(verified.passingChecks, ['runtime-check']);
  assert.deepEqual(collectCoverageStrictFailures(evaluate()), []);
}

for (const testCase of [
  {
    name: 'source-only',
    check: check({ evidenceClass: 'source_contract' }),
    script: scriptRecord({ executionModel: 'source_contract', importsRuntimeCode: false }),
    reason: 'required_evidence_class_missing:behavioral',
  },
  {
    name: 'workflow-contract-only',
    check: check({ evidenceClass: 'workflow_contract', scriptIdentity: null, workflow: '.github/workflows/check.yml' }),
    script: null,
    reason: 'required_evidence_class_missing:behavioral',
  },
  {
    name: 'wildcard-only',
    check: check({ capabilityWildcard: true }),
    script: scriptRecord(),
    reason: 'wildcard_only_registration',
  },
  {
    name: 'evidence-document',
    check: check({ evidenceClass: 'evidence_only' }),
    script: scriptRecord({ executionModel: 'evidence_only', importsRuntimeCode: false }),
    reason: 'required_evidence_class_missing:behavioral',
  },
]) {
  const matrix = evaluate({
    checks: [testCase.check],
    scripts: testCase.script ? [testCase.script] : [],
  });
  const coverage = scenario(matrix);
  assert.equal(coverage.coverageSatisfied, false, testCase.name);
  assert.ok(coverage.remainingEvidence.includes(testCase.reason), testCase.name);
  assert.ok(collectCoverageStrictFailures(matrix).length > 0, testCase.name);
}

{
  const matrix = evaluate({
    checks: [check({ executionEnvironment: 'mock_only' })],
    scripts: [scriptRecord({ usesFixturesOrMocks: true })],
    scenarioRequirement: requirement({ requiresLiveProvider: true }),
  });
  assert.ok(scenario(matrix).remainingEvidence.includes('live_provider_evidence_required'));
  assert.ok(collectCoverageStrictFailures(matrix).some((entry) => entry.code === 'mock_only_live_requirement'));
}

{
  const matrix = evaluate({
    checks: [check({ executionEnvironment: 'uncontrolled_network' })],
    scripts: [scriptRecord({ networkDependency: 'real_or_uncontrolled' })],
  });
  assert.ok(scenario(matrix).remainingEvidence.includes('deterministic_execution_required'));
  assert.ok(collectCoverageStrictFailures(matrix).some((entry) => entry.code === 'uncontrolled_network'));
}

{
  const matrix = evaluate({ results: [] });
  assert.equal(scenario(matrix).state, 'mismatch');
  assert.ok(scenario(matrix).remainingEvidence.includes('selected_check_result_missing:runtime-check'));
  assert.ok(collectCoverageStrictFailures(matrix).some((entry) => entry.code === 'missing_execution_result'));
}

{
  const matrix = evaluate({ results: [result('runtime-check', 'failed')] });
  assert.equal(scenario(matrix).state, 'executed');
  assert.equal(scenario(matrix).coverageSatisfied, false);
  assert.ok(collectCoverageStrictFailures(matrix).some((entry) => entry.code === 'required_check_failed'));
}

{
  const matrix = evaluate({ checks: [check({ evidenceQuality: 'provisional' })] });
  assert.equal(scenario(matrix).state, 'provisional');
  assert.ok(scenario(matrix).remainingEvidence.includes('authoritative_registration_required:runtime-check'));
  assert.ok(collectCoverageStrictFailures(matrix).some((entry) => entry.code === 'provisional_check'));
}

{
  const matrix = evaluate({ results: [{ checkId: 'runtime-check', status: 'made_up' }] });
  assert.equal(scenario(matrix).state, 'mismatch');
  assert.ok(collectCoverageStrictFailures(matrix).some((entry) => entry.code === 'malformed_execution_result'));
}

{
  const behavioral = check();
  const providerShadow = check({
    id: 'provider-shadow',
    scriptIdentity: 'root::test:provider-shadow',
    evidenceClass: 'provider_shadow',
    executionEnvironment: 'provider_shadow',
  });
  const mixedRequirement = requirement({
    requiredEvidenceClasses: ['behavioral', 'provider_shadow'],
    checkIds: ['runtime-check', 'provider-shadow'],
  });
  const partial = evaluate({
    checks: [behavioral, providerShadow],
    scripts: [
      scriptRecord(),
      scriptRecord({
        policyCheckId: 'provider-shadow',
        scriptIdentity: 'root::test:provider-shadow',
      }),
    ],
    scenarioRequirement: mixedRequirement,
    selectedCheckIds: ['runtime-check', 'provider-shadow'],
    results: [result(), result('provider-shadow', 'failed')],
  });
  assert.equal(scenario(partial).state, 'passed');
  assert.equal(scenario(partial).confidenceLevel, 'partial');
  assert.deepEqual(scenario(partial).verifiedEvidenceClasses, ['behavioral']);
  assert.ok(scenario(partial).remainingEvidence.includes('required_evidence_class_missing:provider_shadow'));

  const complete = evaluate({
    checks: [behavioral, providerShadow],
    scripts: [
      scriptRecord(),
      scriptRecord({
        policyCheckId: 'provider-shadow',
        scriptIdentity: 'root::test:provider-shadow',
      }),
    ],
    scenarioRequirement: mixedRequirement,
    selectedCheckIds: ['runtime-check', 'provider-shadow'],
    results: [result(), result('provider-shadow')],
  });
  assert.equal(scenario(complete).state, 'evidence_verified');
  assert.equal(scenario(complete).coverageSatisfied, true);
}

{
  const wildcardMatrix = evaluate({
    checks: [check({ capabilityWildcard: true })],
    scripts: [scriptRecord()],
    selectedCheckIds: [],
    results: [],
    phase: 'planned',
  });
  const strictFailures = collectCoverageStrictFailures(wildcardMatrix, { requireExecution: false });
  const inventoryFailures = collectVerificationInventoryStrictFailures({
    summary: { unresolvedVerificationCommandCount: 0 },
    policyReferenceErrors: [],
    coverageStrictFailures: strictFailures,
  });
  assert.ok(inventoryFailures.some((entry) => entry.code === 'wildcard_only_registration'));
}

console.log('Verification conservative coverage model checks passed.');
