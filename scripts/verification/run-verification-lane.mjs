import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import {
  EVIDENCE_RESULT_CONTRACT,
  VERIFICATION_EXIT_CODES,
  VERIFICATION_OUTCOMES,
  validateEvidenceCheckResult,
} from './evidence-result.mjs';
import {
  VERIFICATION_ARTIFACT_AUDIENCES,
  artifactIdentityFromPath,
  buildVerificationLaneArtifact,
  buildVerificationProvenanceArtifact,
  buildVerificationTimingsArtifact,
  commandIdentityFromLegacyText,
  sanitizeVerificationArtifactText,
  serializeVerificationArtifact,
} from './verification-artifact-policy.mjs';
import {
  computeSupabaseVerificationBinding,
  validatePgtapWorkflowEvidence,
} from './pgtap-workflow-evidence.mjs';
import {
  buildVerificationCoverageMatrix,
  collectCoverageStrictFailures,
} from './verification-coverage.mjs';
import { buildVerificationInventory } from './verification-inventory.mjs';
import { loadVerificationPolicy, resolveVerificationPolicy } from './verification-policy.mjs';
import {
  buildVerificationTimingBaselineCandidate,
  createVerificationTimingRuntime,
  evaluateVerificationTimingResults,
  resolveVerificationTimingBaseline,
  serializeVerificationTimingBaseline,
} from './verification-timing-baseline.mjs';
import { validateWorkflowArtifactPathInput } from './workflow-input-safety.mjs';

const OUTPUT_LIMIT = 16 * 1024;
const SUMMARY_LIMIT = 500;
const UNKNOWN_CHANGE = '__verification_unknown_change__';

function normalizePath(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function startsWithPrefix(filePath, prefix) {
  const normalizedFile = normalizePath(filePath).toLowerCase();
  const normalizedPrefix = normalizePath(prefix).toLowerCase();
  return normalizedFile === normalizedPrefix || normalizedFile.startsWith(normalizedPrefix);
}

function dedupeChecks(checks) {
  const seen = new Set();
  const skippedDuplicateCheckIds = [];
  const result = [];
  for (const check of checks) {
    const identity = check.script
      ? `script:${check.scriptIdentity ?? `${check.workspace ?? 'unresolved'}::${check.script}`}`
      : check.command
        ? `command:${check.workspace ?? 'root'}:${check.command}`
        : `workflow:${check.workflow}`;
    if (seen.has(identity)) {
      skippedDuplicateCheckIds.push(check.id);
      continue;
    }
    seen.add(identity);
    result.push(check);
  }
  return { checks: result, skippedDuplicateCheckIds };
}

export function buildLanePlan(options) {
  const { policy, laneId } = options;
  const unresolvedChecks = policy.checks.filter((check) => check.script && !check.scriptIdentity);
  if (unresolvedChecks.length > 0) {
    throw new Error(
      `ECS verification policy must resolve package scripts before planning; unresolved checks: ${unresolvedChecks.map((check) => check.id).join(', ')}.`,
    );
  }
  const lane = policy.lanes.find((entry) => entry.id === laneId);
  if (!lane) throw new Error(`Unknown ECS verification lane "${laneId}".`);

  let capabilities = policy.capabilities.map((entry) => entry.id).sort();
  let selectionReason = 'lane_policy';
  if (laneId === 'affected-domain') {
    const changedFiles = Array.from(new Set((options.changedFiles ?? []).map(normalizePath).filter(Boolean)));
    const failWide = changedFiles.length === 0
      || changedFiles.includes(UNKNOWN_CHANGE)
      || changedFiles.some((filePath) => policy.globalPathPrefixes.some((prefix) => startsWithPrefix(filePath, prefix)));
    if (!failWide) {
      const matched = new Set();
      let unknownPath = false;
      for (const filePath of changedFiles) {
        const matches = policy.capabilities.filter((capability) =>
          capability.pathPrefixes.some((prefix) => startsWithPrefix(filePath, prefix)));
        if (!matches.length) unknownPath = true;
        for (const capability of matches) matched.add(capability.id);
      }
      if (!unknownPath && matched.size > 0) {
        capabilities = Array.from(matched).sort();
        selectionReason = 'changed_path_match';
      } else {
        selectionReason = 'unknown_path_fail_wide';
      }
    } else {
      selectionReason = changedFiles.length === 0 ? 'no_change_list_fail_wide' : 'global_or_unknown_change_fail_wide';
    }
  }

  const capabilitySet = new Set(capabilities);
  const selected = policy.checks
    .filter((check) => check.lanes.includes(laneId))
    .filter((check) => check.capabilities.some((capabilityId) => capabilitySet.has(capabilityId)))
    .sort((left, right) => left.id.localeCompare(right.id));
  const deduped = dedupeChecks(selected);
  return {
    lane,
    laneId,
    capabilities,
    selectionReason,
    checks: deduped.checks,
    skippedDuplicateCheckIds: deduped.skippedDuplicateCheckIds,
  };
}

function redactSummary(value) {
  const redacted = sanitizeVerificationArtifactText(value, SUMMARY_LIMIT).replace(/\s+/g, ' ').trim();
  return redacted.length > SUMMARY_LIMIT ? `${redacted.slice(0, SUMMARY_LIMIT - 3)}...` : redacted;
}

function npmCliPath() {
  const configured = process.env.npm_execpath;
  if (configured && fs.existsSync(configured)) return configured;
  const candidate = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return fs.existsSync(candidate) ? candidate : null;
}

function packageScripts(rootDir, packagePath = 'package.json') {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir, packagePath), 'utf8')).scripts ?? {};
  } catch {
    return {};
  }
}

