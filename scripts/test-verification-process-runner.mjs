import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import {
  GENERATED_ARTIFACT_HYGIENE_RESULT_SCHEMA,
  verifyGeneratedArtifactHygiene,
} from './verification/generated-artifact-hygiene.mjs';
import {
  VERIFICATION_PROCESS_FAILURE_CLASSES,
  VERIFICATION_PROCESS_SAFE_CODES,
  runVerificationProcess,
} from './verification/verification-process-runner.mjs';
import {
  buildLanePlan,
  commandForCheck,
} from './verification/run-verification-lane.mjs';
import { loadVerificationPolicy } from './verification/verification-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs verification process '));
const fixtureScript = path.join(fixtureRoot, 'child process fixture.mjs');

function fakeChild(onReady) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  queueMicrotask(() => onReady(child));
  return child;
}

function restrictionResult() {
  return {
    status: 'failed',
    commandId: 'generated-artifact.git-ls-files',
    exitCode: null,
    signal: null,
    failureClass: VERIFICATION_PROCESS_FAILURE_CLASSES.ENVIRONMENT_PROCESS_SPAWN_RESTRICTION,
    failureCode: VERIFICATION_PROCESS_SAFE_CODES.SPAWN_RESTRICTED,
    durationMs: 1,
    summary: 'The environment denied creation of the verification child process.',
    stdout: '',
    stderr: '',
  };
}

