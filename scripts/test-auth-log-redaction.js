const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const redactionPath = path.join(root, 'lib', 'auth', 'authLogRedaction.ts');
const source = fs.readFileSync(redactionPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});

const moduleShim = { exports: {} };
const load = new Function('module', 'exports', compiled.outputText);
load(moduleShim, moduleShim.exports);

const {
  hashAuthIdentifier,
  maskAuthEmail,
  redactAuthUserId,
  sanitizeAuthLogPayload,
} = moduleShim.exports;

const rawEmail = 'admin@expeditioncommand.com';
const rawUserId = '123e4567-e89b-12d3-a456-426614174000';

assert.strictEqual(
  maskAuthEmail(rawEmail),
  'a***@expeditioncommand.com',
  'Auth email logs should retain only a masked local part and domain.',
);

assert.strictEqual(
  hashAuthIdentifier(rawEmail),
  hashAuthIdentifier(rawEmail),
  'Auth identifier hashes should be stable for correlation.',
);
assert.notStrictEqual(
  hashAuthIdentifier(rawEmail),
  rawEmail,
  'Auth identifier hashes must not return the raw email.',
);

const redactedUserId = redactAuthUserId(rawUserId);
assert.ok(redactedUserId.startsWith('user_'), 'User IDs should be converted to a diagnostic-safe token.');
assert.ok(!redactedUserId.includes(rawUserId), 'Redacted user IDs must not contain the raw ID.');
assert.ok(!redactedUserId.includes('123e4567'), 'Redacted user IDs must not expose recognizable UUID segments.');

const sanitized = sanitizeAuthLogPayload({
  source: 'cta_press',
  email: rawEmail,
  userId: rawUserId,
  passwordLength: 15,
  hasPassword: true,
  accessToken: 'secret-access-token',
  session: { access_token: 'secret-token', refresh_token: 'secret-refresh' },
  nested: {
    currentUserEmail: rawEmail,
    operatorUserId: rawUserId,
  },
});

const serialized = JSON.stringify(sanitized);
assert.strictEqual(sanitized.source, 'cta_press', 'Non-sensitive auth context should be preserved.');
assert.strictEqual(sanitized.email, 'a***@expeditioncommand.com', 'Top-level email should be masked.');
assert.strictEqual(sanitized.userId, redactedUserId, 'Top-level userId should be redacted.');
assert.strictEqual(sanitized.passwordLength, '[redacted]', 'Password length must be redacted.');
assert.strictEqual(sanitized.hasPassword, '[redacted]', 'Password presence metadata must be redacted.');
assert.strictEqual(sanitized.accessToken, '[redacted]', 'Tokens must be redacted.');
assert.strictEqual(sanitized.session, '[redacted]', 'Session objects must not be logged.');
assert.strictEqual(sanitized.nested.currentUserEmail, 'a***@expeditioncommand.com');
assert.strictEqual(sanitized.nested.operatorUserId, redactedUserId);
assert.strictEqual(
  sanitizeAuthLogPayload(`Auth failed for ${rawEmail} / ${rawUserId}`),
  `Auth failed for a***@expeditioncommand.com / ${redactedUserId}`,
  'Free-form auth strings should redact embedded emails and UUIDs.',
);
assert.ok(!serialized.includes(rawEmail), 'Sanitized payload must not contain raw email.');
assert.ok(!serialized.includes(rawUserId), 'Sanitized payload must not contain raw user ID.');
assert.ok(!serialized.includes('secret-access-token'), 'Sanitized payload must not contain raw tokens.');

console.log('Auth log redaction regression checks passed.');
