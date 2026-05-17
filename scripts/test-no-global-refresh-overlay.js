const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

const rootLayout = read('app', '_layout.tsx');
const dashboard = read('app', '(tabs)', 'dashboard.tsx');
const navigate = read('app', '(tabs)', 'navigate.tsx');
const discover = read('app', '(tabs)', 'discover.tsx');
const dispatch = read('app', '(tabs)', 'alert.tsx');
const index = read('app', 'index.tsx');
const refreshHelper = read('lib', 'nonObstructiveRefreshControl.ts');

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

assertIncludes(
  index,
  "import LoadingTransitionVideo from '../components/LoadingTransitionVideo';",
  'The entry route may still render the startup loading video before app chrome mounts.',
);

assertNotIncludes(
  rootLayout,
  'videoLoadingOverlay',
  'The shared root shell must not define or render a full-screen loading overlay over app chrome.',
);
assertIncludes(
  rootLayout,
  'if (postAuthRedirectHoldingScreenActive) {',
  'The shared root shell should keep the post-auth loading video isolated to the pre-shell holding branch.',
);
assertIncludes(
  rootLayout,
  'return <LoadingTransitionVideo />;',
  'The post-auth holding branch should return the loading video before app chrome mounts.',
);

assertNotIncludes(
  dashboard,
  "import LoadingTransitionVideo from '../../components/LoadingTransitionVideo';",
  'Dashboard hydration must not use the global loading video overlay.',
);
assertNotIncludes(
  dashboard,
  'dashboardHydrationOverlay',
  'Dashboard hydration must not define or render an obstructive overlay container.',
);
assertNotIncludes(
  dashboard,
  '<LoadingTransitionVideo />',
  'Dashboard hydration must not render a full-screen loading video over app chrome.',
);

for (const [name, source] of [
  ['Navigate', navigate],
  ['Dashboard', dashboard],
  ['Explorer', discover],
  ['Dispatch', dispatch],
]) {
  assertNotIncludes(
    source,
    'RefreshControl',
    `${name} should not mount a pull-to-refresh control that can draw a top refresh bar over the app banner.`,
  );
}

assertIncludes(
  refreshHelper,
  "tintColor: 'transparent'",
  'Shared refresh controls should not draw a visible top spinner/bar.',
);
assertIncludes(
  refreshHelper,
  "progressBackgroundColor: 'transparent'",
  'Shared refresh controls should not draw a gray refresh background.',
);

for (const [name, source] of [
  ['Load Map', read('app', '(tabs)', 'loadmap.tsx')],
  ['Power Home', read('app', 'power', 'index.tsx')],
  ['Power Manage', read('app', 'power', 'manage.tsx')],
  ['Expedition Dispatch', read('app', 'expedition-dispatch.tsx')],
  ['Weight Dashboard', read('components', 'weight-dashboard', 'WeightDashboardPanel.tsx')],
]) {
  assertIncludes(
    source,
    'NON_OBSTRUCTIVE_REFRESH_CONTROL_PROPS',
    `${name} should use the shared transparent refresh presentation.`,
  );
  assertIncludes(
    source,
    '<RefreshControl\n',
    `${name} should keep pull-to-refresh behavior wired through RefreshControl.`,
  );
  assertIncludes(
    source,
    '{...NON_OBSTRUCTIVE_REFRESH_CONTROL_PROPS}',
    `${name} should spread the non-obstructive refresh props onto RefreshControl.`,
  );
  assertNotIncludes(
    source,
    'progressBackgroundColor={',
    `${name} should not override the transparent refresh background inline.`,
  );
}

console.log('Global refresh overlay regression checks passed.');
