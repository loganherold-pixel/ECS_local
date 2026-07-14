import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadVerificationPolicy } from './verification-policy.mjs';
import {
  PGTAP_WORKFLOW_SAFE_CODES,
  computeSupabaseVerificationBinding,
  createPgtapWorkflowEvidence,
  parseExecutedPgtapSuites,
  validatePgtapWorkflowEvidence,
} from './pgtap-workflow-evidence.mjs';

const OUTPUT_CAPTURE_LIMIT = 2 * 1024 * 1024;
const CHECK_ID = 'supabase-pgtap-rls';

function parseArgs(argv) {
  const result = {
    commitSha: process.env.GITHUB_SHA ?? null,
    output: '.smoke/verification/pgtap-workflow-evidence.json',
    githubOutput: process.env.GITHUB_OUTPUT ?? null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--commit-sha') result.commitSha = argv[++index] ?? null;
    else if (argv[index] === '--output') result.output = argv[++index] ?? null;
    else if (argv[index] === '--github-output') result.githubOutput = argv[++index] ?? null;
  }
  return result;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const digest = crypto.createHash('sha256');
    let output = '';
    let overflow = false;
    let settled = false;
    let child;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const capture = (stream, chunk) => {
      const text = chunk.toString();
      digest.update(`${stream}\0`);
      digest.update(chunk);
      if (output.length < OUTPUT_CAPTURE_LIMIT) {
        const remaining = OUTPUT_CAPTURE_LIMIT - output.length;
        output += text.slice(0, remaining);
        if (text.length > remaining) overflow = true;
      } else {
        overflow = true;
      }
      (stream === 'stderr' ? process.stderr : process.stdout).write(chunk);
    };
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      finish({
        exitCode: null,
        signal: null,
        durationMs: Date.now() - started,
        output: '',
        overflow: false,
        artifactDigest: digest.update('spawn_failed').digest('hex'),
        spawnError: error,
      });
      return;
    }
    child.stdout?.on('data', (chunk) => capture('stdout', chunk));
    child.stderr?.on('data', (chunk) => capture('stderr', chunk));
    child.on('error', (error) => finish({
      exitCode: null,
      signal: null,
      durationMs: Date.now() - started,
      output,
      overflow,
      artifactDigest: digest.update('process_error').digest('hex'),
      spawnError: error,
    }));
    child.on('close', (exitCode, signal) => finish({
      exitCode,
      signal,
      durationMs: Date.now() - started,
      output,
      overflow,
      artifactDigest: digest.digest('hex'),
      spawnError: null,
    }));
  });
}

function assertionCount(output) {
  const match = String(output).match(/\bTests=(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function supabaseExecutable(rootDir) {
  const binaryName = process.platform === 'win32' ? 'supabase.exe' : 'supabase';
  const localBinary = path.join(rootDir, 'node_modules', 'supabase', 'bin', binaryName);
  return fs.existsSync(localBinary) ? localBinary : binaryName;
}

function writeResult(rootDir, relativePath, result, githubOutput) {
  const outputPath = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, outputPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('pgTAP evidence output must remain inside the repository root.');
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const serialized = `${JSON.stringify(result)}\n`;
  fs.writeFileSync(outputPath, serialized, 'utf8');
  if (githubOutput) fs.appendFileSync(githubOutput, `result=${JSON.stringify(result)}\n`, 'utf8');
}

export async function runPgtapRlsWorkflow(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const policy = options.policy ?? loadVerificationPolicy({ rootDir });
  const check = policy.checks.find((entry) => entry.id === CHECK_ID);
  if (!check?.workflowEvidence) throw new Error('The pgTAP workflow evidence policy is unavailable.');
  const binding = computeSupabaseVerificationBinding({ rootDir, ...check.workflowEvidence });
  const requiredSuiteIds = check.workflowEvidence.requiredSuiteIds;
  const executable = options.executable ?? supabaseExecutable(rootDir);
  const processRunner = options.processRunner ?? runProcess;
  const processResult = await processRunner(
    executable,
    ['test', 'db', '--local', ...requiredSuiteIds],
    { cwd: rootDir, env: options.env ?? process.env },
  );
  const executedSuiteIds = parseExecutedPgtapSuites(processResult.output, requiredSuiteIds);
  const missingSuite = executedSuiteIds.length !== requiredSuiteIds.length;
  const runnerFailed = Boolean(processResult.spawnError || processResult.signal
    || processResult.exitCode === null || processResult.exitCode === undefined || processResult.overflow);
  const passed = processResult.exitCode === 0 && !processResult.signal
    && !processResult.spawnError && !processResult.overflow && !missingSuite;
  const testFailed = !runnerFailed && processResult.exitCode !== 0;
  const safeCode = passed
    ? PGTAP_WORKFLOW_SAFE_CODES.PASSED
    : runnerFailed
      ? PGTAP_WORKFLOW_SAFE_CODES.JOB_FAILED
      : testFailed
        ? PGTAP_WORKFLOW_SAFE_CODES.TEST_FAILED
        : PGTAP_WORKFLOW_SAFE_CODES.REQUIRED_SUITE_MISSING;
  const result = createPgtapWorkflowEvidence({
    checkId: check.id,
    workflow: check.workflow,
    status: passed ? 'passed' : 'failed',
    safeCode,
    commitSha: options.commitSha,
    binding,
    testResult: passed ? 'passed' : runnerFailed ? 'not_executed' : 'failed',
    executedSuiteIds,
    durationMs: processResult.durationMs,
    executedAt: (options.now instanceof Date ? options.now : new Date()).toISOString(),
    artifactDigest: processResult.artifactDigest,
    diagnostics: {
      suiteCount: executedSuiteIds.length,
      assertionCount: assertionCount(processResult.output),
      exitCode: processResult.exitCode,
      failureStage: passed ? null : runnerFailed ? 'pgtap_runner' : 'pgtap_execution',
      mismatchFields: null,
    },
  });
  validatePgtapWorkflowEvidence(result, {
    expectedCheckId: check.id,
    expectedWorkflow: check.workflow,
    expectedCommitSha: options.commitSha,
    expectedBinding: binding,
    requiredSuiteIds,
  });
  writeResult(
    rootDir,
    options.output ?? '.smoke/verification/pgtap-workflow-evidence.json',
    result,
    options.githubOutput,
  );
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.commitSha) throw new Error('A commit SHA is required for pgTAP workflow evidence.');
  const result = await runPgtapRlsWorkflow({
    rootDir: process.cwd(),
    commitSha: args.commitSha,
    output: args.output,
    githubOutput: args.githubOutput,
  });
  process.exitCode = result.status === 'passed' ? 0 : 1;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(`pgTAP workflow execution failed with safe code pgtap_runner_exception.\n`);
    process.exitCode = 1;
  });
}
