const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');

function loadTsModule(relativePath, mocks = {}) {
  const filename = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => (mocks[request] ? mocks[request] : originalRequire(request));
  mod._compile(outputText, filename);
  return mod.exports;
}

const bearingUtils = loadTsModule('lib/navigation/bearingUtils.ts');
const compassData = loadTsModule('lib/navigation/recoveryHazardCompassData.ts', {
  './bearingUtils': bearingUtils,
});

const {
  calculateBearingDegrees,
  calculateDistanceMiles,
  degreesToCardinalDirection,
} = bearingUtils;
const {
  normalizeRecoveryHazardCompassData,
  getBearingToRecoveryTarget,
  getDistanceToRecoveryTargetMiles,
} = compassData;

assert.strictEqual(calculateBearingDegrees(null, { latitude: 1, longitude: 1 }), null);
assert.strictEqual(calculateDistanceMiles({ latitude: 95, longitude: 0 }, { latitude: 0, longitude: 0 }), null);
assert.strictEqual(degreesToCardinalDirection(0), 'N');
assert.strictEqual(degreesToCardinalDirection(90), 'E');

const empty = normalizeRecoveryHazardCompassData();
assert.deepStrictEqual(Object.keys(empty).sort(), [
  'activeRoute',
  'bearingToNearestSavedPin',
  'bearingToNearestWaypoint',
  'bearingToRoute',
  'bearingToStart',
  'cardinalDirection',
  'commsConfidence',
  'confidenceLabel',
  'currentCoordinates',
  'currentHeadingDegrees',
  'currentLocation',
  'dataState',
  'distanceToNearestSavedPinMiles',
  'distanceToNearestWaypointMiles',
  'distanceToRouteMiles',
  'distanceToStartMiles',
  'hasActiveRoute',
  'hazardBearingDegrees',
  'hazardLabel',
  'headingDegrees',
  'headingSource',
  'isOffline',
  'isUsingCachedData',
  'lastUpdatedAt',
  'locationAccuracyMeters',
  'missingInputs',
  'nearestHazard',
  'nearestRoutePoint',
  'nearestSavedPinName',
  'nearestWaypointName',
  'recommendedAction',
  'recoveryDifficulty',
  'recoveryTarget',
  'routeDriftLevel',
  'safeCorridorBearingDegrees',
  'savedPins',
  'speedMph',
  'state',
].sort());
assert.strictEqual(empty.headingSource, 'unavailable');
assert.strictEqual(empty.state, 'setupNeeded');
assert.strictEqual(empty.dataState, 'setupNeeded');
assert.strictEqual(empty.recommendedAction, 'ENABLE LOCATION OR SELECT WAYPOINT');
assert(empty.missingInputs.includes('Location'));

const sensorHeading = normalizeRecoveryHazardCompassData({
  liveCompassHeadingDegrees: 721,
  gpsCourseDegrees: 91,
  gpsSpeedMph: 20,
  currentLocation: { latitude: 39, longitude: -105 },
  activeRoute: {
    id: 'live-route',
    isActive: true,
    nextWaypoint: { latitude: 39.1, longitude: -105, label: 'North waypoint' },
    routePoints: [
      { latitude: 39, longitude: -105, label: 'Current route point' },
      { latitude: 39.1, longitude: -105, label: 'North route point' },
    ],
  },
});
assert.strictEqual(sensorHeading.headingDegrees, 1);
assert.strictEqual(sensorHeading.headingSource, 'sensor');
assert.strictEqual(sensorHeading.state, 'live');
assert.strictEqual(sensorHeading.routeDriftLevel, 'nominal');
assert.strictEqual(sensorHeading.recoveryDifficulty, 'low');

const gpsMoving = normalizeRecoveryHazardCompassData({
  gpsCourseDegrees: 181,
  gpsSpeedMph: 5,
  currentLocation: { latitude: 39, longitude: -105 },
  savedPins: [{ id: 'base', label: 'Base', latitude: 39.01, longitude: -105, type: 'base' }],
});
assert.strictEqual(gpsMoving.headingDegrees, 181);
assert.strictEqual(gpsMoving.headingSource, 'gpsCourse');

const gpsStationaryRouteFallback = normalizeRecoveryHazardCompassData({
  gpsCourseDegrees: 181,
  gpsSpeedMph: 0,
  currentLocation: { latitude: 39, longitude: -105 },
  activeRoute: {
    id: 'route-1',
    label: 'Route',
    isActive: true,
    nextWaypoint: { latitude: 40, longitude: -105, label: 'North waypoint' },
  },
});
assert.strictEqual(gpsStationaryRouteFallback.headingSource, 'estimated');
assert(Math.abs(gpsStationaryRouteFallback.headingDegrees - 0) < 1);

const lastKnown = normalizeRecoveryHazardCompassData({
  lastKnownHeadingDegrees: -90,
  currentLocation: { latitude: 39, longitude: -105 },
  savedPins: [{ id: 'base', label: 'Base', latitude: 39.01, longitude: -105, type: 'base' }],
});
assert.strictEqual(lastKnown.headingDegrees, 270);
assert.strictEqual(lastKnown.headingSource, 'estimated');
assert.strictEqual(lastKnown.state, 'estimated');

const explicitTarget = normalizeRecoveryHazardCompassData({
  currentLocation: { latitude: 39, longitude: -105 },
  explicitRecoveryTarget: {
    id: 'manual',
    label: 'Manual recovery',
    latitude: 39.1,
    longitude: -105,
    type: 'manual',
  },
  activeRoute: {
    id: 'route-2',
    isActive: true,
    nextWaypoint: { id: 'wp', label: 'Waypoint', latitude: 39.2, longitude: -105 },
  },
});
assert.strictEqual(explicitTarget.recoveryTarget.id, 'manual');
assert.strictEqual(explicitTarget.recoveryTarget.type, 'manual');

