const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const memoryStorage = new Map();

global.localStorage = {
  getItem(key) {
    return memoryStorage.has(key) ? memoryStorage.get(key) : null;
  },
  setItem(key, value) {
    memoryStorage.set(key, String(value));
  },
  removeItem(key) {
    memoryStorage.delete(key);
  },
};

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
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function load(relativePath) {
  return require(path.join(root, relativePath));
}

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(target) : [target];
  });
}

function appFileToRoute(filePath) {
  const relative = path.relative(path.join(root, 'app'), filePath).replace(/\\/g, '/');
  const withoutExtension = relative.replace(/\.tsx$/, '');
  const withoutGroups = withoutExtension.replace(/(^|\/)\([^/]+\)/g, '$1');
  const withoutIndex = withoutGroups.replace(/(^|\/)index$/, '');
  return `/${withoutIndex}`.replace(/\/{2,}/g, '/') || '/';
}

const manifest = load('lib/routeManifest.ts');
const features = load('lib/features/featureVisibilityRegistry.ts');
const policy = load('lib/navigation/ecsRoutePolicy.ts');
const coordinator = load('lib/navigation/ecsNavigationCoordinator.ts');
const shellState = load('lib/navigation/ecsShellRouteState.ts');

function featureContext(overrides = {}) {
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
    ...overrides,
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

assert.deepStrictEqual(manifest.validateECSRouteRegistry(), []);
assert.deepStrictEqual(
  manifest.ECS_PRIMARY_TAB_MANIFEST.map((tab) => tab.id),
  ['fleet', 'navigate', 'dashboard', 'explore', 'dispatch'],
);
for (const route of manifest.ECS_ROUTE_REGISTRY) {
  for (const field of [
    'route',
    'parentSurface',
    'dockSelection',
    'authRequirement',
    'setupRequirement',
    'offlineSupport',
    'restoration',
    'safeReturnRoute',
    'deepLinkPolicy',
    'title',
    'accessibilityLabel',
  ]) {
    assert(Object.prototype.hasOwnProperty.call(route, field), `${route.route} missing ${field}`);
  }
}

const routedAppFiles = walkFiles(path.join(root, 'app'))
  .filter((filePath) => filePath.endsWith('.tsx'))
  .filter((filePath) => path.basename(filePath) !== '_layout.tsx');
for (const filePath of routedAppFiles) {
  const route = appFileToRoute(filePath);
  assert(
    manifest.getRouteMetadata(route),
    `${path.relative(root, filePath)} is reachable as ${route} but has no route metadata`,
  );
}

assert.strictEqual(manifest.getRouteMetadata('/expedition-channel/join/ABC123').route, '/expedition-channel/join/[code]');
assert.strictEqual(manifest.getPrimaryTabForPath('/expedition-checklist?id=1').id, 'dashboard');
assert.strictEqual(manifest.getPrimaryTabForPath('/power/blu').id, 'dashboard');
assert.strictEqual(manifest.getPrimaryTabForPath('/navigate-run').id, 'navigate');
assert.strictEqual(manifest.getRestorableShellRouteForPath('/explore-trip-builder'), '/discover');
assert.strictEqual(manifest.normalizeECSReturnRoute('/alert?dispatchEventId=evt-1'), '/alert?dispatchEventId=evt-1');
assert.strictEqual(manifest.normalizeECSReturnRoute('/not-a-route', '/discover'), '/discover');

const warmRestore = policy.resolveECSRestorationTarget({
  storedPath: '/navigate',
  context: routeContext(),
});
assert.strictEqual(warmRestore.targetPath, '/navigate');
assert.strictEqual(warmRestore.restored, true);

const coldStartup = policy.resolveECSRestorationTarget({ storedPath: null, context: routeContext() });
assert.strictEqual(coldStartup.targetPath, '/dashboard');
assert.strictEqual(coldStartup.restored, false);

const noVehicleRestore = policy.resolveECSRestorationTarget({
  storedPath: '/dashboard',
  context: routeContext({ setupComplete: false, hasConfiguredVehicle: false }),
});
assert.strictEqual(noVehicleRestore.targetPath, '/dashboard');
assert.strictEqual(noVehicleRestore.reason, 'allowed');
assert.strictEqual(noVehicleRestore.restored, true);
assert.strictEqual(noVehicleRestore.fallbackUsed, false);

const safetyPreSetup = policy.resolveECSRoutePolicy({
  path: '/navigate',
  intent: 'navigate',
  context: routeContext({ setupComplete: false, hasConfiguredVehicle: false }),
});
assert.strictEqual(safetyPreSetup.allowed, true);

const signedOutDeepLink = policy.resolveECSRoutePolicy({
  path: '/expedition-detail?id=exp-1',
  intent: 'deep_link',
  context: routeContext({
    authenticated: false,
    shellAccessReady: false,
    featureContext: featureContext({ authenticated: false }),
  }),
});
assert.strictEqual(signedOutDeepLink.reason, 'authentication_required');
assert.strictEqual(signedOutDeepLink.targetPath, '/login');
assert.strictEqual(signedOutDeepLink.preserveIntent, true);

const authenticatedDeepLink = policy.resolveECSRoutePolicy({
  path: '/expedition-detail?id=exp-1',
  intent: 'deep_link',
  context: routeContext(),
});
assert.strictEqual(authenticatedDeepLink.allowed, true);
assert.strictEqual(authenticatedDeepLink.targetPath, '/expedition-detail?id=exp-1');

const invalidDeepLink = policy.resolveECSRoutePolicy({
  path: '/route-that-does-not-exist',
  intent: 'deep_link',
  context: routeContext(),
});
assert.strictEqual(invalidDeepLink.reason, 'unknown_route');
assert.strictEqual(invalidDeepLink.targetPath, '/dashboard');

const offlineUnavailable = policy.resolveECSRoutePolicy({
  path: '/assistant',
  intent: 'navigate',
  context: routeContext({ offline: true, featureContext: featureContext({ online: false }) }),
});
assert.strictEqual(offlineUnavailable.reason, 'offline_unavailable');

const disabledFeature = policy.resolveECSRoutePolicy({
  path: '/explore-trip-builder',
  intent: 'deep_link',
  context: routeContext({
    featureContext: featureContext({ env: { EXPO_PUBLIC_ECS_EXPLORE_TRIP_BUILDER: '0' } }),
  }),
});
assert.strictEqual(disabledFeature.reason, 'feature_unavailable');
assert.strictEqual(disabledFeature.allowed, false);
assert.strictEqual(disabledFeature.safeReturnRoute, '/discover');

const disabledRestore = policy.resolveECSRestorationTarget({
  storedPath: '/navigate',
  context: routeContext({
    featureContext: featureContext({ env: { EXPO_PUBLIC_ECS_KILL_NAVIGATE_TAB: '1' } }),
  }),
});
assert.strictEqual(disabledRestore.targetPath, '/dashboard');
assert.strictEqual(disabledRestore.fallbackUsed, true);

const nestedRestore = policy.resolveECSRestorationTarget({
  storedPath: '/explore-trip-builder',
  context: routeContext(),
});
assert.strictEqual(nestedRestore.targetPath, '/discover');
assert.strictEqual(nestedRestore.fallbackUsed, true);

const phoneDecision = policy.resolveECSRoutePolicy({ path: '/navigate', intent: 'restore', context: routeContext() });
const landscapeDecision = policy.resolveECSRoutePolicy({ path: '/navigate', intent: 'restore', context: routeContext() });
assert.deepStrictEqual(phoneDecision, landscapeDecision, 'Route restoration must not depend on orientation dimensions.');

coordinator.resetECSNavigationCoordinatorForTests();
const firstTap = coordinator.acquireECSNavigation({
  sourcePath: '/dashboard',
  targetPath: '/navigate',
  method: 'navigate',
}, 1_000);
assert.strictEqual(firstTap.accepted, true);
assert.strictEqual(coordinator.acquireECSNavigation({
  sourcePath: '/dashboard',
  targetPath: '/navigate',
  method: 'navigate',
}, 1_010).status, 'duplicate');
assert.strictEqual(coordinator.acquireECSNavigation({
  sourcePath: '/dashboard',
  targetPath: '/discover',
  method: 'navigate',
}, 1_020).status, 'busy');
assert.strictEqual(coordinator.settleECSNavigation('/dashboard'), false);
assert.strictEqual(coordinator.settleECSNavigation('/navigate'), true);
assert.strictEqual(coordinator.acquireECSNavigation({
  sourcePath: '/navigate',
  targetPath: '/discover',
  method: 'navigate',
}, 1_030).accepted, true);
assert.strictEqual(coordinator.acquireECSNavigation({
  sourcePath: '/navigate',
  targetPath: '/alert',
  method: 'navigate',
}, 2_531).accepted, true, 'Expired navigation locks should not block later actions.');

coordinator.resetECSNavigationCoordinatorForTests();
assert.strictEqual(coordinator.acquireECSNavigation({
  sourcePath: '/navigate-run',
  targetPath: '/navigate',
  method: 'back',
  settleOnAnyPath: true,
}, 3_000).accepted, true);
assert.strictEqual(coordinator.settleECSNavigation('/dashboard'), true, 'Back navigation should settle on the actual history destination.');

shellState.clearLastECSShellRoute();
shellState.clearECSIntendedRoute();
assert.strictEqual(shellState.saveLastECSShellRoute('/explore-trip-builder'), '/discover');
assert.strictEqual(shellState.loadLastECSShellRoute(), '/discover');
assert.strictEqual(
  shellState.saveECSIntendedRoute('/expedition-detail?id=exp-2', 10_000),
  '/expedition-detail?id=exp-2',
);
assert.strictEqual(shellState.loadECSIntendedRoute(10_500), '/expedition-detail?id=exp-2');
assert.strictEqual(shellState.saveECSIntendedRoute('/not-a-route', 10_000), null);
assert.strictEqual(shellState.loadECSIntendedRoute(10_000 + (25 * 60 * 60 * 1_000)), null);

const rootLayout = fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8');
const dock = fs.readFileSync(path.join(root, 'components', 'CommandDock.tsx'), 'utf8');
assert(rootLayout.includes("presentation: 'modal' as const"));
assert(rootLayout.includes("BackHandler.addEventListener('hardwareBackPress'"));
assert(rootLayout.includes('resolveECSRestorationTarget'));
assert(rootLayout.includes('saveECSIntendedRoute'));
assert(dock.includes('navigateSingleFlight(route)'));
assert(dock.includes('selectVisibleECSPrimaryTabs'));
assert(!dock.includes('resolveECSFeatureVisibility(item.featureRequirement'));
assert(!fs.readFileSync(path.join(root, 'app', 'expedition-detail.tsx'), 'utf8').includes("'/settings'"));

console.log('ECS shell routing hardening checks passed.');
