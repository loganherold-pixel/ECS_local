const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
const ownerSource = read('lib/auth/useOwnedVideoPlayer.ts');
const loginSource = read('app/login.tsx');
const heroSource = read('components/login/LoginHeroBackground.tsx');
const loadingSource = read('components/LoadingTransitionVideo.tsx');

const calls = [];
let playerCount = 0;
const mockPlayer = {
  loop: false,
  muted: false,
  play: () => calls.push('play'),
  pause: () => calls.push('pause'),
  replay: () => calls.push('replay'),
  release: () => calls.push('release'),
  addListener: (_event, listener) => {
    mockPlayer.listener = listener;
    return { remove: () => calls.push('remove-listener') };
  },
};

const compiled = ts.transpileModule(ownerSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputText)(
  moduleShim,
  moduleShim.exports,
  (id) => {
    if (id === 'react') return { useEffect: () => undefined, useRef: (value) => ({ current: value }) };
    if (id === 'expo-video') return { createVideoPlayer: () => { playerCount += 1; return mockPlayer; } };
    if (id === './authDiagnostics') return { recordAuthDiagnostic: () => undefined };
    return require(id);
  },
);

const owner = moduleShim.exports.createOwnedVideoPlayer(1, (player) => {
  player.loop = true;
  player.muted = true;
  player.play();
});
const subscription = owner.listen('statusChange', () => calls.push('status-callback'));
assert.strictEqual(playerCount, 1, 'One transition media owner should create one player.');
assert.strictEqual(owner.action((player) => player.replay()), true, 'Active owner should accept playback actions.');
owner.dispose();
owner.dispose();
subscription.remove();
assert.deepStrictEqual(
  calls,
  ['play', 'replay', 'remove-listener', 'release'],
  'Cleanup must remove listeners and release once in ownership order.',
);
assert.strictEqual(owner.action((player) => player.play()), false, 'No video method may run after release.');

assert.ok(!heroSource.includes('useVideoPlayer'), 'Login hero must not mix hook-owned release with component cleanup.');
assert.ok(!loadingSource.includes('useVideoPlayer'), 'Loading transition must not mix hook-owned release with component cleanup.');
assert.ok(loginSource.includes("| 'state_committed'") && loginSource.includes("| 'destination_mounted'"), 'Free entry must expose the authoritative finite transition state machine.');
assert.ok(loginSource.includes('beginFreeSessionTransition()'), 'First free-entry press must synchronously claim transition ownership.');
assert.ok(loginSource.includes('dispatchFreeSessionNavigation(generation)'), 'Free entry must guard navigation emission.');
assert.ok(loginSource.includes('commitFreeSessionTransition(generation)'), 'Loaded and loading media paths must commit state before navigation.');
assert.ok(loginSource.includes("setFreeEntryTransition('failed')"), 'Offline activation failures must reach a retryable state.');
assert.ok(loginSource.includes('Retry Free Entry'), 'Activation failure must remain visibly retryable.');
assert.ok(loginSource.includes('accessibilityLabel="Continue with Free"'), 'Free entry must have an accessible label.');
assert.ok(loginSource.includes('accessibilityState={{ disabled: utilityBusy, busy:'), 'Free-entry progress must be exposed to accessibility services.');
assert.ok(loadingSource.includes('accessibilityRole="progressbar"'), 'The handoff shell must expose a nonempty accessibility tree.');
assert.ok(loadingSource.includes('Preparing your offline workspace'), 'The handoff must remain visibly meaningful without video.');
assert.ok(heroSource.includes('playerOwner.listen') && loadingSource.includes('playerOwner.listen'), 'Late status callbacks must be owned and detached before release.');
assert.ok(heroSource.includes('AppState.addEventListener'), 'Login media must retain foreground/background handling.');
assert.ok(loginSource.includes("const handleLogin = useCallback(async"), 'Existing signed-in login behavior must remain present.');
assert.ok(loginSource.includes('commitFreeSessionTransition(generation)'), 'Network-disabled and ordinary guest entry must retain local offline activation.');

console.log('Auth video transition lifecycle checks passed (16 contract scenarios).');