function directNodeInvocation(command, rootDir) {
  const match = command.match(/^node\s+(?:\.\/)?([^\s"']+\.(?:js|mjs|cjs))(?<args>.*)$/i);
  if (!match?.[1]) return null;
  const args = (match.groups?.args ?? '').trim().split(/\s+/).filter(Boolean);
  return { command: process.execPath, args: [path.resolve(rootDir, match[1]), ...args] };
}

export function commandForCheck(check, rootDir) {
  if (check.workflow) return null;
  const workingDirectory = path.resolve(rootDir, check.workingDirectory ?? '.');
  if (check.script) {
    const packagePath = check.packagePath;
    if (!packagePath || !check.scriptIdentity) {
      throw new Error(`Package script check "${check.id}" was not resolved to a qualified identity.`);
    }
    const scripts = packageScripts(rootDir, packagePath);
    const packageCommand = scripts[check.script];
    if (!packageCommand) throw new Error(`Package script "${check.scriptIdentity}" is not registered.`);
    if (check.script === 'lint' && check.workspace === 'root') {
      return {
        command: process.execPath,
        args: [path.join(rootDir, 'node_modules', 'expo', 'bin', 'cli'), 'lint'],
        workingDirectory,
      };
    }
    const tscMatch = String(packageCommand).match(/^tsc\s+(?<args>.*)$/i);
    if (tscMatch) {
      return {
        command: process.execPath,
        args: [
          path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'),
          ...(tscMatch.groups?.args ?? '').split(/\s+/).filter(Boolean),
        ],
        workingDirectory,
      };
    }
    const direct = directNodeInvocation(String(packageCommand), workingDirectory);
    if (direct) return { ...direct, workingDirectory };
    const npmCli = npmCliPath();
    if (npmCli) return { command: process.execPath, args: [npmCli, 'run', '--silent', check.script], workingDirectory };
    return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', '--silent', check.script], workingDirectory };
  }
  if (check.command) {
    const [command, ...args] = check.command.split(/\s+/);
    return { command, args, workingDirectory };
  }
  return null;
}

function canUseWorker(invocation) {
  return invocation.command === process.execPath
    && typeof invocation.args[0] === 'string'
    && fs.existsSync(invocation.args[0]);
}

async function executeInWorker(invocation, context) {
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let worker;
    const finish = (status, exitCode, summary, details = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status,
        exitCode,
        signal: details.signal ?? null,
        failureCode: details.failureCode ?? null,
        durationMs: Date.now() - started,
        summary: redactSummary(summary),
        stdout,
        stderr,
      });
    };
    const timer = setTimeout(() => {
      void worker?.terminate();
      finish('timeout', null, `Timed out after ${context.timeoutMs}ms.`, { failureCode: 'process_timeout' });
    }, context.timeoutMs);
    try {
      worker = new Worker(invocation.args[0], {
        argv: invocation.args.slice(1),
        env: context.env,
        stdout: true,
        stderr: true,
      });
    } catch (error) {
      finish('failed', null, error instanceof Error ? error.message : String(error), { failureCode: 'process_spawn_error' });
      return;
    }
    worker.stdout?.on('data', (chunk) => {
      if (stdout.length < OUTPUT_LIMIT) stdout += chunk.toString().slice(0, OUTPUT_LIMIT - stdout.length);
    });
    worker.stderr?.on('data', (chunk) => {
      if (stderr.length < OUTPUT_LIMIT) stderr += chunk.toString().slice(0, OUTPUT_LIMIT - stderr.length);
    });
    worker.on('error', (error) => finish(
      'failed',
      null,
      error instanceof Error ? error.message : String(error),
      { failureCode: 'process_worker_error' },
    ));
    worker.on('exit', (code) => finish(
      code === 0 ? 'passed' : 'failed',
      code,
      `${stdout}\n${stderr}`.trim() || `Worker exited with code ${code}.`,
      { failureCode: code === 0 ? null : 'process_exit_nonzero' },
    ));
  });
}

