const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      ActivityIndicator() { return null; },
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
      StyleSheet: {
        absoluteFillObject: {},
        create(styles) { return styles; },
      },
      Text() { return null; },
      View() { return null; },
    };
  }
  if (request === 'react-native-webview') {
    return { WebView() { return null; } };
  }
  if (request === 'react-native-svg') {
    function Svg() { return null; }
    return {
      __esModule: true,
      default: Svg,
      Circle() { return null; },
      Line() { return null; },
      Polyline() { return null; },
      Rect() { return null; },
    };
  }
  if (request === 'expo-constants') {
    return { default: { expoConfig: { extra: {} }, manifest: { extra: {} } } };
  }
  if (request.endsWith('/supabase') || request === './supabase') {
    return { supabase: null };
  }
  if (request.endsWith('/ecsIssueReporter') || request === './ecsIssueReporter') {
    return { reportRecoverableFailure() {} };
  }
  return originalLoad(request, parent, isMain);
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = read(relativePath);
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
  mod._compile(outputText, filename);
  return mod.exports;
}

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

require.extensions['.tsx'] = require.extensions['.ts'];

const motion = loadTsModule('lib/mapMotion.ts');
const coordinator = loadTsModule('lib/mapSurfaceCoordinator.ts');
const mapRenderer = loadTsModule('components/navigate/MapRenderer.tsx');

const heading = motion.resolveVehicleGuidanceHeading({
  hasActiveGuidance: true,
  routeAheadHeadingDeg: 0,
  courseOverGroundDeg: 3,
  gpsHeadingDeg: 181,
  compassHeadingDeg: 190,
  speedMph: 24,
});
assert.strictEqual(heading.source, 'route-ahead');
assert.strictEqual(Math.round(heading.headingDeg), 0);

const courseHeading = motion.resolveVehicleGuidanceHeading({
  hasActiveGuidance: true,
  routeAheadHeadingDeg: null,
  courseOverGroundDeg: 42,
  gpsHeadingDeg: 210,
  compassHeadingDeg: 215,
  speedMph: 18,
});
assert.strictEqual(courseHeading.source, 'course-over-ground');
assert.strictEqual(Math.round(courseHeading.headingDeg), 42);

const stationaryHeading = motion.resolveVehicleGuidanceHeading({
  hasActiveGuidance: false,
  routeAheadHeadingDeg: null,
  courseOverGroundDeg: null,
  gpsHeadingDeg: null,
  compassHeadingDeg: 272,
  speedMph: 0.4,
});
assert.strictEqual(stationaryHeading.source, 'compass-heading');
assert.strictEqual(Math.round(stationaryHeading.headingDeg), 272);

assert.strictEqual(
  motion.resolveViewportMarkerHeadingDeg({ headingDeg: 90, mapBearingDeg: 45 }),
  45,
  'DOM user marker rotation should subtract the map bearing from travel heading.',
);

const baseSample = {
  latitude: 39,
  longitude: -104,
  altitudeFt: 5000,
  speedMph: 30,
  headingDeg: 90,
  accuracyM: 8,
  timestamp: 1000,
};

assert.strictEqual(
  motion.classifyGpsSampleForMotion(null, baseSample).accepted,
  true,
  'The first valid GPS sample should be accepted.',
);
assert.strictEqual(
  motion.classifyGpsSampleForMotion(baseSample, { ...baseSample, latitude: 39.0001, timestamp: 500 }).reason,
  'stale',
  'Older GPS samples should be rejected before they can move the map or recorder.',
);
assert.strictEqual(
  motion.classifyGpsSampleForMotion(baseSample, { ...baseSample, latitude: 39.0001, accuracyM: 120, timestamp: 2000 }).reason,
  'poor_accuracy',
  'Poor accuracy samples should be rejected.',
);
assert.strictEqual(
  motion.classifyGpsSampleForMotion(baseSample, { ...baseSample, latitude: 40, longitude: -105, timestamp: 2000 }).reason,
  'teleport',
  'Impossible jumps should be rejected as teleports.',
);
assert.strictEqual(
  motion.classifyGpsSampleForMotion(baseSample, { ...baseSample, latitude: 39.000001, longitude: -104.000001, timestamp: 2000 }).reason,
  'jitter',
  'Tiny low-value movement should be classified as jitter.',
);

