const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function loadTypescriptModule(relativePath) {
  const filename = path.join(root, relativePath);
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output.outputText, filename);
  return loaded.exports;
}

const permissions = loadTypescriptModule('lib/locationPermissions.ts');
const state = (response, extra = {}) => permissions.resolveApplicationLocationPermissionState({
  permission: permissions.normalizeForegroundLocationPermission(response),
  ...extra,
});

assert.strictEqual(state({ status: 'denied', canAskAgain: true }), 'denied_requestable');
assert.strictEqual(state({ status: 'denied', canAskAgain: false }), 'denied_permanent_or_settings_required');
assert.strictEqual(state({ status: 'granted', android: { accuracy: 'coarse' } }), 'approximate_granted');
assert.strictEqual(state({ status: 'granted', android: { accuracy: 'fine' } }), 'precise_granted');
assert.strictEqual(state({ status: 'granted', ios: { scope: 'whenInUse' } }), 'precise_granted');
assert.strictEqual(state({ status: 'granted' }, { servicesEnabled: false }), 'services_disabled');
assert.strictEqual(state({ status: 'denied', canAskAgain: true }, { requestError: true }), 'request_error');
assert.strictEqual(state({ status: 'denied', canAskAgain: true }, { requesting: true }), 'requesting');

const shared = read('lib/sharedGPSLocation.ts');
const discover = read('app/(tabs)/discover.tsx');
assert.ok(shared.includes("Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS')"));
assert.ok(shared.includes('Linking.openSettings()'));
assert.ok(shared.includes("nextState === 'active'"));
assert.ok(shared.includes("category: 'permission_request_error'"));
assert.strictEqual(
  shared.includes("[GPS SHARED] Permission request failed', {\n        error:"),
  false,
);
for (const testId of [
  'explore-retry-location-permission',
  'explore-open-app-settings',
  'explore-open-location-settings',
  'explore-location-permission-status',
]) assert.ok(discover.includes(testId));
assert.ok(discover.includes("locationRecoveryState !== 'precise_granted'"));
assert.ok(discover.includes('CHOOSE AREA'));

console.log('Location permission recovery state, actions, lifecycle, privacy, Android 16, and iOS mapping checks passed.');
