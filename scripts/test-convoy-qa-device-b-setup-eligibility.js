const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

require.extensions['.ts'] = function compileTs(module, filename) {
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

const {
  CONVOY_QA_SETUP_ELIGIBILITY_CONTRACT,
  evaluateConvoyQaSetupEligibility,
} = require(path.join(root, 'lib', 'convoy', 'convoyQaSetupEligibility.ts'));

const { resolveDistributionEntryState } = require(path.join(root, 'lib', 'auth', 'distributionEntryResolver.ts'));

const packageJson = readJson('package.json');
const helperSource = read('lib/convoy/convoyQaSetupEligibility.ts');
const diagnosticSource = read('components/convoy/ConvoyQaIdentityDiagnosticScreen.tsx');
const accountDoc = read('docs/qa/convoy-qa-account-session-separation.md');
const liveQaDoc = read('docs/qa/convoy-live-multidevice-privacy-gate.md');
const setupDoc = read('docs/qa/convoy-qa-device-b-setup-eligibility.md');

assert.strictEqual(
  packageJson.scripts['test:convoy-qa-device-b-setup-eligibility'],
  'node ./scripts/test-convoy-qa-device-b-setup-eligibility.js',
);

assert.strictEqual(CONVOY_QA_SETUP_ELIGIBILITY_CONTRACT.scope, 'dev_test_read_only_setup_preflight');
assert.ok(CONVOY_QA_SETUP_ELIGIBILITY_CONTRACT.forbiddenActions.includes('create_convoy'));
assert.ok(CONVOY_QA_SETUP_ELIGIBILITY_CONTRACT.forbiddenActions.includes('join_convoy'));
assert.ok(CONVOY_QA_SETUP_ELIGIBILITY_CONTRACT.forbiddenActions.includes('publish_location'));
assert.ok(CONVOY_QA_SETUP_ELIGIBILITY_CONTRACT.forbiddenActions.includes('mutate_fleet'));
assert.ok(CONVOY_QA_SETUP_ELIGIBILITY_CONTRACT.forbiddenActions.includes('unlock_badge'));

const vehiclePresent = {
  hasConfiguredVehicle: true,
  localVehicleCount: 1,
  activeVehicleId: 'vehicle-a',
  setupVehicleId: 'vehicle-a',
  activeVehicleExists: true,
  setupVehicleExists: true,
};

const vehicleMissing = {
  hasConfiguredVehicle: false,
  localVehicleCount: 0,
  activeVehicleId: null,
  setupVehicleId: null,
  activeVehicleExists: false,
  setupVehicleExists: false,
};

const authMissing = evaluateConvoyQaSetupEligibility({
  authenticated: false,
  setupCompletionFlag: false,
  setupComplete: false,
  vehiclePresence: vehicleMissing,
  activeConvoyId: null,
  liveSharingActive: false,
  pendingInviteOrJoinState: false,
});
assert.strictEqual(authMissing.status, 'incomplete');
assert.strictEqual(authMissing.code, 'auth_required');
assert.strictEqual(authMissing.convoyCommandReachable, false);

const setupIncomplete = evaluateConvoyQaSetupEligibility({
  authenticated: true,
  setupCompletionFlag: false,
  setupComplete: false,
  vehiclePresence: vehicleMissing,
  activeConvoyId: null,
  liveSharingActive: false,
  pendingInviteOrJoinState: false,
});
assert.strictEqual(setupIncomplete.status, 'blocked');
assert.strictEqual(setupIncomplete.code, 'setup_incomplete');
assert.strictEqual(setupIncomplete.missingRequirement, 'Complete Fleet/Profile setup before opening Convoy Command.');
assert.ok(setupIncomplete.requiredActions.includes('Complete the Fleet Profile setup flow on Device B.'));

const configuredVehicleMissing = evaluateConvoyQaSetupEligibility({
  authenticated: true,
  setupCompletionFlag: true,
  setupComplete: false,
  vehiclePresence: vehicleMissing,
  activeConvoyId: null,
  liveSharingActive: false,
  pendingInviteOrJoinState: false,
});
assert.strictEqual(configuredVehicleMissing.status, 'blocked');
assert.strictEqual(configuredVehicleMissing.code, 'configured_vehicle_missing');
assert.strictEqual(configuredVehicleMissing.hasConfiguredVehicle, 'no');
assert.strictEqual(configuredVehicleMissing.convoyCommandReachable, false);

const activeVehicleOptional = evaluateConvoyQaSetupEligibility({
  authenticated: true,
  setupCompletionFlag: true,
  setupComplete: true,
  vehiclePresence: {
    hasConfiguredVehicle: true,
    localVehicleCount: 1,
    activeVehicleId: null,
    setupVehicleId: 'vehicle-a',
    activeVehicleExists: false,
    setupVehicleExists: true,
  },
  activeConvoyId: null,
  liveSharingActive: false,
  pendingInviteOrJoinState: false,
});
assert.strictEqual(activeVehicleOptional.status, 'ready');
assert.strictEqual(activeVehicleOptional.code, 'convoy_command_reachable');
assert.strictEqual(activeVehicleOptional.convoyCommandReachable, true);
assert.strictEqual(activeVehicleOptional.activeVehiclePresent, 'no');
assert.ok(
  activeVehicleOptional.notes.some((note) => note.includes('Active vehicle selection is recommended')),
  'active vehicle absence should be visible without blocking the setup gate',
);

const cleanReady = evaluateConvoyQaSetupEligibility({
  authenticated: true,
  setupCompletionFlag: true,
  setupComplete: true,
  vehiclePresence: vehiclePresent,
  activeConvoyId: null,
  liveSharingActive: false,
  pendingInviteOrJoinState: false,
});
assert.strictEqual(cleanReady.status, 'ready');
assert.strictEqual(cleanReady.code, 'convoy_command_reachable');
assert.strictEqual(cleanReady.convoyCommandReachable, true);
assert.strictEqual(cleanReady.hasConfiguredVehicle, 'yes');
assert.strictEqual(cleanReady.fleetProfileCount, '1');

const baselineNotClean = evaluateConvoyQaSetupEligibility({
  authenticated: true,
  setupCompletionFlag: true,
  setupComplete: true,
  vehiclePresence: vehiclePresent,
  activeConvoyId: 'convoy-a',
  liveSharingActive: false,
  pendingInviteOrJoinState: false,
});
assert.strictEqual(baselineNotClean.status, 'blocked');
assert.strictEqual(baselineNotClean.code, 'convoy_baseline_not_clean');
assert.strictEqual(baselineNotClean.convoyCommandReachable, false);

const protectedRouteWhenSetupMissing = resolveDistributionEntryState({
  currentPath: '/convoy-command',
  isLoading: false,
  authenticated: true,
  accessState: null,
  offlineMode: false,
  startupSessionRestored: true,
  restorableShellRoute: null,
  isAuthScreen: false,
  isRecoveryScreen: false,
  isLoginScreen: false,
  isSetupScreen: false,
  isProtectedScreen: true,
  firstLaunchResolved: true,
  firstLaunchComplete: true,
  setupComplete: false,
  preferredShellRoute: '/dashboard',
});
assert.strictEqual(protectedRouteWhenSetupMissing.kind, 'setup_required');
assert.strictEqual(protectedRouteWhenSetupMissing.redirectTarget, '/setup');

const protectedRouteWhenSetupReady = resolveDistributionEntryState({
  currentPath: '/convoy-command',
  isLoading: false,
  authenticated: true,
  accessState: null,
  offlineMode: false,
  startupSessionRestored: true,
  restorableShellRoute: null,
  isAuthScreen: false,
  isRecoveryScreen: false,
  isLoginScreen: false,
  isSetupScreen: false,
  isProtectedScreen: true,
  firstLaunchResolved: true,
  firstLaunchComplete: true,
  setupComplete: true,
  preferredShellRoute: '/dashboard',
});
assert.notStrictEqual(protectedRouteWhenSetupReady.kind, 'setup_required');

assert.ok(diagnosticSource.includes('buildLocalConvoyQaSetupEligibility'), 'Diagnostic screen should include setup eligibility.');
assert.ok(diagnosticSource.includes('Setup eligibility'), 'Diagnostic screen should render setup eligibility.');
assert.ok(diagnosticSource.includes('Convoy Command reachable'), 'Diagnostic screen should show route reachability.');
assert.ok(diagnosticSource.includes('Fleet profiles'), 'Diagnostic screen should expose configured vehicle baseline.');

for (const source of [helperSource, diagnosticSource]) {
  assert.ok(!source.includes('createConvoy('), 'Setup diagnostic must not create convoys.');
  assert.ok(!source.includes('joinConvoy'), 'Setup diagnostic must not join convoys.');
  assert.ok(!source.includes('startConvoyLocationSharing'), 'Setup diagnostic must not publish location.');
  assert.ok(!source.includes('unlockBadge'), 'Setup diagnostic must not unlock badges.');
  assert.ok(!source.includes('markComplete('), 'Setup diagnostic must not complete Fleet setup for the user.');
  assert.ok(!source.includes('setActiveVehicleId('), 'Setup diagnostic must not select a vehicle.');
  assert.ok(!source.includes('vehicleStore.create'), 'Setup diagnostic must not create Fleet profiles.');
}

assert.ok(setupDoc.includes('Device B Fleet/setup eligibility'), 'Dedicated setup eligibility doc should exist.');
assert.ok(setupDoc.includes('Complete the Fleet Profile setup flow'), 'Manual procedure should preserve production setup gate.');
assert.ok(setupDoc.includes('Do not create a convoy'), 'Manual procedure should forbid Convoy mutations.');
assert.ok(setupDoc.includes('planning-offline-sync:///dev/convoy-identity-qa'), 'Manual procedure should use existing diagnostic.');
assert.ok(accountDoc.includes('Fleet/setup eligibility'), 'Account checklist should include Fleet/setup preflight.');
assert.ok(liveQaDoc.includes('Fleet/setup eligibility'), 'Live privacy checklist should include setup eligibility.');
assert.ok(liveQaDoc.includes('Convoy Command reachable'), 'Live privacy checklist should require Convoy Command reachability.');

console.log('convoy QA Device B setup eligibility guards passed');
