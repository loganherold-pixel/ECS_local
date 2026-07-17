const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const publisherPath = path.join(root, 'lib', 'convoy', 'convoyLocationPublisher.ts');
const packagePath = path.join(root, 'package.json');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === '@supabase/supabase-js') {
    return {
      createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
        },
        from: () => ({
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: {}, error: null }),
            }),
          }),
        }),
      }),
    };
  }
  if (request === 'expo-location') {
    return {
      Accuracy: { BestForNavigation: 6 },
      requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
      watchPositionAsync: async () => ({ remove: () => {} }),
    };
  }
  return originalLoad.apply(this, arguments);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function waitForAsyncCallback() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeFix(overrides = {}) {
  return {
    coords: {
      latitude: overrides.latitude ?? 38.781,
      longitude: overrides.longitude ?? -121.208,
      accuracy: overrides.accuracy ?? 8,
      heading: overrides.heading ?? 270,
      speed: overrides.speed ?? 2.4,
    },
    timestamp: overrides.timestamp ?? Date.now(),
  };
}

function makeBackend(options = {}) {
  const backend = {
    permission: options.permission || 'granted',
    user: options.user === undefined ? { id: 'user-1' } : options.user,
    publishedRows: [],
    watchCallback: null,
    watchOptions: null,
    removed: false,
    eligibility: options.eligibility || { ok: true, data: { allowed: true } },
    permissionRequested: false,
    watchStarted: false,
    isAvailable: () => options.available !== false,
    getCurrentUser: async () => {
      if (options.authThrows) throw new Error(options.authThrows);
      return backend.user;
    },
    requestForegroundPermission: async () => {
      if (options.permissionThrows) throw new Error(options.permissionThrows);
      backend.permissionRequested = true;
      options.onPermissionRequest?.();
      if (options.permissionPromise) return options.permissionPromise;
      return backend.permission;
    },
    watchPosition: async (watchOptions, callback) => {
      backend.watchStarted = true;
      backend.watchOptions = watchOptions;
      backend.watchCallback = callback;
      options.onWatchRequest?.();
      if (options.watchPromise) return options.watchPromise;
      return {
        remove: () => {
          backend.removed = true;
        },
      };
    },
    getHighAccuracySetting: () => 'best',
    validateSharingAllowed: async () => backend.eligibility,
    publishLocation: async (row) => {
      backend.publishedRows.push(row);
      return { ok: true, data: { id: 'location-row-1', updated_at: new Date().toISOString() } };
    },
  };

  return backend;
}

