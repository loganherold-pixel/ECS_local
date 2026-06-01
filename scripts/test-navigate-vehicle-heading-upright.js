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

const headingHook = read('lib/useVehicleHeading.ts');
const navigate = read('app/(tabs)/navigate.tsx');
const trailDecisionData = read('components/dashboard/commandCenter/useTrailDecisionData.ts');
const recoveryHazardCompassData = read('components/dashboard/commandCenter/useRecoveryHazardCompassData.ts');

assert(
  headingHook.includes("const DEFAULT_COMPASS_MODE: CompassMode = 'upright';") &&
    headingHook.includes('return DEFAULT_COMPASS_MODE;'),
  'Vehicle heading should default to the upright/cradle compass frame.',
);

assert(
  navigate.includes("initialMode: 'upright'"),
  'Navigate map heading hook should opt into the upright/cradle compass frame.',
);

assert(
  trailDecisionData.includes("initialMode: 'upright'") &&
    recoveryHazardCompassData.includes("initialMode: 'upright'"),
  'Dashboard command heading data hooks should opt into the upright/cradle compass frame.',
);

assert(
  headingHook.includes("let rawSource: 'compass' | 'gps' | 'none' = 'none';") &&
    headingHook.includes('const gpsHeadingUsable = hasGpsHeading && (') &&
    headingHook.includes('if (gpsHeadingUsable) {') &&
    headingHook.includes("rawSource = 'gps';") &&
    headingHook.includes('else if (compassHeadingRef.current != null) {') &&
    headingHook.includes("rawSource = 'compass';"),
  'Vehicle heading should prefer GPS course while moving, then fall back to compass heading.',
);

assert(
  headingHook.includes("if (rawSource === 'compass' && compassMode === 'upright')") &&
    headingHook.includes('GPS course, \'flat\', and \'auto\' use raw heading as-is'),
  'Upright orientation correction should apply only to compass heading, never GPS course.',
);

assert(
  headingHook.includes('if (angle === 90) return -90;') &&
    headingHook.includes('if (angle === 180) return 180;') &&
    headingHook.includes('if (angle === 270) return 90;') &&
    headingHook.includes('return -90;'),
  'Upright heading orientation offsets should cover portrait, landscape, and upside-down orientations.',
);

assert(
  headingHook.includes("if (rawSource === 'gps') {") &&
    headingHook.includes('updateNeedsRecalibration(false);'),
  'GPS course heading should not inherit compass recalibration warnings.',
);

console.log('navigate vehicle heading upright regression passed');
