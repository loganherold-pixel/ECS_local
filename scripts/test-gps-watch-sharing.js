const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const geofenceMonitor = read('lib', 'useGeofenceMonitor.ts');
const sharedGps = read('lib', 'sharedGPSLocation.ts');
const dashboard = read('app', '(tabs)', 'dashboard.tsx');
const pkg = JSON.parse(read('package.json'));

assert.ok(
  geofenceMonitor.includes("import { useThrottledGPS } from './useThrottledGPS';"),
  'Geofence monitor should subscribe to the shared throttled GPS pipeline.',
);
assert.strictEqual(
  geofenceMonitor.includes('useGPSLocation({ enabled'),
  false,
  'Geofence monitor must not create a separate native GPS watcher.',
);
assert.ok(
  geofenceMonitor.includes('const gps = useThrottledGPS({ enabled });'),
  'Geofence monitor should preserve independent enablement while sharing the native GPS watcher.',
);
assert.ok(
  dashboard.includes('const geofenceMonitor = useGeofenceMonitor({') &&
    dashboard.includes('enabled: useIsFocused() && geofenceEnabled,'),
  'Dashboard should keep geofence monitoring independently enabled when focused.',
);
assert.ok(
  sharedGps.includes('private subscribers = new Map') &&
    sharedGps.includes('resolveActiveOptions()') &&
    sharedGps.includes('this.subscribers.set(id, normalizeOptions(options));'),
  'Shared GPS store should arbitrate multiple subscribers through one active watcher.',
);
assert.ok(
  pkg.scripts['test:gps-watch-sharing'],
  'package.json should expose the GPS watch sharing regression test.',
);

console.log('GPS watch sharing checks passed.');
