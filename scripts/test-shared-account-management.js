const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const moreSource = read('app/(tabs)/more.tsx');
const authHandlerSource = read('supabase/functions/auth-handler/index.ts');
const authSource = read('lib/auth.ts');

assert(
  authHandlerSource.includes("case 'rotate_shared_account_password'"),
  'auth-handler must expose rotate_shared_account_password.',
);

assert(
  authHandlerSource.includes('if (!isSharedInternalAccount(email))') &&
    authHandlerSource.includes("return jsonResponse({ error: 'Not authorized' }, 403);"),
  'shared-account password rotation must remain server-authorized.',
);

assert(
  authHandlerSource.includes("access_level: 'full_app_access'") &&
    authHandlerSource.includes('is_admin: false'),
  'shared-account rotation response must preserve full access without admin rights.',
);

assert(
  authSource.includes('export async function rotateSharedAccountPassword('),
  'client auth helper must expose shared-account password rotation.',
);

assert(
  moreSource.includes('SHARED INTERNAL ACCOUNT') &&
    moreSource.includes('NO ADMIN RIGHTS') &&
    moreSource.includes('Sign out existing sessions'),
  'settings UI must show the shared-account label, no-admin state, and optional session revoke control.',
);

assert(
  moreSource.includes('await refreshAccessState().catch(() => {});'),
  'shared-account settings flow should refresh backend access state after password rotation.',
);

console.log('shared account management checks passed');
