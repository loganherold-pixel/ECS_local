import fs from 'node:fs';
import path from 'node:path';

import {
  VERIFICATION_PROCESS_FAILURE_CLASSES,
  runVerificationProcess,
} from './verification-process-runner.mjs';

export const GENERATED_ARTIFACT_HYGIENE_RESULT_SCHEMA = 'ecs.generated-artifact-hygiene.v1';

const EXPECTED_IGNORED_PATHS = Object.freeze([
  'apps/web/.next/dev/trace',
  'apps/web/.next/cache',
]);

function failedResult(safeCode, summary, details = {}) {
  return {
    schemaVersion: GENERATED_ARTIFACT_HYGIENE_RESULT_SCHEMA,
    status: 'failed',
    safeCode,
    failureClass: details.failureClass
      ?? VERIFICATION_PROCESS_FAILURE_CLASSES.APPLICATION_BUILD_FAILURE,
    exitCode: details.exitCode ?? null,
    signal: details.signal ?? null,
    summary,
  };
}

function lines(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim().replaceAll('\\', '/'))
    .filter(Boolean);
}

export async function verifyGeneratedArtifactHygiene(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const execute = options.runProcess ?? runVerificationProcess;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const runGit = (commandId, args) => execute({
    command: 'git',
    args,
    cwd: rootDir,
    commandId,
  }, {
    timeoutMs,
    env: options.env ?? process.env,
    signal: options.signal,
  });

  const tracked = await runGit('generated-artifact.git-ls-files', [
    'ls-files',
    '--',
    'apps/web/.next',
  ]);
  if (tracked.status !== 'passed') {
    return failedResult(
      tracked.failureCode ?? 'generated_artifact_git_query_failed',
      'Generated artifact hygiene could not verify tracked Next.js output.',
      tracked,
    );
  }
  if (lines(tracked.stdout).length > 0) {
    return failedResult(
      'generated_artifact_tracked_next_output',
      'Next.js generated output under apps/web/.next must not be tracked.',
    );
  }

  let gitignore;
  try {
    gitignore = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code.toUpperCase() : '';
    const failureClass = ['EACCES', 'EPERM'].includes(code)
      ? VERIFICATION_PROCESS_FAILURE_CLASSES.PERMISSION_FAILURE
      : code === 'ENOENT'
        ? VERIFICATION_PROCESS_FAILURE_CLASSES.APPLICATION_BUILD_FAILURE
        : VERIFICATION_PROCESS_FAILURE_CLASSES.VERIFICATION_WRAPPER_FAILURE;
    return failedResult(
      'generated_artifact_gitignore_unreadable',
      'Generated artifact hygiene could not read the repository .gitignore.',
      { failureClass },
    );
  }
  if (!/(^|\r?\n)(apps\/web\/)?\.next\/(\r?\n|$)/.test(gitignore)) {
    return failedResult(
      'generated_artifact_next_ignore_missing',
      '.gitignore must exclude Next.js .next output.',
    );
  }

  const ignored = await runGit('generated-artifact.git-check-ignore', [
    'check-ignore',
    '--',
    ...EXPECTED_IGNORED_PATHS,
  ]);
  if (ignored.status !== 'passed') {
    return failedResult(
      ignored.failureCode ?? 'generated_artifact_ignore_query_failed',
      'Generated artifact hygiene could not verify ignored Next.js runtime paths.',
      ignored,
    );
  }
  const actualIgnored = new Set(lines(ignored.stdout));
  const missing = EXPECTED_IGNORED_PATHS.filter((entry) => !actualIgnored.has(entry));
  if (missing.length > 0) {
    return failedResult(
      'generated_artifact_runtime_ignore_missing',
      'One or more Next.js runtime artifact paths are not ignored.',
    );
  }

  return {
    schemaVersion: GENERATED_ARTIFACT_HYGIENE_RESULT_SCHEMA,
    status: 'passed',
    safeCode: 'generated_artifact_hygiene_passed',
    failureClass: null,
    exitCode: 0,
    signal: null,
    summary: 'Generated artifact hygiene checks passed.',
  };
}
