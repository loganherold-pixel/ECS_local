const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const profilePanelSource = read('components', 'ProfileSettingsPanel.tsx');
const headerSource = read('components', 'Header.tsx');
const dashboardHeaderSource = read('components', 'dashboard', 'DashboardHeader.tsx');
const expeditionStoreSource = read('lib', 'expeditionStateStore.ts');
const geofenceMonitorSource = read('lib', 'useGeofenceMonitor.ts');
const roadNavigationSource = read('lib', 'useRoadNavigation.ts');
const trailNavigationSource = read('lib', 'useTrailNavigation.ts');
const trailGuidanceSource = read('lib', 'trailGuidanceEngine.ts');

assert.ok(
  !profilePanelSource.includes('GEOFENCE_PRESETS') &&
    !profilePanelSource.includes('onSelectGeofence') &&
    !profilePanelSource.includes('geofenceRadius: number') &&
    !profilePanelSource.includes('>GEOFENCE<'),
  'Account command hub should not expose configurable geofence meter options.',
);

assert.ok(
  !headerSource.includes('geofenceRadius={') &&
    !headerSource.includes('setGeofenceRadius') &&
    !dashboardHeaderSource.includes('geofenceRadius={') &&
    !dashboardHeaderSource.includes('setGeofenceRadius'),
  'Global header profile panels should not pass configurable geofence props.',
);

assert.ok(
  expeditionStoreSource.includes('const DEFAULT_GEOFENCE_RADIUS = 200') &&
    expeditionStoreSource.includes('getGeofenceRadius(): number {\n    return DEFAULT_GEOFENCE_RADIUS;\n  }') &&
    expeditionStoreSource.includes('setGeofenceRadius(_meters: number): void {\n    sClear(KEYS.geofenceRadius);\n  }'),
  'Expedition state store should pin the geofence radius to the ECS 200m default and clear legacy writes.',
);

assert.ok(
  geofenceMonitorSource.includes('command default of 200m'),
  'Geofence monitor should document the fixed ECS 200m behavior.',
);

assert.ok(
  roadNavigationSource.includes('const ARRIVAL_DISTANCE_M = 200') &&
    trailGuidanceSource.includes('const ARRIVAL_DISTANCE_M = 200') &&
    trailNavigationSource.includes('const TRAIL_NAVIGATION_ARRIVAL_DISTANCE_M = 200') &&
    !trailNavigationSource.includes('remainingDistanceM <= 35'),
  'Road and trail navigation should treat destination arrival as the fixed 200m ECS threshold.',
);

assert.ok(
  !fs.existsSync(path.join(root, 'components', 'dashboard', 'GeofenceRadiusPanel.tsx')) &&
    !fs.existsSync(path.join(root, 'components', 'dashboard', 'GeofenceMapPreview.tsx')),
  'Retired configurable geofence dashboard components should be removed.',
);

console.log('account command hub geofence default checks passed');
