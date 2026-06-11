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
  CONVOY_QA_DEVICE_A_LEADER_EMAIL,
  CONVOY_QA_DEVICE_A_LEADER_LABEL,
  CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT,
  buildConvoyQaIdentityDiagnostic,
  buildLocalConvoyQaIdentityDiagnostic,
  evaluateConvoyQaAccountSeparation,
  getConvoyQaBackendProjectLabelFromUrl,
  isConvoyQaDeviceALeaderIdentity,
  isConvoyQaIdentityDiagnosticAllowed,
  redactConvoyQaEmail,
  redactConvoyQaIdentifier,
} = require(path.join(root, 'lib', 'convoy', 'convoyQaIdentityPreflight.ts'));
const { resolveDistributionEntryState } = require(path.join(root, 'lib', 'auth', 'distributionEntryResolver.ts'));

const packageJson = readJson('package.json');
const doc = read('docs/qa/convoy-qa-account-session-separation.md');
const liveQaDoc = read('docs/qa/convoy-live-multidevice-privacy-gate.md');
const routeSource = read('app/dev/convoy-identity-qa.tsx');
const screenSource = read('components/convoy/ConvoyQaIdentityDiagnosticScreen.tsx');
const lintWrapperSource = read('scripts/run-expo-lint.mjs');

assert.strictEqual(packageJson.scripts['test:convoy-qa-account-session-separation'], 'node ./scripts/test-convoy-qa-account-session-separation.js');
assert.strictEqual(packageJson.scripts.lint, 'node ./scripts/run-expo-lint.mjs');
assert.ok(lintWrapperSource.includes('filter((arg) => arg.trim().length > 0)'), 'Lint wrapper should drop empty forwarded patterns.');
assert.ok(lintWrapperSource.includes("['lint', ...sanitizedArgs]"), 'Lint wrapper should preserve real lint arguments.');

assert.strictEqual(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.scope, 'dev_test_manual_preflight_only');
assert.strictEqual(CONVOY_QA_DEVICE_A_LEADER_EMAIL, 'admin@expeditioncommand.com');
assert.strictEqual(CONVOY_QA_DEVICE_A_LEADER_LABEL, 'QA Leader');
assert.strictEqual(isConvoyQaDeviceALeaderIdentity('admin@expeditioncommand.com'), true);
assert.strictEqual(isConvoyQaDeviceALeaderIdentity('ADMIN@EXPEDITIONCOMMAND.COM'), true);
assert.strictEqual(isConvoyQaDeviceALeaderIdentity('loganherold@gmail.com'), false);
assert.ok(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.forbiddenActions.includes('sign_in'));
assert.ok(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.forbiddenActions.includes('sign_out'));
assert.ok(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.forbiddenActions.includes('create_convoy'));
assert.ok(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.forbiddenActions.includes('join_convoy'));
assert.ok(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.forbiddenActions.includes('publish_location'));
assert.ok(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.forbiddenActions.includes('unlock_badge'));
assert.ok(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.forbiddenActions.includes('mutate_fleet'));
assert.ok(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.forbiddenActions.includes('mutate_active_trip'));
assert.ok(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.forbiddenActions.includes('mutate_packet'));
assert.ok(CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT.forbiddenActions.includes('touch_telemetry'));

assert.strictEqual(isConvoyQaIdentityDiagnosticAllowed({ dev: true, nodeEnv: 'production' }), true);
assert.strictEqual(isConvoyQaIdentityDiagnosticAllowed({ dev: false, nodeEnv: 'test' }), true);
assert.strictEqual(isConvoyQaIdentityDiagnosticAllowed({ dev: false, nodeEnv: 'production' }), false);
assert.strictEqual(isConvoyQaIdentityDiagnosticAllowed({ dev: false, nodeEnv: undefined }), false);

assert.strictEqual(redactConvoyQaIdentifier('1234567890abcdef'), '1234...cdef');
assert.strictEqual(redactConvoyQaIdentifier('short'), 'shor...');
assert.strictEqual(redactConvoyQaIdentifier(null), 'unknown');
assert.strictEqual(redactConvoyQaEmail('loganherold@gmail.com'), 'lo...@gmail.com');
assert.strictEqual(redactConvoyQaEmail('x@example.test'), 'x...@example.test');
assert.strictEqual(redactConvoyQaEmail(null), 'unknown');
assert.strictEqual(getConvoyQaBackendProjectLabelFromUrl('https://ppullxxprgyeoakzqnxi.supabase.co'), 'ppullxxprgyeoakzqnxi');
assert.strictEqual(getConvoyQaBackendProjectLabelFromUrl(''), 'unknown');

