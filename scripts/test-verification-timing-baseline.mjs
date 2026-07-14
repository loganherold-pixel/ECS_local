import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  VERIFICATION_TIMING_BASELINE_CONTRACT,
  buildVerificationTimingBaseline,
  buildVerificationTimingBaselineCandidate,
  createVerificationTimingRuntime,
  evaluateVerificationTimingResults,
  promoteVerificationTimingBaselineCandidate,
  resolveVerificationTimingBaseline,
  validateVerificationTimingBaseline,
} from './verification/verification-timing-baseline.mjs';
import { promoteTimingBaselineFromFile } from './verification/promote-verification-timing-baseline.mjs';
import { buildVerificationLaneArtifact } from './verification/verification-artifact-policy.mjs';
import {
  formatVerificationLaneSummary,
  runVerificationLane,
} from './verification/run-verification-lane.mjs';
import {
  resolveVerificationPolicy,
  validateVerificationPolicy,
} from './verification/verification-policy.mjs';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const RUNTIME = createVerificationTimingRuntime({
  environment: { GITHUB_ACTIONS: 'true' },
  platform: 'linux',
  arch: 'x64',
  nodeVersion: 'v22.14.0',
});
const OTHER_RUNTIME = createVerificationTimingRuntime({
  environment: {},
  platform: 'win32',
  arch: 'x64',
  nodeVersion: 'v22.14.0',
});
const THRESHOLDS = Object.freeze({
  minimumSamples: 3,
  minimumAbsoluteAllowanceMs: 20,
  relativeRegressionPct: 25,
  p95Multiplier: 1.1,
  improvementPct: 20,
});

function timingResult(overrides = {}) {
  return {
    checkId: 'root-build',
    packageScript: 'build',
    scriptIdentity: 'root::build',
    timingIdentity: 'root::build',
    workspace: 'root',
    packageName: 'ecs-timing-fixture',
    workingDirectory: '.',
    status: 'passed',
    durationMs: 150,
    timingThresholds: THRESHOLDS,
    ...overrides,
  };
}

function approvedBaseline(entries = [{
  checkId: 'root-build',
  timingIdentity: 'root::build',
  workspace: 'root',
  packageName: 'ecs-timing-fixture',
  script: 'build',
  workingDirectory: '.',
  runtime: RUNTIME,
  samplesMs: [100, 110, 120, 130, 140],
}]) {
  return buildVerificationTimingBaseline({
    baselineVersion: 'approved.1',
    source: 'approved_repository',
    generatedAt: NOW.toISOString(),
    parentBaselineVersion: null,
    maxSamplesPerCheck: 20,
    entries,
  });
}

function evaluate(results, options = {}) {
  const baseline = options.baseline ?? approvedBaseline();
  return evaluateVerificationTimingResults({
    results,
    baselineState: options.baselineState ?? { status: 'available', baseline },
    runtime: options.runtime ?? RUNTIME,
    defaultThresholds: THRESHOLDS,
    enforcement: options.enforcement ?? 'enforce',
    baselineRequired: options.baselineRequired ?? false,
  });
}

