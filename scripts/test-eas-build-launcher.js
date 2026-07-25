const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex');
}

(async () => {
  const launcherPath = path.join(root, 'scripts', 'eas-cloud-build-android-apk.mjs');
  const launcher = await import(pathToFileURL(launcherPath).href);
  const launcherSource = read('scripts/eas-cloud-build-android-apk.mjs');
  const workflow = read('.eas/workflows/explore-android-acceptance.yml');
  const packageJson = JSON.parse(read('package.json'));
  const easJson = JSON.parse(read('eas.json'));

  assert.strictEqual(fs.existsSync(path.join(root, 'scripts', 'run-eas-fieldtest-windows.mjs')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'scripts', 'eas-windows-spawn-shim.cjs')), false);
  for (const forbidden of [
    'expoCli.js',
    'expoUpdatesCli.js',
    'UpdatesModule.js',
    'resolveRuntimeVersionAsync.js',
    'ECS_WINDOWS_EXPO_',
    'NODE_OPTIONS',
    'childProcess.spawn',
    'spawnNeedle',
    'guardNeedle',
  ]) {
    assert.strictEqual(launcherSource.includes(forbidden), false, `Launcher must not contain ${forbidden}.`);
  }

  assert.strictEqual(launcher.resolveNpxCommand('win32'), 'npx.cmd');
  assert.strictEqual(launcher.resolveNpxCommand('linux'), 'npx');
  assert.strictEqual(launcher.resolveGhCommand('linux', {}), 'gh');
  assert.ok(launcher.resolveGhCommand('win32', process.env).toLowerCase().endsWith('gh.exe'));
  assert.strictEqual(launcher.resolveEasCliVersion(), easJson.cli.version);
  assert.match(easJson.cli.version, /^\d+\.\d+\.\d+$/);

  const options = launcher.parseLauncherArgs([
    '--profile',
    'route-discovery-qa',
    '--platform',
    'android',
    '--non-interactive',
    '--no-wait',
    '--clear-cache',
    '--verbose-logs',
    '--build-logger-level',
    'trace',
    '--message',
    'acceptance artifact',
  ]);
  const invocation = launcher.buildEasCommand(options, easJson.cli.version, 'win32');
  assert.strictEqual(invocation.command, 'npx.cmd');
  assert.deepStrictEqual(invocation.args.slice(0, 3), [
    '--yes',
    `eas-cli@${easJson.cli.version}`,
    'build',
  ]);
  assert.deepStrictEqual(invocation.args.slice(invocation.args.indexOf('--profile'), invocation.args.indexOf('--profile') + 2), [
    '--profile',
    'route-discovery-qa',
  ]);
  for (const flag of ['--non-interactive', '--no-wait', '--clear-cache', '--verbose-logs']) {
    assert.ok(invocation.args.includes(flag), `${flag} must be forwarded.`);
  }
  assert.deepStrictEqual(
    invocation.args.slice(invocation.args.indexOf('--build-logger-level'), invocation.args.indexOf('--build-logger-level') + 2),
    ['--build-logger-level', 'trace'],
  );
  assert.strictEqual(invocation.spawnOptions.shell, false);
  assert.strictEqual(invocation.spawnOptions.stdio, 'inherit');

  const cleanProvenance = {
    localSha: 'a'.repeat(40),
    branch: 'codex/example',
    sourceState: 'clean',
    remoteSha: 'a'.repeat(40),
    prHeadSha: 'a'.repeat(40),
  };
  assert.doesNotThrow(() => launcher.validateReleaseProvenance(cleanProvenance, options));
  assert.throws(
    () => launcher.validateReleaseProvenance({ ...cleanProvenance, sourceState: 'dirty' }, { ...options, allowDirty: true }),
    /dirty source/,
  );
  assert.throws(
    () => launcher.validateReleaseProvenance({ ...cleanProvenance, remoteSha: 'b'.repeat(40) }, options),
    /remote branch head/,
  );
  assert.throws(
    () => launcher.validateReleaseProvenance({ ...cleanProvenance, prHeadSha: 'b'.repeat(40) }, options),
    /pull request head/,
  );

  const manifest = launcher.createInvocationManifest({
    provenance: cleanProvenance,
    options,
    easCliVersion: easJson.cli.version,
    startTime: '2026-07-22T00:00:00.000Z',
    endTime: '2026-07-22T00:01:00.000Z',
    exitCode: 0,
  });
  assert.deepStrictEqual(manifest, {
    schemaVersion: 1,
    gitSha: cleanProvenance.localSha,
    sourceState: 'clean',
    profile: 'route-discovery-qa',
    platform: 'android',
    easCliVersion: easJson.cli.version,
    startTime: '2026-07-22T00:00:00.000Z',
    endTime: '2026-07-22T00:01:00.000Z',
    exitCode: 0,
  });

  const manifestHashBefore = sha256('android/app/src/main/AndroidManifest.xml');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-eas-launcher-test-'));
  const manifestOutput = path.join(tempDir, 'invocation.json');
  const secretSentinel = 'diagnostic-secret-sentinel';
  const printResult = spawnSync(
    process.execPath,
    [
      launcherPath,
      '--profile',
      'preview',
      '--platform',
      'android',
      '--allow-dirty',
      '--non-interactive',
      '--no-wait',
      '--build-logger-level',
      'debug',
      '--message',
      secretSentinel,
      '--manifest-output',
      manifestOutput,
      '--print-command',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_TOKEN: secretSentinel,
        EAS_ACCESS_TOKEN: secretSentinel,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: secretSentinel,
      },
      shell: false,
    },
  );
  assert.strictEqual(printResult.status, 0, printResult.stderr);
  assert.ok(printResult.stdout.includes(`eas-cli@${easJson.cli.version}`));
  assert.ok(printResult.stdout.includes('<redacted-build-message>'));
  assert.strictEqual(`${printResult.stdout}\n${printResult.stderr}`.includes(secretSentinel), false);
  assert.strictEqual(readFileSafe(manifestOutput).includes(secretSentinel), false);
  assert.strictEqual(sha256('android/app/src/main/AndroidManifest.xml'), manifestHashBefore);
  fs.rmSync(tempDir, { recursive: true, force: true });

  assert.strictEqual(packageJson.scripts['test:eas-build-launcher'], 'node ./scripts/test-eas-build-launcher.js');
  assert.ok(packageJson.scripts['android:fieldtest'].includes('eas-cloud-build-android-apk.mjs'));
  assert.ok(packageJson.scripts['android:route-discovery-qa'].includes('eas-cloud-build-android-apk.mjs'));

  assert.match(workflow, /^on:\n  workflow_dispatch: \{\}\n/m);
  for (const forbiddenTrigger of ['  push:', '  pull_request:', '  schedule:']) {
    assert.strictEqual(workflow.includes(forbiddenTrigger), false);
  }
  const artifactA = workflow.indexOf('  artifact_a:');
  const artifactB = workflow.indexOf('  artifact_b:');
  assert.ok(artifactA >= 0 && artifactB > artifactA, 'Artifact A must be declared before Artifact B.');
  assert.ok(workflow.includes('needs: [artifact_a]'));
  assert.ok(workflow.includes('profile: fieldtest'));
  assert.ok(workflow.includes('profile: route-discovery-qa'));
  for (const forbiddenJob of ['type: submit', 'type: deploy', 'type: release', 'supabase']) {
    assert.strictEqual(workflow.toLowerCase().includes(forbiddenJob), false);
  }

  console.log('Supported EAS build launcher and manual workflow checks passed (20 requirements).');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function readFileSafe(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}
