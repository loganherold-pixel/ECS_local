const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

const appConfigPath = path.join(root, 'app.config.js');
assert.ok(fs.existsSync(appConfigPath), 'Expo builds should use app.config.js to stamp dynamic build provenance.');

const appConfig = read('app.config.js');
const packageJson = readJson('package.json');
const easJson = readJson('eas.json');
const appJson = readJson('app.json');
const moreScreen = read('app/(tabs)/more.tsx');
const buildScript = read('scripts/eas-cloud-build-android-apk.mjs');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const androidBuildGradle = read('android/app/build.gradle');
const androidGradlew = read('android/gradlew');
const androidGradlewBat = read('android/gradlew.bat');
const mapboxEnvGuardPath = path.join(root, 'scripts', 'check-fieldtest-mapbox-token-split.mjs');
const mapboxEnvGuard = fs.existsSync(mapboxEnvGuardPath)
  ? read('scripts/check-fieldtest-mapbox-token-split.mjs')
  : '';
const easIgnore = read('.easignore');

assertIncludes(appConfig, 'buildFingerprint', 'Expo config should expose a buildFingerprint in extra.');
assertIncludes(appConfig, 'ECS_BUILD_COMMIT_SHA', 'Build fingerprint should accept an explicit commit SHA from the build environment.');
assertIncludes(appConfig, 'ECS_BUILD_DIRTY', 'Build fingerprint should preserve a dirty/clean flag.');
assertIncludes(appConfig, 'ECS_BUILD_PROFILE', 'Build fingerprint should preserve the EAS/profile name.');
assertIncludes(appConfig, 'updates.enabled = false', 'Field-test APK config should disable OTA updates so cached JS cannot mask the embedded bundle.');
assertIncludes(appConfig, "profile === 'fieldtest'", 'OTA disabling should be scoped to the field-test profile.');
assertIncludes(
  androidManifest,
  'expo.modules.updates.ENABLED" android:value="false"',
  'Checked-in local Android QA APK manifest should disable OTA updates so emulator evidence uses the embedded bundle.',
);
assertIncludes(
  androidManifest,
  'expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH" android:value="NEVER"',
  'Checked-in local Android QA APK manifest should not check Expo Updates during startup.',
);
assertIncludes(
  androidBuildGradle,
  'nodeExecutableAndArgs = [',
  'Local Android release bundling should set NODE_ENV=production explicitly so production APK evidence is repeatable.',
);
assertIncludes(
  androidBuildGradle,
  "const path = require('path'); process.env.NODE_ENV = process.env.NODE_ENV || 'production'; require(path.resolve(process.argv[1]));",
  'Local Android release bundling should inject NODE_ENV before Expo CLI reads env files.',
);
assertIncludes(
  androidGradlewBat,
  'if not errorlevel 1 set NODE_ENV=production',
  'Windows Gradle release wrapper should provide NODE_ENV before config-time Expo tasks run.',
);
assertIncludes(
  androidGradlew,
  'NODE_ENV=${NODE_ENV:-production}; export NODE_ENV',
  'POSIX Gradle release wrapper should provide NODE_ENV before config-time Expo tasks run.',
);

assert.ok(
  Number(appJson.expo?.android?.versionCode) >= 4,
  'Android versionCode should be bumped for the next field-test APK.',
);
assert.ok(
  packageJson.scripts['android:fieldtest']?.includes('--clear-cache'),
  'android:fieldtest should build with --clear-cache.',
);
assert.ok(
  packageJson.scripts['test:fieldtest-apk-provenance'] === 'node ./scripts/test-fieldtest-apk-provenance.js',
  'Package scripts should expose the field-test provenance check.',
);

assert.strictEqual(easJson.build.fieldtest.channel, 'fieldtest', 'Field-test APKs should use a distinct fieldtest update channel.');
assert.strictEqual(easJson.build.fieldtest.autoIncrement, true, 'Field-test profile should auto-increment native versions.');
assert.strictEqual(
  easJson.build.fieldtest.env.EXPO_PUBLIC_ECS_FIELD_TEST_BUILD,
  'true',
  'Field-test profile should identify itself to runtime config.',
);

