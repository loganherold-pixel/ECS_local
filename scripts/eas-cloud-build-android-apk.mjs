#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const easJsonPath = path.join(projectRoot, 'eas.json');
const RELEASE_PROVENANCE_PROFILES = new Set([
  'fieldtest',
  'route-discovery-qa',
  'production',
]);
const BUILD_LOGGER_LEVELS = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

function readOption(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

export function parseLauncherArgs(argv) {
  const options = {
    profile: process.env.ECS_BUILD_PROFILE || process.env.EAS_BUILD_PROFILE || 'fieldtest',
    platform: 'android',
    nonInteractive: false,
    noWait: false,
    clearCache: false,
    verboseLogs: false,
    buildLoggerLevel: null,
    message: null,
    allowDirty: false,
    printCommand: false,
    manifestOutput: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') {
      options.profile = readOption(argv, index, '--profile');
      index += 1;
    } else if (arg.startsWith('--profile=')) {
      options.profile = arg.slice('--profile='.length);
    } else if (arg === '--platform') {
      options.platform = readOption(argv, index, '--platform');
      index += 1;
    } else if (arg.startsWith('--platform=')) {
      options.platform = arg.slice('--platform='.length);
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    } else if (arg === '--no-wait') {
      options.noWait = true;
    } else if (arg === '--clear-cache') {
      options.clearCache = true;
    } else if (arg === '--verbose-logs') {
      options.verboseLogs = true;
    } else if (arg === '--build-logger-level') {
      options.buildLoggerLevel = readOption(argv, index, '--build-logger-level');
      index += 1;
    } else if (arg.startsWith('--build-logger-level=')) {
      options.buildLoggerLevel = arg.slice('--build-logger-level='.length);
    } else if (arg === '--message') {
      options.message = readOption(argv, index, '--message');
      index += 1;
    } else if (arg.startsWith('--message=')) {
      options.message = arg.slice('--message='.length);
    } else if (arg === '--allow-dirty') {
      options.allowDirty = true;
    } else if (arg === '--print-command') {
      options.printCommand = true;
    } else if (arg === '--manifest-output') {
      options.manifestOutput = readOption(argv, index, '--manifest-output');
      index += 1;
    } else if (arg.startsWith('--manifest-output=')) {
      options.manifestOutput = arg.slice('--manifest-output='.length);
    } else {
      throw new Error(`Unsupported launcher argument: ${arg}`);
    }
  }

  if (!options.profile) throw new Error('Build profile must not be empty.');
  if (!['android', 'ios', 'all'].includes(options.platform)) {
    throw new Error(`Unsupported platform: ${options.platform}`);
  }
  if (options.buildLoggerLevel && !BUILD_LOGGER_LEVELS.has(options.buildLoggerLevel)) {
    throw new Error(`Unsupported build logger level: ${options.buildLoggerLevel}`);
  }

  return options;
}

export function resolveEasCliVersion(configPath = easJsonPath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const version = config.cli?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('eas.json cli.version must be one exact EAS CLI version.');
  }
  return version;
}

export function resolveNpxCommand(platform = process.platform) {
  return platform === 'win32' ? 'npx.cmd' : 'npx';
}

export function buildEasCommand(options, easCliVersion, platform = process.platform) {
  const args = [
    '--yes',
    `eas-cli@${easCliVersion}`,
    'build',
    '--platform',
    options.platform,
    '--profile',
    options.profile,
  ];

  if (options.nonInteractive) args.push('--non-interactive');
  if (options.noWait) args.push('--no-wait');
  if (options.clearCache) args.push('--clear-cache');
  if (options.verboseLogs) args.push('--verbose-logs');
  if (options.buildLoggerLevel) {
    args.push('--build-logger-level', options.buildLoggerLevel);
  }
  if (options.message) args.push('--message', options.message);

  return {
    command: resolveNpxCommand(platform),
    args,
    spawnOptions: {
      cwd: projectRoot,
      shell: false,
      stdio: 'inherit',
    },
  };
}

