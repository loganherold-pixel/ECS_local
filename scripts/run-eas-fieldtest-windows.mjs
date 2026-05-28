#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const cacheRoot = process.env.npm_config_cache ?? path.join(repoRoot, '.npm-cache');
const npxRoot = path.join(cacheRoot, '_npx');
const dryRun = process.argv.includes('--dry-run');

function findEasLauncherFiles(root) {
  const matches = {
    expoCli: [],
    expoUpdatesCli: [],
    androidUpdatesModule: [],
    resolveRuntimeVersion: [],
  };
  if (!fs.existsSync(root)) return matches;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.bin') continue;
        stack.push(fullPath);
        continue;
      }
      if (entry.name === 'UpdatesModule.js' && fullPath.includes(`${path.sep}eas-cli${path.sep}build${path.sep}update${path.sep}android${path.sep}`)) {
        matches.androidUpdatesModule.push(fullPath);
        continue;
      }
      if (entry.name === 'resolveRuntimeVersionAsync.js' && fullPath.includes(`${path.sep}eas-cli${path.sep}build${path.sep}project${path.sep}`)) {
        matches.resolveRuntimeVersion.push(fullPath);
        continue;
      }
      if (!fullPath.includes(`${path.sep}eas-cli${path.sep}build${path.sep}utils${path.sep}`)) continue;
      if (entry.name === 'expoCli.js') {
        matches.expoCli.push(fullPath);
      }
      if (entry.name === 'expoUpdatesCli.js') {
        matches.expoUpdatesCli.push(fullPath);
      }
    }
  }
  return matches;
}

function patchExpoCliLauncher(filePath) {
  let source = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const spawnNeedle = `const spawnPromise = (0, spawn_async_1.default)(expoCliPath, args, {
        cwd: projectDir,
        ...opts,
        env: {
            ...process.env,
            ...opts?.env,
        },
    });`;
  const spawnReplacement = `// ECS_WINDOWS_EXPO_CLI_SPAWN_PATCH
    const isWindowsExtensionlessExpoCli = process.platform === 'win32' && /[\\\\/]expo[\\\\/]bin[\\\\/]cli$/.test(expoCliPath);
    const spawnCommand = isWindowsExtensionlessExpoCli ? process.execPath : expoCliPath;
    const spawnArgs = isWindowsExtensionlessExpoCli ? [expoCliPath, ...args] : args;
    const spawnPromise = (0, spawn_async_1.default)(spawnCommand, spawnArgs, {
        cwd: projectDir,
        ...opts,
        env: {
            ...process.env,
            ...opts?.env,
        },
    });`;

  if (!source.includes('ECS_WINDOWS_EXPO_CLI_SPAWN_PATCH')) {
    if (!source.includes(spawnNeedle)) {
      throw new Error(`Unable to patch EAS Expo CLI launcher at ${filePath}. The expected spawn block was not found.`);
    }
    source = source.replace(spawnNeedle, spawnReplacement);
    changed = true;
  }

  const guardNeedle = `if (!spawnPromise.child.stdout && !spawnPromise.child.stderr) {
        throw new Error('Failed to spawn expo-cli');
    }`;
  const guardReplacement = `// ECS_WINDOWS_EXPO_CLI_STDIO_GUARD_PATCH
    if (!spawnPromise.child.pid && !spawnPromise.child.stdout && !spawnPromise.child.stderr) {
        throw new Error('Failed to spawn expo-cli');
    }`;
  if (!source.includes('ECS_WINDOWS_EXPO_CLI_STDIO_GUARD_PATCH')) {
    if (!source.includes(guardNeedle)) {
      throw new Error(`Unable to patch EAS Expo CLI launcher at ${filePath}. The expected stdio guard was not found.`);
    }
    source = source.replace(guardNeedle, guardReplacement);
    changed = true;
  }

  if (!changed) {
    return false;
  }

  if (!source.includes('ECS_WINDOWS_EXPO_CLI_SPAWN_PATCH')) {
    throw new Error(`Unable to patch EAS Expo CLI launcher at ${filePath}. The expected spawn block was not found.`);
  }

  fs.writeFileSync(filePath, source);
  return true;
}

