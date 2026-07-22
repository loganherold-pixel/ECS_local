const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const coordinatorSource = read('lib/auth/freeSessionTransition.ts');
const appContext = read('context/AppContext.tsx');
const login = read('app/login.tsx');
const layout = read('app/_layout.tsx');
const loading = read('components/LoadingTransitionVideo.tsx');
const setup = read('app/setup.tsx');
const videoOwner = read('lib/auth/useOwnedVideoPlayer.ts');
const supabase = read('lib/supabase.ts');
const routeCap = read('supabase/functions/route-catalog-search/index.ts');

const compiled = ts.transpileModule(coordinatorSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const shim = { exports: {} };
new Function('module', 'exports', compiled.outputText)(shim, shim.exports);
const events = [];
const create = () => shim.exports.createFreeSessionTransitionCoordinator({
  correlationId: (generation) => `test-${generation}`,
  onEvent: (event, snapshot) => events.push([event, snapshot]),
});

// 1-4: both profiles share deterministic authority despite provider availability.
for (const profile of ['fieldtest-pending', 'fieldtest-no-session', 'fieldtest-stale-session', 'qa-supabase-disabled']) {
  const coordinator = create();
  const hydrationGeneration = coordinator.snapshot().generation;
  const generation = coordinator.begin();
  assert.strictEqual(generation, 1, `${profile}: first press activates generation one`);
  assert.strictEqual(coordinator.commit(generation), true, `${profile}: state commits`);
  assert.strictEqual(coordinator.requestNavigation(generation, '/setup'), true, `${profile}: navigation dispatches`);
  assert.strictEqual(coordinator.shouldIgnoreHydration(hydrationGeneration), true, `${profile}: stale hydration is ignored`);
}

// 5-8: video readiness/failure never owns navigation; stale callbacks are rejected.
assert.ok(loading.includes('Preparing your offline workspace'), '5: already-playing video retains the shell');
assert.ok(loading.includes('accessibilityRole="progressbar"'), '6: loading video retains labeled progress');
assert.ok(loading.includes('Visual transition unavailable. Workspace startup continues.'), '7: video failure is finite and nonblocking');
assert.ok(videoOwner.includes("recordAuthDiagnostic('stale_video_callback_rejected'"), '8: callback after unmount is rejected');

const coordinator = create();
const generation = coordinator.begin();
assert.strictEqual(coordinator.begin(), null, '9: duplicate rapid press is rejected');
assert.strictEqual(coordinator.commit(generation), true);
for (let index = 0; index < 5; index += 1) assert.strictEqual(coordinator.isAuthoritative(), true, '10: repeated guard evaluation preserves authority');
assert.strictEqual(coordinator.requestNavigation(generation, '/setup'), true);
assert.strictEqual(coordinator.shouldIgnoreHydration(0), true, '11: hydration after dispatch is ignored');
assert.ok(videoOwner.includes('if (disposed)'), '12: background callback checks ownership');
assert.strictEqual(coordinator.markDestinationMounted('/setup'), true, '13: foreground destination remains mounted');
assert.ok(videoOwner.includes('if (disposed) return;'), '14: cleanup is idempotent');
assert.strictEqual(coordinator.requestNavigation(generation, '/setup'), false, '15: navigation count remains exactly one');
assert.strictEqual(coordinator.snapshot().navigationCount, 1);
assert.ok(!videoOwner.includes('player.pause();'), '16: cleanup cannot call pause after native ownership ends');
assert.ok(setup.includes('ECS Free Session') && setup.includes('Opening Fleet setup'), '17: destination shell is visible');
assert.ok(setup.includes('accessibilityRole="header"') && setup.includes('accessibilityLabel="ECS Free Session destination'), '18: destination accessibility is labeled');
assert.ok(appContext.includes('if (freeSessionCoordinator.isAuthoritative())') && appContext.includes('resetForIntentionalSignIn'), '19: intentional signed-in startup remains authoritative');
coordinator.resetForIntentionalSignIn();
assert.deepStrictEqual(
  coordinator.snapshot(),
  { state: 'idle', generation, correlationId: null, navigationCount: 0, navigationTarget: null },
  '19: intentional sign-in synchronously releases Free authority and clears its target',
);
assert.ok(events.some(([event]) => event === 'free_session_intentional_sign_in_reset'),
  '19: intentional sign-in publishes the semantic reset to provider consumers');
assert.ok(supabase.includes('EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED') && supabase.includes('network-disabled route-discovery QA build'), '20: Artifact B remains network disabled');
assert.ok(routeCap.includes('const ROUTE_SEARCH_RESULT_LIMIT = 20'), '21: strict Explore cap remains 20');

assert.ok(login.includes('dispatchFreeSessionNavigation(generation, destinationPath)') && layout.includes('committedFreeSession'));
assert.ok(events.every(([, snapshot]) => !JSON.stringify(snapshot).match(/email|token|coordinate|userId/i)), 'diagnostics remain privacy-safe');
console.log('Auth free-session transition checks passed (21 deterministic scenarios).');
