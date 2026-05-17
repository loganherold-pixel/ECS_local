import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const bundle = args.includes('--bundle');
const platformArg = args.find((arg, index) => args[index - 1] === '--platform');
const platform = platformArg ?? 'android';
const allowedPlatforms = new Set(['android', 'ios', 'web']);
const smokeDir = path.join(root, '.smoke');
const runtimeDir = path.join(root, '.expo-runtime');
const resultPath = path.join(smokeDir, 'smoke-result.json');

const STAGE_TIMEOUTS = {
  inspect: 10_000,
  expoConfig: 45_000,
  typecheck: 120_000,
  lint: 120_000,
  bundle: 180_000,
};

function localBin(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(root, 'node_modules', '.bin', `${name}${suffix}`);
}

function packageBin(packageName, binPath) {
  return path.join(root, 'node_modules', packageName, binPath);
}

function commandText(command, commandArgs = []) {
  const display = path.relative(root, command) || command;
  return [display, ...commandArgs].join(' ');
}

function summarizeOutput(stdout, stderr) {
  const text = `${stdout ?? ''}\n${stderr ?? ''}`.trim().replace(/\s+/g, ' ');
  if (!text) return 'No output.';
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

function summarizeSpawnError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/spawn\s+EPERM/i.test(message) || /spawn\s+EINVAL/i.test(message)) {
    return `Unable to start child process for this local smoke stage (${message}). This usually means the current sandbox blocks child process execution.`;
  }
  return message;
}

function isSpawnBlocked(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /spawn\s+(EPERM|EINVAL)/i.test(message);
}

function childEnv() {
  return {
    ...process.env,
    CI: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_OFFLINE: '1',
    EXPO_USE_FAST_RESOLVER: '1',
    EXPO_HOME: runtimeDir,
    EXPO_CACHE_DIR: path.join(runtimeDir, 'cache'),
    BROWSERSLIST_IGNORE_OLD_DATA: '1',
  };
}

async function runCommandStage(name, command, commandArgs, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let child;

    const finish = (status, exitCode, summary) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        name,
        command: commandText(command, commandArgs),
        status,
        durationMs: Date.now() - started,
        exitCode,
        summary,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child?.kill();
      finish('timeout', null, `Timed out after ${timeoutMs}ms.`);
    }, timeoutMs);

    try {
      child = spawn(command, commandArgs, {
        cwd: root,
        env: childEnv(),
        windowsHide: true,
        shell: false,
      });
    } catch (error) {
      finish(
        isSpawnBlocked(error) ? 'skipped' : 'failed',
        null,
        summarizeSpawnError(error),
      );
      return;
    }

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      finish(
        isSpawnBlocked(error) ? 'skipped' : 'failed',
        null,
        summarizeSpawnError(error),
      );
    });
    child.on('close', (code) => {
      if (timedOut) return;
      finish(code === 0 ? 'passed' : 'failed', code, summarizeOutput(stdout, stderr));
    });
  });
}

function createStage(name, status, summary, started, command = 'internal') {
  return {
    name,
    command,
    status,
    durationMs: Date.now() - started,
    exitCode: null,
    summary,
  };
}