function writeJson(rootDir, relativePath, value) {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function fixturePolicy(rootDir) {
  const raw = validateVerificationPolicy({
    schemaVersion: 2,
    policyVersion: 'timing-fixture.1',
    globalPathPrefixes: [],
    timingPolicy: {
      schemaVersion: 1,
      baselinePath: 'config/verification-timing-baseline.json',
      maxSamplesPerCheck: 20,
      defaultThresholds: THRESHOLDS,
      enforceLanes: ['pr-fast', 'release-candidate'],
      requiredBaselineLanes: ['release-candidate'],
      candidateLanes: ['full-nightly'],
    },
    capabilities: [{
      id: 'build',
      label: 'Build',
      pathPrefixes: [],
      highValueScenarios: [],
      scenarioRequirements: [],
      evidenceBlockers: [],
    }],
    lanes: [
      { id: 'pr-fast', maxParallel: 1, timeoutMs: 1_000, budgetMs: 10_000 },
      { id: 'full-nightly', maxParallel: 1, timeoutMs: 1_000, budgetMs: 10_000 },
      { id: 'release-candidate', maxParallel: 1, timeoutMs: 1_000, budgetMs: 10_000 },
    ],
    checks: [{
      id: 'root-build',
      workspace: 'root',
      script: 'build',
      capabilities: ['build'],
      classifications: ['integration', 'performance'],
      scenarios: [],
      lanes: ['pr-fast', 'full-nightly', 'release-candidate'],
      confidence: 'behavioral',
      evidenceClass: 'behavioral',
      evidenceQuality: 'authoritative',
      executionEnvironment: 'deterministic_ci',
      timingThresholds: THRESHOLDS,
    }],
  });
  return resolveVerificationPolicy(raw, { rootDir });
}

async function withFixture(run) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-timing-baseline-'));
  try {
    writeJson(rootDir, 'package.json', {
      name: 'ecs-timing-fixture',
      scripts: { build: 'node build.mjs' },
    });
    fs.writeFileSync(path.join(rootDir, 'build.mjs'), 'process.exitCode = 0;\n', 'utf8');
    return await run(rootDir, fixturePolicy(rootDir));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

test('established check within robust allowance passes', () => {
  const baseline = approvedBaseline();
  assert.equal(baseline.resultContract, VERIFICATION_TIMING_BASELINE_CONTRACT);
  assert.deepEqual(validateVerificationTimingBaseline(baseline), baseline);
  const result = evaluate([timingResult({ durationMs: 150 })]);
  assert.equal(result.timingChecksPassed, true);
  assert.equal(result.comparisons[0].status, 'within_budget');
  assert.equal(result.comparisons[0].baselineMedianMs, 120);
  assert.equal(result.comparisons[0].baselineP95Ms, 140);
  assert.equal(result.comparisons[0].allowanceMs, 154);
  assert.equal(result.comparisons[0].deltaMs, 30);
});

test('check exceeding median and p95 allowance regresses', () => {
  const result = evaluate([timingResult({ durationMs: 180 })]);
  assert.equal(result.timingChecksPassed, false);
  assert.deepEqual(result.regressedCheckIds, ['root-build']);
  assert.equal(result.comparisons[0].status, 'regressed');
  assert.equal(result.comparisons[0].allowanceMs, 154);
});

test('new check remains explicitly provisional without failing its first run', () => {
  const result = evaluate([timingResult({
    checkId: 'new-check',
    packageScript: 'test:new-check',
    scriptIdentity: 'root::test:new-check',
    timingIdentity: 'root::test:new-check',
    durationMs: 9_000,
  })]);
  assert.equal(result.timingChecksPassed, true);
  assert.deepEqual(result.provisionalCheckIds, ['new-check']);
  assert.equal(result.comparisons[0].status, 'provisional');
  assert.equal(result.comparisons[0].reason, 'baseline_entry_missing');
});

test('renamed and package-conflicted checks cannot borrow another baseline', () => {
  const renamed = evaluate([timingResult({ checkId: 'renamed-build' })]);
  assert.equal(renamed.comparisons[0].status, 'provisional');
  assert.equal(renamed.comparisons[0].reason, 'baseline_identity_mismatch');

  const web = evaluate([timingResult({
    checkId: 'web-build',
    scriptIdentity: 'apps/web::build',
    timingIdentity: 'apps/web::build',
    workspace: 'apps/web',
    packageName: '@ecs/web',
    workingDirectory: 'apps/web',
  })]);
  assert.equal(web.comparisons[0].status, 'provisional');
  assert.equal(web.comparisons[0].reason, 'baseline_entry_missing');
});

test('missing baseline is provisional unless the lane policy requires infrastructure evidence', () => {
  const baselineState = { status: 'missing', baseline: null, safeCode: 'timing_baseline_missing' };
  const pr = evaluate([timingResult()], { baselineState });
  assert.equal(pr.timingChecksPassed, true);
  assert.equal(pr.infrastructurePassed, true);
  assert.equal(pr.comparisons[0].status, 'provisional');
  assert.equal(pr.comparisons[0].reason, 'baseline_missing');

  const release = evaluate([timingResult()], { baselineState, baselineRequired: true });
  assert.equal(release.timingChecksPassed, false);
  assert.equal(release.infrastructurePassed, false);
});

test('malformed repository baseline fails closed for release enforcement', async () => {
  await withFixture(async (rootDir, policy) => {
    writeJson(rootDir, 'config/verification-timing-baseline.json', { schemaVersion: 999 });
    const state = resolveVerificationTimingBaseline({
      rootDir,
      baselinePath: policy.timingPolicy.baselinePath,
    });
    assert.equal(state.status, 'malformed');
    const lane = await runVerificationLane({
      rootDir,
      policy,
      laneId: 'release-candidate',
      now: NOW,
      timingRuntime: RUNTIME,
      executor: async () => ({
        status: 'passed', exitCode: 0, signal: null, durationMs: 120, summary: 'Passed.',
      }),
    });
    assert.equal(lane.status, 'failed');
    assert.equal(lane.budgetStatus, 'within_budget');
    assert.equal(lane.timingBaselineStatus, 'malformed');
    assert.equal(lane.timingChecksPassed, false);
  });
});

test('incomparable runtime does not create a false regression', () => {
  const result = evaluate([timingResult({ durationMs: 50_000 })], { runtime: OTHER_RUNTIME });
  assert.equal(result.timingChecksPassed, true);
  assert.equal(result.comparisons[0].status, 'incomparable');
  assert.equal(result.comparisons[0].reason, 'runtime_incomparable');
});

test('an established check regression fails the lane even under the aggregate budget', async () => {
  await withFixture(async (rootDir, policy) => {
    const baseline = approvedBaseline();
    const lane = await runVerificationLane({
      rootDir,
      policy,
      laneId: 'pr-fast',
      now: NOW,
      timingBaseline: baseline,
      timingRuntime: RUNTIME,
      executor: async () => ({
        status: 'passed', exitCode: 0, signal: null, durationMs: 180, summary: 'Passed slowly.',
      }),
    });
    assert.equal(lane.budgetStatus, 'within_budget');
    assert.equal(lane.timingChecksPassed, false);
    assert.equal(lane.status, 'failed');
    assert.equal(lane.results[0].timing.status, 'regressed');

    const artifact = buildVerificationLaneArtifact(lane);
    assert.equal(artifact.lane.timingChecksPassed, false);
    assert.equal(artifact.lane.timingRegressedCheckCount, 1);
    assert.equal(artifact.checks[0].timing.status, 'regressed');
    assert.equal(artifact.checks[0].timing.allowanceMs, 154);

    const summary = formatVerificationLaneSummary(lane);
    assert.match(summary, /1 regressed, 0 provisional, 0 incomparable/);
    assert.match(summary, /\| root-build \| passed \| regressed \| 180 ms \| 154 ms \|/);
  });
});

test('substantial improvement is reported without mutating or automatically accepting the baseline', () => {
  const baseline = approvedBaseline();
  const serializedBefore = JSON.stringify(baseline);
  const evaluation = evaluate([timingResult({ durationMs: 80 })], { baseline });
  assert.equal(evaluation.comparisons[0].status, 'improved');
  assert.equal(JSON.stringify(baseline), serializedBefore);

  const candidate = buildVerificationTimingBaselineCandidate({
    approvedBaseline: baseline,
    laneResult: {
      status: 'passed',
      codeChecksPassed: true,
      timingChecksPassed: true,
      laneId: 'full-nightly',
      generatedAt: NOW.toISOString(),
      results: [{ ...timingResult({ durationMs: 80 }), timing: evaluation.comparisons[0] }],
    },
    runtime: RUNTIME,
    generatedAt: NOW,
  });
  assert.equal(candidate.source, 'scheduled_candidate');
  assert.equal(candidate.parentBaselineVersion, baseline.baselineVersion);
  assert.equal(candidate.entries[0].samplesMs.at(-1), 80);
  assert.equal(baseline.entries[0].samplesMs.includes(80), false);
  const promoted = promoteVerificationTimingBaselineCandidate(candidate, {
    baselineVersion: 'approved.2',
    generatedAt: NOW,
  });
  assert.equal(promoted.source, 'approved_repository');
  assert.equal(promoted.parentBaselineVersion, null);
  assert.equal(promoted.baselineVersion, 'approved.2');
  assert.equal(promoted.entries[0].samplesMs.at(-1), 80);

  assert.throws(() => buildVerificationTimingBaselineCandidate({
    approvedBaseline: baseline,
    laneResult: {
      status: 'failed',
      codeChecksPassed: false,
      timingChecksPassed: false,
      laneId: 'pr-fast',
      generatedAt: NOW.toISOString(),
      results: [timingResult({ durationMs: 999 })],
    },
    runtime: RUNTIME,
    generatedAt: NOW,
  }), /successful lane/i);
});

test('reviewed candidate promotion writes only the policy-approved baseline path', async () => {
  await withFixture(async (rootDir, policy) => {
    const baseline = approvedBaseline();
    const evaluation = evaluate([timingResult({ durationMs: 125 })], { baseline });
    const candidate = buildVerificationTimingBaselineCandidate({
      approvedBaseline: baseline,
      laneResult: {
        status: 'passed',
        codeChecksPassed: true,
        timingChecksPassed: true,
        laneId: 'full-nightly',
        generatedAt: NOW.toISOString(),
        results: [{ ...timingResult({ durationMs: 125 }), timing: evaluation.comparisons[0] }],
      },
      runtime: RUNTIME,
      generatedAt: NOW,
    });
    writeJson(rootDir, '.smoke/verification/timing-baseline-candidate.json', candidate);

    const result = promoteTimingBaselineFromFile({
      rootDir,
      policy,
      candidate: '.smoke/verification/timing-baseline-candidate.json',
      baselineVersion: 'approved.2',
      acceptedAt: NOW.toISOString(),
    });
    assert.equal(result.outputPath, path.join(rootDir, policy.timingPolicy.baselinePath));
    const persisted = validateVerificationTimingBaseline(JSON.parse(fs.readFileSync(result.outputPath, 'utf8')));
    assert.equal(persisted.source, 'approved_repository');
    assert.equal(persisted.baselineVersion, 'approved.2');
    assert.equal(persisted.entries[0].samplesMs.at(-1), 125);
  });
});
