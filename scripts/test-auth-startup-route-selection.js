/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'lib', 'auth', 'distributionEntryResolver.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const moduleShim = { exports: {} };
const authCopy = {
  AUTH_COPY: {
    session: {
      loadingSystems: 'Loading ECS systems',
      preparing: 'Preparing ECS',
      checking: 'Checking secure session',
    },
    resetPassword: { verifying: 'Verifying reset' },
    activation: { verifying: 'Verifying activation' },
  },
};

function localRequire(request) {
  if (request === './authCopy') return authCopy;
  if (request === './entryStateTypes') return {};
  return require(request);
}

new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
  moduleShim.exports,
  localRequire,
  moduleShim,
  sourcePath,
  path.dirname(sourcePath),
);

const { resolveDistributionEntryState } = moduleShim.exports;

function resolve(overrides) {
  return resolveDistributionEntryState({
    currentPath: '/',
    isLoading: false,
    authenticated: false,
    guestOfflineAccess: false,
    rememberedOfflineAccess: false,
    accessState: null,
    offlineMode: false,
    setupComplete: false,
    setupRecoveryRequired: false,
    restorableShellRoute: null,
    requestedEntryRoute: null,
    isAuthScreen: true,
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

assert.strictEqual(
  resolve({ currentPath: '/', isAuthScreen: true }).redirectTarget,
  '/login',
  'No session at the root entry should route to /login.',
);

assert.strictEqual(
  resolve({
    currentPath: '/',
    authenticated: true,
    setupComplete: true,
    isAuthScreen: true,
  }).redirectTarget,
  '/dashboard',
  'Authenticated startup with completed setup should route directly to /dashboard.',
);

assert.strictEqual(
  resolve({
    currentPath: '/',
    authenticated: true,
    setupComplete: true,
    isAuthScreen: true,
    restorableShellRoute: '/navigate',
  }).redirectTarget,
  '/navigate',
  'Cold launch with a valid remembered session should restore the saved Navigate shell route.',
);

assert.strictEqual(
  resolve({
    currentPath: '/login',
    authenticated: true,
    setupComplete: true,
    isAuthScreen: true,
    isLoginScreen: true,
  }).redirectTarget,
  '/dashboard',
  'Authenticated users found on /login should route directly to /dashboard.',
);

assert.strictEqual(
  resolve({
    currentPath: '/login',
    authenticated: true,
    setupComplete: true,
    isAuthScreen: true,
    isLoginScreen: true,
    restorableShellRoute: '/navigate',
  }).redirectTarget,
  '/dashboard',
  'Fresh authenticated login from /login should land on Dashboard instead of stale shell restore.',
);

assert.strictEqual(
  resolve({
    currentPath: '/',
    guestOfflineAccess: true,
    offlineMode: true,
    setupComplete: true,
    isAuthScreen: true,
  }).redirectTarget,
  '/dashboard',
  'Guest offline startup with completed setup should route directly to /dashboard.',
);

assert.strictEqual(
  resolve({
    currentPath: '/login',
    guestOfflineAccess: true,
    offlineMode: true,
    setupComplete: true,
    isAuthScreen: true,
    isLoginScreen: true,
  }).redirectTarget,
  '/dashboard',
  'Guest offline users found on /login should route directly to /dashboard.',
);

assert.strictEqual(
  resolve({
    currentPath: '/',
    rememberedOfflineAccess: true,
    offlineMode: true,
    setupComplete: true,
    isAuthScreen: true,
    restorableShellRoute: '/navigate',
  }).redirectTarget,
  '/navigate',
  'Offline remembered session restore should honestly open the saved shell route without pretending online readiness.',
);

assert.strictEqual(
  resolve({
    currentPath: '/',
    authenticated: true,
    setupComplete: false,
    isAuthScreen: true,
  }).redirectTarget,
  '/setup',
  'Authenticated startup with incomplete setup should route to /setup.',
);

assert.strictEqual(
  resolve({
    currentPath: '/',
    authenticated: true,
    setupComplete: false,
    setupRecoveryRequired: true,
    isAuthScreen: true,
  }).redirectTarget,
  '/fleet',
  'Authenticated startup that needs vehicle recovery should route directly to Fleet.',
);

assert.strictEqual(
  resolve({
    currentPath: '/dashboard',
    authenticated: true,
    setupComplete: false,
    setupRecoveryRequired: true,
    isAuthScreen: false,
    isProtectedScreen: false,
  }).redirectTarget,
  '/fleet',
  'Vehicle recovery should not leave setup-incomplete users on Dashboard.',
);

assert.strictEqual(
  resolve({
    currentPath: '/fleet',
    authenticated: true,
    setupComplete: false,
    setupRecoveryRequired: true,
    isAuthScreen: false,
    isProtectedScreen: false,
  }).redirectTarget,
  null,
  'Vehicle recovery should settle on Fleet instead of redirecting again.',
);

assert.strictEqual(
  resolve({
    currentPath: '/alert',
    authenticated: true,
    setupComplete: false,
    setupRecoveryRequired: true,
    isAuthScreen: false,
    isProtectedScreen: false,
  }).redirectTarget,
  null,
  'Vehicle recovery should still allow Dispatch because emergency coordinate ping is safety-critical.',
);

assert.strictEqual(
  resolve({
    currentPath: '/navigate',
    authenticated: true,
    setupComplete: false,
    setupRecoveryRequired: true,
    isAuthScreen: false,
    isProtectedScreen: false,
  }).redirectTarget,
  null,
  'Vehicle recovery should allow Navigate so Recovery Assist coordinate handoffs can open the map.',
);

assert.strictEqual(
  resolve({
    currentPath: '/navigate',
    authenticated: true,
    setupComplete: false,
    setupRecoveryRequired: false,
    isAuthScreen: false,
    isProtectedScreen: false,
  }).redirectTarget,
  null,
  'Navigate should remain available as a safety-critical pre-setup shell route for recovery handoffs.',
);

assert.strictEqual(
  resolve({
    currentPath: '/',
    authenticated: true,
    setupComplete: false,
    requestedEntryRoute: '/dev/campops-visual-qa',
    isAuthScreen: true,
    isProtectedScreen: false,
  }).redirectTarget,
  '/dev/campops-visual-qa',
  'Dev-only CampOps visual QA should be reachable before setup so Android pin/popup evidence can be captured.',
);

assert.strictEqual(
  resolve({
    currentPath: '/dev/campops-visual-qa',
    authenticated: true,
    setupComplete: false,
    isAuthScreen: false,
    isProtectedScreen: false,
  }).redirectTarget,
  null,
  'Dev-only CampOps visual QA should stay mounted once opened before setup.',
);

assert.strictEqual(
  resolve({
    currentPath: '/safety',
    authenticated: true,
    setupComplete: false,
    setupRecoveryRequired: true,
    isAuthScreen: false,
    isProtectedScreen: false,
  }).redirectTarget,
  null,
  'Vehicle recovery should still allow the Dispatch safety surface.',
);

assert.strictEqual(
  resolve({
    currentPath: '/dashboard',
    authenticated: true,
    setupComplete: false,
    setupRecoveryRequired: false,
    isAuthScreen: false,
    isProtectedScreen: false,
  }).redirectTarget,
  '/setup',
  'Setup-incomplete users without recovery context should not remain on Dashboard.',
);

assert.strictEqual(
  resolve({
    currentPath: '/setup',
    authenticated: true,
    setupComplete: false,
    isAuthScreen: false,
    isSetupScreen: true,
    preserveSetupRoute: true,
  }).redirectTarget,
  null,
  'Authenticated setup-incomplete users already on /setup should stay there.',
);

console.log('Auth startup route selection checks passed.');
