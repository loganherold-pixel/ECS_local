const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const authSource = read('lib/auth.ts');
const purchaseSource = read('lib/ecsProPurchase.ts');
const accessSource = read('lib/subscriptionAccess.ts');
const appContextSource = read('context/AppContext.tsx');
const offlinePolicySource = read('lib/auth/offlineAccessPolicy.ts');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(__dirname, '..', relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

assert(
  authSource.includes('function buildSafeFallbackAccessState()'),
  'auth.ts should define a safe non-privileged fallback access state.',
);

assert(
  !authSource.includes("buildSharedAccountAccessState({ email, role: 'user', status: 'active' })") &&
    !authSource.includes("buildSharedAccountAccessState({ role: 'user', status: 'active' })"),
  'auth.ts should not reconstruct privileged shared/admin access in local fallback branches.',
);

assert(
  !purchaseSource.includes('}) || purchases[0]'),
  'restore flow must not fall back to the first unrelated store purchase.',
);

assert(
  accessSource.includes('const ENTITLEMENT_VERIFICATION_MAX_AGE_MS') &&
    accessSource.includes('isEntitlementVerificationFresh'),
  'subscriptionAccess.ts should enforce a verification freshness window for standard Pro access.',
);

assert(
  appContextSource.includes('AppState.addEventListener') &&
    appContextSource.includes('canReuseOperatorInfoSnapshot'),
  'AppContext.tsx should refresh access on app foreground and preserve prior server-validated access during transient refresh failures.',
);

assert(
  offlinePolicySource.includes('function hasReusableCachedAccess') &&
    offlinePolicySource.includes("return null;") &&
    offlinePolicySource.includes("snapshot.last_verified_at.trim().length > 0"),
  'offlineAccessPolicy.ts should fail closed for non-reusable cached operator snapshots.',
);

const {
  canReuseOperatorInfoSnapshot,
  resolveCachedOperatorAccessSnapshot,
} = loadTypeScriptModule('lib/auth/offlineAccessPolicy.ts');

function operator(overrides = {}) {
  return {
    role: 'user',
    status: 'active',
    display_name: null,
    email: 'driver@example.com',
    exists: true,
    access_level: 'standard',
    account_kind: 'standard',
    entitlement_status: 'free',
    is_shared_internal: false,
    is_shared_account: false,
    internal_account_type: null,
    is_admin: false,
    has_full_app_access: false,
    allow_password_rotation: false,
    can_rotate_shared_password: false,
    can_revoke_shared_sessions: false,
    revoke_sessions_supported: false,
    subscription_provider: null,
    subscription_product_id: null,
    subscription_environment: null,
    current_period_end_at: null,
    current_period_start_at: null,
    grace_expires_at: null,
    revoked_at: null,
    last_verified_at: null,
    ...overrides,
  };
}

const staleVerifiedPro = operator({
  entitlement_status: 'pro_active',
  subscription_provider: 'google_play',
  last_verified_at: '2026-01-01T00:00:00.000Z',
});

assert(
  resolveCachedOperatorAccessSnapshot({
    snapshot: staleVerifiedPro,
    currentUserEmail: 'DRIVER@example.com',
    isOnline: false,
  }) === staleVerifiedPro,
  'Previously verified paid access may be reused during offline/transient refresh failure.',
);

assert(
  resolveCachedOperatorAccessSnapshot({
    snapshot: operator({ entitlement_status: 'pro_active', subscription_provider: 'google_play' }),
    currentUserEmail: 'driver@example.com',
    isOnline: true,
  }) === null,
  'Unverified paid-looking access must not be reused after provider refresh failure.',
);

assert(
  resolveCachedOperatorAccessSnapshot({
    snapshot: operator({ entitlement_status: 'free' }),
    currentUserEmail: 'driver@example.com',
    isOnline: true,
  }) === null,
  'Free fallback snapshots should not be treated as reusable privileged access.',
);

assert(
  canReuseOperatorInfoSnapshot({
    snapshot: operator({ entitlement_status: 'revoked', revoked_at: '2026-01-01T00:00:00.000Z' }),
    currentUserEmail: 'driver@example.com',
    isOnline: true,
  }) === false,
  'Revoked cached access must fail closed during provider refresh failure.',
);

assert(
  canReuseOperatorInfoSnapshot({
    snapshot: operator({
      role: 'admin',
      access_level: 'super_admin',
      is_admin: true,
      has_full_app_access: true,
      entitlement_status: 'free',
    }),
    currentUserEmail: 'other@example.com',
    isOnline: true,
  }) === false,
  'Cached access snapshots must not be reused for a different signed-in account.',
);

console.log('subscription hardening checks passed');