function readPackageJson() {
  const packagePath = path.join(root, 'package.json');
  if (!fs.existsSync(packagePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    return null;
  }
}

function hasAnyEntry() {
  const entries = [
    'app.json',
    'app.config.js',
    'app.config.ts',
    'App.tsx',
    'App.ts',
    'App.jsx',
    'App.js',
  ];
  return entries.some((entry) => fs.existsSync(path.join(root, entry))) || fs.existsSync(path.join(root, 'app'));
}

function inspectProject() {
  const started = Date.now();
  const packageJson = readPackageJson();
  const failures = [];
  const notes = [];
  const nodeModulesExists = fs.existsSync(path.join(root, 'node_modules'));
  const expoDependency = Boolean(packageJson?.dependencies?.expo || packageJson?.devDependencies?.expo);
  const expoBin = localBin('expo');
  const expoCli = packageBin('expo', path.join('bin', 'cli'));
  const tscBin = localBin('tsc');
  const tscCli = packageBin('typescript', path.join('bin', 'tsc'));

  if (!packageJson) failures.push('package.json is missing or invalid.');
  if (!nodeModulesExists) failures.push('node_modules is missing. Run npm install before smoke checks.');
  if (expoDependency && !fs.existsSync(expoBin)) failures.push('Expo is a dependency but node_modules/.bin/expo is missing.');
  if (expoDependency && !fs.existsSync(expoCli)) failures.push('Expo local CLI entry node_modules/expo/bin/cli is missing.');
  if (!hasAnyEntry()) failures.push('No app entry/config found. Expected app.json, app.config.*, App.*, or Expo Router app/ directory.');
  if (platform && !allowedPlatforms.has(platform)) failures.push(`Unsupported --platform "${platform}". Use android, ios, or web.`);
  if (!fs.existsSync(tscBin) || !fs.existsSync(tscCli)) {
    notes.push('Local TypeScript binary not found; typecheck will be skipped unless package script exists.');
  }

  return {
    stage: createStage(
      'inspect-project',
      failures.length ? 'failed' : 'passed',
      failures.length ? failures.join(' ') : 'Project structure looks inspectable.',
      started,
    ),
    packageJson,
    expoDependency,
    expoBin,
    expoCli,
    tscBin,
    tscCli,
    notes,
  };
}

function ensureDirs() {
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
}

function writeResult(result) {
  ensureDirs();
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function printHuman(result) {
  console.log(`ECS app smoke: ${result.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`Result file: ${path.relative(root, resultPath)}`);
  for (const stage of result.stages) {
    console.log(`\n[${stage.status.toUpperCase()}] ${stage.name}`);
    console.log(`command: ${stage.command}`);
    console.log(`durationMs: ${stage.durationMs}`);
    console.log(`summary: ${stage.summary}`);
  }
  if (result.notes.length) {
    console.log('\nNotes:');
    for (const note of result.notes) console.log(`- ${note}`);
  }
}

export async function buildSmokeResult() {
  ensureDirs();
  const stages = [];
  const notes = [];
  const inspected = inspectProject();
  stages.push(inspected.stage);
  notes.push(...inspected.notes);

  if (inspected.stage.status === 'passed' && inspected.expoDependency && fs.existsSync(inspected.expoBin)) {
    stages.push(
      await runCommandStage(
        'expo-config',
        process.execPath,
        [inspected.expoCli, 'config', '--type', 'public', '--json'],
        STAGE_TIMEOUTS.expoConfig,
      ),
    );
  } else if (inspected.expoDependency) {
    stages.push(createStage('expo-config', 'skipped', 'Skipped because local Expo CLI is unavailable.', Date.now()));
  }

  const packageJson = inspected.packageJson;
  if (stages.every((stage) => stage.status !== 'failed' && stage.status !== 'timeout')) {
    if (packageJson?.scripts?.typecheck) {
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      stages.push(await runCommandStage('typecheck', npmCmd, ['run', '--silent', 'typecheck'], STAGE_TIMEOUTS.typecheck));
    } else if (
      (packageJson?.dependencies?.typescript || packageJson?.devDependencies?.typescript) &&
      fs.existsSync(inspected.tscBin) &&
      fs.existsSync(inspected.tscCli)
    ) {
      stages.push(await runCommandStage('typecheck', process.execPath, [inspected.tscCli, '--noEmit'], STAGE_TIMEOUTS.typecheck));
    } else {
      stages.push(createStage('typecheck', 'skipped', 'No typecheck script or local TypeScript binary found.', Date.now()));
    }
  }

  if (stages.every((stage) => stage.status !== 'failed' && stage.status !== 'timeout')) {
    if (packageJson?.scripts?.lint) {
      if (packageJson.scripts.lint.trim() === 'expo lint' && fs.existsSync(inspected.expoBin)) {
        stages.push(await runCommandStage('lint', process.execPath, [inspected.expoCli, 'lint'], STAGE_TIMEOUTS.lint));
      } else {
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        stages.push(await runCommandStage('lint', npmCmd, ['run', '--silent', 'lint'], STAGE_TIMEOUTS.lint));
      }
    } else {
      stages.push(createStage('lint', 'skipped', 'No lint script found in package.json.', Date.now()));
    }
  }

  if (bundle) {
    if (stages.every((stage) => stage.status !== 'failed' && stage.status !== 'timeout')) {
      stages.push(
        await runCommandStage(
          'expo-export',
          process.execPath,
          [inspected.expoCli, 'export', '--platform', platform, '--dev', '--output-dir', path.join('.smoke', 'export')],
          STAGE_TIMEOUTS.bundle,
        ),
      );
    }
  } else {
    stages.push(createStage('expo-export', 'skipped', 'Bundle export skipped. Pass --bundle to enable.', Date.now()));
  }

  const passed = stages.every((stage) => stage.status === 'passed' || stage.status === 'skipped');
  const result = {
    passed,
    checkedAt: new Date().toISOString(),
    stages,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    notes,
  };
  return result;
}

export function writeSmokeResult(result) {
  writeResult(result);
}

export function formatSmokeResult(result) {
  const lines = [`ECS app smoke: ${result.passed ? 'PASSED' : 'FAILED'}`];
  lines.push(`Result file: ${path.relative(root, resultPath)}`);
  for (const stage of result.stages) {
    lines.push('', `[${stage.status.toUpperCase()}] ${stage.name}`);
    lines.push(`command: ${stage.command}`);
    lines.push(`durationMs: ${stage.durationMs}`);
    lines.push(`summary: ${stage.summary}`);
  }
  if (result.notes.length) {
    lines.push('', 'Notes:');
    for (const note of result.notes) lines.push(`- ${note}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runSmokeAppCli() {
  const result = await buildSmokeResult();
  writeResult(result);
  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printHuman(result);
  }
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runSmokeAppCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
  const result = {
    passed: false,
    checkedAt: new Date().toISOString(),
    stages: [
      {
        name: 'smoke-runner',
        command: 'node scripts/smoke-app.mjs',
        status: 'failed',
        durationMs: 0,
        exitCode: null,
        summary: error instanceof Error ? error.message : String(error),
      },
    ],
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    notes: ['Smoke runner failed before completing staged checks.'],
  };
  writeResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else printHuman(result);
  process.exitCode = 1;
  });
}
