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
    source.includes('style={[styles.recenterHint, { opacity: hintFadeAnim }]}'),
  'Recenter helper label must not intercept compass touch events.',
);

assert(
  source.includes('top: COMPASS_SIZE + 6') &&
    !source.includes('top: -18'),
  'Recenter helper label should sit below the compass instead of over it.',
);

assert(
  source.includes("backgroundColor: 'rgba(11,15,18,0.56)'") &&
    source.includes("color: 'rgba(214,208,190,0.58)'"),
  'Recenter helper label should be visually subtle.',
);

console.log('navigate compass recenter hint regression passed');
