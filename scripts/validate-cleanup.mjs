#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const json = args.has('--json');
const runLint = args.has('--run-lint');
const help = args.has('--help') || args.has('-h');

const quarantineDirArg = process.argv.find((arg) => arg.startsWith('--quarantine-dir='));
const quarantineRoot = path.resolve(
  root,
  quarantineDirArg?.slice('--quarantine-dir='.length) ?? '../ECS_local-cleanup-quarantine',
);

const CRITICAL_PATHS = [
  '.env',
  '.env.example',
  'package.json',
  'package-lock.json',
  'app.json',
  'eas.json',
  'metro.config.js',
  'babel.config.js',
  'tsconfig.json',
  'app',
  'components',
  'lib',
  'src',
  'stores',
  'assets',
  'public',
  'supabase/functions',
  'supabase/migrations',
];

const ROUTE_SMOKE_PATHS = [
  'app/index.tsx',
  'app/login.tsx',
  'app/(tabs)/dashboard.tsx',
  'app/(tabs)/navigate.tsx',
  'app/(tabs)/fleet.tsx',
  'app/(tabs)/expeditions.tsx',
  'app/expedition-command.tsx',
];

const RUNTIME_STORAGE_PATHS = [
  'uploads',
  'public/uploads',
  'storage',
  'media',
  'backups',
  'exports',
  'artifacts',
  '.smoke',
  'android/app/build/outputs',
];

function usage() {
  return `ECS cleanup validation

Usage:
  node scripts/validate-cleanup.mjs
  node scripts/validate-cleanup.mjs --run-lint
  node scripts/validate-cleanup.mjs --json
  node scripts/validate-cleanup.mjs --quarantine-dir=../ECS_local-cleanup-quarantine

This script is read-only by default. --run-lint runs the detected lint script only.
It does not run build, start, smoke, Docker, or cleanup commands because those may
write generated artifacts or start long-lived processes.`;
}

function run(command, commandArgs = []) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    error: result.error?.message ?? null,
  };
}

function readTextIfExists(absolute) {
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute, 'utf8').trim();
}

function gitDir() {
  const dotGit = path.join(root, '.git');
  if (!fs.existsSync(dotGit)) return null;
  const stat = fs.statSync(dotGit);
  if (stat.isDirectory()) return dotGit;
  const pointer = readTextIfExists(dotGit);
  if (!pointer?.startsWith('gitdir:')) return null;
  return path.resolve(root, pointer.slice('gitdir:'.length).trim());
}

