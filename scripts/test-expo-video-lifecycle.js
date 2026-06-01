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
  !loginHero.includes("Platform.OS !== 'android'"),
  'LoginHeroBackground should not disable the login video on Android.',
);
assert(
  loginHero.includes("status === 'readyToPlay'") &&
    loginHero.includes('onFirstFrameRender') &&
    loginHero.includes("safePlayerAction('play')"),
  'LoginHeroBackground should mark the video ready from status or first frame and keep playback running.',
);
assert(
  !loginHero.includes('if (videoFailed || !videoReady) {\n      safePlayerAction(\'pause\');'),
  'LoginHeroBackground must not pause the video while waiting for the first frame.',
);
assert(
  loginHero.includes('<Image source={LOGIN_FALLBACK} resizeMode="cover" style={styles.fallbackImage} />'),
  'LoginHeroBackground should keep the fallback image underneath the video while it loads.',
);
assert(
  loadingTransition.includes('safePlaybackAction') && loadingTransition.includes('clearInterval(cycleTimer)'),
  'LoadingTransitionVideo should guard interval playback calls and clear the interval on unmount.',
);
assert(
  loadingTransition.includes('const LOADING_FALLBACK') &&
    loadingTransition.includes('<Image source={LOADING_FALLBACK} resizeMode="cover" style={styles.fallbackImage} />') &&
    loadingTransition.includes('flex: 1') &&
    loadingTransition.includes("backgroundColor: '#040608'") &&
    loadingTransition.includes('videoFailed') &&
    loadingTransition.includes('videoReady') &&
    loadingTransition.includes('onFirstFrameRender') &&
    loadingTransition.includes('<ActivityIndicator size="small" color={TACTICAL.amber} />'),
  'LoadingTransitionVideo should show a branded non-gray fallback while media loads or fails.',
);
assert(
  loginBackground.includes('if (!isMountedRef.current || hasSignalled.current) return;'),
  'Native login video status callbacks should not run after unmount.',
);

console.log('Expo video lifecycle regression checks passed.');
