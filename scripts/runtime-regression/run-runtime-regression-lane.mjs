import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import {
  RuntimeRegressionContractError,
  buildRuntimeRegressionReport,
  normalizeChildPayload,
  normalizeScenarioResult,
} from './result-contract.mjs';

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAX_CHILD_OUTPUT_BYTES = 1024 * 1024;

export const RUNTIME_REGRESSION_RUNNERS = Object.freeze({
  fast: Object.freeze([
    Object.freeze({
      childIdentity: 'fast-core-scenarios',
      script: 'scripts/runtime-regression/scenarios/fast-core-1-5.js',
      args: ['--json'],
      exportName: 'runFastCoreScenarios',
      timeoutMs: 90_000,
    }),
  ]),
  integration: Object.freeze([
    Object.freeze({
      childIdentity: 'integration-dispatch-explore-controls',
      script: 'scripts/runtime-regression/integration-dispatch-explore-controls.mjs',
      args: [],
      exportName: 'runDispatchExploreControlScenarios',
      timeoutMs: 120_000,
    }),
  ]),
});

function deterministicEnvironment() {
  return {
    ...process.env,
    CI: '1',
    TZ: 'UTC',
    EXPO_NO_TELEMETRY: '1',
    ECS_TEST_NETWORK: 'disabled',
    ECS_TEST_SEED: process.env.ECS_TEST_SEED ?? 'ecs-runtime-regression-v1',
    ECS_TEST_NOW: process.env.ECS_TEST_NOW ?? '2026-01-01T00:00:00.000Z',
  };
}

const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');

