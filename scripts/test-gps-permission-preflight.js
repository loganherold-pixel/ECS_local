const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const permissionHelper = read('lib', 'locationPermissions.ts');
const sharedGps = read('lib', 'sharedGPSLocation.ts');
const gpsHook = read('lib', 'useGPSLocation.ts');
const headingHook = read('lib', 'useVehicleHeading.ts');
const gpsDistanceTracker = read('lib', 'gpsDistanceTracker.ts');
const convoyLocationPublisher = read('lib', 'convoy', 'convoyLocationPublisher.ts');
const quickActions = read('components', 'QuickActionsSheet.tsx');
const dispatchCommandCenter = read('components', 'dispatch', 'DispatchCadCommandCenter.tsx');
const navigateRun = read('app', 'navigate-run.tsx');
const convoyMap = read('components', 'convoy', 'ConvoyCommandMap.tsx');
const pkg = JSON.parse(read('package.json'));

assert.ok(
  permissionHelper.includes('getForegroundPermissionsAsync'),
  'Foreground location helper should preflight current permission status.',
);
assert.ok(
  permissionHelper.includes("current?.status === 'granted'"),
  'Foreground location helper should return granted status without requesting again.',
);
assert.ok(
  permissionHelper.includes('Location.requestForegroundPermissionsAsync()'),
  'Foreground location helper should still request when permission is not already usable.',
);

for (const [label, source] of [
  ['shared GPS store', sharedGps],
  ['useGPSLocation hook', gpsHook],
  ['vehicle heading hook', headingHook],
  ['GPS distance tracker', gpsDistanceTracker],
  ['convoy location publisher', convoyLocationPublisher],
  ['Quick Actions GPS shortcut', quickActions],
  ['Dispatch Recovery Assist GPS capture', dispatchCommandCenter],
  ['Navigate Run immediate GPS capture', navigateRun],
]) {
  assert.ok(source.includes('ensureForegroundLocationPermission'), `${label} should use the shared foreground permission preflight helper.`);
  assert.ok(
    source.includes('ensureForegroundLocationPermission(Location)'),
    `${label} should route foreground permission checks through the preflight helper.`,
  );
  assert.strictEqual(
    source.includes('Location.requestForegroundPermissionsAsync()'),
    false,
    `${label} must not directly relaunch the Android permission controller on mount.`,
  );
}

assert.strictEqual(
  convoyMap.includes('logoEnabled={false}'),
  false,
  'Convoy native map must not disable the Mapbox logo.',
);
assert.strictEqual(
  convoyMap.includes('attributionEnabled={false}'),
  false,
  'Convoy native map must not disable Mapbox attribution.',
);
assert.ok(
  convoyMap.includes('logoEnabled') && convoyMap.includes('attributionEnabled'),
  'Convoy native map should explicitly keep Mapbox logo and attribution enabled.',
);

assert.ok(
  pkg.scripts['test:gps-permission-preflight'],
  'package.json should expose the GPS permission preflight regression test.',
);

console.log('GPS permission preflight and native Mapbox compliance checks passed.');
