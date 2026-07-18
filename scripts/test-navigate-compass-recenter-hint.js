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
  !source.includes("'LOCKED'") &&
    !source.includes("'TAP TO CENTER'") &&
    !source.includes('styles.recenterHint') &&
    !source.includes('styles.recenterHintText') &&
    !source.includes('recenterHintSeenThisSession') &&
    !source.includes('tapHintVisible'),
  'Compass must not render an external lock or recenter-helper container above the dial.',
);

assert(
  source.includes('const handlePress = () => {') &&
    source.includes('onPress?.();'),
  'Removing the helper container must preserve the compass recenter action.',
);

assert(
  source.includes("accessibilityRole: 'button' as const") &&
    source.includes("accessibilityLabel: 'Recenter map on current location'") &&
    source.includes("accessibilityHint: 'Centers the map on your current GPS location.'"),
  'Compass recenter action should be accessible.',
);

assert(
  source.includes('if (!visible || paused || isStationaryLocked) return;') &&
    source.includes('if (!visible || paused || isStationaryLocked) {') &&
    source.includes('rotateAnim.stopAnimation();'),
  'Stationary lock must remain an internal heading-freeze state rather than an external visual badge.',
);

assert(
  source.includes("overflow: 'visible'") &&
    source.includes('height: COMPASS_SIZE') &&
    source.includes('position: \'absolute\',\n    bottom: 0,\n    left: 0,\n    width: COMPASS_SIZE') &&
    !source.includes('bottom: COMPASS_SIZE + 6'),
  'Compass layout must be limited to the dial instead of reserving space for an external status pill.',
);

assert(
  source.includes("source = 'none'") &&
    source.includes("source === 'gps' ? 'GPS'") &&
    source.includes('styles.headingSourceBadge') &&
    source.includes('styles.headingSourceText'),
  'Compass should surface whether the live heading is coming from GPS, device compass, or no fix.',
);

console.log('navigate compass presentation regression passed');
