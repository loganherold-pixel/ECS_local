#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const DEFAULT_MODE = 'dry-run';
const REPORT_VERSION = 1;

// Keep this allowlist intentionally small. Medium-risk items from the audit
// stay out of scope until a human approves a broader cleanup pass.
const LOW_RISK_DIRECTORIES = [
  '.npm-cache',
  '.expo-export-check',
  '.expo-runtime',
  '.gradle-local',
  '.gradle-local-build3',
];

const LOW_RISK_ROOT_FILE_PATTERNS = [
  /^\.codex-[^/\\]+\.png$/i,
  /^tmp_[^/\\]+\.png$/i,
  /^tmp-[^/\\]+\.png$/i,
];

// The denylist is broader than the allowlist on purpose. A future edit that
// accidentally adds a risky path to the allowlist should still fail closed.
const DENYLIST_EXACT = new Set([
  '.git',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'app.json',
  'eas.json',
  'metro.config.js',
  'tsconfig.json',
  'android/app/debug.keystore',
  'assets',
  'public',
  'app',
  'components',
  'context',
  'config',
  'lib',
  'src',
  'stores',
  'docs',
  'fixtures',
  'tests',
  'scripts',
  'supabase',
  'supabase/migrations',
  'supabase/functions',
  'dist',
  'artifacts',
  'node_modules',
  '.gradle-user-home',
  '.gradle-local-build2',
  '.gradle-local-apk-build',
  '.gradle-local-release-audit',
  '.gradle-local-fieldtest',
  'android/app/build',
  'android/app/.cxx',
  'android/.gradle',
]);

const DENYLIST_SEGMENTS = new Set([
  '.git',
  'uploads',
  'upload',
  'storage',
  'media',
  'user-data',
  'userdata',
  'database',
  'databases',
  'migrations',
  'backup',
  'backups',
  'exports',
  'docker',
  'volumes',
  'secrets',
  'credentials',
  'keys',
]);

const DENYLIST_FILE_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /\.(?:db|sqlite|sqlite3|realm|jks|keystore|p8|p12|key|mobileprovision)$/i,
  /(?:secret|credential|private-key|service-role)/i,
];

function parseArgs(argv) {
  const options = {
    appPath: '.',
    allowDirty: false,
    quarantineRoot: null,
    confirmDelete: false,
    help: false,
    modes: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run' || arg === '--quarantine' || arg === '--restore' || arg === '--delete-quarantine' || arg === '--report') {
      options.modes.push(arg.slice(2));
    } else if (arg === '--allow-dirty') {
      options.allowDirty = true;
    } else if (arg === '--confirm-delete') {
      options.confirmDelete = true;
    } else if (arg === '--app-path') {
      options.appPath = requireValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--app-path=')) {
      options.appPath = arg.slice('--app-path='.length);
    } else if (arg === '--quarantine-dir') {
      options.quarantineRoot = requireValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--quarantine-dir=')) {
      options.quarantineRoot = arg.slice('--quarantine-dir='.length);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.modes.length > 1) {
    throw new Error(`Choose exactly one mode. Received: ${options.modes.join(', ')}`);
  }

  options.mode = options.modes[0] ?? DEFAULT_MODE;
  return options;
}

function requireValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${arg} requires a value.`);
  }
  return value;
}

function usage() {
  return [
    'Usage: node scripts/safe-cleanup.mjs [mode] [options]',
    '',
    'Modes:',
    '  --dry-run             Default. Inspect approved candidates without moving or deleting.',
    '  --report              Print a markdown cleanup report without moving or deleting.',
    '  --quarantine          Move approved low-risk candidates into a quarantine folder.',
    '  --restore             Restore files from the latest or selected quarantine manifest.',
    '  --delete-quarantine   Permanently delete a quarantine folder; requires --confirm-delete.',
    '',
    'Options:',
    '  --allow-dirty         Permit running when git status is dirty.',
    '  --app-path <path>     App folder to inspect. Defaults to current directory.',
    '  --quarantine-dir <p>  Quarantine root or run folder. Defaults beside the app folder.',
    '  --confirm-delete      Required with --delete-quarantine.',
  ].join('\n');
}

function runGit(root, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });

  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

function detectBaseline(root) {
  const originHead = runGit(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (originHead.status === 0 && originHead.stdout) {
    return { baseline: originHead.stdout, source: 'origin/HEAD' };
  }

  const main = runGit(root, ['show-ref', '--verify', '--quiet', 'refs/heads/main']);
  if (main.status === 0) {
    return { baseline: 'main', source: 'local branch fallback' };
  }

  const master = runGit(root, ['show-ref', '--verify', '--quiet', 'refs/heads/master']);
  if (master.status === 0) {
    return { baseline: 'master', source: 'local branch fallback' };
  }

  const current = runGit(root, ['branch', '--show-current']);
  return { baseline: current.stdout || '(detached HEAD)', source: 'current branch fallback' };
}

function assertCleanWorkingTree(root, allowDirty, logger) {
  const status = runGit(root, ['status', '--short']);
  if (status.status !== 0) {
    throw new Error(`Unable to inspect git status: ${status.stderr || status.stdout}`);
  }

  if (status.stdout && !allowDirty) {
    logger(`refuse: working tree is dirty; pass --allow-dirty to continue`);
    throw new Error('Working tree is dirty. Refusing to run without --allow-dirty.');
  }

  if (status.stdout && allowDirty) {
    logger('warn: working tree is dirty; continuing because --allow-dirty was passed');
  }
}

function normalizeRelative(relativePath) {
  return relativePath.split(path.sep).join('/').replace(/^\.?\//, '');
}

function isDenylisted(relativePath) {
  const normalized = normalizeRelative(relativePath);
  const lower = normalized.toLowerCase();
  const basename = path.posix.basename(lower);
  const segments = lower.split('/').filter(Boolean);

  if (DENYLIST_EXACT.has(lower)) {
    return `exact denylist match: ${lower}`;
  }

  for (const segment of segments) {
    if (DENYLIST_SEGMENTS.has(segment)) {
      return `denylisted path segment: ${segment}`;
    }
  }

  for (const pattern of DENYLIST_FILE_PATTERNS) {
    if (pattern.test(basename) || pattern.test(lower)) {
      return `denylisted filename pattern: ${pattern}`;
    }
  }

  return null;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function statSize(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.lstatSync(targetPath);
  if (!stat.isDirectory()) return stat.size;

  let total = 0;
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const childPath = path.join(targetPath, entry.name);
    const childStat = fs.lstatSync(childPath);
    if (childStat.isSymbolicLink()) {
      total += childStat.size;
    } else if (childStat.isDirectory()) {
      total += statSize(childPath);
    } else {
      total += childStat.size;
    }
  }
  return total;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function gitStatusForPath(root, relativePath) {
  const tracked = runGit(root, ['ls-files', '--', relativePath]).stdout.length > 0;
  const ignoredResult = runGit(root, ['check-ignore', '-v', '--', relativePath]);
  const statusResult = runGit(root, ['status', '--ignored', '--short', '--', relativePath]);
  return {
    tracked,
    ignored: ignoredResult.status === 0,
    ignoreRule: ignoredResult.status === 0 ? ignoredResult.stdout : '',
    status: statusResult.stdout,
  };
}

function collectCandidates(root) {
  const candidates = [];

  // Only exact root-level directories are considered. The script does not
  // recurse looking for "large" files because unknown large files are risky.
  for (const relativePath of LOW_RISK_DIRECTORIES) {
    candidates.push(buildCandidate(root, relativePath, 'approved generated/cache directory'));
  }

  // Temporary screenshots are limited to root files matching known QA names.
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!LOW_RISK_ROOT_FILE_PATTERNS.some((pattern) => pattern.test(entry.name))) continue;
    candidates.push(buildCandidate(root, entry.name, 'approved root temp screenshot pattern'));
  }

  return candidates.filter(Boolean).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function buildCandidate(root, relativePath, reason) {
  const absolutePath = path.resolve(root, relativePath);
  const normalized = normalizeRelative(path.relative(root, absolutePath));
  if (!isInside(root, absolutePath)) {
    return {
      relativePath: normalized,
      exists: false,
      allowed: false,
      reason,
      blockedReason: 'path resolves outside app root',
    };
  }

  const blockedReason = isDenylisted(normalized);
  const exists = fs.existsSync(absolutePath);
  const sizeBytes = exists ? statSize(absolutePath) : 0;
  const git = exists ? gitStatusForPath(root, normalized) : { tracked: false, ignored: false, ignoreRule: '', status: '' };
  const allowed = exists && !blockedReason && !git.tracked;

  return {
    relativePath: normalized,
    absolutePath,
    exists,
    allowed,
    reason,
    blockedReason,
    sizeBytes,
    size: formatBytes(sizeBytes),
    git,
  };
}

function detectPackageManager(root) {
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lock')) || fs.existsSync(path.join(root, 'bun.lockb'))) return 'bun';
  return null;
}

function commandForPackageManager(packageManager, scriptName) {
  if (!packageManager) return null;
  if (packageManager === 'npm') return `npm run ${scriptName}`;
  if (packageManager === 'pnpm') return `pnpm ${scriptName}`;
  if (packageManager === 'yarn') return `yarn ${scriptName}`;
  if (packageManager === 'bun') return `bun run ${scriptName}`;
  return null;
}

function detectValidation(root) {
  const packageManager = detectPackageManager(root);
  const packagePath = path.join(root, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return {
      packageManager,
      commands: [],
      notes: ['No package.json detected. No Node validation commands selected.'],
    };
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const scripts = packageJson.scripts ?? {};
  const commands = [];
  const notes = [];

  if (scripts.lint) commands.push({ type: 'lint', command: commandForPackageManager(packageManager, 'lint') });
  if (scripts.test) {
    commands.push({ type: 'test', command: commandForPackageManager(packageManager, 'test') });
  } else {
    const targetedTests = Object.keys(scripts).filter((name) => name.startsWith('test:'));
    notes.push(`No generic test script detected; ${targetedTests.length} targeted test scripts are available.`);
  }
  if (scripts.build) commands.push({ type: 'build', command: commandForPackageManager(packageManager, 'build') });
  if (scripts.smoke) commands.push({ type: 'smoke', command: commandForPackageManager(packageManager, 'smoke') });
  if (scripts.start) {
    notes.push(`Start command detected (${commandForPackageManager(packageManager, 'start')}) but not selected for automatic validation because it is long-lived.`);
  }

  return { packageManager, commands, notes };
}

function makeLogger() {
  const lines = [];
  const log = (message) => {
    const line = `${new Date().toISOString()} ${message}`;
    lines.push(line);
    console.error(line);
  };
  log.lines = lines;
  return log;
}

function renderReport({ root, baseline, candidates, validation, mode }) {
  const totalBytes = candidates.reduce((sum, candidate) => sum + (candidate.exists && candidate.allowed ? candidate.sizeBytes : 0), 0);
  const rows = candidates.map((candidate) => {
    const status = candidate.exists
      ? candidate.allowed
        ? 'allowed'
        : `blocked: ${candidate.blockedReason ?? 'not allowed'}`
      : 'missing';
    const git = candidate.exists
      ? `${candidate.git.tracked ? 'tracked' : 'untracked'} / ${candidate.git.ignored ? 'ignored' : 'not ignored'}`
      : 'n/a';
    return `| \`${candidate.relativePath}\` | ${candidate.size} | ${status} | ${git} | ${candidate.reason} |`;
  });

  const validationRows = validation.commands.length
    ? validation.commands.map((item) => `| ${item.type} | \`${item.command}\` |`).join('\n')
    : '| none | No reliable validation command detected. |';

  return [
    '# ECS Safe Cleanup Report',
    '',
    `- Mode: \`${mode}\``,
    `- App path: \`${root}\``,
    `- Baseline: \`${baseline.baseline}\` (${baseline.source})`,
    `- Package manager: \`${validation.packageManager ?? 'none detected'}\``,
    `- Reclaimable approved candidate size: ${formatBytes(totalBytes)}`,
    '',
    '## Candidates',
    '',
    '| Path | Size | Decision | Git status | Evidence |',
    '|---|---:|---|---|---|',
    ...rows,
    '',
    '## Validation Commands',
    '',
    '| Type | Command |',
    '|---|---|',
    validationRows,
    '',
    '## Notes',
    '',
    ...validation.notes.map((note) => `- ${note}`),
  ].join('\n');
}