const ready = evaluateConvoyQaAccountSeparation({
  leader: {
    deviceLabel: 'Device A',
    userId: 'leader-user-id',
    participantId: null,
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
  member: {
    deviceLabel: 'Device B',
    userId: 'member-user-id',
    participantId: null,
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
});
assert.strictEqual(ready.status, 'ready');
assert.strictEqual(ready.code, 'distinct_identities_ready');
assert.strictEqual(ready.validForTrueTwoDeviceQa, true);

const missingIdentity = evaluateConvoyQaAccountSeparation({
  leader: {
    deviceLabel: 'Device A',
    userId: null,
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
  member: {
    deviceLabel: 'Device B',
    userId: 'member-user-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
});
assert.strictEqual(missingIdentity.status, 'incomplete');
assert.strictEqual(missingIdentity.code, 'missing_user_id');

const unreadableAuth = evaluateConvoyQaAccountSeparation({
  leader: {
    deviceLabel: 'Device A',
    userId: 'leader-user-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
  member: {
    deviceLabel: 'Device B',
    userId: null,
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: false,
  },
});
assert.strictEqual(unreadableAuth.status, 'incomplete');
assert.strictEqual(unreadableAuth.code, 'unreadable_auth_state');

const sameUser = evaluateConvoyQaAccountSeparation({
  leader: {
    deviceLabel: 'Device A',
    userId: 'same-user-id',
    participantId: 'leader-member-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
  member: {
    deviceLabel: 'Device B',
    userId: 'same-user-id',
    participantId: 'member-member-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
});
assert.strictEqual(sameUser.status, 'blocked');
assert.strictEqual(sameUser.code, 'same_user_id');

const backendMismatch = evaluateConvoyQaAccountSeparation({
  leader: {
    deviceLabel: 'Device A',
    userId: 'leader-user-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-a',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
  member: {
    deviceLabel: 'Device B',
    userId: 'member-user-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-b',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
});
assert.strictEqual(backendMismatch.status, 'blocked');
assert.strictEqual(backendMismatch.code, 'backend_mismatch');

const activeConvoy = evaluateConvoyQaAccountSeparation({
  leader: {
    deviceLabel: 'Device A',
    userId: 'leader-user-id',
    activeConvoyId: 'active-convoy-id',
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
  member: {
    deviceLabel: 'Device B',
    userId: 'member-user-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
});
assert.strictEqual(activeConvoy.status, 'blocked');
assert.strictEqual(activeConvoy.code, 'active_convoy_present');

const liveSharing = evaluateConvoyQaAccountSeparation({
  leader: {
    deviceLabel: 'Device A',
    userId: 'leader-user-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: true,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
  member: {
    deviceLabel: 'Device B',
    userId: 'member-user-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
});
assert.strictEqual(liveSharing.status, 'blocked');
assert.strictEqual(liveSharing.code, 'live_sharing_active');

const pendingJoin = evaluateConvoyQaAccountSeparation({
  leader: {
    deviceLabel: 'Device A',
    userId: 'leader-user-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: true,
    authStateReadable: true,
  },
  member: {
    deviceLabel: 'Device B',
    userId: 'member-user-id',
    activeConvoyId: null,
    backendProjectLabel: 'qa-project',
    liveSharingActive: false,
    pendingInviteOrJoinState: false,
    authStateReadable: true,
  },
});
assert.strictEqual(pendingJoin.status, 'blocked');
assert.strictEqual(pendingJoin.code, 'pending_invite_or_join_state');

const diagnostic = buildConvoyQaIdentityDiagnostic({
  deviceLabel: 'Device A',
  userId: 'leader-user-id-123456',
  email: 'leader@example.test',
  displayName: 'QA Leader',
  participantId: 'participant-123456',
  activeConvoyId: 'convoy-123456',
  backendProjectLabel: 'qa-project',
  liveSharingActive: false,
  pendingInviteOrJoinState: false,
  authStateReadable: true,
});
assert.strictEqual(diagnostic.authPresent, 'yes');
assert.strictEqual(diagnostic.userId, 'lead...3456');
assert.strictEqual(diagnostic.email, 'le...@example.test');
assert.strictEqual(diagnostic.displayName, 'QA Leader');
assert.strictEqual(diagnostic.activeConvoyId, 'conv...3456');
assert.strictEqual(diagnostic.participantId, 'part...3456');
assert.strictEqual(diagnostic.liveSharingActive, 'no');
assert.strictEqual(diagnostic.currentConvoyBaselineState, 'active_convoy_present');
assert.ok(!JSON.stringify(diagnostic).includes('leader-user-id-123456'));
assert.ok(!JSON.stringify(diagnostic).includes('participant-123456'));
assert.ok(!JSON.stringify(diagnostic).includes('leader@example.test'));
assert.ok(!JSON.stringify(diagnostic).includes('access_token'));
assert.ok(!JSON.stringify(diagnostic).includes('refresh_token'));
assert.ok(!JSON.stringify(diagnostic).includes('secret'));

const localReady = buildLocalConvoyQaIdentityDiagnostic({
  deviceLabel: 'Device B',
  userId: 'member-user-id-123456',
  email: 'member@example.test',
  displayName: 'QA Member',
  activeConvoyId: null,
  participantId: null,
  backendProjectLabel: 'qa-project',
  liveSharingActive: false,
  pendingInviteOrJoinState: false,
  authStateReadable: true,
});
assert.strictEqual(localReady.preflightResult, 'ready');
assert.strictEqual(localReady.preflightCode, 'local_identity_ready_for_pairing');

const localMissing = buildLocalConvoyQaIdentityDiagnostic({
  deviceLabel: 'Device B',
  userId: null,
  email: null,
  displayName: null,
  activeConvoyId: null,
  participantId: null,
  backendProjectLabel: 'qa-project',
  liveSharingActive: false,
  pendingInviteOrJoinState: false,
  authStateReadable: true,
});
assert.strictEqual(localMissing.preflightResult, 'incomplete');
assert.strictEqual(localMissing.preflightCode, 'missing_user_id');

assert.ok(routeSource.includes('isConvoyQaIdentityDiagnosticAllowed'), 'Diagnostic route should use the shared dev/test guard.');
assert.ok(routeSource.includes('<Redirect href="/" />'), 'Diagnostic route should redirect outside dev/test.');
assert.ok(routeSource.includes('ConvoyQaIdentityDiagnosticScreen'), 'Diagnostic route should render the diagnostic screen when allowed.');

const unauthenticatedDiagnosticRoute = resolveDistributionEntryState({
  currentPath: '/dev/convoy-identity-qa',
  isLoading: false,
  authenticated: false,
  guestOfflineAccess: false,
  rememberedOfflineAccess: false,
  accessState: null,
  offlineMode: false,
  setupComplete: false,
  restorableShellRoute: null,
  requestedEntryRoute: '/dev/convoy-identity-qa',
  isAuthScreen: false,
  isRecoveryScreen: false,
  isLoginScreen: false,
  isSetupScreen: false,
  isProtectedScreen: false,
  bootstrapError: null,
});
assert.strictEqual(unauthenticatedDiagnosticRoute.kind, 'public_entry');
assert.strictEqual(unauthenticatedDiagnosticRoute.redirectTarget, null);

assert.ok(screenSource.includes('supabase.auth.getSession()'), 'Diagnostic should derive auth from the existing Supabase session.');
assert.ok(screenSource.includes('convoyMembershipService.getActiveConvoyContext()'), 'Diagnostic should read active convoy context.');
assert.ok(screenSource.includes('getConvoyLocationSharingState()'), 'Diagnostic should read live sharing state.');
for (const forbidden of [
  'createConvoy(',
  'joinConvoyWithInvite(',
  'startConvoyLocationSharing(',
  'stopConvoyLocationSharing(',
  'unlockBadge',
  'vehicleStore.',
  'activeTripStore',
  'offlineIncidentPacket',
]) {
  assert.ok(!screenSource.includes(forbidden), `Diagnostic screen must not perform mutation: ${forbidden}`);
}
assert.ok(!screenSource.includes('access_token'), 'Diagnostic UI must not reference access tokens.');
assert.ok(!screenSource.includes('refresh_token'), 'Diagnostic UI must not reference refresh tokens.');

assert.ok(doc.includes('Device A signed in as QA Leader account'));
assert.ok(doc.includes('Current approved Device A QA Leader identity: `admin@expeditioncommand.com`'));
assert.ok(doc.includes('Device B signed in as QA Member account'));
assert.ok(doc.includes('same account on both devices is invalid'));
assert.ok(doc.includes('debuggable dev-client build'));
assert.ok(doc.includes('safe in-app diagnostic surface'));
assert.ok(doc.includes('approved non-secret identity diagnostic'));
assert.ok(doc.includes('Do not rely on `run-as` if the installed package is not debuggable'));
assert.ok(doc.includes('no pending invite/join state exists'));
assert.ok(doc.includes('Do not record raw user ids, tokens, invite codes, or account credentials'));

assert.ok(liveQaDoc.includes('Device B also needs a debuggable QA/dev-client build or another approved non-secret identity diagnostic surface'));
assert.ok(liveQaDoc.includes('Rerun only after Device A and Device B both expose present, distinct authenticated QA user ids before Convoy creation'));
assert.ok(liveQaDoc.includes('`admin@expeditioncommand.com` is explicitly approved as Device A'));

console.log('Convoy QA account/session separation checks passed.');