assertIncludes(buildScript, 'resolveProfileArg', 'Cloud APK helper should support selecting the exact EAS profile.');
assertIncludes(buildScript, 'ECS_BUILD_COMMIT_SHA', 'Cloud APK helper should stamp the commit SHA into the build env.');
assertIncludes(buildScript, 'ECS_BUILD_TIME', 'Cloud APK helper should stamp a build time into the build env.');
assertIncludes(buildScript, 'ECS_BUILD_DIRTY', 'Cloud APK helper should stamp dirty state into the build env.');
assertIncludes(buildScript, '"--clear-cache"', 'Cloud APK helper should always pass --clear-cache.');
assertIncludes(
  buildScript,
  'check-fieldtest-mapbox-token-split.mjs',
  'Cloud APK helper should run the field-test Mapbox token split guard before uploading to EAS.',
);
assertIncludes(
  appConfig,
  'assertFieldtestRuntimeMapboxToken',
  'Field-test Expo config should reject secret/download Mapbox tokens before bundling runtime config.',
);
assertIncludes(
  appConfig,
  'EXPO_PUBLIC_MAPBOX_TOKEN',
  'Field-test Expo config should explicitly validate EXPO_PUBLIC_MAPBOX_TOKEN.',
);
assertIncludes(
  appConfig,
  "startsWith('pk.')",
  'Field-test runtime Mapbox token guard should require a public pk.* token.',
);
assertIncludes(
  appConfig,
  "startsWith('sk.')",
  'Field-test runtime Mapbox token guard should call out secret sk.* token shape without printing token values.',
);
assertIncludes(
  mapboxEnvGuard,
  'MAPBOX_DOWNLOADS_TOKEN',
  'Field-test Mapbox token split guard should distinguish the build-only downloads token.',
);
assertIncludes(
  mapboxEnvGuard,
  'describeTokenShape',
  'Field-test Mapbox token split guard should report token shape instead of raw token values.',
);

function runMapboxEnvGuard(envOverrides) {
  return spawnSync(
    process.execPath,
    [
      path.join(root, 'scripts', 'check-fieldtest-mapbox-token-split.mjs'),
      '--require-runtime-env',
      '--require-build-env',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_PUBLIC_MAPBOX_TOKEN: '',
        EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: '',
        MAPBOX_DOWNLOADS_TOKEN: '',
        ...envOverrides,
      },
    },
  );
}

const validSplit = runMapboxEnvGuard({
  EXPO_PUBLIC_MAPBOX_TOKEN: 'pk.test-public-runtime-token',
  MAPBOX_DOWNLOADS_TOKEN: 'sk.test-downloads-token',
});
assert.strictEqual(validSplit.status, 0, validSplit.stderr || validSplit.stdout);
assert.match(validSplit.stdout, /runtimeTokenShape=pk\.\*/);
assert.match(validSplit.stdout, /downloadsTokenShape=sk\.\*/);
assert.ok(
  !validSplit.stdout.includes('pk.test-public-runtime-token') &&
    !validSplit.stdout.includes('sk.test-downloads-token'),
  'Field-test Mapbox token split guard must not print token values for valid env.',
);

const secretRuntime = runMapboxEnvGuard({
  EXPO_PUBLIC_MAPBOX_TOKEN: 'sk.secret-runtime-token',
  MAPBOX_DOWNLOADS_TOKEN: 'sk.test-downloads-token',
});
assert.notStrictEqual(secretRuntime.status, 0, 'sk.* runtime Mapbox tokens should fail field-test provenance.');
assert.match(secretRuntime.stderr + secretRuntime.stdout, /EXPO_PUBLIC_MAPBOX_TOKEN must be a public pk\.\* token/);
assert.match(secretRuntime.stderr + secretRuntime.stdout, /runtimeTokenShape=sk\.\*/);
assert.ok(
  !(secretRuntime.stderr + secretRuntime.stdout).includes('sk.secret-runtime-token'),
  'Field-test Mapbox token split guard must not print rejected sk.* runtime token values.',
);

const missingRuntime = runMapboxEnvGuard({
  MAPBOX_DOWNLOADS_TOKEN: 'sk.test-downloads-token',
});
assert.notStrictEqual(missingRuntime.status, 0, 'Missing public runtime Mapbox token should fail field-test provenance.');
assert.match(missingRuntime.stderr + missingRuntime.stdout, /EXPO_PUBLIC_MAPBOX_TOKEN is required/);

const sharedToken = runMapboxEnvGuard({
  EXPO_PUBLIC_MAPBOX_TOKEN: 'pk.same-token',
  MAPBOX_DOWNLOADS_TOKEN: 'pk.same-token',
});
assert.notStrictEqual(sharedToken.status, 0, 'Runtime and downloads Mapbox tokens must not be the same value.');
assert.match(sharedToken.stderr + sharedToken.stdout, /must not match MAPBOX_DOWNLOADS_TOKEN/);

for (const ignoredPath of [
  'apps/web/.next/',
  '.worktrees/',
  '.cleanup-quarantine/',
  '.cleanup-safety/',
  '.ruff_cache/',
  '.expo-home/',
  'android/.gradle-codex/',
]) {
  assertIncludes(
    easIgnore,
    ignoredPath,
    `Field-test APK archive should exclude local/generated ${ignoredPath} payloads.`,
  );
}

assertIncludes(moreScreen, 'getEcsBuildFingerprint', 'More > Settings should read the visible ECS build fingerprint.');
assertIncludes(moreScreen, 'Build Fingerprint', 'More > Settings should display a Build Fingerprint row/card.');
assertIncludes(moreScreen, 'Dirty flag', 'Build fingerprint UI should show whether the source tree was dirty.');
assertIncludes(moreScreen, 'Profile', 'Build fingerprint UI should show the build profile.');
assertIncludes(moreScreen, 'Commit', 'Build fingerprint UI should show the commit SHA.');

console.log('Field-test APK provenance contract passed.');
