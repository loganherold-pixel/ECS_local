const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function load(relativePath) {
  return require(path.join(root, relativePath));
}

const manifest = load('lib/routeManifest.ts');
const features = load('lib/features/featureVisibilityRegistry.ts');
const policy = load('lib/navigation/ecsRoutePolicy.ts');
const coordinator = load('lib/navigation/ecsNavigationCoordinator.ts');
const bluetoothNavigation = load('lib/bluetoothCommandNavigation.ts');
const { resolveDistributionEntryState } = load('lib/auth/distributionEntryResolver.ts');

const canonicalRoute = bluetoothNavigation.UNIFIED_BLUETOOTH_COMMAND_ROUTE;
const redirectAliases = ['/power', '/power/setup', '/obd-setup'];
const vehicleSpecificRoutes = ['/power/devices', '/power/manage', '/vehicle-telemetry-settings'];
const unrelatedPreSetupRoutes = ['/navigate-run', '/vehicle-config', '/safety'];
const primarySources = ['/fleet', '/navigate', '/dashboard', '/discover', '/alert'];

function featureContext(overrides = {}) {
  return features.createRuntimeFeatureVisibilityContext({
    environment: 'production',
    env: {},
    online: true,
    authenticated: true,
    hasFullAccess: true,
    backends: {},
    providers: {},
    hardware: { bluetooth: 'available' },
    permissions: { bluetooth: 'available' },
    ...overrides,
  });
}

function routeContext(overrides = {}) {
  return {
    authenticated: true,
    shellAccessReady: true,
    setupComplete: false,
    hasConfiguredVehicle: false,
    offline: false,
    featureContext: featureContext(),
    ...overrides,
  };
}

function coldEntry(requestedEntryRoute) {
  return resolveDistributionEntryState({
    currentPath: '/',
    isLoading: false,
    authenticated: true,
    guestOfflineAccess: false,
    rememberedOfflineAccess: false,
    accessState: null,
    offlineMode: false,
    setupComplete: false,
    setupRecoveryRequired: true,
    restorableShellRoute: null,
    requestedEntryRoute,
    isAuthScreen: true,
    isRecoveryScreen: false,
    recoveryMode: 'unknown',
    isLoginScreen: false,
    isSetupScreen: false,
    preserveSetupRoute: false,
    isProtectedScreen: false,
    bootstrapError: null,
  });
}

function mountedEntry(overrides = {}) {
  return resolveDistributionEntryState({
    currentPath: canonicalRoute,
    isLoading: false,
    authenticated: true,
    guestOfflineAccess: false,
    rememberedOfflineAccess: false,
    accessState: null,
    offlineMode: false,
    setupComplete: false,
    setupRecoveryRequired: true,
    restorableShellRoute: null,
    requestedEntryRoute: null,
    isAuthScreen: false,
    isRecoveryScreen: false,
    recoveryMode: 'unknown',
    isLoginScreen: false,
    isSetupScreen: false,
    preserveSetupRoute: false,
    isProtectedScreen: false,
    bootstrapError: null,
    ...overrides,
  });
}

assert.equal(canonicalRoute, '/power/blu');
assert.equal(manifest.getRouteMetadata(canonicalRoute)?.setupRequirement, 'none');
assert.equal(manifest.getPrimaryTabForPath(canonicalRoute)?.id, 'dashboard');

const completedSetupWithoutVehicle = policy.resolveECSRoutePolicy({
  path: canonicalRoute,
  intent: 'navigate',
  context: routeContext({ setupComplete: true, hasConfiguredVehicle: false }),
});
assert.equal(completedSetupWithoutVehicle.allowed, true);
assert.equal(completedSetupWithoutVehicle.targetPath, canonicalRoute);
assert.notEqual(completedSetupWithoutVehicle.targetPath, '/fleet');

for (const route of [canonicalRoute, ...redirectAliases]) {
  const metadata = manifest.getRouteMetadata(route);
  assert.ok(metadata, `${route} must remain registered.`);
  assert.equal(metadata.setupRequirement, 'none', `${route} must remain usable without a vehicle.`);
  assert.equal(metadata.allowPreSetupEntry, true, `${route} must retain explicit cold-entry eligibility.`);

  const decision = policy.resolveECSRoutePolicy({
    path: route,
    intent: 'navigate',
    context: routeContext(),
  });
  assert.equal(decision.allowed, true, `${route} must not be intercepted by vehicle setup.`);
  assert.equal(decision.targetPath, route);
  assert.notEqual(decision.targetPath, '/fleet');

  const hydration = coldEntry(route);
  assert.equal(hydration.redirectTarget, route, `Cold hydration must retain ${route}.`);
  assert.notEqual(hydration.redirectTarget, '/fleet');
}

assert.equal(mountedEntry().redirectTarget, null, 'Mounted BlueStack must survive vehicle-recovery hydration.');
assert.equal(
  mountedEntry({ setupComplete: true, setupRecoveryRequired: false }).redirectTarget,
  null,
  'Completing hydration while BlueStack is active must not emit a redirect.',
);

