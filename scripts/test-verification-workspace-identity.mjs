import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveVerificationPolicy,
  validateVerificationPolicy,
} from './verification/verification-policy.mjs';
import { buildVerificationInventory } from './verification/verification-inventory.mjs';
import {
  buildLanePlan,
  commandForCheck,
  runVerificationLane,
} from './verification/run-verification-lane.mjs';
import {
  buildVerificationLaneArtifact,
  buildVerificationTimingsArtifact,
} from './verification/verification-artifact-policy.mjs';

function writeJson(rootDir, relativePath, value) {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function policyInput(checks) {
  return {
    schemaVersion: 1,
    policyVersion: 'workspace-fixture-v1',
    globalPathPrefixes: [],
    capabilities: [{
      id: 'web',
      label: 'Web',
      pathPrefixes: ['apps/web/'],
      highValueScenarios: [],
      evidenceBlockers: [],
    }],
    lanes: [
      { id: 'pr-fast', maxParallel: 2, timeoutMs: 5_000, budgetMs: 10_000 },
      { id: 'full-nightly', maxParallel: 2, timeoutMs: 5_000, budgetMs: 10_000 },
    ],
    checks: checks.map((check) => ({
      capabilities: ['web'],
      classifications: ['integration'],
      scenarios: [],
      lanes: ['pr-fast', 'full-nightly'],
      confidence: 'behavioral',
      ...check,
    })),
  };
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-qualified-checks-'));
try {
  writeJson(tempRoot, 'package.json', {
    name: 'ecs-root-fixture',
    scripts: { build: 'node scripts/root-build.mjs' },
  });
  writeJson(tempRoot, 'apps/web/package.json', {
    name: '@ecs/web-fixture',
    scripts: { build: 'next build' },
  });

  const policy = resolveVerificationPolicy(validateVerificationPolicy(policyInput([
    { id: 'root-build', workspace: 'root', script: 'build' },
    { id: 'web-build', workspace: 'apps/web', script: 'build' },
  ])), { rootDir: tempRoot });
  const prPlan = buildLanePlan({ policy, laneId: 'pr-fast' });
  assert.deepEqual(prPlan.checks.map((check) => check.scriptIdentity), [
    'root::build',
    'apps/web::build',
  ]);
  assert.deepEqual(prPlan.checks.map((check) => check.workingDirectory), ['.', 'apps/web']);
  assert.deepEqual(prPlan.checks.map((check) => check.packageName), [
    'ecs-root-fixture',
    '@ecs/web-fixture',
  ]);
  assert.deepEqual(prPlan.skippedDuplicateCheckIds, []);
  assert.equal(commandForCheck(prPlan.checks[0], tempRoot).workingDirectory, tempRoot);
  assert.equal(
    commandForCheck(prPlan.checks[1], tempRoot).workingDirectory,
    path.join(tempRoot, 'apps/web'),
  );

  const inventory = buildVerificationInventory({
    rootDir: tempRoot,
    policy,
    now: new Date('2026-07-13T12:00:00.000Z'),
    durationSamples: {
      'root::build': [7],
      'apps/web::build': [19],
    },
  });
  const rootBuild = inventory.scripts.find((entry) => entry.scriptIdentity === 'root::build');
  const webBuild = inventory.scripts.find((entry) => entry.scriptIdentity === 'apps/web::build');
  assert.equal(rootBuild.workingDirectory, '.');
  assert.equal(webBuild.workingDirectory, 'apps/web');
  assert.equal(rootBuild.duration.medianMs, 7);
  assert.equal(webBuild.duration.medianMs, 19);
  assert.equal(rootBuild.policyCheckId, 'root-build');
  assert.equal(webBuild.policyCheckId, 'web-build');

  await assert.rejects(
    async () => resolveVerificationPolicy(validateVerificationPolicy(policyInput([
      { id: 'ambiguous-build', script: 'build' },
    ])), { rootDir: tempRoot }),
    (error) => {
      assert.match(error.message, /ambiguous/i);
      assert.match(error.message, /root::build/);
      assert.match(error.message, /apps\/web::build/);
      return true;
    },
  );

  const seen = [];
  const failedLane = await runVerificationLane({
    rootDir: tempRoot,
    policy,
    laneId: 'pr-fast',
    now: new Date('2026-07-13T12:00:00.000Z'),
    executor: async (check, context) => {
      seen.push({ identity: check.scriptIdentity, cwd: context.workingDirectory });
      if (check.scriptIdentity === 'apps/web::build') {
        return {
          status: 'failed',
          exitCode: 1,
          durationMs: 11,
          summary: 'Next TypeScript build failed.',
        };
      }
      return { status: 'passed', exitCode: 0, durationMs: 3, summary: 'Root build passed.' };
    },
  });
  assert.equal(failedLane.status, 'failed');
  assert.equal(failedLane.results.find((entry) => entry.scriptIdentity === 'root::build').status, 'passed');
  assert.equal(failedLane.results.find((entry) => entry.scriptIdentity === 'apps/web::build').status, 'failed');
  assert.deepEqual(seen, [
    { identity: 'root::build', cwd: tempRoot },
    { identity: 'apps/web::build', cwd: path.join(tempRoot, 'apps/web') },
  ]);

  const artifact = buildVerificationLaneArtifact(failedLane);
  assert.deepEqual(artifact.checks.map((entry) => entry.scriptIdentity), ['root::build', 'apps/web::build']);
  const timings = buildVerificationTimingsArtifact({
    ...failedLane,
    results: failedLane.results.map((entry) => ({ ...entry, status: 'passed' })),
  });
  assert.deepEqual(timings.samples.map((entry) => entry.scriptIdentity), ['apps/web::build', 'root::build']);

  console.log('Verification workspace identity checks passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
