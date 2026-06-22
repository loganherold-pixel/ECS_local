const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

const scrubber = require(path.join(root, 'lib', 'navigateRouteProfileScrubber.ts'));
const navigateTab = fs
  .readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

const profile = [
  { distanceMiles: 0, elevationFeet: 5200, riskScore: 12, riskLevel: 'low' },
  { distanceMiles: 1, elevationFeet: 5520, riskScore: 48, riskLevel: 'moderate' },
  { distanceMiles: 2, elevationFeet: 6100, riskScore: 76, riskLevel: 'high' },
];
const routeCoordinates = [
  { latitude: 38.0, longitude: -110.0 },
  { latitude: 38.01, longitude: -110.01 },
  { latitude: 38.02, longitude: -110.02 },
];
const events = [
  { id: 'event-high-grade', distanceMiles: 2, label: 'Steep grade', riskLevel: 'high' },
];

const middle = scrubber.resolveNavigateRouteProfileFocus({
  profile,
  routeCoordinates,
  referenceEvents: events,
  distanceMiles: 1.05,
});

assert(middle, 'Profile focus should resolve for route/profile data.');
assert.strictEqual(middle.point.riskLevel, 'moderate');
assert(Math.abs(middle.coordinate.latitude - 38.01) < 0.001, 'Profile focus should map scrub distance to route geometry.');
assert.strictEqual(middle.referenceEvent, null, 'Middle focus should not invent a risk event.');

const high = scrubber.resolveNavigateRouteProfileFocus({
  profile,
  routeCoordinates,
  referenceEvents: events,
  distanceRatio: 1,
});

assert(high, 'Profile focus should resolve by distance ratio.');
assert.strictEqual(high.point.riskLevel, 'high');
assert.strictEqual(high.referenceEvent.id, 'event-high-grade', 'Nearby terrain risk reference event should surface while scrubbing.');

const unevenRouteCoordinates = [
  { latitude: 38.0, longitude: -110.0 },
  { latitude: 38.001, longitude: -110.001 },
  { latitude: 38.04, longitude: -110.04 },
];
const unevenMidpoint = scrubber.resolveNavigateRouteProfileFocus({
  profile,
  routeCoordinates: unevenRouteCoordinates,
  distanceRatio: 0.5,
});

assert(unevenMidpoint, 'Uneven route geometry should still resolve a profile focus.');
assert(
  unevenMidpoint.coordinate.latitude > 38.015 && unevenMidpoint.coordinate.latitude < 38.025,
  'Profile focus should interpolate by route distance instead of snapping to an array index.',
);

assert.strictEqual(
  scrubber.resolveNavigateRouteProfileFocus({ profile: [], routeCoordinates, distanceRatio: 0.5 }),
  null,
  'Unavailable elevation profile should return null instead of a fake focus point.',
);

assert(
  navigateTab.includes('const [routeProfileScrubTrackHeight, setRouteProfileScrubTrackHeight] = useState(1);') &&
    navigateTab.includes('const locationY = Number(event?.nativeEvent?.locationY);') &&
    navigateTab.includes('1 - locationY / Math.max(1, routeProfileScrubTrackHeight)'),
  'Navigate route profile scrubber should use vertical drag position for the compact rail control.',
);
assert(
  navigateTab.includes('routeProfileFocusPayload') &&
    navigateTab.includes("routeProfileAvailable && routeLifecycleState.phase === 'navigating'") &&
    navigateTab.includes('elevationFeet: routeProfileFocus.point.elevationFeet') &&
    navigateTab.includes('label: `${Math.round(routeProfileFocus.point.elevationFeet).toLocaleString()} ft`') &&
    navigateTab.includes('routeProfileFocus={routeProfileFocusPayload}'),
  'Navigate route profile scrubber should send elevation, distance, and label metadata to the active map focus marker.',
);
assert(
  navigateTab.includes('testID="navigateRouteProfileElevationScrubber"') &&
    navigateTab.includes('testID="navigateRouteProfileElevationFeet"') &&
    navigateTab.includes('ACTIVE GUIDANCE') &&
    navigateTab.includes('{routeProfileFocus ? `${Math.round(routeProfileFocus.point.elevationFeet).toLocaleString()}FT` : \'--\'}'),
  'Navigate route profile scrubber should expose a polished active-guidance elevation rail with feet feedback.',
);
assert(
  navigateTab.includes('height: `${Math.max(0, Math.min(1, routeProfileScrubRatio)) * 100}%`') &&
    navigateTab.includes('bottom: `${Math.max(0, Math.min(1, routeProfileScrubRatio)) * 100}%`'),
  'Navigate route profile scrubber should render a vertical progress fill and thumb.',
);
assert(
  !navigateTab.includes('<View style={[styles.navigateRouteProfileScrubber, { left: OVERLAY_EDGE, right: OVERLAY_EDGE }]}>'),
  'Navigate route profile scrubber should not render as a full-width bottom overlay.',
);

const mapRenderer = fs
  .readFileSync(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

assert(
  mapRenderer.includes('type RouteProfileFocusPayload') &&
    mapRenderer.includes('routeProfileFocus?: RouteProfileFocusPayload | null') &&
    mapRenderer.includes('routeProfileFocus: props.routeProfileFocus') &&
    mapRenderer.includes('updateRouteProfileFocus(payload.routeProfileFocus || null)'),
  'MapRenderer should accept a route profile focus payload instead of coordinate-only focus state.',
);
assert(
  mapRenderer.includes("'route-profile-focus-label-layer'") &&
    mapRenderer.includes("'text-field': ['coalesce', ['get', 'label'], 'Elevation']") &&
    mapRenderer.includes("['get', 'bearing']") &&
    mapRenderer.includes('#FF4D4D'),
  'MapRenderer should render a red active guidance focus arrow and elevation label for scrubbed terrain segments.',
);

console.log('Navigate route profile scrubber checks passed.');