function patchExpoUpdatesCliLauncher(filePath) {
  let source = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  const staleRegexLine =
    "const isWindowsExtensionlessExpoUpdatesCli = process.platform === 'win32' && /[\\\\/]expo-updates[\\\\/]bin[\\\\/]cli$/.test(expoUpdatesCli);";
  const currentRegexLine =
    "const isWindowsExpoUpdatesCli = process.platform === 'win32' && /[\\\\/]expo-updates[\\\\/]bin[\\\\/]cli(?:\\\\.js)?$/.test(expoUpdatesCli);";
  if (source.includes(staleRegexLine)) {
    source = source
      .replace(staleRegexLine, currentRegexLine)
      .replaceAll('isWindowsExtensionlessExpoUpdatesCli', 'isWindowsExpoUpdatesCli');
    changed = true;
  }
  if (source.includes('cwd: options.cwd,')) {
    source = source.replaceAll('cwd: options.cwd,', 'cwd: options.cwd ?? projectDir,');
    changed = true;
  }
  const needle = `return (await (0, spawn_async_1.default)(expoUpdatesCli, args, {
            stdio: 'pipe',
            env: { ...process.env, ...options.env },
            cwd: options.cwd,
        })).stdout;`;
  const replacement = `// ECS_WINDOWS_EXPO_UPDATES_CLI_SPAWN_PATCH
        const isWindowsExpoUpdatesCli = process.platform === 'win32' && /[\\\\/]expo-updates[\\\\/]bin[\\\\/]cli(?:\\\\.js)?$/.test(expoUpdatesCli);
        const spawnCommand = isWindowsExpoUpdatesCli ? process.execPath : expoUpdatesCli;
        const spawnArgs = isWindowsExpoUpdatesCli ? [expoUpdatesCli, ...args] : args;
        return (await (0, spawn_async_1.default)(spawnCommand, spawnArgs, {
            stdio: 'pipe',
            env: { ...process.env, ...options.env },
            cwd: options.cwd ?? projectDir,
        })).stdout;`;

  if (!source.includes('ECS_WINDOWS_EXPO_UPDATES_CLI_SPAWN_PATCH')) {
    if (!source.includes(needle)) {
      throw new Error(`Unable to patch EAS expo-updates launcher at ${filePath}. The expected spawn block was not found.`);
    }
    source = source.replace(needle, replacement);
    changed = true;
  }
  const catchNeedle = [
    "if (e.stderr && typeof e.stderr === 'string') {",
    "            if (e.stderr.includes('Invalid command')) {",
    "                throw new ExpoUpdatesCLIInvalidCommandError(`The command specified by ${args} was not valid in the \\`expo-updates\\` CLI.`);",
    '            }',
    '            else {',
    '                throw new ExpoUpdatesCLICommandFailedError(e.stderr);',
    '            }',
    '        }',
    '        throw e;',
  ].join('\n');
  const catchReplacement = [
    "const stderr = typeof e.stderr === 'string' ? e.stderr : '';",
    "        const stdout = typeof e.stdout === 'string' ? e.stdout : '';",
    "        const output = [stderr, stdout].filter(Boolean).join('\\n');",
    '        if (output) {',
    "            if (output.includes('Invalid command')) {",
    "                throw new ExpoUpdatesCLIInvalidCommandError(`The command specified by ${args} was not valid in the \\`expo-updates\\` CLI.`);",
    '            }',
    '            throw new ExpoUpdatesCLICommandFailedError(output);',
    '        }',
    '        throw e;',
  ].join('\n');
  if (!source.includes("const output = [stderr, stdout].filter(Boolean).join('\\n');")) {
    if (!source.includes(catchNeedle)) {
      throw new Error(`Unable to patch EAS expo-updates launcher at ${filePath}. The expected catch block was not found.`);
    }
    source = source.replace(catchNeedle, catchReplacement);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, source);
  }
  return changed;
}

function patchAndroidUpdatesModule(filePath) {
  let source = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  const needle = `if (await (0, projectUtils_1.isModernExpoUpdatesCLIWithRuntimeVersionCommandSupportedAsync)(projectDir)) {
        await (0, expoUpdatesCli_1.expoUpdatesCommandAsync)(projectDir, ['configuration:syncnative', '--platform', 'android', '--workflow', workflow], { env });
        return;
    }`;
  const replacement = `// ECS_WINDOWS_EXPO_UPDATES_IN_PROCESS_SYNC_PATCH
    if (process.platform !== 'win32' && await (0, projectUtils_1.isModernExpoUpdatesCLIWithRuntimeVersionCommandSupportedAsync)(projectDir)) {
        await (0, expoUpdatesCli_1.expoUpdatesCommandAsync)(projectDir, ['configuration:syncnative', '--platform', 'android', '--workflow', workflow], { env });
        return;
    }`;

  if (!source.includes('ECS_WINDOWS_EXPO_UPDATES_IN_PROCESS_SYNC_PATCH')) {
    if (!source.includes(needle)) {
      throw new Error(`Unable to patch EAS Android updates module at ${filePath}. The expected modern CLI block was not found.`);
    }
    source = source.replace(needle, replacement);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, source);
  }
  return changed;
}

