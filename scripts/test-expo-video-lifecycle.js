const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const loginHero = read(path.join('components', 'login', 'LoginHeroBackground.tsx'));
const loginBackground = read(path.join('components', 'login', 'VideoBackground.tsx'));
const loadingTransition = read(path.join('components', 'LoadingTransitionVideo.tsx'));

assert(
  loginBackground.includes('const NATIVE_VIDEO_SOURCE = { uri: VIDEO_URI };'),
  'Native login video source must be stable outside render.',
);
assert(
  !loginBackground.includes('useVideoPlayer(\n    { uri: VIDEO_URI }'),
  'Native login video must not pass a new object literal to useVideoPlayer on every render.',
);

for (const [name, source] of [
  ['LoginHeroBackground', loginHero],
  ['VideoBackground', loginBackground],
  ['LoadingTransitionVideo', loadingTransition],
]) {
  assert(source.includes('isMountedRef'), `${name} should guard async video callbacks after unmount.`);
  assert(source.includes('player.pause()'), `${name} should pause safely during unmount cleanup.`);
  assert(!source.includes('.release('), `${name} should not manually release expo-video players.`);
}

assert(
  loginHero.includes('safePlayerAction') && loginHero.includes('markVideoFailed'),
  'LoginHeroBackground should guard player method calls and fall back cleanly on errors.',
);
assert(
  loadingTransition.includes('safePlaybackAction') && loadingTransition.includes('clearInterval(cycleTimer)'),
  'LoadingTransitionVideo should guard interval playback calls and clear the interval on unmount.',
);
assert(
  loginBackground.includes('if (!isMountedRef.current || hasSignalled.current) return;'),
  'Native login video status callbacks should not run after unmount.',
);

console.log('Expo video lifecycle regression checks passed.');