function readGitRef(refName) {
  const dir = gitDir();
  if (!dir) return null;
  const direct = readTextIfExists(path.join(dir, refName.replace(/\//g, path.sep)));
  if (direct) return direct;
  const packedRefs = readTextIfExists(path.join(dir, 'packed-refs'));
  if (!packedRefs) return null;
  const line = packedRefs
    .split(/\r?\n/)
    .find((entry) => entry && !entry.startsWith('#') && entry.endsWith(` ${refName}`));
  return line?.split(' ')[0] ?? null;
}

function detectCurrentBranch() {
  const dir = gitDir();
  if (!dir) return 'unknown';
  const head = readTextIfExists(path.join(dir, 'HEAD'));
  if (head?.startsWith('ref: refs/heads/')) {
    return head.slice('ref: refs/heads/'.length);
  }
  if (head) return 'detached';

  const gitBranch = run('git', ['branch', '--show-current']);
  return gitBranch.ok && gitBranch.stdout ? gitBranch.stdout : 'unknown';
}

function detectGitStatus() {
  const gitStatus = run('git', ['status', '--short']);
  if (gitStatus.ok) {
    return {
      available: true,
      dirty: Boolean(gitStatus.stdout),
      entries: gitStatus.stdout.split(/\r?\n/).filter(Boolean),
      error: null,
    };
  }
  return {
    available: false,
    dirty: null,
    entries: [],
    error: gitStatus.error || gitStatus.stderr || 'git status unavailable',
  };
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function statFor(relPath) {
  const absolute = path.join(root, relPath);
  if (!fs.existsSync(absolute)) {
    return { path: relPath, exists: false };
  }
  const stat = fs.statSync(absolute);
  return {
    path: relPath,
    exists: true,
    type: stat.isDirectory() ? 'directory' : 'file',
    sizeBytes: stat.isFile() ? stat.size : null,
    sha256: stat.isFile() ? hashFile(absolute) : null,
  };
}

function hashFile(absolute) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(absolute));
  return hash.digest('hex');
}

function readJson(relPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
  } catch {
    return null;
  }
}

function detectBaseline() {
  const originHead = readGitRef('refs/remotes/origin/HEAD');
  if (originHead?.startsWith('ref: refs/remotes/origin/')) {
    return {
      baseline: originHead.slice('ref: refs/remotes/origin/'.length),
      source: 'origin/HEAD',
    };
  }

  if (readGitRef('refs/heads/main')) return { baseline: 'main', source: 'local main branch' };

  if (readGitRef('refs/heads/master')) return { baseline: 'master', source: 'local master branch' };

  return { baseline: detectCurrentBranch(), source: 'current branch fallback' };
}

function detectPackageManager() {
  if (exists('pnpm-lock.yaml')) return 'pnpm';
  if (exists('yarn.lock')) return 'yarn';
  if (exists('package-lock.json')) return 'npm';
  if (exists('bun.lockb') || exists('bun.lock')) return 'bun';
  return null;
}

function commandFor(packageManager, scriptName) {
  if (!packageManager) return null;
  if (packageManager === 'npm') return `npm run ${scriptName}`;
  if (packageManager === 'pnpm') return `pnpm ${scriptName}`;
  if (packageManager === 'yarn') return `yarn ${scriptName}`;
  if (packageManager === 'bun') return `bun run ${scriptName}`;
  return null;
}

function parseEnvKeys(relPath) {
  const absolute = path.join(root, relPath);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readFileSync(absolute, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.slice(0, line.indexOf('=')))
    .filter(Boolean)
    .sort();
}

function detectDockerFiles() {
  const names = fs.readdirSync(root);
  return names.filter((name) => {
    const lower = name.toLowerCase();
    return lower === '.dockerignore' || lower.startsWith('dockerfile') || lower.startsWith('docker-compose');
  });
}

function latestQuarantineManifest() {
  if (!fs.existsSync(quarantineRoot)) return null;
  const candidates = fs
    .readdirSync(quarantineRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(quarantineRoot, entry.name, 'manifest.json'))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .map((manifestPath) => ({
      manifestPath,
      modifiedMs: fs.statSync(manifestPath).mtimeMs,
    }))
    .sort((a, b) => b.modifiedMs - a.modifiedMs);
  if (!candidates.length) return null;
  const selected = candidates[0].manifestPath;
  return {
    path: path.relative(root, selected),
    sha256: hashFile(selected),
  };
}

function discoverValidation(packageJson, packageManager) {
  const scripts = packageJson?.scripts ?? {};
  const commands = [];

  if (scripts.lint) {
    commands.push({
      type: 'lint',
      command: commandFor(packageManager, 'lint'),
      automatedByScript: runLint,
      safeDefault: true,
      notes: 'Read-only validation; may read env names through Expo.',
    });
  }

  if (scripts.build) {
    commands.push({
      type: 'build',
      command: commandFor(packageManager, 'build'),
      automatedByScript: false,
      safeDefault: false,
      notes: 'Detected but not run automatically because it writes generated build output.',
    });
  }

  if (scripts.smoke) {
    commands.push({
      type: 'smoke',
      command: commandFor(packageManager, 'smoke'),
      automatedByScript: false,
      safeDefault: false,
      notes: 'Detected but not run automatically because the smoke script writes .smoke/.expo-runtime artifacts.',
    });
  }

  if (scripts.start) {
    commands.push({
      type: 'local-start',
      command: commandFor(packageManager, 'start'),
      automatedByScript: false,
      safeDefault: false,
      notes: 'Detected but not run automatically because Expo start is long-lived.',
    });
  }

  if (scripts.typecheck) {
    commands.push({
      type: 'typecheck',
      command: commandFor(packageManager, 'typecheck'),
      automatedByScript: false,
      safeDefault: true,
      notes: 'Detected package script.',
    });
  }

  const selectedTests = [
    'test:startup-warning-hygiene',
    'test:auth-startup-route-selection',
    'test:dashboard-widgets',
    'test:navigate-readiness',
    'test:fleet-full-flow',
    'test:react-native-text-children',
  ].filter((scriptName) => scripts[scriptName]);

  for (const scriptName of selectedTests) {
    commands.push({
      type: 'targeted-test',
      command: commandFor(packageManager, scriptName),
      automatedByScript: false,
      safeDefault: true,
      notes: 'Suggested targeted cleanup regression check; run manually before and after quarantine.',
    });
  }

  return commands;
}

function runLintCommand(packageManager, packageJson) {
  if (!packageJson?.scripts?.lint) {
    return { skipped: true, reason: 'No lint script detected.' };
  }
  if (packageManager !== 'npm') {
    return { skipped: true, reason: `--run-lint currently supports npm safely; detected ${packageManager}.` };
  }
  const started = Date.now();
  const result = run('npm', ['run', 'lint']);
  if (result.error && /EPERM|EACCES|spawnSync/i.test(result.error)) {
    return {
      skipped: true,
      reason: `Unable to spawn npm from this environment: ${result.error}`,
    };
  }
  return {
    skipped: false,
    ok: result.ok,
    status: result.status,
    durationMs: Date.now() - started,
    stdoutTail: result.stdout.slice(-2000),
    stderrTail: result.stderr.slice(-2000),
    error: result.error,
  };
}

function buildReport() {
  const packageJson = readJson('package.json');
  const appJson = readJson('app.json');
  const packageManager = detectPackageManager();
  const gitStatus = detectGitStatus();
  const currentBranch = detectCurrentBranch();
  const dockerFiles = detectDockerFiles();
  const validationCommands = discoverValidation(packageJson, packageManager);
  const critical = CRITICAL_PATHS.map(statFor);
  const routes = ROUTE_SMOKE_PATHS.map(statFor);
  const runtimeStorage = RUNTIME_STORAGE_PATHS.map(statFor);
  const expo = appJson?.expo ?? {};
  const declaredAssets = [
    expo.icon,
    expo.android?.adaptiveIcon?.foregroundImage,
    expo.web?.favicon,
    expo.plugins?.find?.((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')?.[1]?.image,
  ].filter(Boolean).map((assetPath) => assetPath.replace(/^\.\//, ''));
  const assetChecks = declaredAssets.map(statFor);

  const missingCritical = critical.filter((item) => !item.exists && item.path !== '.env');
  const missingRoutes = routes.filter((item) => !item.exists);
  const missingAssets = assetChecks.filter((item) => !item.exists);

  const findings = [];
  if (missingCritical.length) findings.push(`Missing critical paths: ${missingCritical.map((item) => item.path).join(', ')}`);
  if (missingRoutes.length) findings.push(`Missing route smoke paths: ${missingRoutes.map((item) => item.path).join(', ')}`);
  if (missingAssets.length) findings.push(`Missing declared assets: ${missingAssets.map((item) => item.path).join(', ')}`);
  if (!packageManager) findings.push('No package manager lockfile detected.');
  if (!packageJson) findings.push('package.json is missing or invalid.');

  const lint = runLint ? runLintCommand(packageManager, packageJson) : null;
  if (lint && !lint.skipped && !lint.ok) findings.push('Lint command failed.');

  return {
    generatedAt: new Date().toISOString(),
    appPath: root,
    currentBranch,
    baseline: detectBaseline(),
    gitStatus: {
      available: gitStatus.available,
      dirty: gitStatus.dirty,
      entries: gitStatus.entries,
      error: gitStatus.error,
    },
    packageManager,
    stack: {
      packageName: packageJson?.name ?? null,
      expoSdk: packageJson?.dependencies?.expo ?? null,
      reactNative: packageJson?.dependencies?.['react-native'] ?? null,
      routerEntry: packageJson?.main ?? null,
      dockerFiles,
    },
    validationCommands,
    critical,
    routes,
    declaredAssets: assetChecks,
    runtimeStorage,
    envFiles: fs
      .readdirSync(root)
      .filter((name) => name === '.env' || name.startsWith('.env.'))
      .sort()
      .map((name) => ({
        ...statFor(name),
        keys: parseEnvKeys(name),
      })),
    quarantine: {
      root: quarantineRoot,
      exists: fs.existsSync(quarantineRoot),
      latestManifest: latestQuarantineManifest(),
    },
    commandResults: {
      lint,
    },
    status: findings.length ? 'attention-needed' : 'passed',
    findings,
  };
}

function printReport(report) {
  console.log('# ECS Cleanup Validation Report');
  console.log('');
  console.log(`- App path: ${report.appPath}`);
  console.log(`- Current branch: ${report.currentBranch}`);
  console.log(`- Baseline: ${report.baseline.baseline} (${report.baseline.source})`);
  console.log(`- Package manager: ${report.packageManager ?? 'not detected'}`);
  console.log(`- Stack: Expo ${report.stack.expoSdk ?? 'unknown'}, React Native ${report.stack.reactNative ?? 'unknown'}`);
  console.log(`- Docker files: ${report.stack.dockerFiles.length ? report.stack.dockerFiles.join(', ') : 'none detected'}`);
  console.log(
    `- Git status: ${
      report.gitStatus.available
        ? report.gitStatus.dirty
          ? 'dirty'
          : 'clean'
        : `unavailable (${report.gitStatus.error})`
    }`,
  );
  console.log(`- Status: ${report.status}`);
  console.log('');

  console.log('## Validation Commands');
  for (const command of report.validationCommands) {
    console.log(`- ${command.type}: ${command.command} (${command.notes})`);
  }
  if (!report.validationCommands.length) console.log('- No reliable validation commands detected.');
  console.log('');

  console.log('## Critical Paths');
  for (const item of report.critical) {
    const hash = item.sha256 ? ` sha256=${item.sha256.slice(0, 12)}` : '';
    console.log(`- ${item.exists ? 'OK' : 'MISSING'} ${item.path}${hash}`);
  }
  console.log('');

  console.log('## Route Smoke Paths');
  for (const item of report.routes) {
    console.log(`- ${item.exists ? 'OK' : 'MISSING'} ${item.path}`);
  }
  console.log('');

  console.log('## Declared Assets');
  for (const item of report.declaredAssets) {
    console.log(`- ${item.exists ? 'OK' : 'MISSING'} ${item.path}`);
  }
  console.log('');

  console.log('## Runtime Storage / Artifacts');
  for (const item of report.runtimeStorage) {
    console.log(`- ${item.exists ? 'PRESENT' : 'not present'} ${item.path}`);
  }
  console.log('');

  console.log('## Env Files');
  for (const envFile of report.envFiles) {
    console.log(`- ${envFile.path}: ${envFile.keys.length} keys, sha256=${envFile.sha256?.slice(0, 12) ?? 'n/a'}`);
  }
  console.log('');

  console.log('## Quarantine');
  console.log(`- Root: ${report.quarantine.root}`);
  console.log(`- Exists: ${report.quarantine.exists ? 'yes' : 'no'}`);
  console.log(`- Latest manifest: ${report.quarantine.latestManifest?.path ?? 'none'}`);
  console.log('');

  if (report.commandResults.lint) {
    console.log('## Lint Result');
    if (report.commandResults.lint.skipped) {
      console.log(`- Skipped: ${report.commandResults.lint.reason}`);
    } else {
      console.log(`- ${report.commandResults.lint.ok ? 'passed' : 'failed'} in ${report.commandResults.lint.durationMs}ms`);
      if (report.commandResults.lint.stdoutTail) console.log(report.commandResults.lint.stdoutTail);
      if (report.commandResults.lint.stderrTail) console.error(report.commandResults.lint.stderrTail);
    }
    console.log('');
  }

  if (report.findings.length) {
    console.log('## Findings');
    for (const finding of report.findings) console.log(`- ${finding}`);
  }
}

if (help) {
  console.log(usage());
  process.exit(0);
}

const report = buildReport();
if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

process.exit(report.status === 'passed' ? 0 : 1);
