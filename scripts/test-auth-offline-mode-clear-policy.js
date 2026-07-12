const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'lib', 'auth', 'offlineModeClearPolicy.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const moduleShim = { exports: {} };

new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
  moduleShim.exports,
  require,
  moduleShim,
  sourcePath,
  path.dirname(sourcePath),
);

const { shouldClearOfflineModeForAuthCleanup } = moduleShim.exports;

for (const reason of ['startup_signed_out', 'initial_provider_session', 'session_restore_failure']) {
  assert.equal(
    shouldClearOfflineModeForAuthCleanup({ reason, persistedOfflineMode: true }),
    false,
    `${reason} should preserve an explicit local-mode selection.`,
  );
  assert.equal(
    shouldClearOfflineModeForAuthCleanup({ reason, persistedOfflineMode: false }),
    true,
    `${reason} should clear ordinary signed-out startup state.`,
  );
}

for (const reason of ['provider_signed_out', 'session_expired', 'authenticated', 'explicit_sign_out']) {
  assert.equal(
    shouldClearOfflineModeForAuthCleanup({ reason, persistedOfflineMode: true }),
    true,
    `${reason} must clear offline mode even when an old persisted flag exists.`,
  );
}

console.log('Auth offline-mode cleanup policy checks passed.');