function defaultQuarantineRoot(root) {
  return path.join(path.dirname(root), `${path.basename(root)}-cleanup-quarantine`);
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureQuarantineIsOutsideRoot(root, quarantinePath) {
  const resolved = path.resolve(quarantinePath);
  if (isInside(root, resolved)) {
    throw new Error(`Quarantine path must be outside the app root: ${resolved}`);
  }
  if (!path.basename(resolved).includes('cleanup-quarantine')) {
    throw new Error(`Quarantine path must include "cleanup-quarantine" in its name: ${resolved}`);
  }
}

function quarantineCandidates({ root, quarantineRoot, baseline, candidates, validation, logger }) {
  ensureQuarantineIsOutsideRoot(root, quarantineRoot);
  const runDir = path.join(path.resolve(quarantineRoot), timestampId());
  fs.mkdirSync(runDir, { recursive: true });

  const moved = [];
  for (const candidate of candidates) {
    if (!candidate.exists) {
      logger(`skip missing: ${candidate.relativePath}`);
      continue;
    }
    if (!candidate.allowed) {
      logger(`skip blocked: ${candidate.relativePath} (${candidate.blockedReason ?? 'not allowed'})`);
      continue;
    }

    const destination = path.join(runDir, 'files', candidate.relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    // Rename keeps the operation reversible without copying large directories.
    logger(`move to quarantine: ${candidate.relativePath} -> ${destination}`);
    fs.renameSync(candidate.absolutePath, destination);
    moved.push({
      relativePath: candidate.relativePath,
      originalPath: candidate.absolutePath,
      quarantinePath: destination,
      sizeBytes: candidate.sizeBytes,
      size: candidate.size,
      reason: candidate.reason,
    });
  }

  const manifest = {
    version: REPORT_VERSION,
    createdAt: new Date().toISOString(),
    mode: 'quarantine',
    appPath: root,
    baseline,
    validation,
    moved,
  };

  const report = renderReport({
    root,
    baseline,
    candidates,
    validation,
    mode: 'quarantine',
  });

  fs.writeFileSync(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, 'report.md'), `${report}\n`);
  fs.writeFileSync(path.join(runDir, 'safe-cleanup.log'), `${logger.lines.join('\n')}\n`);
  logger(`wrote quarantine manifest: ${path.join(runDir, 'manifest.json')}`);
  return { runDir, moved };
}

function findLatestManifest(quarantineRoot) {
  const resolved = path.resolve(quarantineRoot);
  const directManifest = path.join(resolved, 'manifest.json');
  if (fs.existsSync(directManifest)) return directManifest;
  if (!fs.existsSync(resolved)) {
    throw new Error(`Quarantine path does not exist: ${resolved}`);
  }

  const manifests = fs.readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(resolved, entry.name, 'manifest.json'))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .sort()
    .reverse();

  if (!manifests.length) {
    throw new Error(`No quarantine manifest found under: ${resolved}`);
  }
  return manifests[0];
}