const routeTarget = normalizeRecoveryHazardCompassData({
  currentLocation: { latitude: 39, longitude: -105 },
  activeRoute: {
    id: 'route-3',
    isActive: true,
    nextWaypoint: { id: 'wp', label: 'Waypoint', latitude: 39.2, longitude: -105 },
    routePoints: [
      { latitude: 39.05, longitude: -105, label: 'Route point' },
    ],
  },
  savedPins: [{ id: 'camp', label: 'Camp', latitude: 39.01, longitude: -105, type: 'camp' }],
});
assert.strictEqual(routeTarget.recoveryTarget.type, 'route');
assert.strictEqual(routeTarget.activeRoute.nextWaypoint.label, 'Waypoint');
assert.strictEqual(routeTarget.nearestWaypointName, 'Waypoint');
assert(routeTarget.distanceToRouteMiles > 0);

const savedPinTarget = normalizeRecoveryHazardCompassData({
  currentLocation: { latitude: 39, longitude: -105 },
  activeRoute: {
    id: 'route-4',
    isActive: true,
    routeStart: { id: 'start', label: 'Route start', latitude: 38, longitude: -105 },
  },
  savedPins: [
    { id: 'poi', label: 'POI', latitude: 39.001, longitude: -105, type: 'poi' },
    { id: 'camp', label: 'Camp', latitude: 39.5, longitude: -105, type: 'camp' },
  ],
});
assert.strictEqual(savedPinTarget.recoveryTarget.id, 'camp');
assert.strictEqual(savedPinTarget.nearestSavedPinName, 'POI');

const hazard = normalizeRecoveryHazardCompassData({
  currentLocation: { latitude: 39, longitude: -105 },
  activeRouteHazards: [
    { id: 'far', label: 'Far hazard', latitude: 41, longitude: -105, type: 'routeHazard', severity: 'high' },
  ],
  hazardPins: [
    { id: 'near', label: 'Near hazard', latitude: 39.01, longitude: -105, type: 'hazard', severity: 'med' },
  ],
});
assert.strictEqual(hazard.nearestHazard.id, 'near');
assert.strictEqual(hazard.nearestHazard.severity, 'medium');

const offlineNoLocation = normalizeRecoveryHazardCompassData({ isOffline: true });
assert.strictEqual(offlineNoLocation.state, 'setupNeeded');

const cachedLocation = normalizeRecoveryHazardCompassData({
  isOffline: true,
  isUsingCachedData: true,
  currentLocation: { latitude: 39, longitude: -105 },
  lastKnownHeadingDegrees: 33,
  savedPins: [{ id: 'base', label: 'Base', latitude: 39.01, longitude: -105, type: 'base' }],
});
assert.strictEqual(cachedLocation.state, 'offline');
assert.strictEqual(cachedLocation.recommendedAction, 'OFFLINE - USING LAST KNOWN POSITION');

assert.strictEqual(
  normalizeRecoveryHazardCompassData({
    savedPins: [{ id: 'bad', label: 'Bad', latitude: 95, longitude: 0, type: 'camp' }],
  }).savedPins.length,
  0,
);

assert.strictEqual(Math.round(getBearingToRecoveryTarget(explicitTarget)), 0);
assert(getDistanceToRecoveryTargetMiles(explicitTarget) > 0);

const driftCritical = normalizeRecoveryHazardCompassData({
  currentLocation: { latitude: 39, longitude: -105 },
  liveCompassHeadingDegrees: 90,
  activeRoute: {
    id: 'drift-route',
    isActive: true,
    routePoints: [{ latitude: 39, longitude: -104 }],
    nextWaypoint: { latitude: 39, longitude: -104, label: 'Route waypoint' },
  },
});
assert.strictEqual(driftCritical.routeDriftLevel, 'critical');
assert.strictEqual(driftCritical.recoveryDifficulty, 'high');
assert.strictEqual(driftCritical.recommendedAction, 'RETURN TO ROUTE');

const hookSource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/useRecoveryHazardCompassData.ts'),
  'utf8',
);
const widgetSource = fs.readFileSync(
  path.join(repoRoot, 'components/dashboard/commandCenter/RecoveryHazardCompass.tsx'),
  'utf8',
);
assert(hookSource.includes('useThrottledGPS'), 'hook should use existing GPS source');
assert(hookSource.includes('useVehicleHeading'), 'hook should use existing heading source');
assert(hookSource.includes('routeStore'), 'hook should read route store');
assert(hookSource.includes('pinStore.subscribe'), 'hook should subscribe to pin store changes');
assert(hookSource.includes('vehicleSessionState'), 'hook should read synced vehicle session state');
assert(!hookSource.includes('mock') && !hookSource.includes('demo'), 'hook must not use mock/demo data');
assert(widgetSource.includes('CommandCenterFrame'), 'widget must render inside CommandCenterFrame');
assert(widgetSource.includes('RECOVERY / HAZARD COMPASS'), 'widget must render the recovery compass title');
assert(widgetSource.includes('Field Recovery Intelligence'), 'widget must render the field recovery subtitle');
assert(widgetSource.includes('recommendationStrip'), 'widget must include a bottom recommendation strip');
assert(widgetSource.includes('Nearest route / safe exit'), 'widget must surface route-return intelligence');
assert(widgetSource.includes('Recovery intelligence limited'), 'widget must include polished setup fallback copy');
assert(!widgetSource.includes('mock') && !widgetSource.includes('demo'), 'widget must not render mock/demo data');

console.log('Recovery / Hazard Compass data normalization checks passed');