try {
  fs.writeFileSync(fixtureScript, `
const [mode, ...args] = process.argv.slice(2);
if (mode === 'exit') {
  process.stderr.write('expected build failure');
  process.exit(7);
}
if (mode === 'wait') {
  setTimeout(() => {}, 10_000);
} else if (mode === 'secret') {
  process.stderr.write('Bearer header.payload.signature-with-long-secret-value');
  process.exit(3);
} else {
  process.stdout.write(JSON.stringify(args));
}
`, 'utf8');

  const successful = await runVerificationProcess({
    command: process.execPath,
    args: [fixtureScript, 'echo', 'argument with spaces', '"quoted" value', 'semi;colon & pipe'],
    cwd: fixtureRoot,
    commandId: 'fixture.success',
  }, { timeoutMs: 5_000 });
  assert.equal(successful.status, 'passed');
  assert.equal(successful.exitCode, 0);
  assert.equal(successful.failureClass, null);
  assert.deepEqual(JSON.parse(successful.stdout), [
    'argument with spaces',
    '"quoted" value',
    'semi;colon & pipe',
  ]);

  const nonzero = await runVerificationProcess({
    command: process.execPath,
    args: [fixtureScript, 'exit'],
    cwd: fixtureRoot,
    commandId: 'fixture.nonzero',
  }, { timeoutMs: 5_000 });
  assert.equal(nonzero.status, 'failed');
  assert.equal(nonzero.exitCode, 7, 'The wrapper must preserve the actual child exit code.');
  assert.equal(nonzero.failureCode, VERIFICATION_PROCESS_SAFE_CODES.EXIT_NONZERO);
  assert.equal(nonzero.failureClass, VERIFICATION_PROCESS_FAILURE_CLASSES.APPLICATION_BUILD_FAILURE);

  const spawnRestricted = await runVerificationProcess({
    command: process.execPath,
    args: [fixtureScript, 'echo'],
    cwd: fixtureRoot,
    commandId: 'fixture.eperm',
  }, {
    timeoutMs: 5_000,
    spawnImpl() {
      throw Object.assign(new Error('spawn EPERM'), { code: 'EPERM', syscall: 'spawn node' });
    },
  });
  assert.equal(spawnRestricted.status, 'failed');
  assert.equal(
    spawnRestricted.failureClass,
    VERIFICATION_PROCESS_FAILURE_CLASSES.ENVIRONMENT_PROCESS_SPAWN_RESTRICTION,
  );
  assert.equal(spawnRestricted.failureCode, VERIFICATION_PROCESS_SAFE_CODES.SPAWN_RESTRICTED);

  const permissionDenied = await runVerificationProcess({
    command: process.execPath,
    args: [fixtureScript, 'echo'],
    cwd: fixtureRoot,
    commandId: 'fixture.eacces',
  }, {
    timeoutMs: 5_000,
    spawnImpl() {
      throw Object.assign(new Error('access denied'), { code: 'EACCES', syscall: 'open' });
    },
  });
  assert.equal(permissionDenied.failureClass, VERIFICATION_PROCESS_FAILURE_CLASSES.PERMISSION_FAILURE);
  assert.equal(permissionDenied.failureCode, VERIFICATION_PROCESS_SAFE_CODES.PERMISSION_DENIED);

  const invalidExecutable = await runVerificationProcess({
    command: path.join(fixtureRoot, 'missing executable.exe'),
    args: [],
    cwd: fixtureRoot,
    commandId: 'fixture.invalid-executable',
  }, { timeoutMs: 5_000 });
  assert.equal(invalidExecutable.status, 'failed');
  assert.equal(invalidExecutable.failureClass, VERIFICATION_PROCESS_FAILURE_CLASSES.VERIFICATION_WRAPPER_FAILURE);
  assert.equal(invalidExecutable.failureCode, VERIFICATION_PROCESS_SAFE_CODES.EXECUTABLE_MISSING);

  const timedOut = await runVerificationProcess({
    command: process.execPath,
    args: [fixtureScript, 'wait'],
    cwd: fixtureRoot,
    commandId: 'fixture.timeout',
  }, { timeoutMs: 50 });
  assert.equal(timedOut.status, 'timeout');
  assert.equal(timedOut.exitCode, null);
  assert.equal(timedOut.failureClass, VERIFICATION_PROCESS_FAILURE_CLASSES.TIMEOUT);
  assert.equal(timedOut.failureCode, VERIFICATION_PROCESS_SAFE_CODES.TIMEOUT);

  const controller = new AbortController();
  const cancelledPromise = runVerificationProcess({
    command: process.execPath,
    args: [fixtureScript, 'wait'],
    cwd: fixtureRoot,
    commandId: 'fixture.cancelled',
  }, { timeoutMs: 5_000, signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  const cancelled = await cancelledPromise;
  assert.equal(cancelled.status, 'failed');
  assert.equal(cancelled.failureClass, VERIFICATION_PROCESS_FAILURE_CLASSES.VERIFICATION_WRAPPER_FAILURE);
  assert.equal(cancelled.failureCode, VERIFICATION_PROCESS_SAFE_CODES.CANCELLED);

  const signalled = await runVerificationProcess({
    command: process.execPath,
    args: [fixtureScript, 'echo'],
    cwd: fixtureRoot,
    commandId: 'fixture.signal',
  }, {
    timeoutMs: 5_000,
    spawnImpl: () => fakeChild((child) => child.emit('close', null, 'SIGTERM')),
  });
  assert.equal(signalled.status, 'failed');
  assert.equal(signalled.exitCode, null);
  assert.equal(signalled.signal, 'SIGTERM');
  assert.equal(signalled.failureCode, VERIFICATION_PROCESS_SAFE_CODES.SIGNAL_TERMINATION);

  const redacted = await runVerificationProcess({
    command: process.execPath,
    args: [fixtureScript, 'secret'],
    cwd: fixtureRoot,
    commandId: 'fixture.redaction',
  }, { timeoutMs: 5_000 });
  assert.equal(redacted.status, 'failed');
  assert(!redacted.stderr.includes('header.payload.signature-with-long-secret-value'));

  const generatedRestriction = await verifyGeneratedArtifactHygiene({
    rootDir: root,
    runProcess: async () => restrictionResult(),
  });
  assert.equal(generatedRestriction.schemaVersion, GENERATED_ARTIFACT_HYGIENE_RESULT_SCHEMA);
  assert.equal(generatedRestriction.status, 'failed');
  assert.equal(
    generatedRestriction.failureClass,
    VERIFICATION_PROCESS_FAILURE_CLASSES.ENVIRONMENT_PROCESS_SPAWN_RESTRICTION,
    'Passing equivalent Git assertions manually cannot turn a failed wrapper execution into a pass.',
  );

  const policy = loadVerificationPolicy({ rootDir: root });
  const prPlan = buildLanePlan({ policy, laneId: 'pr-fast' });
  const webBuild = prPlan.checks.find((check) => check.id === 'web-build-typecheck');
  assert(webBuild, 'The PR lane must require the real apps/web build.');
  assert.equal(webBuild.scriptIdentity, 'apps/web::build');
  const webInvocation = commandForCheck(webBuild, root);
  assert.equal(webInvocation.command, process.execPath);
  assert.equal(webInvocation.workingDirectory, path.join(root, 'apps', 'web'));
  assert(webInvocation.args[0].replaceAll('\\', '/').endsWith('/next/dist/bin/next'));
  assert.deepEqual(webInvocation.args.slice(1), ['build']);

  for (const laneId of ['pr-fast', 'full-nightly', 'release-candidate']) {
    const plan = buildLanePlan({ policy, laneId });
    assert(plan.checks.some((check) => check.id === 'web-build-typecheck'));
    assert(plan.checks.some((check) => check.id === 'generated-artifact-hygiene'));
    assert(plan.checks.some((check) => check.id === 'verification-process-runner'));
  }

  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release-smoke-readiness.yml'), 'utf8');
  assert(workflow.includes('--lane pr-fast'));
  assert(workflow.includes('runs-on: ubuntu-latest'));
  assert(!workflow.includes('continue-on-error: true'));

  console.log('Verification process runner checks passed');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
