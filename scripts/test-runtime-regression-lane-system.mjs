import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildRuntimeRegressionReport,
  normalizeChildPayload,
  normalizeScenarioResult,
} from './runtime-regression/result-contract.mjs';
import { buildDevicePlanReport } from './runtime-regression/generate-device-plan.mjs';
import {
  executeChildInWorker,
  runRuntimeRegressionLane,
} from './runtime-regression/run-runtime-regression-lane.mjs';
import { buildVerificationInventoryArtifact } from './verification/verification-artifact-policy.mjs';
import { buildVerificationInventory } from './verification/verification-inventory.mjs';

const FIXED_NOW = new Date('2026-07-15T18:00:00.000Z');

function passingScenario(overrides = {}) {
  return {
    scenario: 'dashboard_weather_live_ready',
    status: 'passed',
    durationMs: 12,
    sourceFixtureProvider: 'weather_broker_normalized_fixture',
    failureSafeCode: null,
    deviceEvidenceStillRequired: ['android_real_provider_refresh'],
    qualifiedTestIdentity: 'runtime-regression.fast.dashboard-weather-live-ready',
    ...overrides,
  };
}

{
  const normalized = normalizeScenarioResult(passingScenario());
  assert.equal(normalized.status, 'passed');
  assert.equal(normalized.durationMs, 12);
  assert.deepEqual(normalized.deviceEvidenceStillRequired, ['android_real_provider_refresh']);
}

{
  assert.throws(
    () => normalizeScenarioResult(passingScenario({ sourceFixtureProvider: 'lat=35.1&lng=-106.2' })),
    /sourceFixtureProvider/,
  );
  assert.throws(
    () => normalizeScenarioResult(passingScenario({ sourceFixtureProvider: '35.123 -106.456' })),
    /sourceFixtureProvider/,
  );
  assert.throws(
    () => normalizeScenarioResult(passingScenario({ sourceFixtureProvider: 'lat_35_lng_106' })),
    /sourceFixtureProvider/,
  );
  assert.throws(
    () => normalizeScenarioResult(passingScenario({ sourceFixtureProvider: 'n35_w106' })),
    /sourceFixtureProvider/,
  );
  assert.throws(
    () => normalizeScenarioResult(passingScenario({ sourceFixtureProvider: 'https:provider_secret_path' })),
    /sourceFixtureProvider/,
  );
  for (const unsafeIdentity of [
    'N35W106',
    '35N106W',
    'north35_west106',
    'x35_y106',
    'www.example.com',
    'example.com',
    'api.example.com_v1',
    'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
    'AKIAABCDEFGHIJKLMNOP',
    'xoxb-123456789012-credential',
    'supabase_eyJabcdefghijklmnopqrstuvwxyz',
    '0123456789abcdef0123456789abcdef',
    'glpat-abcdefghijklmnopqrstuvwxyz',
    'npm_abcdefghijklmnopqrstuvwxyz',
    '123e4567-e89b-12d3-a456-426614174000',
    'u4pruydqqvj',
    'dm65rd',
  ]) {
    assert.throws(
      () => normalizeScenarioResult(passingScenario({ sourceFixtureProvider: unsafeIdentity })),
      /sourceFixtureProvider/,
    );
  }
  assert.throws(
    () => normalizeScenarioResult(passingScenario({ failureSafeCode: 'unsafe code with details' })),
    /failureSafeCode/,
  );
  for (const unsafeFailureCode of [
    '0123456789abcdef0123456789abcdef',
    'npm_abcdefghijklmnopqrstuvwxyz',
    'token_abcdefghijklmnopqrstuvwxyz',
    'u4pruydqqvj',
    'dm65rd',
  ]) {
    assert.throws(
      () => normalizeScenarioResult(passingScenario({
        status: 'failed',
        failureSafeCode: unsafeFailureCode,
      })),
      /failureSafeCode/,
    );
  }
}

{
  assert.throws(
    () => buildRuntimeRegressionReport({
      lane: 'fast',
      generatedAt: FIXED_NOW,
      durationMs: 0,
      scenarios: [],
      childRuns: [],
    }),
    /at least one terminal scenario/,
  );
  const skipped = buildRuntimeRegressionReport({
    lane: 'fast',
    generatedAt: FIXED_NOW,
    durationMs: 1,
    scenarios: [passingScenario({
      status: 'skipped',
      failureSafeCode: 'scenario_skipped',
    })],
    childRuns: [],
  });
  assert.equal(skipped.status, 'failed');
}

{
  const records = normalizeChildPayload({ results: [passingScenario()] }, { childIdentity: 'fast-core' });
  assert.equal(records.length, 1);
  assert.equal(records[0].scenario, 'dashboard_weather_live_ready');
}