async function defaultExecutor(check, context) {
  const invocation = commandForCheck(check, context.rootDir);
  if (!invocation) {
    return {
      status: 'failed',
      exitCode: null,
      durationMs: 0,
      summary: `Workflow-only check ${check.workflow} cannot execute inside a command lane.`,
    };
  }
  if (canUseWorker(invocation)
    && invocation.workingDirectory === context.rootDir
    && (process.platform === 'win32' || process.env.ECS_VERIFICATION_USE_WORKERS === '1')) {
    return executeInWorker(invocation, context);
  }
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;
    const finish = (status, exitCode, summary, details = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status,
        exitCode,
        signal: details.signal ?? null,
        failureCode: details.failureCode ?? null,
        durationMs: Date.now() - started,
        summary: redactSummary(summary),
        stdout,
        stderr,
      });
    };
    const timer = setTimeout(() => {
      child?.kill();
      finish('timeout', null, `Timed out after ${context.timeoutMs}ms.`, { failureCode: 'process_timeout' });
    }, context.timeoutMs);
    try {
      child = spawn(invocation.command, invocation.args, {
        cwd: invocation.workingDirectory,
        env: context.env,
        windowsHide: true,
        shell: false,
      });
    } catch (error) {
      finish('failed', null, error instanceof Error ? error.message : String(error), { failureCode: 'process_spawn_error' });
      return;
    }
    child.stdout?.on('data', (chunk) => {
      if (stdout.length < OUTPUT_LIMIT) stdout += chunk.toString().slice(0, OUTPUT_LIMIT - stdout.length);
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < OUTPUT_LIMIT) stderr += chunk.toString().slice(0, OUTPUT_LIMIT - stderr.length);
    });
    child.on('error', (error) => finish(
      'failed',
      null,
      error instanceof Error ? error.message : String(error),
      { failureCode: 'process_spawn_error' },
    ));
    child.on('close', (code, signal) => finish(
      code === 0 ? 'passed' : 'failed',
      code,
      `${stdout}\n${stderr}`.trim() || `Exited with code ${code}.`,
      {
        signal,
        failureCode: signal ? 'process_signal' : code === 0 ? null : 'process_exit_nonzero',
      },
    ));
  });
}