for (const route of unrelatedPreSetupRoutes) {
  assert.equal(
    coldEntry(route).redirectTarget,
    '/fleet',
    `${route} must not gain BlueStack's explicit pre-setup entry exception.`,
  );
}

for (const route of vehicleSpecificRoutes) {
  assert.equal(
    manifest.getRouteMetadata(route)?.setupRequirement,
    'configured_vehicle',
    `${route} must retain its genuine vehicle requirement.`,
  );
  const decision = policy.resolveECSRoutePolicy({
    path: route,
    intent: 'navigate',
    context: routeContext(),
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'vehicle_required');
  assert.equal(
    coldEntry(route).redirectTarget,
    '/fleet',
    `${route} must not bypass vehicle recovery during cold hydration.`,
  );
}

for (const [featureOverrides, expectedReason] of [
  [{ permissions: { bluetooth: 'unavailable' } }, 'permission_required'],
  [{ hardware: { bluetooth: 'unavailable' } }, 'hardware_unavailable'],
  [{ online: false }, 'enabled'],
]) {
  const decision = policy.resolveECSRoutePolicy({
    path: canonicalRoute,
    intent: 'navigate',
    context: routeContext({
      offline: featureOverrides.online === false,
      featureContext: featureContext(featureOverrides),
    }),
  });
  assert.equal(decision.allowed, true, 'Bluetooth degraded states must remain in-page BlueStack states.');
  assert.equal(decision.readOnly, true);
  assert.equal(decision.targetPath, canonicalRoute);
  assert.notEqual(decision.targetPath, '/fleet');
  assert.equal(decision.featureAccess?.decision?.reason, expectedReason);
}

const killedDecision = policy.resolveECSRoutePolicy({
  path: canonicalRoute,
  intent: 'navigate',
  context: routeContext({
    setupComplete: true,
    hasConfiguredVehicle: true,
    featureContext: featureContext({
      env: { EXPO_PUBLIC_ECS_KILL_BLUETOOTH_OBD: 'true' },
    }),
  }),
});
assert.equal(killedDecision.allowed, false, 'The central Bluetooth kill switch must retain precedence.');
assert.equal(killedDecision.reason, 'feature_unavailable');
assert.equal(killedDecision.featureAccess?.decision?.reason, 'kill_switch');

for (const sourcePath of primarySources) {
  coordinator.resetECSNavigationCoordinatorForTests();
  const pushes = [];
  const router = {
    push(target) {
      pushes.push(target);
    },
    replace() {
      assert.fail('BlueStack header navigation must not replace the tab stack.');
    },
  };

  assert.equal(
    bluetoothNavigation.openUnifiedBluetoothCommand(router, { returnTo: sourcePath }),
    true,
    `${sourcePath} should open BlueStack.`,
  );
  assert.equal(
    bluetoothNavigation.openUnifiedBluetoothCommand(router, { returnTo: sourcePath }),
    true,
    `${sourcePath} duplicate press should be safely absorbed.`,
  );
  assert.equal(pushes.length, 1, `${sourcePath} must emit one navigation action.`);
  assert.deepEqual(pushes[0], {
    pathname: canonicalRoute,
    params: { returnTo: sourcePath },
  });
  assert.notEqual(pushes[0]?.pathname ?? pushes[0], '/fleet');
  assert.equal(coordinator.settleECSNavigation(canonicalRoute), true);
  assert.equal(manifest.getSafeReturnRoute(canonicalRoute, sourcePath), sourcePath);
}

coordinator.resetECSNavigationCoordinatorForTests();
let unavailableCount = 0;
assert.equal(
  bluetoothNavigation.openUnifiedBluetoothCommand(
    { push() { throw new Error('navigation unavailable'); } },
    {
      returnTo: '/navigate',
      onUnavailable: () => { unavailableCount += 1; },
    },
  ),
  false,
);
assert.equal(unavailableCount, 1);
assert.equal(coordinator.getECSNavigationSnapshot(), null, 'Failed navigation must release the single-flight lock.');

const mountedCallers = [
  'components/Header.tsx',
  'components/dashboard/DashboardHeader.tsx',
  'app/(tabs)/dashboard.tsx',
  'components/dispatch/DispatchCadCommandCenter.tsx',
];
for (const relativePath of mountedCallers) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert.match(source, /openUnifiedBluetoothCommand\(router,\s*\{/);
  assert.match(source, /returnTo:\s*pathname/);
}

const scannerSource = fs.readFileSync(path.join(root, 'app/power/blu.tsx'), 'utf8');
assert.match(scannerSource, /const \{ back: goBack \} = useECSNavigation\(\)/);
assert.match(scannerSource, /const handleBackPress = useCallback\(\(\) => \{[\s\S]*?goBack\(\);/);
assert.doesNotMatch(scannerSource, /router\.back\(\)/);

console.log('BlueStack canonical navigation behavior checks passed.');