{
  const report = buildRuntimeRegressionReport({
    lane: 'fast',
    generatedAt: FIXED_NOW,
    durationMs: 20,
    scenarios: [passingScenario()],
    childRuns: [{ childIdentity: 'fast-core', status: 'passed', durationMs: 20, scenarioCount: 1 }],
  });
  assert.equal(report.status, 'passed');
  assert.deepEqual(report.summary, {
    total: 1,
    passed: 1,
    failed: 0,
    timedOut: 0,
    skipped: 0,
    blockedExternal: 0,
    deviceEvidenceRequired: 0,
    durationMs: 20,
  });
}

{
  const report = await runRuntimeRegressionLane({
    lane: 'integration',
    rootDir: process.cwd(),
    now: () => FIXED_NOW,
    executeChild: () => ({
      childIdentity: 'integration-dispatch-explore-controls',
      exitCode: 0,
      timedOut: false,
      durationMs: 33,
      payload: { scenarios: [passingScenario({
        scenario: 'dispatch_canonical_route_store_update',
        qualifiedTestIdentity: 'runtime-regression.integration.dispatch-canonical-route-store-update',
      })] },
    }),
  });
  assert.equal(report.status, 'passed');
  assert.equal(report.scenarios[0].scenario, 'dispatch_canonical_route_store_update');
}

{
  const fixturePath = path.join(
    os.tmpdir(),
    `ecs-runtime-worker-timeout-${process.pid}-${Date.now()}.mjs`,
  );
  fs.writeFileSync(fixturePath, 'export function runTimeoutFixture() { while (true) {} }\n', 'utf8');
  try {
    const startedAt = performance.now();
    const result = await executeChildInWorker({
      childIdentity: 'worker-timeout-fixture',
      script: fixturePath,
      exportName: 'runTimeoutFixture',
      timeoutMs: 75,
    }, { rootDir: process.cwd() }, startedAt);
    assert.equal(result.timedOut, true);
    assert.equal(result.failureSafeCode, 'runtime_child_timeout');
    assert.ok(performance.now() - startedAt < 2_000, 'A synchronously stuck worker must terminate promptly.');
  } finally {
    fs.rmSync(fixturePath, { force: true });
  }
}

{
  const report = await runRuntimeRegressionLane({
    lane: 'fast',
    rootDir: process.cwd(),
    now: () => FIXED_NOW,
    executeChild: () => ({
      childIdentity: 'fast-core',
      exitCode: null,
      timedOut: true,
      durationMs: 90_000,
      payload: null,
    }),
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.scenarios[0].status, 'timed_out');
  assert.equal(report.scenarios[0].failureSafeCode, 'runtime_child_timeout');
}

{
  const report = await runRuntimeRegressionLane({
    lane: 'integration',
    rootDir: process.cwd(),
    now: () => FIXED_NOW,
    executeChild: () => ({
      childIdentity: 'integration-dispatch-explore-controls',
      exitCode: 0,
      timedOut: false,
      durationMs: 4,
      payload: { scenarios: [{ scenario: 'raw coordinates are not permitted' }] },
    }),
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.scenarios[0].failureSafeCode, 'runtime_child_contract_invalid');
  assert.equal(report.childRuns[0].status, 'failed');
}

{
  const report = buildDevicePlanReport({ now: FIXED_NOW });
  assert.equal(report.lane, 'device-plan');
  assert.equal(report.status, 'device_evidence_required');
  assert.ok(report.scenarios.length >= 8);
  for (const scenario of report.scenarios) {
    assert.equal(scenario.status, 'device_evidence_required');
    assert.equal(scenario.durationMs, 0);
    assert.equal(scenario.failureSafeCode, 'device_evidence_required');
    assert.ok(scenario.deviceEvidenceStillRequired.length > 0);
    assert.match(scenario.qualifiedTestIdentity, /^runtime-regression\.device-plan\./);
  }
}

{
  const inventory = buildVerificationInventory({ rootDir: process.cwd(), now: FIXED_NOW });
  const artifact = buildVerificationInventoryArtifact(inventory);
  assert.equal(artifact.schemaVersion, 'ecs.verification-inventory-artifact.v3');
  const checks = new Map(
    artifact.scripts
      .filter(entry => entry.checkId?.startsWith('runtime-regression-'))
      .map(entry => [entry.checkId, entry]),
  );
  assert.equal(checks.get('runtime-regression-fast')?.executionModel, 'runtime_behavior');
  assert.equal(checks.get('runtime-regression-fast')?.qualifiedTestIdentities.length, 5);
  assert.equal(checks.get('runtime-regression-integration')?.executionModel, 'runtime_behavior');
  assert.equal(checks.get('runtime-regression-integration')?.qualifiedTestIdentities.length, 8);
  assert.equal(checks.get('runtime-regression-lane-system')?.executionModel, 'runtime_behavior');
  assert.deepEqual(
    checks.get('runtime-regression-lane-system')?.qualifiedTestIdentities,
    ['runtime-regression.lane-system.fail-closed-contract-and-worker-timeout'],
  );
}

console.log('Runtime regression lane system tests passed.');
