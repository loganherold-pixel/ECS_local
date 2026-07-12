const fs = require('fs');
const path = require('path');

const compassPath = path.join(process.cwd(), 'components/navigate/CompassRose.tsx');
const source = fs.readFileSync(compassPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  source.includes('const RECENTER_HINT_VISIBLE_MS = 3400;') &&
    source.includes('const RECENTER_HINT_FADE_MS = ECS_MOTION.intelBarFadeOut;') &&
    source.includes('let recenterHintSeenThisSession = false;'),
  'Compass recenter hint should use a short first-session display window and ECS motion timing.',
);

assert(
  source.includes('const dismissTapHint = useCallback(() => {') &&
    source.includes('ECS_EASE.accelerate') &&
    source.includes('recenterHintSeenThisSession = true;') &&
    source.includes('const handlePress = () => {') &&
    source.includes('dismissTapHint();') &&
    source.includes('onPress?.();'),
  'Compass press should still call the recenter handler and fade the hint as seen.',
);

assert(
  source.includes("accessibilityRole: 'button' as const") &&
    source.includes("accessibilityLabel: 'Recenter map on current location'") &&
    source.includes("accessibilityHint: 'Centers the map on your current GPS location.'"),
  'Compass recenter action should be accessible.',
);

assert(
  source.includes('pointerEvents="none"') &&
    source.includes('accessible={false}') &&
    source.includes('importantForAccessibility="no"') &&
    source.includes('const showRecenterHint = !paused && (isStationaryLocked || tapHintVisible);') &&
    source.includes('const persistentRecenterHint = isStationaryLocked;') &&
    source.includes('style={styles.recenterHint}') &&
    source.includes('style={[styles.recenterHint, { opacity: hintFadeAnim }]}') &&
    !source.includes('POWER SAVE') &&
    !source.includes("'PAUSED'"),
  'Recenter helper label must not intercept compass touch events, and paused power-save state should not render a space-taking visual pill.',
);

assert(
    source.includes('bottom: COMPASS_SIZE + 6') &&
    source.includes("overflow: 'visible'") &&
    source.includes('height: COMPASS_SIZE') &&
    source.includes('position: \'absolute\',\n    bottom: 0,\n    left: 0,\n    width: COMPASS_SIZE') &&
    source.includes('left: -14') &&
    source.includes('right: -14') &&
    source.includes('minHeight: 20') &&
    source.includes('lineHeight: 12') &&
    source.includes('zIndex: 9') &&
    source.includes('elevation: 9') &&
    !source.includes('top: COMPASS_SIZE + 6'),
  'Recenter helper label should sit above the compass when shown while the compass itself keeps compact Android bounds.',
);

assert(
  source.includes("backgroundColor: 'rgba(11,15,18,0.72)'") &&
    source.includes("color: 'rgba(214,208,190,0.76)'"),
  'Recenter helper label should be visually subtle.',
);

assert(
  source.includes("source = 'none'") &&
    source.includes("source === 'gps' ? 'GPS'") &&
    source.includes('styles.headingSourceBadge') &&
    source.includes('styles.headingSourceText'),
  'Compass should surface whether the live heading is coming from GPS, device compass, or no fix.',
);

console.log('navigate compass recenter hint regression passed');