function patchResolveRuntimeVersion(filePath) {
  let source = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  const needle = `if (!(await (0, projectUtils_1.isModernExpoUpdatesCLIWithRuntimeVersionCommandSupportedAsync)(projectDir))) {
        // fall back to the previous behavior (using the @expo/config-plugins eas-cli dependency rather
        // than the versioned @expo/config-plugins dependency in the project)
        return {
            runtimeVersion: await config_plugins_1.Updates.getRuntimeVersionNullableAsync(projectDir, exp, platform),
            expoUpdatesRuntimeFingerprint: null,
            expoUpdatesRuntimeFingerprintHash: null,
        };
    }`;
  const replacement = `// ECS_WINDOWS_EXPO_UPDATES_RUNTIME_RESOLVE_PATCH
    if (process.platform === 'win32' || !(await (0, projectUtils_1.isModernExpoUpdatesCLIWithRuntimeVersionCommandSupportedAsync)(projectDir))) {
        // fall back to the previous behavior (using the @expo/config-plugins eas-cli dependency rather
        // than the versioned @expo/config-plugins dependency in the project)
        return {
            runtimeVersion: await config_plugins_1.Updates.getRuntimeVersionNullableAsync(projectDir, exp, platform),
            expoUpdatesRuntimeFingerprint: null,
            expoUpdatesRuntimeFingerprintHash: null,
        };
    }`;

  if (!source.includes('ECS_WINDOWS_EXPO_UPDATES_RUNTIME_RESOLVE_PATCH')) {
    if (!source.includes(needle)) {
      throw new Error(`Unable to patch EAS runtime version resolver at ${filePath}. The expected fallback block was not found.`);
    }
    source = source.replace(needle, replacement);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, source);
  }
  return changed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      EXPO_NO_TELEMETRY: '1',
      npm_config_cache: cacheRoot,
      GRADLE_USER_HOME: process.env.GRADLE_USER_HOME ?? path.join(repoRoot, '.gradle-user-home'),
      ...options.env,
    },
  });
  return result.status ?? 1;
}

let status = run('npx', ['eas-cli@latest', '--version']);
if (status !== 0) process.exit(status);

const launcherFiles = findEasLauncherFiles(npxRoot);
if (launcherFiles.expoCli.length === 0) {
  console.error(`No cached eas-cli expoCli.js launcher found under ${npxRoot}.`);
  process.exit(1);
}
if (launcherFiles.expoUpdatesCli.length === 0) {
  console.error(`No cached eas-cli expoUpdatesCli.js launcher found under ${npxRoot}.`);
  process.exit(1);
}
if (launcherFiles.androidUpdatesModule.length === 0) {
  console.error(`No cached eas-cli Android UpdatesModule.js found under ${npxRoot}.`);
  process.exit(1);
}
if (launcherFiles.resolveRuntimeVersion.length === 0) {
  console.error(`No cached eas-cli resolveRuntimeVersionAsync.js found under ${npxRoot}.`);
  process.exit(1);
}

for (const filePath of launcherFiles.expoCli) {
  const patched = patchExpoCliLauncher(filePath);
  console.log(`${patched ? 'Patched' : 'Already patched'} EAS Expo CLI launcher: ${filePath}`);
}
for (const filePath of launcherFiles.expoUpdatesCli) {
  const patched = patchExpoUpdatesCliLauncher(filePath);
  console.log(`${patched ? 'Patched' : 'Already patched'} EAS expo-updates CLI launcher: ${filePath}`);
}
for (const filePath of launcherFiles.androidUpdatesModule) {
  const patched = patchAndroidUpdatesModule(filePath);
  console.log(`${patched ? 'Patched' : 'Already patched'} EAS Android updates sync module: ${filePath}`);
}
for (const filePath of launcherFiles.resolveRuntimeVersion) {
  const patched = patchResolveRuntimeVersion(filePath);
  console.log(`${patched ? 'Patched' : 'Already patched'} EAS runtime version resolver: ${filePath}`);
}

if (dryRun) {
  console.log('Dry run complete. Re-run without --dry-run to start the EAS fieldtest build.');
  process.exit(0);
}

status = run('npx', [
  'eas-cli@latest',
  'build',
  '--platform',
  'android',
  '--profile',
  'fieldtest',
  '--non-interactive',
  '--no-wait',
]);

process.exit(status);