async function runBounded(items, maxParallel, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const consumers = Array.from({ length: Math.min(maxParallel, Math.max(items.length, 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(consumers);
  return results;
}

function safeGit(rootDir, args) {
  try {
    const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8', windowsHide: true });
    if (result.status === 0) return result.stdout.trim();
  } catch {
    // Git metadata is optional provenance, never a reason to fabricate a value.
  }
  return null;
}

function gitHeadFallback(rootDir) {
  const gitDirectory = path.join(rootDir, '.git');
  try {
    const head = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return { commit: head || null, branch: null };
    const ref = head.slice(5).trim();
    let commit = null;
    try {
      commit = fs.readFileSync(path.join(gitDirectory, ...ref.split('/')), 'utf8').trim() || null;
    } catch {
      const packedRefs = readTextIfAvailable(path.join(gitDirectory, 'packed-refs'));
      const match = packedRefs.split(/\r?\n/).find((line) => line.endsWith(` ${ref}`));
      commit = match?.split(' ')[0] ?? null;
    }
    return { commit, branch: ref.replace(/^refs\/heads\//, '') || null };
  } catch {
    return { commit: null, branch: null };
  }
}

function readTextIfAvailable(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function safeProvenance(rootDir, provided = {}) {
  const fallback = gitHeadFallback(rootDir);
  const commit = typeof provided.commit === 'string'
    ? provided.commit
    : safeGit(rootDir, ['rev-parse', 'HEAD']) ?? fallback.commit;
  const branch = typeof provided.branch === 'string'
    ? provided.branch
    : safeGit(rootDir, ['branch', '--show-current']) ?? fallback.branch;
  const status = typeof provided.dirty === 'boolean' ? null : safeGit(rootDir, ['status', '--porcelain']);
  const dirty = typeof provided.dirty === 'boolean' ? provided.dirty : status === null ? null : status.length > 0;
  const lockPath = path.join(rootDir, 'package-lock.json');
  return {
    commit: commit || 'unavailable',
    branch: branch || 'unavailable',
    dirty,
    packageLockSha256: fs.existsSync(lockPath) ? sha256File(lockPath) : null,
    ci: {
      provider: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    },
  };
}

function deterministicEnvironment(now) {
  return {
    ...process.env,
    CI: '1',
    TZ: 'UTC',
    EXPO_NO_TELEMETRY: '1',
    ECS_TEST_NETWORK: 'disabled',
    ECS_TEST_SEED: process.env.ECS_TEST_SEED ?? 'ecs-verification-v1',
    ECS_TEST_NOW: now.toISOString(),
  };
}

function isEvidenceCheck(check) {
  return check.resultContract === EVIDENCE_RESULT_CONTRACT;
}

function failedClassification(failureCode, summary, evidenceResult = null) {
  return {
    status: VERIFICATION_OUTCOMES.FAILED,
    failureCode,
    summary: redactSummary(summary),
    evidenceResult,
    evidenceBlockers: [],
  };
}

function readEvidenceResult(resultFile, checkId) {
  if (!resultFile || !fs.existsSync(resultFile)) {
    return {
      ok: false,
      failureCode: 'evidence_result_missing',
      summary: 'Evidence process did not write the required result file.',
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  } catch {
    return {
      ok: false,
      failureCode: 'evidence_result_malformed_json',
      summary: 'Evidence result file is not valid JSON.',
    };
  }
  try {
    return {
      ok: true,
      value: validateEvidenceCheckResult(parsed, { expectedCheckId: checkId }),
    };
  } catch (error) {
    return {
      ok: false,
      failureCode: 'evidence_result_schema_invalid',
      summary: error instanceof Error ? error.message : 'Evidence result schema validation failed.',
    };
  }
}

function classifyEvidenceCheck(check, processResult, evidenceResultFile) {
  if (processResult.status === 'timeout' || processResult.failureCode === 'process_timeout') {
    return failedClassification('process_timeout', processResult.summary || 'Evidence process timed out.');
  }
  if (processResult.signal) {
    return failedClassification('process_signal', `Evidence process terminated by signal ${processResult.signal}.`);
  }
  if (String(processResult.stderr ?? '').trim()) {
    return failedClassification('evidence_process_stderr', 'Evidence process wrote to stderr.');
  }

  const loaded = readEvidenceResult(evidenceResultFile, check.id);
  if (!loaded.ok) return failedClassification(loaded.failureCode, loaded.summary);
  const evidenceResult = loaded.value;

  if (evidenceResult.status === VERIFICATION_OUTCOMES.PASSED) {
    if (processResult.status !== 'passed' || processResult.exitCode !== VERIFICATION_EXIT_CODES.PASSED) {
      return failedClassification(
        'evidence_exit_mismatch',
        'Passed evidence result did not use the passed process exit code.',
        evidenceResult,
      );
    }
    return {
      status: VERIFICATION_OUTCOMES.PASSED,
      failureCode: null,
      summary: redactSummary(evidenceResult.summary),
      evidenceResult,
      evidenceBlockers: [],
    };
  }

  if (evidenceResult.status === VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL) {
    if (processResult.exitCode !== VERIFICATION_EXIT_CODES.BLOCKED_EXTERNAL) {
      return failedClassification(
        'evidence_exit_mismatch',
        'Blocked evidence result did not use the blocked_external process exit code.',
        evidenceResult,
      );
    }
    return {
      status: VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL,
      failureCode: null,
      summary: redactSummary(evidenceResult.summary),
      evidenceResult,
      evidenceBlockers: evidenceResult.blockerIds,
    };
  }

  return failedClassification(
    'evidence_reported_failed',
    evidenceResult.summary,
    evidenceResult,
  );
}

function classifyOrdinaryCheck(processResult) {
  if (processResult.status === 'passed'
    && processResult.exitCode === VERIFICATION_EXIT_CODES.PASSED
    && !processResult.signal) {
    return {
      status: VERIFICATION_OUTCOMES.PASSED,
      failureCode: null,
      summary: redactSummary(processResult.summary),
      evidenceResult: null,
      evidenceBlockers: [],
    };
  }
  return failedClassification(
    processResult.failureCode ?? (processResult.signal ? 'process_signal' : 'process_failed'),
    processResult.summary || 'Verification process failed.',
  );
}

function normalizeWorkflowCoverageResults(policy, values, context) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new Error('Workflow coverage results must be an array.');
  const seen = new Set();
  return values.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Workflow coverage result ${index} must be an object.`);
    }
    const check = policy.checks.find((entry) => entry.id === value.checkId);
    if (!check?.workflow || !check.workflowEvidence) {
      throw new Error(`Workflow coverage result ${index} references an unknown workflow check.`);
    }
    if (seen.has(check.id)) throw new Error(`Workflow coverage result duplicates check "${check.id}".`);
    seen.add(check.id);
    const expectedBinding = computeSupabaseVerificationBinding({
      rootDir: context.rootDir,
      ...check.workflowEvidence,
    });
    const validated = validatePgtapWorkflowEvidence(value, {
      expectedCheckId: check.id,
      expectedWorkflow: check.workflow,
      expectedCommitSha: context.provenance.commit,
      expectedBinding,
      requiredSuiteIds: check.workflowEvidence.requiredSuiteIds,
      now: context.now,
      maxAgeMs: check.workflowEvidence.maxAgeMs,
    });
    return {
      checkId: check.id,
      packageScript: null,
      scriptIdentity: null,
      timingIdentity: check.timingIdentity,
      workspace: 'root',
      packageName: null,
      workingDirectory: '.',
      timingThresholds: check.timingThresholds,
      classifications: check.classifications,
      capabilities: check.capabilities,
      scenarios: check.scenarios,
      evidenceClass: check.evidenceClass,
      evidenceQuality: check.evidenceQuality,
      executionEnvironment: check.executionEnvironment,
      resultContract: validated.resultContract,
      status: validated.status,
      safeCode: validated.safeCode,
      failureCode: validated.status === 'failed' ? validated.safeCode : null,
      exitCode: null,
      signal: null,
      durationMs: validated.durationMs,
      summary: validated.summary,
      evidenceBlockers: [],
      evidenceResult: validated,
      executionSource: 'workflow',
      workflow: check.workflow,
    };
  });
}

export async function runVerificationLane(options) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const suppliedPolicy = options.policy ?? loadVerificationPolicy({ rootDir });
  const policy = suppliedPolicy.resolvedRoot === rootDir
    ? suppliedPolicy
    : resolveVerificationPolicy(suppliedPolicy, { rootDir });
  const now = options.now instanceof Date ? options.now : new Date();
  const inventory = options.inventory ?? buildVerificationInventory({ rootDir, policy, now });
  const plan = buildLanePlan({
    policy,
    laneId: options.laneId,
    changedFiles: options.changedFiles,
  });
  const timingEnforcement = !policy.timingPolicy.enabled
    ? 'off'
    : policy.timingPolicy.enforceLanes.includes(plan.laneId)
      ? 'enforce'
      : 'report';
  const timingBaselineOptions = {
    rootDir,
    baselinePath: options.timingBaselinePath ?? policy.timingPolicy.baselinePath,
  };
  if (Object.hasOwn(options, 'timingBaseline')) {
    timingBaselineOptions.suppliedBaseline = options.timingBaseline;
  }
  const timingBaselineState = policy.timingPolicy.enabled
    ? resolveVerificationTimingBaseline(timingBaselineOptions)
    : { status: 'disabled', safeCode: 'timing_disabled', baseline: null };
  const timingRuntime = options.timingRuntime ?? createVerificationTimingRuntime();
  const executor = options.executor ?? defaultExecutor;
  const provenance = safeProvenance(rootDir, options.provenance);
  const workflowCoverageResults = normalizeWorkflowCoverageResults(policy, options.workflowCoverageResults, {
    rootDir,
    provenance,
    now,
  });
  const maxParallel = Math.max(1, Math.min(options.maxParallel ?? plan.lane.maxParallel, 16));
  const env = deterministicEnvironment(now);
  const started = Date.now();
  const evidenceRunDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-verification-evidence-'));
  let results;
  try {
    results = await runBounded(plan.checks, maxParallel, async (check, index) => {
      const evidenceResultFile = isEvidenceCheck(check)
        ? path.join(evidenceRunDirectory, `${String(index).padStart(3, '0')}-${check.id}.json`)
        : null;
      try {
        const checkEnvironment = {
          ...env,
          npm_lifecycle_event: check.script ?? env.npm_lifecycle_event,
        };
        delete checkEnvironment.ECS_VERIFICATION_CHECK_ID;
        delete checkEnvironment.ECS_VERIFICATION_RESULT_FILE;
        if (evidenceResultFile) {
          checkEnvironment.ECS_VERIFICATION_CHECK_ID = check.id;
          checkEnvironment.ECS_VERIFICATION_RESULT_FILE = evidenceResultFile;
        }
        const processResult = await executor(check, {
          rootDir,
          workingDirectory: path.resolve(rootDir, check.workingDirectory ?? '.'),
          env: checkEnvironment,
          timeoutMs: plan.lane.timeoutMs,
          evidenceResultFile,
        });
        const classification = evidenceResultFile
          ? classifyEvidenceCheck(check, processResult, evidenceResultFile)
          : classifyOrdinaryCheck(processResult);
        return {
          checkId: check.id,
          packageScript: check.script ?? null,
          scriptIdentity: check.scriptIdentity ?? null,
          timingIdentity: check.timingIdentity,
          workspace: check.workspace ?? 'root',
          packageName: check.packageName ?? null,
          workingDirectory: check.workingDirectory ?? '.',
          timingThresholds: check.timingThresholds,
          classifications: check.classifications,
          capabilities: check.capabilities,
          scenarios: check.scenarios,
          evidenceClass: check.evidenceClass,
          evidenceQuality: check.evidenceQuality,
          executionEnvironment: check.executionEnvironment,
          resultContract: check.resultContract ?? null,
          status: classification.status,
          safeCode: classification.evidenceResult?.safeCode ?? null,
          failureCode: classification.failureCode,
          exitCode: processResult.exitCode ?? null,
          signal: processResult.signal ?? null,
          durationMs: Number.isFinite(processResult.durationMs) ? processResult.durationMs : 0,
          summary: classification.summary,
          evidenceBlockers: classification.evidenceBlockers,
          evidenceResult: classification.evidenceResult,
        };
      } catch (error) {
        return {
          checkId: check.id,
          packageScript: check.script ?? null,
          scriptIdentity: check.scriptIdentity ?? null,
          timingIdentity: check.timingIdentity,
          workspace: check.workspace ?? 'root',
          packageName: check.packageName ?? null,
          workingDirectory: check.workingDirectory ?? '.',
          timingThresholds: check.timingThresholds,
          classifications: check.classifications,
          capabilities: check.capabilities,
          scenarios: check.scenarios,
          evidenceClass: check.evidenceClass,
          evidenceQuality: check.evidenceQuality,
          executionEnvironment: check.executionEnvironment,
          resultContract: check.resultContract ?? null,
          status: VERIFICATION_OUTCOMES.FAILED,
          safeCode: null,
          failureCode: 'runner_exception',
          exitCode: null,
          signal: null,
          durationMs: 0,
          summary: redactSummary(error instanceof Error ? error.message : String(error)),
          evidenceBlockers: [],
          evidenceResult: null,
        };
      }
    });
  } finally {
    fs.rmSync(evidenceRunDirectory, { recursive: true, force: true });
  }

  const rawResults = [...results, ...workflowCoverageResults];
  const timingEvaluation = evaluateVerificationTimingResults({
    results: rawResults,
    baselineState: timingBaselineState,
    runtime: timingRuntime,
    defaultThresholds: policy.timingPolicy.defaultThresholds,
    enforcement: timingEnforcement,
    baselineRequired: policy.timingPolicy.requiredBaselineLanes.includes(plan.laneId),
  });
  const timingByCheckId = new Map(timingEvaluation.comparisons.map((entry) => [entry.checkId, entry]));
  const allResults = rawResults.map((entry) => ({
    ...entry,
    timing: timingByCheckId.get(entry.checkId) ?? null,
  }));
  const functionalChecksPassed = allResults.length > 0 && allResults.every((entry) =>
    entry.status === VERIFICATION_OUTCOMES.PASSED
      || entry.status === VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL);
  const externalEvidenceBlockers = Array.from(new Set(allResults
    .filter((entry) => entry.status === VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL)
    .flatMap((entry) => entry.evidenceBlockers))).sort();
  const durationMs = Date.now() - started;
  const budgetStatus = durationMs <= plan.lane.budgetMs ? 'within_budget' : 'budget_exceeded';
  const selectedCheckIds = Array.from(new Set([
    ...plan.checks.map((entry) => entry.id),
    ...workflowCoverageResults.map((entry) => entry.checkId),
  ])).sort();
  const coverageMatrix = buildVerificationCoverageMatrix({
    policy,
    scripts: inventory.scripts,
    laneId: plan.laneId,
    selectedCheckIds,
    results: allResults,
    phase: 'executed',
  });
  const coverageStrictFailures = collectCoverageStrictFailures(coverageMatrix, { requireExecution: true });
  const coverageChecksPassed = plan.lane.coverageEnforcement !== 'strict'
    || coverageStrictFailures.length === 0;
  const codeChecksPassed = functionalChecksPassed
    && budgetStatus === 'within_budget'
    && coverageChecksPassed
    && timingEvaluation.timingGatePassed;
  const status = !codeChecksPassed
    ? VERIFICATION_OUTCOMES.FAILED
    : externalEvidenceBlockers.length
      ? VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL
      : VERIFICATION_OUTCOMES.PASSED;

  return {
    schemaVersion: 3,
    policyVersion: policy.policyVersion,
    laneId: plan.laneId,
    status,
    codeChecksPassed,
    productionApproval: 'not_granted_by_code_checks',
    productionApprovalStatus: 'pending',
    generatedAt: now.toISOString(),
    durationMs,
    laneBudgetMs: plan.lane.budgetMs,
    budgetStatus,
    timingEnforcement,
    timingChecksPassed: timingEvaluation.timingChecksPassed,
    timingGatePassed: timingEvaluation.timingGatePassed,
    timingInfrastructurePassed: timingEvaluation.infrastructurePassed,
    timingBaselineStatus: timingEvaluation.baselineStatus,
    timingBaselineSafeCode: timingEvaluation.baselineSafeCode,
    timingBaselineVersion: timingEvaluation.baselineVersion,
    timingBaselineSource: timingEvaluation.baselineSource,
    timingRuntime: timingEvaluation.runtime,
    timingRegressedCheckIds: timingEvaluation.regressedCheckIds,
    timingProvisionalCheckIds: timingEvaluation.provisionalCheckIds,
    timingIncomparableCheckIds: timingEvaluation.incomparableCheckIds,
    coverageEnforcement: plan.lane.coverageEnforcement,
    coverageChecksPassed,
    coverageMatrix,
    coverageStrictFailures,
    maxParallel,
    selectedCapabilities: plan.capabilities,
    selectionReason: plan.selectionReason,
    selectedCheckIds,
    skippedDuplicateCheckIds: plan.skippedDuplicateCheckIds,
    externalEvidenceBlockers,
    workflowCoverageResults,
    provenance,
    results: allResults,
  };
}

export function exitCodeForLaneResult(status, options = {}) {
  if (status === VERIFICATION_OUTCOMES.PASSED) return VERIFICATION_EXIT_CODES.PASSED;
  if (status === VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL) {
    return options.allowBlockedExternal
      ? VERIFICATION_EXIT_CODES.PASSED
      : VERIFICATION_EXIT_CODES.BLOCKED_EXTERNAL;
  }
  return VERIFICATION_EXIT_CODES.FAILED;
}

function markdownCell(value) {
  return redactSummary(value).replaceAll('|', '\\|');
}

export function formatVerificationLaneSummary(result) {
  const lines = [
    `## ECS Verification: ${result.laneId}`,
    '',
    `- Lane outcome: **${result.status}**`,
    `- Technical checks passed: **${result.codeChecksPassed ? 'yes' : 'no'}**`,
    `- Required executed coverage passed: **${result.coverageChecksPassed ? 'yes' : 'no'}** (${result.coverageEnforcement})`,
    `- Behavioral scenarios verified: **${result.coverageMatrix.summary.satisfiedScenarioCount}/${result.coverageMatrix.summary.scenarioCount}**`,
    `- Production approval: **${result.productionApprovalStatus}** (${result.productionApproval})`,
    `- Duration: ${result.durationMs} ms / ${result.laneBudgetMs} ms budget`,
    `- Timing baseline: **${result.timingBaselineStatus}** (${result.timingBaselineVersion ?? 'unversioned'}, ${result.timingEnforcement})`,
    `- Per-check timing: **${result.timingChecksPassed ? 'no regression' : 'attention required'}**; ${result.timingRegressedCheckIds.length} regressed, ${result.timingProvisionalCheckIds.length} provisional, ${result.timingIncomparableCheckIds.length} incomparable`,
  ];
  if (result.externalEvidenceBlockers.length > 0) {
    lines.push('', '### Unresolved External Evidence');
    for (const blockerId of result.externalEvidenceBlockers) lines.push(`- \`${blockerId}\``);
  }
  if (result.coverageStrictFailures.length > 0) {
    lines.push('', '### Coverage Gaps');
    for (const failure of result.coverageStrictFailures.slice(0, 50)) {
      lines.push(`- \`${failure.capabilityId ?? 'unknown'}/${failure.scenarioId ?? 'unknown'}\`: ${markdownCell(failure.reason)}`);
    }
  }
  lines.push(
    '',
    '### Checks',
    '',
    '| Check | Outcome | Timing | Duration | Allowance | Summary |',
    '| --- | --- | --- | ---: | ---: | --- |',
  );
  for (const check of result.results) {
    const allowance = Number.isFinite(check.timing?.allowanceMs) ? `${check.timing.allowanceMs} ms` : 'n/a';
    lines.push(`| ${markdownCell(check.checkId)} | ${check.status} | ${check.timing?.status ?? 'incomparable'} | ${check.durationMs} ms | ${allowance} | ${markdownCell(check.summary)} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function filesForArtifact(absolutePath) {
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [absolutePath];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(target);
    }
  };
  visit(absolutePath);
  return files.sort((left, right) => left.localeCompare(right));
}

export function buildArtifactProvenance(options) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const validatedPath = validateWorkflowArtifactPathInput(options.artifactPath, {
    rootDir,
    expectedType: options.expectedArtifactType ?? 'any',
  });
  const absolutePath = validatedPath.realPath;
  const relativePath = validatedPath.relativePath;
  const files = filesForArtifact(absolutePath);
  const digest = crypto.createHash('sha256');
  let sizeBytes = 0;
  for (const filePath of files) {
    const fileRelativePath = normalizePath(path.relative(absolutePath, filePath)) || path.basename(filePath);
    const content = fs.readFileSync(filePath);
    sizeBytes += content.length;
    digest.update(fileRelativePath);
    digest.update('\0');
    digest.update(content);
  }
  const environment = options.environment ?? process.env;
  const now = options.now instanceof Date ? options.now : new Date();
  return buildVerificationProvenanceArtifact({
    audience: options.audience ?? VERIFICATION_ARTIFACT_AUDIENCES.RELEASE_CANDIDATE,
    generatedAt: now.toISOString(),
    commandId: options.commandId ?? commandIdentityFromLegacyText(options.command),
    workspaceId: options.workspaceId ?? 'root',
    artifactId: options.artifactId ?? artifactIdentityFromPath(relativePath),
    artifactKind: options.artifactKind ?? (fs.statSync(absolutePath).isDirectory() ? 'directory' : 'file'),
    fileCount: files.length,
    sizeBytes,
    artifactDigest: digest.digest('hex'),
    ci: {
      provider: environment.GITHUB_ACTIONS === 'true' ? 'github-actions' : environment.EAS_BUILD_ID ? 'eas' : 'local',
      runId: environment.GITHUB_RUN_ID ?? environment.EAS_BUILD_ID ?? null,
      runAttempt: environment.GITHUB_RUN_ATTEMPT ?? null,
      sourceCommit: environment.GITHUB_SHA ?? null,
    },
  });
}

function changedFilesFromGit(rootDir, base, head) {
  if (!base) return [UNKNOWN_CHANGE];
  const range = head ? `${base}...${head}` : `${base}...HEAD`;
  const output = safeGit(rootDir, ['diff', '--name-only', range]);
  if (output === null) return [UNKNOWN_CHANGE];
  return output.split(/\r?\n/).map(normalizePath).filter(Boolean);
}

function parseArgs(argv) {
  const result = {
    laneId: null,
    output: null,
    summaryOutput: null,
    timingsOutput: null,
    timingBaselinePath: null,
    timingCandidateOutput: null,
    changedFiles: [],
    base: null,
    head: null,
    maxParallel: null,
    allowBlockedExternal: false,
    artifactAudience: null,
    workflowCoverageResultFiles: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--lane') result.laneId = argv[++index] ?? null;
    else if (arg === '--output') result.output = argv[++index] ?? null;
    else if (arg === '--summary-output') result.summaryOutput = argv[++index] ?? null;
    else if (arg === '--timings-output') result.timingsOutput = argv[++index] ?? null;
    else if (arg === '--timing-baseline') result.timingBaselinePath = argv[++index] ?? null;
    else if (arg === '--timing-candidate-output') result.timingCandidateOutput = argv[++index] ?? null;
    else if (arg === '--changed-files') result.changedFiles.push(...String(argv[++index] ?? '').split(',').filter(Boolean));
    else if (arg === '--changed-files-file') {
      const filePath = argv[++index];
      if (filePath) result.changedFiles.push(...fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean));
    } else if (arg === '--base') result.base = argv[++index] ?? null;
    else if (arg === '--head') result.head = argv[++index] ?? null;
    else if (arg === '--max-parallel') result.maxParallel = Number(argv[++index]);
    else if (arg === '--artifact-audience') result.artifactAudience = argv[++index] ?? null;
    else if (arg === '--workflow-coverage-result') {
      const filePath = argv[++index];
      if (filePath) result.workflowCoverageResultFiles.push(filePath);
    }
    else if (arg === '--allow-blocked-external') result.allowBlockedExternal = true;
  }
  return result;
}

function workflowCoverageResultsFromFiles(rootDir, relativePaths) {
  return relativePaths.flatMap((relativePath) => {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(rootDir, relativePath), 'utf8'));
    if (Array.isArray(parsed?.results)) return parsed.results;
    return [parsed];
  });
}

function updateTimingSamples(outputPath, laneResult, audience) {
  let current = {};
  try {
    current = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch {
    // A missing or invalid local timing cache starts clean; it never affects check outcomes.
  }
  const artifact = buildVerificationTimingsArtifact(laneResult, current, { audience });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serializeVerificationArtifact(artifact), 'utf8');
}

function artifactAudienceForLane(laneId) {
  if (laneId === 'release-candidate') return VERIFICATION_ARTIFACT_AUDIENCES.RELEASE_CANDIDATE;
  if (laneId === 'manual-hardware') return VERIFICATION_ARTIFACT_AUDIENCES.RESTRICTED_FIELD_TEST;
  if (['full-nightly', 'provider-scheduled'].includes(laneId)) {
    return VERIFICATION_ARTIFACT_AUDIENCES.SCHEDULED_CI;
  }
  return VERIFICATION_ARTIFACT_AUDIENCES.PULL_REQUEST;
}

export async function runVerificationLaneCli(argv = process.argv.slice(2)) {
  const rootDir = process.cwd();
  const args = parseArgs(argv);
  if (!args.laneId) throw new Error('Pass --lane <lane-id>.');
  const policy = loadVerificationPolicy({ rootDir });
  const changedFiles = args.laneId === 'affected-domain' && args.changedFiles.length === 0
    ? changedFilesFromGit(rootDir, args.base, args.head)
    : args.changedFiles;
  const result = await runVerificationLane({
    rootDir,
    policy,
    laneId: args.laneId,
    changedFiles,
    maxParallel: Number.isInteger(args.maxParallel) ? args.maxParallel : undefined,
    workflowCoverageResults: workflowCoverageResultsFromFiles(rootDir, args.workflowCoverageResultFiles),
    timingBaselinePath: args.timingBaselinePath ?? undefined,
  });
  const artifactAudience = args.artifactAudience ?? artifactAudienceForLane(args.laneId);
  const artifact = buildVerificationLaneArtifact(result, { audience: artifactAudience });
  const output = serializeVerificationArtifact(artifact);
  if (args.output) {
    const outputPath = path.resolve(rootDir, args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, 'utf8');
  }
  const summary = formatVerificationLaneSummary(result);
  if (args.summaryOutput) {
    const summaryPath = path.resolve(rootDir, args.summaryOutput);
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath, summary, 'utf8');
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
  }
  if (args.timingsOutput) {
    updateTimingSamples(path.resolve(rootDir, args.timingsOutput), result, artifactAudience);
  }
  if (args.timingCandidateOutput) {
    if (!policy.timingPolicy.candidateLanes.includes(args.laneId)) {
      throw new Error(`Lane "${args.laneId}" is not approved to produce a timing baseline candidate.`);
    }
    const baselineState = resolveVerificationTimingBaseline({
      rootDir,
      baselinePath: args.timingBaselinePath ?? policy.timingPolicy.baselinePath,
    });
    if (baselineState.status !== 'available') {
      throw new Error('An approved repository timing baseline is required to produce a candidate.');
    }
    const candidate = buildVerificationTimingBaselineCandidate({
      approvedBaseline: baselineState.baseline,
      laneResult: result,
      runtime: result.timingRuntime,
      generatedAt: new Date(result.generatedAt),
    });
    const candidatePath = path.resolve(rootDir, args.timingCandidateOutput);
    fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
    fs.writeFileSync(candidatePath, serializeVerificationTimingBaseline(candidate), 'utf8');
  }
  process.stdout.write(output);
  process.exitCode = exitCodeForLaneResult(result.status, {
    allowBlockedExternal: args.allowBlockedExternal,
  });
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runVerificationLaneCli().catch((error) => {
    process.stderr.write(`${redactSummary(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 1;
  });
}
