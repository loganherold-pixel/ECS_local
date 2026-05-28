const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

const header = read('components', 'Header.tsx');
const dashboardHeader = read('components', 'dashboard', 'DashboardHeader.tsx');
const authModal = read('components', 'AuthModal.tsx');

assert.ok(
  header.includes('const openLoginScreen = useCallback(() => {') &&
    header.includes("router.replace('/login');") &&
    header.includes("if (actionId === 'sign_in') {\n        openLoginScreen();"),
  'Global command hub Sign In action should route directly to /login.',
);

assert.ok(
  dashboardHeader.includes('const openLoginScreen = useCallback(() => {') &&
    dashboardHeader.includes("router.replace('/login');") &&
    dashboardHeader.includes("if (actionId === 'sign_in') {\n      openLoginScreen();"),
  'Dashboard command hub Sign In action should route directly to /login.',
);

assert.ok(
  dashboardHeader.includes("id: 'sign_in'") &&
    dashboardHeader.includes('Return to the ECS login screen without clearing saved local setup.') &&
    dashboardHeader.includes('onAccountAction={handleAccountAction}'),
  'Signed-out Dashboard command hub should expose a Sign In action wired to account handling.',
);

assert.ok(
  !header.includes('onProfilePress={!user ?') &&
    !dashboardHeader.includes('onProfilePress={onAuthPress}'),
  'Command hub profile identity row should remain informational instead of opening a duplicate account modal.',
);

assert.ok(
  authModal.includes("router.replace('/login');") &&
    !authModal.includes("router.push('/login');"),
  'Legacy auth modal Sign In should replace with the login screen instead of stacking a second account route.',
);

console.log('Account command hub sign-in routing checks passed.');