const smoothed = motion.smoothGpsSample(baseSample, {
  ...baseSample,
  latitude: 39.001,
  longitude: -104.001,
  altitudeFt: 5100,
  timestamp: 2000,
}, 0.5);
assert(smoothed.latitude > baseSample.latitude && smoothed.latitude < 39.001);
assert(smoothed.longitude < baseSample.longitude && smoothed.longitude > -104.001);
assert.strictEqual(smoothed.altitudeFt, 5050);

const firstDisplaySample = motion.resolveGpsMapDisplaySample(null, baseSample);
assert.strictEqual(firstDisplaySample.accepted, true, 'The display pin should accept the first valid GPS sample.');
assert.deepStrictEqual(firstDisplaySample.sample, baseSample);

const jitterDisplaySample = motion.resolveGpsMapDisplaySample(baseSample, {
  ...baseSample,
  latitude: 39.000001,
  longitude: -104.000001,
  timestamp: 2000,
});
assert.strictEqual(jitterDisplaySample.accepted, false, 'The display pin should reject jitter before it reaches Mapbox.');
assert.strictEqual(jitterDisplaySample.reason, 'jitter');
assert.deepStrictEqual(jitterDisplaySample.sample, baseSample, 'Rejected display samples should hold the last stable pin coordinate.');

const poorDisplaySample = motion.resolveGpsMapDisplaySample(baseSample, {
  ...baseSample,
  latitude: 39.0005,
  accuracyM: 120,
  timestamp: 2000,
});
assert.strictEqual(poorDisplaySample.accepted, false, 'Poor-accuracy GPS should not move the visible display pin.');
assert.strictEqual(poorDisplaySample.reason, 'poor_accuracy');
assert.deepStrictEqual(poorDisplaySample.sample, baseSample);

const emulatorJumpSample = {
  ...baseSample,
  latitude: 39.02,
  longitude: -104.02,
  timestamp: 2000,
};
const defaultTeleportDisplaySample = motion.resolveGpsMapDisplaySample(baseSample, emulatorJumpSample);
assert.strictEqual(
  defaultTeleportDisplaySample.accepted,
  false,
  'The display pin should still reject teleport-class jumps by default.',
);
assert.strictEqual(defaultTeleportDisplaySample.reason, 'teleport');
assert.deepStrictEqual(defaultTeleportDisplaySample.sample, baseSample);

const providerCorrectionDisplaySample = motion.resolveGpsMapDisplaySample(baseSample, emulatorJumpSample, {
  allowTeleport: true,
});
assert.strictEqual(
  providerCorrectionDisplaySample.accepted,
  true,
  'Emulator/manual provider corrections should be able to move the display pin when explicitly allowed.',
);
assert.strictEqual(providerCorrectionDisplaySample.reason, 'accepted');
assert.deepStrictEqual(
  providerCorrectionDisplaySample.sample,
  emulatorJumpSample,
  'Explicitly accepted provider corrections should move directly to the fresh coordinate instead of smoothing across a huge jump.',
);

const smoothedDisplaySample = motion.resolveGpsMapDisplaySample(baseSample, {
  ...baseSample,
  latitude: 39.001,
  longitude: -104.001,
  altitudeFt: 5100,
  timestamp: 3000,
}, { smoothingRatio: 0.5 });
assert.strictEqual(smoothedDisplaySample.accepted, true, 'Material GPS movement should update the display pin.');
assert(smoothedDisplaySample.sample.latitude > baseSample.latitude && smoothedDisplaySample.sample.latitude < 39.001);
assert(smoothedDisplaySample.sample.longitude < baseSample.longitude && smoothedDisplaySample.sample.longitude > -104.001);
assert.strictEqual(smoothedDisplaySample.sample.altitudeFt, 5050);

