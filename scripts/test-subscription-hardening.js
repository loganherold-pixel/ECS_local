const fs = require('fs');
const path = require('path');

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

console.log('subscription hardening checks passed');
