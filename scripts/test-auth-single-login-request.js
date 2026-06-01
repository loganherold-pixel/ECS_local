const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
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

function count(source, fragment) {
  return normalize(source).split(normalize(fragment)).length - 1;
}

function blockBetween(source, startFragment, endFragment) {
  const normalizedSource = normalize(source);
  const start = normalizedSource.indexOf(normalize(startFragment));
  assert.notStrictEqual(start, -1, `Expected source to include ${startFragment}`);
  const end = normalizedSource.indexOf(normalize(endFragment), start);
  assert.notStrictEqual(end, -1, `Expected source to include ${endFragment}`);
  return normalizedSource.slice(start, end);
}

const signInBlock = blockBetween(
  appContextSource,
  'const signIn = useCallback((',
  '\n\n\n  const signUp = useCallback(',
);

assertIncludes(
  loginSource,
  'const loginSubmitInFlightRef = useRef(false);',
  'Login screen should keep a synchronous in-flight guard for rapid repeated presses.',
);
assertIncludes(
  loginSource,
  'if (loginSubmitInFlightRef.current) {',
  'Rapid double-click sign-in should be blocked before calling the auth provider again.',
);
assertIncludes(
  loginSource,
  "logAuthDev('[Auth] SignIn CTA blocked by in-flight request'",
  'Blocked rapid presses should be logged as dev-gated input suppression, not as a second login attempt.',
);
assertIncludes(
  loginSource,
  'const result = await signIn(trimmedEmail, password, keepSignedIn, source);',
  'Single-click sign-in should pass the CTA source into the provider.',
);

assertNotIncludes(
  loginSource,
  "console.log('[Auth] Login attempt start'",
  'Login attempt start telemetry should be emitted only by the auth provider.',
);
assertNotIncludes(
  loginSource,
  "console.log('[Auth] Auth request response'",
  'Auth response telemetry should be emitted only by the auth provider.',
);
assertNotIncludes(
  loginSource,
  "console.log('[Auth] Login attempt success'",
  'Login success telemetry should be emitted only by the auth provider.',
);
assertNotIncludes(
  loginSource,
  "console.log('[Auth] Login attempt failure'",
  'Login failure telemetry should be emitted only by the auth provider.',
);
assertNotIncludes(
  loginSource,
  'passwordLength',
  'Login screen telemetry must not log password length metadata.',
);
assertNotIncludes(
  loginSource,
  'email: trimmedEmail.toLowerCase()',
  'Login screen telemetry must not log raw normalized email values.',
);
assertIncludes(
  loginSource,
  'email: maskAuthEmail(trimmedEmail)',
  'Login screen telemetry should mask email values when validation succeeds.',
);

assertIncludes(
  appContextSource,
  'const signInAttemptRef = useRef<Promise<SignInResult> | null>(null);',
  'Auth provider should keep a promise-level in-flight guard.',
);
assertIncludes(
  signInBlock,
  'if (signInAttemptRef.current) {\n      return signInAttemptRef.current;\n    }',
  'Concurrent signIn calls should join the active request instead of starting a second one.',
);
assertIncludes(
  signInBlock,
  'signInAttemptRef.current = attempt;',
  'The active login promise should be registered before returning to callers.',
);
assertIncludes(
  signInBlock,
  'signInAttemptRef.current = null;',
  'The provider guard should reset after the login attempt settles.',
);
assert.strictEqual(
  count(signInBlock, 'supabase.auth.signInWithPassword'),
  1,
  'The provider signIn flow should contain exactly one Supabase password-auth call.',
);

assert.strictEqual(
  count(signInBlock, "console.log('[Auth] Login attempt start'"),
  1,
  'Each intended provider login attempt should have one start event.',
);
assert.strictEqual(
  count(signInBlock, "console.log('[Auth] Auth request response'"),
  1,
  'Each intended provider login attempt should have one auth response event.',
);
assert.strictEqual(
  count(signInBlock, "console.log('[Auth] Login attempt success'"),
  1,
  'Each intended provider login attempt should have one success event.',
);
assertIncludes(
  signInBlock,
  'source: attemptSource',
  'Provider login telemetry should preserve the original CTA source.',
);
assertIncludes(
  signInBlock,
  'emailHash: hashAuthIdentifier(loginEmail)',
  'Provider login telemetry should keep a stable redacted email correlation key.',
);
assertNotIncludes(
  signInBlock,
  'email: loginEmail',
  'Provider login telemetry must not log raw normalized email values.',
);
assertNotIncludes(
  signInBlock,
  'userId: data.user.id',
  'Provider login telemetry must not log raw user IDs.',
);

console.log('Auth single-login request regression checks passed.');
