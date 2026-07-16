const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web' },
      InteractionManager: {
        runAfterInteractions(callback) {
          callback();
          return { cancel() {} };
        },
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

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

const load = (relativePath) => require(path.join(root, relativePath));
const manifest = load('lib/routeManifest.ts');
const features = load('lib/features/featureVisibilityRegistry.ts');
const policy = load('lib/navigation/ecsRoutePolicy.ts');
const entry = load('lib/auth/distributionEntryResolver.ts');
const coordinator = load('lib/navigation/ecsNavigationCoordinator.ts');

function featureContext() {
  return features.createRuntimeFeatureVisibilityContext({
    environment: 'production',
    env: {},
    online: true,
    authenticated: true,
    hasFullAccess: true,
    isAdmin: false,
    backends: { supabase: 'available' },
    providers: {},
    hardware: { bluetooth: 'available', gps: 'available' },
    permissions: { bluetooth: 'available', location: 'available' },
    privacyApprovals: new Set(),
    productionEvidence: new Set(),
  });
}

function routeContext(overrides = {}) {
  return {
    authenticated: true,
    shellAccessReady: true,
    setupComplete: true,
    hasConfiguredVehicle: true,
    offline: false,
    featureContext: featureContext(),
    ...overrides,
  };
}

function entryState(overrides = {}) {
  return entry.resolveDistributionEntryState({
    currentPath: '/dashboard',
    isLoading: false,
    authenticated: true,
    guestOfflineAccess: false,
    rememberedOfflineAccess: false,
    accessState: null,
    offlineMode: false,
    setupComplete: true,
    setupRecoveryRequired: false,
    startupSessionRestored: true,
    restorableShellRoute: '/dashboard',
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

const dashboardMetadata = manifest.getRouteMetadata('/dashboard');
assert(dashboardMetadata, 'Dashboard must remain registered.');
assert.strictEqual(
  dashboardMetadata.setupRequirement,
  'none',
  'The primary Dashboard is an operational shell surface, not a configured-vehicle route.',
);
assert.strictEqual(manifest.getPrimaryTabForPath('/dashboard')?.id, 'dashboard');
assert.strictEqual(manifest.normalizeECSRoutePath('/(tabs)/dashboard'), '/dashboard');

for (const sourcePath of ['/fleet', '/navigate', '/discover', '/alert']) {
  coordinator.resetECSNavigationCoordinatorForTests();
  const first = coordinator.acquireECSNavigation({
    sourcePath,
    targetPath: '/dashboard',
    method: 'navigate',
  }, 1_000);
  const duplicate = coordinator.acquireECSNavigation({
    sourcePath,
    targetPath: '/dashboard',
    method: 'navigate',
  }, 1_001);

  assert.deepStrictEqual(
    { accepted: first.accepted, targetPath: first.targetPath },
    { accepted: true, targetPath: '/dashboard' },
    `${sourcePath} must emit one canonical Dashboard navigation.`,
  );
  assert.strictEqual(
    duplicate.status,
    'duplicate',
    `${sourcePath} duplicate Dashboard taps must share the in-flight transition.`,
  );
  assert.strictEqual(coordinator.settleECSNavigation('/dashboard'), true);
}

const coldMount = entryState({
  isLoading: true,
  setupComplete: false,
  setupRecoveryRequired: true,
  restorableShellRoute: null,
});
assert.strictEqual(coldMount.redirectTarget, null, 'Cold Dashboard mount must wait without redirecting.');

const coldRestore = entryState({
  currentPath: '/',
  setupComplete: false,
  setupRecoveryRequired: true,
  restorableShellRoute: '/dashboard',
});
assert.deepStrictEqual(
  {
    redirectTarget: coldRestore.redirectTarget,
    destinationSource: coldRestore.destinationSource,
    routeRestoreEligible: coldRestore.routeRestoreEligible,
  },
  {
    redirectTarget: '/dashboard',
    destinationSource: 'restored_shell_route',
    routeRestoreEligible: true,
  },
  'Cold startup restoration must honor the saved Dashboard before vehicle-recovery fallback.',
);

const incompleteSetupRestore = entryState({
  currentPath: '/',
  setupComplete: false,
  setupRecoveryRequired: false,
  restorableShellRoute: '/navigate',
});
assert.deepStrictEqual(
  {
    redirectTarget: incompleteSetupRestore.redirectTarget,
    destinationSource: incompleteSetupRestore.destinationSource,
    routeRestoreEligible: incompleteSetupRestore.routeRestoreEligible,
  },
  {
    redirectTarget: '/setup',
    destinationSource: 'setup',
    routeRestoreEligible: false,
  },
  'The Dashboard recovery exception must not bypass ordinary incomplete setup for another saved tab.',
);

const nonDashboardRecoveryRestore = entryState({
  currentPath: '/',
  setupComplete: false,
  setupRecoveryRequired: true,
  restorableShellRoute: '/navigate',
});
assert.deepStrictEqual(
  {
    redirectTarget: nonDashboardRecoveryRestore.redirectTarget,
    destinationSource: nonDashboardRecoveryRestore.destinationSource,
    routeRestoreEligible: nonDashboardRecoveryRestore.routeRestoreEligible,
  },
  {
    redirectTarget: '/fleet',
    destinationSource: 'vehicle_recovery',
    routeRestoreEligible: false,
  },
  'Only a saved Dashboard may override the existing vehicle-recovery startup destination.',
);

const hydrationStates = [
  {
    label: 'active vehicle hydration pending',
    entry: { setupComplete: false, setupRecoveryRequired: true },
    policy: { setupComplete: false, hasConfiguredVehicle: false },
  },
  {
    label: 'hydrated without active vehicle',
    entry: { setupComplete: false, setupRecoveryRequired: true },
    policy: { setupComplete: false, hasConfiguredVehicle: false },
  },
  {
    label: 'hydration completed while Dashboard active',
    entry: { setupComplete: true, setupRecoveryRequired: false },
    policy: { setupComplete: true, hasConfiguredVehicle: true },
  },
];

for (const state of hydrationStates) {
  const entryDecision = entryState(state.entry);
  const routeDecision = policy.resolveECSRoutePolicy({
    path: '/dashboard',
    intent: 'navigate',
    context: routeContext(state.policy),
  });
  assert.strictEqual(entryDecision.redirectTarget, null, `${state.label} must not emit a shell redirect.`);
  assert.strictEqual(routeDecision.allowed, true, `${state.label} must keep Dashboard allowed.`);
  assert.strictEqual(routeDecision.targetPath, '/dashboard');
  assert.notStrictEqual(routeDecision.targetPath, '/fleet');
}

for (const missingOperationalState of [
  'no_active_route',
  'no_active_expedition',
  'weather_unavailable',
  'terrain_unavailable',
  'gps_unavailable',
]) {
  const decision = policy.resolveECSRoutePolicy({
    path: '/dashboard',
    intent: 'navigate',
    context: routeContext(),
  });
  assert.strictEqual(
    decision.targetPath,
    '/dashboard',
    `${missingOperationalState} is a presentation state, not a Fleet navigation rule.`,
  );
}

const restoredWithoutVehicle = policy.resolveECSRestorationTarget({
  storedPath: '/dashboard',
  context: routeContext({ setupComplete: false, hasConfiguredVehicle: false }),
});
assert.deepStrictEqual(
  {
    targetPath: restoredWithoutVehicle.targetPath,
    restored: restoredWithoutVehicle.restored,
    fallbackUsed: restoredWithoutVehicle.fallbackUsed,
  },
  { targetPath: '/dashboard', restored: true, fallbackUsed: false },
  'Dashboard restoration must remain stable while active-vehicle state is missing.',
);

coordinator.resetECSNavigationCoordinatorForTests();
assert.strictEqual(coordinator.acquireECSNavigation({
  sourcePath: '/navigate',
  targetPath: '/dashboard',
  method: 'navigate',
}, 2_000).accepted, true);
assert.strictEqual(coordinator.settleECSNavigation('/dashboard'), true);
assert.strictEqual(manifest.getSafeReturnRoute('/dashboard', '/navigate'), '/navigate');
assert.strictEqual(coordinator.acquireECSNavigation({
  sourcePath: '/dashboard',
  targetPath: '/navigate',
  method: 'back',
  settleOnAnyPath: true,
}, 2_001).accepted, true);
assert.strictEqual(coordinator.settleECSNavigation('/navigate'), true);

const dashboardSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'dashboard.tsx'), 'utf8');
const fleetNavigationMatches = dashboardSource.match(/router\.(?:push|replace|navigate)\(\s*['"]\/fleet['"]/g) ?? [];
assert.strictEqual(fleetNavigationMatches.length, 1, 'Dashboard must have exactly one explicit Fleet action.');
const fleetHandlerStart = dashboardSource.indexOf('const handleOpenFleet = useCallback(');
const fleetHandlerEnd = dashboardSource.indexOf('const handleResumeActiveTrip = useCallback(', fleetHandlerStart);
assert(fleetHandlerStart >= 0 && fleetHandlerEnd > fleetHandlerStart, 'Explicit Fleet handler must remain identifiable.');
const fleetHandler = dashboardSource.slice(fleetHandlerStart, fleetHandlerEnd);
assert.match(fleetHandler, /router\.push\(['"]\/fleet['"]\)/);
const lifecycleSource = `${dashboardSource.slice(0, fleetHandlerStart)}${dashboardSource.slice(fleetHandlerEnd)}`;
assert.doesNotMatch(
  lifecycleSource,
  /router\.(?:push|replace|navigate)\(\s*['"]\/fleet['"]/,
  'Dashboard mount, focus, hydration, weather, and terrain lifecycles must never emit Fleet navigation.',
);

const dockSource = fs.readFileSync(path.join(root, 'components', 'CommandDock.tsx'), 'utf8');
assert.match(dockSource, /handleNavigate\(dashboardDockItem\.route\)/);
assert.match(dockSource, /currentPathname === route \|\| pendingRouteRef\.current === route/);

console.log('Dashboard tab navigation stability checks passed.');
