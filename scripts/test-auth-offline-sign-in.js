/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const verifierPath = path.join(root, 'lib', 'auth', 'offlineCredentialVerifier.ts');
const appContextSource = fs.readFileSync(path.join(root, 'context', 'AppContext.tsx'), 'utf8');
const loginSource = fs.readFileSync(path.join(root, 'app', 'login.tsx'), 'utf8');

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function assertIncludes(source, fragment, message) {
  assert.ok(normalize(source).includes(normalize(fragment)), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!normalize(source).includes(normalize(fragment)), message);
}

function blockBetween(source, startFragment, endFragment) {
  const normalizedSource = normalize(source);
  const start = normalizedSource.indexOf(normalize(startFragment));
  assert.notStrictEqual(start, -1, `Expected source to include ${startFragment}`);
  const end = normalizedSource.indexOf(normalize(endFragment), start);
  assert.notStrictEqual(end, -1, `Expected source to include ${endFragment}`);
  return normalizedSource.slice(start, end);
}

assert.ok(
  fs.existsSync(verifierPath),
  'Offline credential verifier should exist as a pure, testable auth module.',
);

const compiled = ts.transpileModule(fs.readFileSync(verifierPath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputText)(
  moduleShim,
  moduleShim.exports,
  require,
);

const {
  createOfflineCredentialRecord,
  verifyOfflineCredentialRecord,
} = moduleShim.exports;

const fixedNow = Date.UTC(2026, 4, 31, 12, 0, 0);
const record = createOfflineCredentialRecord({
  email: 'Field.User@Example.com ',
  password: 'correct horse battery staple',
  userId: 'user-123',
  keepSignedIn: true,
  nowMs: fixedNow,
  salt: 'fixed-test-salt',
});

assert.strictEqual(record.email, 'field.user@example.com');
assert.strictEqual(record.userId, 'user-123');
assert.ok(record.passwordVerifier, 'Offline verifier should persist a derived verifier.');
assert.ok(record.expiresAtMs > fixedNow, 'Keep-signed-in offline credentials should expire in the future.');
assert.ok(!JSON.stringify(record).includes('correct horse battery staple'), 'Offline verifier must not store raw passwords.');
assert.ok(!JSON.stringify(record).includes('Field.User@Example.com '), 'Offline verifier must not store raw email input.');

assert.deepStrictEqual(
  verifyOfflineCredentialRecord(record, {
    email: 'field.user@example.com',
    password: 'correct horse battery staple',
    nowMs: fixedNow + 1000,
  }),
  {
    ok: true,
    email: 'field.user@example.com',
    userId: 'user-123',
  },
  'Matching saved credentials should unlock the known account offline.',
);

assert.strictEqual(
  verifyOfflineCredentialRecord(record, {
    email: 'field.user@example.com',
    password: 'wrong password',
    nowMs: fixedNow + 1000,
  }).ok,
  false,
  'Wrong passwords should not unlock the offline account.',
);

assert.strictEqual(
  verifyOfflineCredentialRecord(record, {
    email: 'different@example.com',
    password: 'correct horse battery staple',
    nowMs: fixedNow + 1000,
  }).ok,
  false,
  'Different emails should not unlock another saved offline account.',
);

assert.strictEqual(
  verifyOfflineCredentialRecord(record, {
    email: 'field.user@example.com',
    password: 'correct horse battery staple',
    nowMs: record.expiresAtMs + 1,
  }).reason,
  'expired',
  'Expired offline credentials should fail closed.',
);

const loginBlock = blockBetween(
  loginSource,
  "const handleLogin = useCallback(async (source: 'cta_press' | 'password_submit' | 'accessibility_activate') => {",
  '\n  const handleLoginSubmit = useCallback(',
);
assertNotIncludes(
  loginBlock,
  'if (!isOnline) {',
  'Login screen must not block password sign-in just because the device is offline.',
);
assertIncludes(
  loginSource,
  'const result = await signIn(trimmedEmail, password, keepSignedIn, source);',
  'Login screen should let the auth provider decide whether online or known-device offline sign-in can proceed.',
);

assertIncludes(
  appContextSource,
  "import { offlineCredentialStore } from '../lib/auth/offlineCredentialStore';",
  'AppContext should use the canonical offline credential store.',
);
assertIncludes(
  appContextSource,
  'function buildOfflineAuthUser',
  'AppContext should create a bounded local auth user for known-device offline sign-in.',
);
assertIncludes(
  appContextSource,
  "const tryOfflineCredentialSignIn = async (fallbackReason: 'offline' | 'network_timeout' | 'network_error')",
  'Provider sign-in should have one offline credential fallback path for poor connectivity.',
);
assertIncludes(
  appContextSource,
  "await offlineCredentialStore.saveOnlineLoginVerifier({",
  'Successful online login should prepare the device for future offline sign-in.',
);
assertIncludes(
  appContextSource,
  "await offlineCredentialStore.verifyOfflineLogin({",
  'Offline or degraded sign-in should verify against the local known-device credential record.',
);
assertIncludes(
  appContextSource,
  'setOfflineMode(true);\n        setPersistedOfflineMode(true);',
  'Successful offline sign-in should enter persisted offline mode for the shell.',
);
assertIncludes(
  appContextSource,
  "return await tryOfflineCredentialSignIn('offline');",
  'Fully offline login attempts should try known-device offline sign-in.',
);
assertIncludes(
  appContextSource,
  "return await tryOfflineCredentialSignIn('network_timeout');",
  'Timed-out online sign-in should fall back to known-device offline sign-in.',
);
assertIncludes(
  appContextSource,
  "return await tryOfflineCredentialSignIn('network_error');",
  'Network-error online sign-in should fall back to known-device offline sign-in.',
);

console.log('Auth offline sign-in regression checks passed.');