async function main() {
  const {
    ConvoyLocationPublisher,
    selectConvoyLocationSharingStateForOwner,
  } = require(publisherPath);

  const permissionDeniedBackend = makeBackend({ permission: 'denied' });
  const permissionDenied = new ConvoyLocationPublisher(permissionDeniedBackend);
  const deniedResult = await permissionDenied.startConvoyLocationSharing({
    convoyId: 'convoy-1',
    memberId: 'member-1',
  });
  assert.strictEqual(deniedResult.ok, false, 'permission denied should fail start.');
  assert.strictEqual(deniedResult.code, 'permission_denied');
  assert.strictEqual(permissionDeniedBackend.permissionRequested, true);
  assert.strictEqual(permissionDeniedBackend.watchStarted, false, 'permission denied should not start watchPositionAsync.');
  const deniedState = await permissionDenied.getConvoyLocationSharingState();
  assert.strictEqual(deniedState.permissionDenied, true);
  assert.strictEqual(deniedState.enabled, false);

  const noAuthBackend = makeBackend({ user: null });
  const noAuth = new ConvoyLocationPublisher(noAuthBackend);
  const noAuthResult = await noAuth.startConvoyLocationSharing({
    convoyId: 'convoy-1',
    memberId: 'member-1',
  });
  assert.strictEqual(noAuthResult.ok, false, 'no-auth start should fail.');
  assert.strictEqual(noAuthResult.code, 'auth_required');
  assert.strictEqual(noAuthBackend.permissionRequested, false, 'no-auth guard should run before location permission.');

  const authThrowBackend = makeBackend({ authThrows: 'Auth lookup failed.' });
  const authThrow = new ConvoyLocationPublisher(authThrowBackend);
  const authThrowResult = await authThrow.startConvoyLocationSharing({
    convoyId: 'convoy-1',
    memberId: 'member-1',
  });
  assert.strictEqual(authThrowResult.ok, false, 'auth lookup exceptions should fail cleanly.');
  assert.strictEqual(authThrowResult.code, 'backend_error');
  assert.strictEqual(authThrowBackend.permissionRequested, false, 'auth exceptions should not request location permission.');
  const authThrowState = await authThrow.getConvoyLocationSharingState();
  assert.strictEqual(authThrowState.enabled, false);
  assert.ok(String(authThrowState.lastError || '').includes('Auth lookup failed'));

  const permissionThrowBackend = makeBackend({ permissionThrows: 'Permission API unavailable.' });
  const permissionThrow = new ConvoyLocationPublisher(permissionThrowBackend);
  const permissionThrowResult = await permissionThrow.startConvoyLocationSharing({
    convoyId: 'convoy-1',
    memberId: 'member-1',
  });
  assert.strictEqual(permissionThrowResult.ok, false, 'permission exceptions should fail cleanly.');
  assert.strictEqual(permissionThrowResult.code, 'backend_error');
  assert.strictEqual(permissionThrowBackend.watchStarted, false);
  const permissionThrowState = await permissionThrow.getConvoyLocationSharingState();
  assert.strictEqual(permissionThrowState.enabled, false);
  assert.ok(String(permissionThrowState.lastError || '').includes('Permission API unavailable'));

  const missingMemberBackend = makeBackend();
  const missingMember = new ConvoyLocationPublisher(missingMemberBackend);
  const missingMemberResult = await missingMember.startConvoyLocationSharing({
    convoyId: 'convoy-1',
    memberId: '',
  });
  assert.strictEqual(missingMemberResult.ok, false, 'missing member id should fail.');
  assert.strictEqual(missingMemberResult.code, 'validation_error');
  assert.strictEqual(missingMemberBackend.watchStarted, false);

  const activeBackend = makeBackend();
  const active = new ConvoyLocationPublisher(activeBackend);
  const startResult = await active.startConvoyLocationSharing({
    convoyId: 'convoy-1',
    memberId: 'member-1',
    publishIntervalMs: 5000,
  });
  assert.strictEqual(startResult.ok, true, 'valid start should enable foreground sharing.');
  assert.strictEqual(activeBackend.watchStarted, true);
  assert.strictEqual(activeBackend.watchOptions.timeInterval, 5000);
  assert.strictEqual(startResult.data.ownerId, 'user-1');
  assert.strictEqual(
    selectConvoyLocationSharingStateForOwner(startResult.data, 'user-1'),
    startResult.data,
    'the owning account should receive its live-sharing state',
  );
  assert.strictEqual(
    selectConvoyLocationSharingStateForOwner(startResult.data, 'user-2'),
    null,
    'a different account must not receive persisted live-sharing state',
  );

  activeBackend.watchCallback(makeFix({ speed: 2.4 }));
  await waitForAsyncCallback();
  assert.strictEqual(activeBackend.publishedRows.length, 1, 'first location update should publish.');
  assert.strictEqual(activeBackend.publishedRows[0].convoy_id, 'convoy-1');
  assert.strictEqual(activeBackend.publishedRows[0].member_id, 'member-1');
  assert.strictEqual(activeBackend.publishedRows[0].movement_status, 'moving');
  assert.strictEqual(activeBackend.publishedRows[0].battery_percent, undefined, 'battery should be omitted when no safe API exists.');

  activeBackend.watchCallback(makeFix({ latitude: 38.782, speed: 0.1 }));
  await waitForAsyncCallback();
  assert.strictEqual(activeBackend.publishedRows.length, 1, 'second immediate update should be throttled.');

  const stopResult = await active.stopConvoyLocationSharing();
  assert.strictEqual(stopResult.ok, true);
  assert.strictEqual(activeBackend.removed, true, 'stop should remove the foreground location subscription.');
  activeBackend.watchCallback(makeFix({ latitude: 38.783, speed: 3.1 }));
  await waitForAsyncCallback();
  assert.strictEqual(activeBackend.publishedRows.length, 1, 'stopped publisher should not publish new updates.');

  const failedRestartBackend = makeBackend();
  const failedRestartPublisher = new ConvoyLocationPublisher(failedRestartBackend);
  const successfulInitialStart = await failedRestartPublisher.startConvoyLocationSharing({
    convoyId: 'convoy-before-restart',
    memberId: 'member-before-restart',
  });
  assert.strictEqual(successfulInitialStart.ok, true);
  failedRestartBackend.user = null;
  const failedRestart = await failedRestartPublisher.startConvoyLocationSharing({
    convoyId: 'convoy-after-restart',
    memberId: 'member-after-restart',
  });
  assert.strictEqual(failedRestart.ok, false);
  assert.strictEqual(failedRestart.code, 'auth_required');
  assert.strictEqual(failedRestartBackend.removed, true, 'a replacement start must remove the prior native watch before preflight.');
  failedRestartBackend.watchCallback(makeFix({ latitude: 38.799 }));
  await waitForAsyncCallback();
  assert.strictEqual(failedRestartBackend.publishedRows.length, 0, 'a failed restart must not leave the prior callback publishing.');
  const failedRestartState = await failedRestartPublisher.getConvoyLocationSharingState();
  assert.strictEqual(failedRestartState.enabled, false);

  const accountSwitchBackend = makeBackend();
  const accountSwitchPublisher = new ConvoyLocationPublisher(accountSwitchBackend);
  const accountSwitchStart = await accountSwitchPublisher.startConvoyLocationSharing({
    expectedOwnerId: 'user-1',
    convoyId: 'convoy-account-a',
    memberId: 'member-account-a',
  });
  assert.strictEqual(accountSwitchStart.ok, true);
  await accountSwitchPublisher.resetConvoyLocationSharingForAccountChange();
  const accountSwitchState = await accountSwitchPublisher.getConvoyLocationSharingState();
  assert.strictEqual(accountSwitchBackend.removed, true, 'account switch should remove the native location watch immediately.');
  assert.strictEqual(accountSwitchState.enabled, false);
  assert.strictEqual(accountSwitchState.ownerId, null);
  assert.strictEqual(accountSwitchState.convoyId, null);
  assert.strictEqual(accountSwitchState.memberId, null);
  assert.strictEqual(
    selectConvoyLocationSharingStateForOwner(accountSwitchState, 'user-2'),
    accountSwitchState,
    'a neutral cleared state is safe for the next account to observe',
  );

  const mismatchedStartBackend = makeBackend({ user: { id: 'user-a' } });
  const mismatchedStartPublisher = new ConvoyLocationPublisher(mismatchedStartBackend);
  const mismatchedStart = await mismatchedStartPublisher.startConvoyLocationSharing({
    expectedOwnerId: 'user-b',
    convoyId: 'convoy-b',
    memberId: 'member-b',
  });
  assert.strictEqual(mismatchedStart.ok, false, 'a raced account response must not start sharing for another UI owner.');
  assert.strictEqual(mismatchedStart.code, 'auth_required');
  assert.strictEqual(mismatchedStartBackend.permissionRequested, false);
  assert.strictEqual(mismatchedStartBackend.watchStarted, false);

  let resolveDeferredPermission;
  let signalPermissionRequested;
  const deferredPermissionRequested = new Promise((resolve) => {
    signalPermissionRequested = resolve;
  });
  const deferredPermission = new Promise((resolve) => {
    resolveDeferredPermission = resolve;
  });
  const deferredPermissionBackend = makeBackend({
    permissionPromise: deferredPermission,
    onPermissionRequest: signalPermissionRequested,
  });
  const deferredPermissionPublisher = new ConvoyLocationPublisher(deferredPermissionBackend);
  const deferredPermissionStart = deferredPermissionPublisher.startConvoyLocationSharing({
    expectedOwnerId: 'user-1',
    convoyId: 'convoy-deferred-permission',
    memberId: 'member-deferred-permission',
  });
  await deferredPermissionRequested;
  await deferredPermissionPublisher.resetConvoyLocationSharingForAccountChange();
  resolveDeferredPermission('granted');
  const deferredPermissionResult = await deferredPermissionStart;
  assert.strictEqual(deferredPermissionResult.ok, false);
  assert.strictEqual(deferredPermissionResult.code, 'tracking_disabled');
  assert.strictEqual(deferredPermissionBackend.watchStarted, false, 'a reset during permission must prevent a late native watch.');
  const deferredPermissionState = await deferredPermissionPublisher.getConvoyLocationSharingState();
  assert.strictEqual(deferredPermissionState.enabled, false);
  assert.strictEqual(deferredPermissionState.ownerId, null);

  let resolveDeferredWatch;
  let signalWatchRequested;
  let deferredWatchRemoved = false;
  const deferredWatchRequested = new Promise((resolve) => {
    signalWatchRequested = resolve;
  });
  const deferredWatch = new Promise((resolve) => {
    resolveDeferredWatch = resolve;
  });
  const deferredWatchBackend = makeBackend({
    watchPromise: deferredWatch,
    onWatchRequest: signalWatchRequested,
  });
  const deferredWatchPublisher = new ConvoyLocationPublisher(deferredWatchBackend);
  const deferredWatchStart = deferredWatchPublisher.startConvoyLocationSharing({
    expectedOwnerId: 'user-1',
    convoyId: 'convoy-deferred-watch',
    memberId: 'member-deferred-watch',
  });
  await deferredWatchRequested;
  await deferredWatchPublisher.resetConvoyLocationSharingForAccountChange();
  resolveDeferredWatch({
    remove: () => {
      deferredWatchRemoved = true;
    },
  });
  const deferredWatchResult = await deferredWatchStart;
  assert.strictEqual(deferredWatchResult.ok, false);
  assert.strictEqual(deferredWatchResult.code, 'tracking_disabled');
  assert.strictEqual(deferredWatchRemoved, true, 'a native watch resolving after reset must be removed immediately.');
  const deferredWatchState = await deferredWatchPublisher.getConvoyLocationSharingState();
  assert.strictEqual(deferredWatchState.enabled, false);
  assert.strictEqual(deferredWatchState.ownerId, null);

  const publishAuthBackend = makeBackend();
  const publishAuth = new ConvoyLocationPublisher(publishAuthBackend);
  const publishAuthStart = await publishAuth.startConvoyLocationSharing({
    convoyId: 'convoy-2',
    memberId: 'member-2',
  });
  assert.strictEqual(publishAuthStart.ok, true);
  publishAuthBackend.user = null;
  publishAuthBackend.watchCallback(makeFix({ speed: 1.2 }));
  await waitForAsyncCallback();
  assert.strictEqual(publishAuthBackend.publishedRows.length, 0, 'publisher should not send location after auth disappears.');
  const publishAuthState = await publishAuth.getConvoyLocationSharingState();
  assert.ok(
    String(publishAuthState.lastError || publishAuthState.lastStopReason || '').includes('Auth session ended'),
    'no-auth publish guard should leave visible local error state.',
  );
  assert.strictEqual(publishAuthState.enabled, false, 'auth-ended publish guard should stop local sharing.');

  const revokedBackend = makeBackend({
    eligibility: { ok: false, code: 'sharing_not_allowed', error: 'Convoy membership was revoked. Live sharing stopped.' },
  });
  const revoked = new ConvoyLocationPublisher(revokedBackend);
  const revokedStart = await revoked.startConvoyLocationSharing({
    convoyId: 'convoy-3',
    memberId: 'member-3',
  });
  assert.strictEqual(revokedStart.ok, true);
  revokedBackend.watchCallback(makeFix({ speed: 1.2 }));
  await waitForAsyncCallback();
  assert.strictEqual(revokedBackend.publishedRows.length, 0, 'revoked member cannot keep publishing.');
  assert.strictEqual(revokedBackend.removed, true, 'revoked member should trigger automatic local stop.');
  const revokedState = await revoked.getConvoyLocationSharingState();
  assert.strictEqual(revokedState.enabled, false);
  assert.ok(String(revokedState.lastStopReason || '').includes('revoked'));

  const source = fs.readFileSync(publisherPath, 'utf8');
  assert.ok(source.includes("import('expo-location')"), 'publisher should use expo-location lazily.');
  assert.ok(source.includes('ensureForegroundLocationPermission'), 'publisher should preflight foreground permission before requesting.');
  assert.ok(source.includes('watchPositionAsync'), 'publisher should use watchPositionAsync.');
  assert.ok(source.includes('tracking_disabled'), 'publisher should guard disabled tracking.');
  assert.ok(source.includes('movementStatusOverride'), 'publisher should expose future needs_assistance override path.');
  assert.ok(!source.includes('requestBackgroundPermissionsAsync'), 'publisher should not silently enable background location.');
  assert.ok(!source.includes('TaskManager'), 'publisher should not define background tasks before UI/product opt-in.');
  assert.ok(source.includes('validateSharingAllowed'), 'publisher should validate active membership before publishing.');
  assert.ok(source.includes('Auth session ended. Live sharing stopped.'), 'publisher should locally stop when auth session ends.');
  assert.strictEqual(
    /console\.(log|warn|error|debug)\([^)]*(latitude|longitude|rawCode|EXPO_PUBLIC_MAPBOX_TOKEN)/.test(source),
    false,
    'publisher should not log precise coordinates, raw invite codes, or tokens.',
  );

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.ok(pkg.scripts['test:convoy-location-publisher'], 'package.json should expose convoy location publisher tests.');

  console.log('convoy location publisher tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