function restoreFromQuarantine({ root, quarantineRoot, logger }) {
  const manifestPath = findLatestManifest(quarantineRoot);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== REPORT_VERSION || !Array.isArray(manifest.moved)) {
    throw new Error(`Unsupported quarantine manifest: ${manifestPath}`);
  }

  for (const item of manifest.moved.slice().reverse()) {
    const destination = path.resolve(root, item.relativePath);
    if (!isInside(root, destination)) {
      throw new Error(`Refusing to restore outside app root: ${item.relativePath}`);
    }
    if (isDenylisted(item.relativePath)) {
      throw new Error(`Refusing to restore denylisted path: ${item.relativePath}`);
    }
    if (fs.existsSync(destination)) {
      throw new Error(`Refusing to overwrite existing path during restore: ${item.relativePath}`);
    }
    if (!fs.existsSync(item.quarantinePath)) {
      throw new Error(`Missing quarantined path: ${item.quarantinePath}`);
    }

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    logger(`restore from quarantine: ${item.quarantinePath} -> ${destination}`);
    fs.renameSync(item.quarantinePath, destination);
  }

  logger(`restore complete from manifest: ${manifestPath}`);
}

function deleteQuarantine({ root, quarantineRoot, confirmDelete, logger }) {
  if (!confirmDelete) {
    throw new Error('Refusing to delete quarantine without --confirm-delete.');
  }
  const resolved = path.resolve(quarantineRoot);
  ensureQuarantineIsOutsideRoot(root, resolved);
  if (!fs.existsSync(resolved)) {
    logger(`skip missing quarantine: ${resolved}`);
    return;
  }
  // This is the only permanent delete path, and it is limited to quarantine.
  logger(`delete quarantine directory: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: false });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const root = path.resolve(options.appPath);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`App path is not a directory: ${root}`);
  }

  const logger = makeLogger();
  const baseline = detectBaseline(root);
  logger(`baseline: ${baseline.baseline} (${baseline.source})`);
  assertCleanWorkingTree(root, options.allowDirty, logger);

  const quarantineRoot = options.quarantineRoot
    ? path.resolve(options.quarantineRoot)
    : defaultQuarantineRoot(root);
  const candidates = collectCandidates(root);
  const validation = detectValidation(root);

  if (options.mode === 'dry-run' || options.mode === 'report') {
    logger(`${options.mode}: no files will be moved or deleted`);
    console.log(renderReport({ root, baseline, candidates, validation, mode: options.mode }));
    return;
  }

  if (options.mode === 'quarantine') {
    const result = quarantineCandidates({ root, quarantineRoot, baseline, candidates, validation, logger });
    console.log(`Quarantine created: ${result.runDir}`);
    console.log(`Moved items: ${result.moved.length}`);
    return;
  }

  if (options.mode === 'restore') {
    restoreFromQuarantine({ root, quarantineRoot, logger });
    return;
  }

  if (options.mode === 'delete-quarantine') {
    deleteQuarantine({ root, quarantineRoot, confirmDelete: options.confirmDelete, logger });
    return;
  }

  throw new Error(`Unsupported mode: ${options.mode}`);
}

try {
  main();
} catch (error) {
  console.error(`safe-cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
