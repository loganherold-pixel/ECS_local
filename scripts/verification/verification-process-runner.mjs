import { spawn as nodeSpawn } from 'node:child_process';

import { sanitizeVerificationArtifactText } from './verification-artifact-policy.mjs';

export const VERIFICATION_PROCESS_FAILURE_CLASSES = Object.freeze({
  APPLICATION_BUILD_FAILURE: 'application_build_failure',
  VERIFICATION_WRAPPER_FAILURE: 'verification_wrapper_failure',
  ENVIRONMENT_PROCESS_SPAWN_RESTRICTION: 'environment_process_spawn_restriction',
  TIMEOUT: 'timeout',
  PERMISSION_FAILURE: 'permission_failure',
});

export const VERIFICATION_PROCESS_SAFE_CODES = Object.freeze({
  EXIT_NONZERO: 'process_exit_nonzero',
  SPAWN_RESTRICTED: 'process_spawn_restricted',
  PERMISSION_DENIED: 'process_permission_denied',
  EXECUTABLE_MISSING: 'process_executable_missing',
  SPAWN_ERROR: 'process_spawn_error',
  SIGNAL_TERMINATION: 'process_signal_termination',
  TIMEOUT: 'process_timeout',
  CANCELLED: 'process_cancelled',
  INVALID_INVOCATION: 'process_invocation_invalid',
});

const DEFAULT_OUTPUT_LIMIT = 16 * 1024;
const DEFAULT_SUMMARY_LIMIT = 500;

function boundedAppend(current, chunk, limit) {
  if (current.length >= limit) return current;
  return current + String(chunk).slice(0, limit - current.length);
}

function safeText(value, limit) {
  return sanitizeVerificationArtifactText(value, limit).trim();
}

function failureForSpawnError(error) {
  const code = typeof error?.code === 'string' ? error.code.toUpperCase() : '';
  const syscall = typeof error?.syscall === 'string' ? error.syscall.toLowerCase() : '';
  if (code === 'EPERM' && syscall.startsWith('spawn')) {
    return {
      failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.ENVIRONMENT_PROCESS_SPAWN_RESTRICTION,
      failureCode: VERIFICATION_PROCESS_SAFE_CODES.SPAWN_RESTRICTED,
      summary: 'The environment denied creation of the verification child process.',
    };
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return {
      failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.PERMISSION_FAILURE,
      failureCode: VERIFICATION_PROCESS_SAFE_CODES.PERMISSION_DENIED,
      summary: 'The verification process did not have permission to execute the requested operation.',
    };
  }
  if (code === 'ENOENT') {
    return {
      failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.VERIFICATION_WRAPPER_FAILURE,
      failureCode: VERIFICATION_PROCESS_SAFE_CODES.EXECUTABLE_MISSING,
      summary: 'The configured verification executable was not found.',
    };
  }
  return {
    failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.VERIFICATION_WRAPPER_FAILURE,
    failureCode: VERIFICATION_PROCESS_SAFE_CODES.SPAWN_ERROR,
    summary: 'The verification wrapper could not start the configured process.',
  };
}

function validateInvocation(invocation) {
  if (!invocation || typeof invocation !== 'object' || Array.isArray(invocation)) return false;
  if (typeof invocation.command !== 'string' || !invocation.command.trim()) return false;
  if (!Array.isArray(invocation.args) || invocation.args.some((value) => typeof value !== 'string')) return false;
  if (typeof invocation.cwd !== 'string' || !invocation.cwd.trim()) return false;
  if (typeof invocation.commandId !== 'string' || !invocation.commandId.trim()) return false;
  return true;
}

export function classifyVerificationSpawnError(error) {
  return Object.freeze(failureForSpawnError(error));
}

export async function runVerificationProcess(invocation, options = {}) {
  const startedAt = Date.now();
  const outputLimit = Number.isInteger(options.outputLimit) && options.outputLimit > 0
    ? options.outputLimit
    : DEFAULT_OUTPUT_LIMIT;
  const summaryLimit = Number.isInteger(options.summaryLimit) && options.summaryLimit > 0
    ? options.summaryLimit
    : DEFAULT_SUMMARY_LIMIT;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : 180_000;
  const spawnImpl = options.spawnImpl ?? nodeSpawn;

  if (!validateInvocation(invocation)) {
    return {
      status: 'failed',
      commandId: typeof invocation?.commandId === 'string' ? invocation.commandId : 'invalid_command',
      exitCode: null,
      signal: null,
      failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.VERIFICATION_WRAPPER_FAILURE,
      failureCode: VERIFICATION_PROCESS_SAFE_CODES.INVALID_INVOCATION,
      durationMs: Date.now() - startedAt,
      summary: 'The verification process invocation was invalid.',
      stdout: '',
      stderr: '',
    };
  }

  return new Promise((resolve) => {
    let child;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeout;

    const finish = ({
      status,
      exitCode = null,
      signal = null,
      failureClass = null,
      failureCode = null,
      summary = '',
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener?.('abort', onAbort);
      const safeStdout = safeText(stdout, outputLimit);
      const safeStderr = safeText(stderr, outputLimit);
      const diagnosticSummary = safeText(
        summary || [safeStdout, safeStderr].filter(Boolean).join('\n') || `${invocation.commandId} completed.`,
        summaryLimit,
      );
      resolve({
        status,
        commandId: invocation.commandId,
        exitCode,
        signal,
        failureClass,
        failureCode,
        durationMs: Date.now() - startedAt,
        summary: diagnosticSummary,
        stdout: safeStdout,
        stderr: safeStderr,
      });
    };

    const onAbort = () => {
      try {
        child?.kill();
      } catch {
        // Cancellation remains fail-closed even if the platform cannot signal the child.
      }
      finish({
        status: 'failed',
        failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.VERIFICATION_WRAPPER_FAILURE,
        failureCode: VERIFICATION_PROCESS_SAFE_CODES.CANCELLED,
        summary: 'The verification process was cancelled.',
      });
    };

    if (options.signal?.aborted) {
      onAbort();
      return;
    }

    try {
      child = spawnImpl(invocation.command, invocation.args, {
        cwd: invocation.cwd,
        env: options.env,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const failure = failureForSpawnError(error);
      finish({ status: 'failed', ...failure });
      return;
    }

    options.signal?.addEventListener?.('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk) => {
      stdout = boundedAppend(stdout, chunk, outputLimit);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = boundedAppend(stderr, chunk, outputLimit);
    });
    child.on('error', (error) => {
      const failure = failureForSpawnError(error);
      finish({ status: 'failed', ...failure });
    });
    child.on('close', (exitCode, signal) => {
      if (signal) {
        finish({
          status: 'failed',
          exitCode,
          signal,
          failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.VERIFICATION_WRAPPER_FAILURE,
          failureCode: VERIFICATION_PROCESS_SAFE_CODES.SIGNAL_TERMINATION,
          summary: `The verification process terminated by signal ${signal}.`,
        });
        return;
      }
      if (exitCode === 0) {
        finish({ status: 'passed', exitCode: 0 });
        return;
      }
      finish({
        status: 'failed',
        exitCode,
        failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.APPLICATION_BUILD_FAILURE,
        failureCode: VERIFICATION_PROCESS_SAFE_CODES.EXIT_NONZERO,
      });
    });

    timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Timeout remains authoritative even if process termination is unavailable.
      }
      finish({
        status: 'timeout',
        failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.TIMEOUT,
        failureCode: VERIFICATION_PROCESS_SAFE_CODES.TIMEOUT,
        summary: `The verification process timed out after ${timeoutMs}ms.`,
      });
    }, timeoutMs);
  });
}
