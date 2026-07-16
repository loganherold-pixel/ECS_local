const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function loadTypescriptModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output.outputText, filename);
  return loaded.exports;
}

async function main() {
  const permissions = loadTypescriptModule('lib/locationPermissions.ts');

  assert.strictEqual(
    permissions.normalizeForegroundLocationPermission({ status: 'granted' }).state,
    'granted',
  );
  assert.strictEqual(
    permissions.normalizeForegroundLocationPermission({ status: 'undetermined', canAskAgain: true }).state,
    'requestable',
  );
  assert.strictEqual(
    permissions.normalizeForegroundLocationPermission({ status: 'denied', canAskAgain: true }).state,
    'denied_requestable',
  );
  assert.strictEqual(
    permissions.normalizeForegroundLocationPermission({ status: 'denied', canAskAgain: false }).state,
    'blocked',
  );
  assert.strictEqual(
    permissions.normalizeForegroundLocationPermission({ status: 'restricted', canAskAgain: false }).state,
    'restricted',
  );
  assert.strictEqual(
    permissions.normalizeForegroundLocationPermission({ status: 'unavailable' }).state,
    'unavailable',
  );
  assert.strictEqual(
    permissions.resolveForegroundLocationPermissionRecoveryAction('denied_requestable', 'native'),
    'request_in_app',
  );
  assert.strictEqual(
    permissions.resolveForegroundLocationPermissionRecoveryAction('blocked', 'native'),
    'open_native_settings',
  );
  assert.strictEqual(
    permissions.resolveForegroundLocationPermissionRecoveryAction('blocked', 'web'),
    'request_in_app',
  );
  assert.strictEqual(
    permissions.resolveForegroundLocationPermissionRecoveryAction('unavailable', 'native'),
    'none',
  );

  let inspectCount = 0;
  let requestCount = 0;
  let releaseRequest;
  const requestableModule = {
    getForegroundPermissionsAsync: async () => {
      inspectCount += 1;
      return { status: 'undetermined', canAskAgain: true };
    },
    requestForegroundPermissionsAsync: () => {
      requestCount += 1;
      return new Promise((resolve) => {
        releaseRequest = resolve;
      });
    },
  };

  const inspectedStates = await Promise.all([
    permissions.inspectForegroundLocationPermission(requestableModule),
    permissions.inspectForegroundLocationPermission(requestableModule),
    permissions.inspectForegroundLocationPermission(requestableModule),
  ]);
  assert.deepStrictEqual(inspectedStates.map((item) => item.state), [
    'requestable',
    'requestable',
    'requestable',
  ]);
  assert.strictEqual(inspectCount, 3, 'Refocus/rerender inspection must not launch a permission request.');
  assert.strictEqual(requestCount, 0);

  const firstActivation = permissions.requestForegroundLocationPermission(requestableModule);
  const repeatedTap = permissions.requestForegroundLocationPermission(requestableModule);
  assert.strictEqual(requestCount, 1, 'Equivalent concurrent permission requests must be single-flight.');
  releaseRequest({ status: 'denied', canAskAgain: true });
  const [firstDenied, repeatedDenied] = await Promise.all([firstActivation, repeatedTap]);
  assert.strictEqual(firstDenied.state, 'denied_requestable');
  assert.strictEqual(repeatedDenied.state, 'denied_requestable');

  requestableModule.requestForegroundPermissionsAsync = async () => {
    requestCount += 1;
    return { status: 'granted', canAskAgain: true };
  };
  const retryResult = await permissions.requestForegroundLocationPermission(requestableModule);
  assert.strictEqual(retryResult.state, 'granted');
  assert.strictEqual(requestCount, 2, 'A later explicit Retry Permission action must issue a new request.');

  let grantedRequests = 0;
  const grantedModule = {
    getForegroundPermissionsAsync: async () => ({ status: 'granted', canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => {
      grantedRequests += 1;
      return { status: 'granted', canAskAgain: true };
    },
  };
  const granted = await permissions.ensureForegroundLocationPermission(grantedModule);
  assert.strictEqual(granted.status, 'granted');
  assert.strictEqual(grantedRequests, 0, 'Granted permission must never reopen the native controller.');

  let blockedRequests = 0;
  const blockedModule = {
    getForegroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: false }),
    requestForegroundPermissionsAsync: async () => {
      blockedRequests += 1;
      return { status: 'denied', canAskAgain: false };
    },
  };
  const blocked = await permissions.ensureForegroundLocationPermission(blockedModule);
  assert.strictEqual(blocked.canAskAgain, false);
  assert.strictEqual(blockedRequests, 0, 'Blocked permission must use Settings recovery, not another native request.');

  const sharedGps = read('lib', 'sharedGPSLocation.ts');
  const gpsHook = read('lib', 'useGPSLocation.ts');
  const headingHook = read('lib', 'useVehicleHeading.ts');
  const gpsDistanceTracker = read('lib', 'gpsDistanceTracker.ts');
  const convoyLocationPublisher = read('lib', 'convoy', 'convoyLocationPublisher.ts');
  const quickActions = read('components', 'QuickActionsSheet.tsx');
  const dispatchCommandCenter = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
  const navigateRun = read('app', 'navigate-run.tsx');
  const gpsOverlay = read('components', 'navigate', 'GPSStatusOverlay.tsx');
  const convoyMap = read('components', 'convoy', 'ConvoyCommandMap.tsx');
  const pkg = JSON.parse(read('package.json'));

  assert.ok(sharedGps.includes('inspectForegroundLocationPermission(Location)'));
  assert.ok(sharedGps.includes('requestForegroundLocationPermission(Location)'));
  assert.ok(sharedGps.includes('permissionRequestPromise'));
  assert.ok(sharedGps.includes("permissionState: 'unavailable'"));
  assert.ok(
    sharedGps.includes("position: snapshot.state === 'granted' ? this.state.position : null"),
    'Permission loss must remove the live GPS position instead of presenting it as current.',
  );
  assert.ok(
    sharedGps.includes('const subscription = await Location.watchPositionAsync(') &&
      sharedGps.includes('subscription.remove();') &&
      sharedGps.includes('activeOptions.highAccuracy !== options.highAccuracy'),
    'A superseded native watch must be removed before it can become the shared watcher.',
  );
  assert.strictEqual(sharedGps.includes('Location.requestForegroundPermissionsAsync()'), false);
  assert.ok(headingHook.includes('inspectForegroundLocationPermission(Location)'));
  assert.ok(
    headingHook.includes('permissionState?: ForegroundLocationPermissionState') &&
      headingHook.includes('[enabled, permissionState, updateAvailable, updateSource]') &&
      headingHook.includes('const nextSubscription = await Location.watchHeadingAsync(') &&
      headingHook.includes('nextSubscription.remove();'),
    'Heading observation must restart after the canonical permission state becomes granted.',
  );
  assert.strictEqual(headingHook.includes('ensureForegroundLocationPermission(Location)'), false);

  for (const [label, source] of [
    ['legacy useGPSLocation hook', gpsHook],
    ['GPS distance tracker', gpsDistanceTracker],
    ['convoy location publisher', convoyLocationPublisher],
    ['Quick Actions GPS shortcut', quickActions],
    ['Dispatch Recovery Assist GPS capture', dispatchCommandCenter],
    ['Navigate Run immediate GPS capture', navigateRun],
  ]) {
    assert.ok(
      source.includes('ensureForegroundLocationPermission(Location)'),
      `${label} should retain the shared explicit-workflow preflight helper.`,
    );
    assert.strictEqual(
      source.includes('Location.requestForegroundPermissionsAsync()'),
      false,
      `${label} must not directly invoke the native permission controller.`,
    );
  }

  assert.ok(gpsOverlay.includes("Platform.OS === 'web' ? 'web' : 'native'"));
  assert.ok(gpsOverlay.includes("'OPEN SETTINGS' : 'RETRY PERMISSION'"));
  assert.strictEqual(gpsOverlay.includes('accessibilityViewIsModal'), false);
  assert.strictEqual(convoyMap.includes('logoEnabled={false}'), false);
  assert.strictEqual(convoyMap.includes('attributionEnabled={false}'), false);
  assert.ok(convoyMap.includes('logoEnabled') && convoyMap.includes('attributionEnabled'));
  assert.ok(pkg.scripts['test:gps-permission-preflight']);

  console.log('GPS permission state, request dedupe, and native Mapbox compliance checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