const hotNavigate = coordinator.resolveMapSurfaceMotionState({
  surface: 'navigate',
  isFocused: true,
  hasActiveGuidance: true,
});
assert.strictEqual(hotNavigate.motionPriority, 'hot');
assert.strictEqual(hotNavigate.allowCameraFollow, true);

const idleNavigate = coordinator.resolveMapSurfaceMotionState({
  surface: 'navigate',
  isFocused: true,
  hasActiveGuidance: false,
});
assert.strictEqual(idleNavigate.motionPriority, 'warm');
assert.strictEqual(idleNavigate.allowLiveLocation, true, 'Idle Navigate should still render the live GPS pin.');
assert.strictEqual(idleNavigate.allowCameraFollow, true, 'Idle Navigate should allow the map to follow the GPS pin until the user pans.');
assert.strictEqual(idleNavigate.allowDynamicCamera, false);

const pausedDashboard = coordinator.resolveMapSurfaceMotionState({
  surface: 'dashboard',
  isFocused: false,
  hasActiveGuidance: true,
  selected: false,
});
assert.strictEqual(pausedDashboard.motionPriority, 'cold');
assert.strictEqual(pausedDashboard.allowLiveLocation, false);
assert.strictEqual(pausedDashboard.allowCameraFollow, false);

const selectedDashboard = coordinator.resolveMapSurfaceMotionState({
  surface: 'dashboard',
  isFocused: true,
  hasActiveGuidance: true,
  selected: true,
});
assert.strictEqual(selectedDashboard.motionPriority, 'hot');

const coldPayload = mapRenderer.buildDynamicPayload({
  userLocation: { latitude: 39, longitude: -104 },
  showUserLocation: true,
  vehicleHeading: 90,
  cameraMode: 'follow_user',
  interactive: true,
  routeBuilderActive: false,
  motionPriority: 'cold',
});
assert.strictEqual(coldPayload.showUserLocation, false, 'Cold map surfaces should not animate the live user marker.');
assert.strictEqual(coldPayload.cameraMode, null, 'Cold map surfaces should not chase live camera mode.');
assert.strictEqual(coldPayload.motionPriority, 'cold');

const hotPayload = mapRenderer.buildDynamicPayload({
  userLocation: { latitude: 39, longitude: -104 },
  showUserLocation: true,
  vehicleHeading: 90,
  cameraMode: 'follow_user',
  interactive: true,
  routeBuilderActive: false,
  motionPriority: 'hot',
});
assert.strictEqual(hotPayload.showUserLocation, true);
assert.strictEqual(hotPayload.cameraMode, 'follow_user');

const mapRendererSource = read('components/navigate/MapRenderer.tsx');
assert(
  mapRendererSource.includes('resolveViewportMarkerHeadingDeg') &&
    mapRendererSource.includes('map.getBearing()'),
  'MapRenderer should rotate the user heading triangle relative to the current map bearing.',
);
assert(
  mapRendererSource.includes('animateUserMarkerTo') &&
    mapRendererSource.includes('requestAnimationFrame'),
  'MapRenderer should animate user-marker movement between GPS samples.',
);
assert(
  mapRendererSource.includes('var currentLngLat = userMarker.getLngLat();') &&
    mapRendererSource.includes('start = { latitude: currentLngLat.lat, longitude: currentLngLat.lng };') &&
    mapRendererSource.includes('USER_MARKER_ANIMATION_MS') &&
    !mapRendererSource.includes('var duration = 950;'),
  'MapRenderer should continue GPS marker interpolation from the current rendered marker position without a near-1Hz animation window.',
);

console.log('GPS and Mapbox motion stabilization checks passed.');