function runText(command, args) {
  return execFileSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function validateReleaseProvenance(provenance, options) {
  const releaseEquivalent = RELEASE_PROVENANCE_PROFILES.has(options.profile);
  if (provenance.sourceState !== 'clean' && (releaseEquivalent || !options.allowDirty)) {
    throw new Error(
      `Refusing ${options.profile} build from ${provenance.sourceState} source. Commit or clean the worktree first.`,
    );
  }
  if (!releaseEquivalent) return;
  if (!provenance.branch) {
    throw new Error(`Refusing ${options.profile} build from a detached Git HEAD.`);
  }
  if (!provenance.remoteSha || provenance.localSha !== provenance.remoteSha) {
    throw new Error(`Refusing ${options.profile} build because local HEAD does not match the remote branch head.`);
  }
  if (!provenance.prHeadSha || provenance.localSha !== provenance.prHeadSha) {
    throw new Error(`Refusing ${options.profile} build because local HEAD does not match the pull request head.`);
  }
}

export function collectSourceProvenance(options, dependencies = {}) {
  const run = dependencies.runText || runText;
  const ghCommand = dependencies.ghCommand || process.env.ECS_GH_BIN || resolveGhCommand();
  const localSha = run('git', ['rev-parse', 'HEAD']);
  const branch = run('git', ['branch', '--show-current']);
  const sourceState = run('git', ['status', '--porcelain']).length > 0 ? 'dirty' : 'clean';
  const provenance = {
    localSha,
    branch,
    sourceState,
    remoteSha: null,
    prHeadSha: null,
  };

  if (RELEASE_PROVENANCE_PROFILES.has(options.profile)) {
    const remoteLine = run('git', [
      'ls-remote',
      '--heads',
      'origin',
      `refs/heads/${branch}`,
    ]);
    provenance.remoteSha = remoteLine.split(/\s+/)[0] || null;
    const prJson = run(ghCommand, [
      'pr',
      'view',
      branch,
      '--json',
      'headRefName,headRefOid',
    ]);
    const pr = JSON.parse(prJson);
    provenance.prHeadSha = pr.headRefName === branch ? pr.headRefOid : null;
  }

  validateReleaseProvenance(provenance, options);
  return provenance;
}

export function resolveGhCommand(platform = process.platform, environment = process.env) {
  if (platform !== 'win32') return 'gh';
  if (environment.ProgramFiles) {
    const installedGh = path.join(environment.ProgramFiles, 'GitHub CLI', 'gh.exe');
    if (fs.existsSync(installedGh)) return installedGh;
  }
  return 'gh.exe';
}

export function createInvocationManifest({
  provenance,
  options,
  easCliVersion,
  startTime,
  endTime = null,
  exitCode = null,
}) {
  return {
    schemaVersion: 1,
    gitSha: provenance.localSha,
    sourceState: provenance.sourceState,
    profile: options.profile,
    platform: options.platform,
    easCliVersion,
    startTime,
    endTime,
    exitCode,
  };
}

function defaultManifestPath(manifest) {
  const safeStart = manifest.startTime.replace(/[:.]/g, '-');
  const safeProfile = manifest.profile.replace(/[^0-9A-Za-z._-]/g, '_');
  return path.join(
    os.tmpdir(),
    'ecs-eas-build-invocations',
    `${safeStart}-${manifest.gitSha.slice(0, 12)}-${safeProfile}.json`,
  );
}

function writeInvocationManifest(manifestPath, manifest) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export function sanitizeCommandForDiagnostics(command, args) {
  const safeArgs = [...args];
  const messageIndex = safeArgs.indexOf('--message');
  if (messageIndex >= 0 && messageIndex + 1 < safeArgs.length) {
    safeArgs[messageIndex + 1] = '<redacted-build-message>';
  }
  return [command, ...safeArgs]
    .map((value) => (/\s/.test(value) ? JSON.stringify(value) : value))
    .join(' ');
}

function forwardSignals(child) {
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const handler = () => {
      if (!child.killed) child.kill(signal);
    };
    try {
      process.on(signal, handler);
      handlers.set(signal, handler);
    } catch {
      // The signal is not available on this platform.
    }
  }
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}

export async function runLauncher(argv = process.argv.slice(2)) {
  const options = parseLauncherArgs(argv);
  const easCliVersion = resolveEasCliVersion();
  const provenance = collectSourceProvenance(options);
  const startTime = new Date().toISOString();
  let manifest = createInvocationManifest({
    provenance,
    options,
    easCliVersion,
    startTime,
  });
  const manifestPath = options.manifestOutput
    ? path.resolve(options.manifestOutput)
    : defaultManifestPath(manifest);
  writeInvocationManifest(manifestPath, manifest);

  const invocation = buildEasCommand(options, easCliVersion);
  if (options.printCommand) {
    console.log(sanitizeCommandForDiagnostics(invocation.command, invocation.args));
    manifest = { ...manifest, endTime: new Date().toISOString(), exitCode: 0 };
    writeInvocationManifest(manifestPath, manifest);
    console.log(`EAS invocation manifest: ${manifestPath}`);
    return 0;
  }

  const env = {
    ...process.env,
    ECS_BUILD_PROFILE: options.profile,
    ECS_BUILD_COMMIT_SHA: provenance.localSha,
    ECS_BUILD_TIME: startTime,
    ECS_BUILD_DIRTY: provenance.sourceState,
  };

  return await new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      ...invocation.spawnOptions,
      env,
    });
    const removeSignalHandlers = forwardSignals(child);
    let finished = false;

    const finish = (exitCode) => {
      if (finished) return;
      finished = true;
      removeSignalHandlers();
      manifest = {
        ...manifest,
        endTime: new Date().toISOString(),
        exitCode,
      };
      writeInvocationManifest(manifestPath, manifest);
      console.log(`EAS invocation manifest: ${manifestPath}`);
      resolve(exitCode);
    };

    child.once('error', () => finish(1));
    child.once('exit', (code, signal) => {
      finish(code ?? (signal ? 1 : 1));
    });
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runLauncher()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'EAS build launcher failed.');
      process.exitCode = 1;
    });
}
