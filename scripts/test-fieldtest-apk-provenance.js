const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
const easIgnore = read('.easignore');

assertIncludes(appConfig, 'buildFingerprint', 'Expo config should expose a buildFingerprint in extra.');
assertIncludes(appConfig, 'ECS_BUILD_COMMIT_SHA', 'Build fingerprint should accept an explicit commit SHA from the build environment.');
assertIncludes(appConfig, 'ECS_BUILD_DIRTY', 'Build fingerprint should preserve a dirty/clean flag.');
assertIncludes(appConfig, 'ECS_BUILD_PROFILE', 'Build fingerprint should preserve the EAS/profile name.');
assertIncludes(appConfig, 'updates.enabled = false', 'Field-test APK config should disable OTA updates so cached JS cannot mask the embedded bundle.');
assertIncludes(appConfig, "profile === 'fieldtest'", 'OTA disabling should be scoped to the field-test profile.');

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
assertIncludes(buildScript, 'ECS_EAS_NO_VCS', 'Cloud APK helper should make no-VCS mode an explicit opt-in.');
assert.ok(
  !buildScript.includes('process.env.EAS_NO_VCS || "1"'),
  'Cloud APK helper must preserve EAS VCS provenance by default.',
);

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