(async () => {
  try {
    const loaded = await import(pathToFileURL(workerData.scriptPath).href);
    const runnerFunction = loaded[workerData.exportName]
      ?? loaded.default?.[workerData.exportName];
    if (typeof runnerFunction !== 'function') {
      parentPort.postMessage({ kind: 'export_missing' });
      return;
    }
    const payload = await runnerFunction();
    parentPort.postMessage({ kind: 'result', payload });
  } catch {
    parentPort.postMessage({ kind: 'execution_failed' });
  }
})();
`;

export async function executeChildInWorker(runner, context, startedAt = performance.now()) {
  const scriptPath = path.resolve(context.rootDir, runner.script);
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      env: deterministicEnvironment(),
      workerData: { scriptPath, exportName: runner.exportName },
    });
    let settled = false;
    let timer = null;
    const finish = async (result, terminate = true) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      worker.removeAllListeners();
      if (terminate) {
        try {
          await worker.terminate();
        } catch {
          // The terminal result remains safe even if the worker already exited.
        }
      }
      resolve({
        childIdentity: runner.childIdentity,
        durationMs: Math.round(performance.now() - startedAt),
        payload: null,
        ...result,
      });
    };
    timer = setTimeout(() => {
      void finish({
        exitCode: null,
        timedOut: true,
        failureSafeCode: 'runtime_child_timeout',
      });
    }, runner.timeoutMs);
    worker.on('message', (message) => {
      if (message?.kind === 'result') {
        const payload = message.payload;
        void finish({
          exitCode: payload?.status === 'failed' || payload?.summary?.failed > 0 ? 1 : 0,
          timedOut: false,
          payload,
          failureSafeCode: null,
        });
      } else {
        void finish({
          exitCode: null,
          timedOut: false,
          failureSafeCode: message?.kind === 'export_missing'
            ? 'runtime_child_export_missing'
            : 'runtime_child_execution_failed',
        });
      }
    });
    worker.on('error', () => {
      void finish({
        exitCode: null,
        timedOut: false,
        failureSafeCode: 'runtime_child_execution_failed',
      });
    });
    worker.on('exit', (exitCode) => {
      if (!settled) {
        void finish({
          exitCode,
          timedOut: false,
          failureSafeCode: 'runtime_child_output_missing',
        }, false);
      }
    });
  });
}

async function defaultExecuteChild(runner, context) {
  const startedAt = performance.now();
  const scriptPath = path.resolve(context.rootDir, runner.script);
  if (!fs.existsSync(scriptPath)) {
    return {
      childIdentity: runner.childIdentity,
      exitCode: null,
      timedOut: false,
      durationMs: Math.round(performance.now() - startedAt),
      payload: null,
      failureSafeCode: 'runtime_child_missing',
    };
  }
  const result = spawnSync(process.execPath, [scriptPath, ...runner.args], {
    cwd: context.rootDir,
    env: deterministicEnvironment(),
    encoding: 'utf8',
    windowsHide: true,
    timeout: runner.timeoutMs,
    maxBuffer: MAX_CHILD_OUTPUT_BYTES,
  });
  if (['EPERM', 'EACCES'].includes(result.error?.code)) {
    return executeChildInWorker(runner, context, startedAt);
  }
  const timedOut = result.error?.code === 'ETIMEDOUT';
  let payload = null;
  let failureSafeCode = null;
  if (!timedOut && typeof result.stdout === 'string' && result.stdout.trim()) {
    try {
      payload = JSON.parse(result.stdout.trim());
    } catch {
      failureSafeCode = 'runtime_child_output_invalid';
    }
  } else if (!timedOut) {
    failureSafeCode = 'runtime_child_output_missing';
  }
  if (timedOut) failureSafeCode = 'runtime_child_timeout';
  else if (result.error && !failureSafeCode) failureSafeCode = 'runtime_child_execution_failed';
  else if (result.status !== 0 && !failureSafeCode) failureSafeCode = 'runtime_child_failed';
  return {
    childIdentity: runner.childIdentity,
    exitCode: result.status,
    timedOut,
    durationMs: Math.round(performance.now() - startedAt),
    payload,
    failureSafeCode,
  };
}

function childFailureScenario(childResult, fallbackCode) {
  const status = childResult.timedOut ? 'timed_out' : 'failed';
  return normalizeScenarioResult({
    scenario: `${childResult.childIdentity}-runner`,
    status,
    durationMs: Math.max(0, Math.round(childResult.durationMs ?? 0)),
    sourceFixtureProvider: 'runtime_lane_orchestrator',
    failureSafeCode: childResult.failureSafeCode
      ?? (childResult.timedOut ? 'runtime_child_timeout' : fallbackCode),
    deviceEvidenceStillRequired: [],
    qualifiedTestIdentity: `runtime-regression.${childResult.childIdentity}.runner`,
  });
}

export async function runRuntimeRegressionLane(options = {}) {
  const lane = String(options.lane ?? '').replace(/^runtime-regression:/, '');
  const runners = options.runners ?? RUNTIME_REGRESSION_RUNNERS[lane];
  if (!runners) throw new RuntimeRegressionContractError(`Unknown runtime regression lane ${lane}.`);
  assert.ok(runners.length > 0, 'A runtime regression lane must execute at least one child runner.');
  const rootDir = path.resolve(options.rootDir ?? SCRIPT_ROOT);
  const now = options.now ?? (() => new Date());
  const executeChild = options.executeChild ?? defaultExecuteChild;
  const generatedAt = now();
  const scenarios = [];
  const childRuns = [];
  let durationMs = 0;

  for (const runner of runners) {
    const child = await executeChild(runner, { rootDir, lane });
    durationMs += Math.max(0, Math.round(child.durationMs ?? 0));
    let normalized = [];
    let contractFailed = false;
    if (child.payload) {
      try {
        normalized = normalizeChildPayload(child.payload, { childIdentity: child.childIdentity });
      } catch {
        contractFailed = true;
        child.failureSafeCode = 'runtime_child_contract_invalid';
      }
    }
    if (normalized.length > 0) scenarios.push(...normalized);
    if (
      normalized.length === 0
      || contractFailed
      || (child.exitCode !== 0 && !normalized.some((entry) => ['failed', 'timed_out'].includes(entry.status)))
    ) {
      scenarios.push(childFailureScenario(child, 'runtime_child_failed'));
    }
    const childFailed = child.timedOut
      || contractFailed
      || child.exitCode !== 0
      || normalized.some((entry) => ['failed', 'timed_out'].includes(entry.status));
    childRuns.push({
      childIdentity: child.childIdentity,
      status: child.timedOut ? 'timed_out' : childFailed ? 'failed' : 'passed',
      durationMs: Math.max(0, Math.round(child.durationMs ?? 0)),
      scenarioCount: normalized.length,
    });
  }

  const report = buildRuntimeRegressionReport({ lane, generatedAt, durationMs, scenarios, childRuns });
  assert.equal(report.childRuns.length, runners.length, 'Every configured runtime child must report a terminal run.');
  return report;
}

export function formatRuntimeRegressionSummary(report) {
  const lines = [
    `# ECS runtime regression: ${report.lane}`,
    '',
    `Status: ${report.status}`,
    `Generated: ${report.generatedAt}`,
    `Duration: ${report.summary.durationMs} ms`,
    '',
    '| Scenario | Status | Duration | Fixture/provider | Safe code | Device evidence still required | Qualified test |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
  ];
  for (const entry of report.scenarios) {
    lines.push(`| ${entry.scenario} | ${entry.status} | ${entry.durationMs} ms | ${entry.sourceFixtureProvider} | ${entry.failureSafeCode ?? 'none'} | ${entry.deviceEvidenceStillRequired.join(', ') || 'none'} | ${entry.qualifiedTestIdentity} |`);
  }
  lines.push('', 'This report does not grant production, device, provider, GPS, Mapbox, or field approval.', '');
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { lane: null, output: null, summaryOutput: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--lane') args.lane = argv[++index] ?? null;
    else if (argv[index] === '--output') args.output = argv[++index] ?? null;
    else if (argv[index] === '--summary-output') args.summaryOutput = argv[++index] ?? null;
    else if (argv[index] === '--json') continue;
    else throw new RuntimeRegressionContractError(`Unknown runtime regression argument ${argv[index]}.`);
  }
  if (!args.lane) throw new RuntimeRegressionContractError('A runtime regression --lane is required.');
  const normalizedLane = String(args.lane).replace(/^runtime-regression:/, '');
  args.output ??= `.smoke/verification/runtime-regression-${normalizedLane}.json`;
  args.summaryOutput ??= `.smoke/verification/runtime-regression-${normalizedLane}.md`;
  return args;
}

function writeFile(rootDir, relativePath, content) {
  const outputPath = path.resolve(rootDir, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}

export async function runRuntimeRegressionLaneCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = await runRuntimeRegressionLane({ lane: args.lane, rootDir: SCRIPT_ROOT });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) writeFile(SCRIPT_ROOT, args.output, serialized);
  if (args.summaryOutput) writeFile(SCRIPT_ROOT, args.summaryOutput, formatRuntimeRegressionSummary(report));
  process.stdout.write(serialized);
  return report.status === 'passed' ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runRuntimeRegressionLaneCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const safeCode = error instanceof RuntimeRegressionContractError
        ? error.safeCode
        : 'runtime_lane_unhandled_error';
      process.stderr.write(`${safeCode}\n`);
      process.exitCode = 1;
    });
}
