const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, require, mod, filename, path.dirname(filename));
  return mod.exports;
}

const {
  buildActiveGuidanceRouteLineSync,
} = loadTsModule(path.join('lib', 'navigation', 'activeGuidanceRouteLineSync.ts'));

function route(id, generation, geometry, distanceMeters = 300) {
  return {
    id,
    source: 'mapbox_directions',
    routeUuid: `${id}-uuid`,
    geometry,
    distanceMeters,
    durationSeconds: Math.round(distanceMeters / 12),
    legs: [],
    steps: [],
    createdAt: '2026-06-22T12:00:00.000Z',
    rerouteGeneration: generation,
    guidanceMode: 'turn_by_turn',
  };
}

const oldGeometry = [
  { lat: 38.781, lng: -121.207 },
  { lat: 38.782, lng: -121.207 },
  { lat: 38.783, lng: -121.206 },
];
const newGeometry = [
  { lat: 38.781, lng: -121.207 },
  { lat: 38.7817, lng: -121.2055 },
  { lat: 38.7832, lng: -121.2048 },
];

function sameCoordinate(left, right) {
  return left.lat === right.lat && left.lng === right.lng;
}

const oldRoute = route('route-old', 0, oldGeometry, 320);
const newRoute = route('route-new', 1, newGeometry, 410);

const activeLine = buildActiveGuidanceRouteLineSync({
  route: oldRoute,
  navigationStatus: 'navigation_active',
  routeConfidenceState: 'on_route',
  routeStatusLabel: 'Navigation active',
});
assert.strictEqual(activeLine.routeId, 'route-old');
assert.strictEqual(activeLine.rerouteGeneration, 0);
assert.strictEqual(activeLine.isStale, false);
assert.strictEqual(activeLine.statusLabel, null);
assert.deepStrictEqual(activeLine.geometry, oldGeometry);
assert(
  activeLine.routeLineKey.includes('route-old') && activeLine.routeLineKey.includes(':0:'),
  'Active route line key should include route identity and reroute generation.',
);

const reroutingLine = buildActiveGuidanceRouteLineSync({
  route: oldRoute,
  navigationStatus: 'rerouting',
  routeConfidenceState: 'rerouting',
  routeStatusLabel: 'Recalculating route...',
});
assert.strictEqual(reroutingLine.routeId, 'route-old');
assert.strictEqual(reroutingLine.rerouteGeneration, 0);
assert.strictEqual(reroutingLine.isStale, true);
assert.strictEqual(reroutingLine.status, 'rerouting');
assert.strictEqual(reroutingLine.statusLabel, 'Recalculating route...');
assert.deepStrictEqual(
  reroutingLine.geometry,
  oldGeometry,
  'Rerouting should keep the previous route line visible until a replacement is ready.',
);

const appliedLine = buildActiveGuidanceRouteLineSync({
  route: {
    ...newRoute,
    routeVersion: 'active-guidance-version-route-new',
  },
  routeVersion: 'active-guidance-version-route-new',
  navigationStatus: 'navigation_active',
  routeConfidenceState: 'reroute_applied',
  routeStatusLabel: 'Route updated',
});
assert.strictEqual(appliedLine.routeId, 'route-new');
assert.strictEqual(appliedLine.rerouteGeneration, 1);
assert.strictEqual(appliedLine.isStale, false);
assert.strictEqual(appliedLine.status, 'reroute_applied');
assert.strictEqual(appliedLine.statusLabel, 'Route updated');
assert.deepStrictEqual(appliedLine.geometry, newGeometry);
assert.notStrictEqual(
  appliedLine.routeLineKey,
  activeLine.routeLineKey,
  'Reroute success should produce a new map route-line identity.',
);
assert(
  appliedLine.routeLineKey.includes('active-guidance-version-route-new'),
  'Active route line key should include the active guidance routeVersion when available.',
);

const repeatedRerouteGeometries = [
  [
    { lat: 38.7812, lng: -121.2068 },
    { lat: 38.7821, lng: -121.2057 },
    { lat: 38.7832, lng: -121.2048 },
  ],
  [
    { lat: 38.7814, lng: -121.2062 },
    { lat: 38.7824, lng: -121.205 },
    { lat: 38.7832, lng: -121.2048 },
  ],
  [
    { lat: 38.7818, lng: -121.2059 },
    { lat: 38.7827, lng: -121.2047 },
    { lat: 38.7832, lng: -121.2048 },
  ],
];
const repeatedRerouteLines = repeatedRerouteGeometries.map((geometry, index) =>
  buildActiveGuidanceRouteLineSync({
    route: {
      ...route(`route-reroute-${index + 1}`, index + 2, geometry, 430 + index * 20),
      routeVersion: `active-guidance-version-reroute-${index + 1}`,
    },
    routeVersion: `active-guidance-version-reroute-${index + 1}`,
    navigationStatus: 'navigation_active',
    routeConfidenceState: 'reroute_applied',
    routeStatusLabel: 'Route updated',
  }),
);
assert.strictEqual(
  new Set(repeatedRerouteLines.map((line) => line.routeLineKey)).size,
  repeatedRerouteLines.length,
  'Repeated reroutes should produce unique keyed route-line replacements instead of reusing stale source identity.',
);
assert(
  repeatedRerouteLines.every((line, index) => {
    const geometry = repeatedRerouteGeometries[index];
    return (
      line.status === 'reroute_applied' &&
      line.routeLineKey?.includes(`active-guidance-version-reroute-${index + 1}`) &&
      line.geometry.length === geometry.length &&
      line.geometry.every((point, pointIndex) => sameCoordinate(point, geometry[pointIndex]))
    );
  }),
  'Each reroute should render only the selected route geometry for that same routeVersion.',
);
assert(
  !repeatedRerouteLines.some((line, index) => {
    const geometry = repeatedRerouteGeometries[index];
    return (
      line.geometry.length === 2 &&
      sameCoordinate(line.geometry[0], geometry[0]) &&
      sameCoordinate(line.geometry[1], geometry[geometry.length - 1])
    );
  }),
  'Repeated reroutes must never collapse to a direct user-to-destination connector line.',
);
assert.deepStrictEqual(
  repeatedRerouteLines[repeatedRerouteLines.length - 1].geometry,
  repeatedRerouteGeometries[repeatedRerouteGeometries.length - 1],
  'The final visible active route line should be the latest accepted reroute geometry.',
);

const staleVersionLine = buildActiveGuidanceRouteLineSync({
  route: {
    ...newRoute,
    routeVersion: 'stale-active-guidance-version',
  },
  routeVersion: 'active-guidance-version-route-new',
  navigationStatus: 'navigation_active',
  routeConfidenceState: 'reroute_applied',
  routeStatusLabel: 'Route updated',
});
assert.strictEqual(staleVersionLine.status, 'unavailable');
assert.strictEqual(staleVersionLine.routeLineKey, null);
assert.strictEqual(staleVersionLine.versionMismatchPrevented, true);
assert.deepStrictEqual(
  staleVersionLine.geometry,
  [],
  'Active route line renderer must ignore geometry whose routeVersion does not match the active guidance routeVersion.',
);

const directConnectorGeometry = [
  { lat: 38.781, lng: -121.207 },
  { lat: 38.7832, lng: -121.2048 },
];
const invalidGuidanceRoute = route('route-direct-connector', 2, [], 410);
const connectorFallbackLine = buildActiveGuidanceRouteLineSync({
  route: invalidGuidanceRoute,
  fallbackGeometry: directConnectorGeometry,
  navigationStatus: 'navigation_active',
  routeConfidenceState: 'reroute_applied',
  routeStatusLabel: 'Route updated',
});
assert.strictEqual(connectorFallbackLine.status, 'unavailable');
assert.strictEqual(connectorFallbackLine.routeLineKey, null);
assert.deepStrictEqual(
  connectorFallbackLine.geometry,
  [],
  'Active guidance route line must not render fallback user-to-destination connector geometry.',
);

const mixedRouteVersionsLine = buildActiveGuidanceRouteLineSync({
  route: route('route-mixed', 3, [
    { lat: 38.781, lng: -121.207, routeVersion: 'old-route' },
    { lat: 38.7817, lng: -121.2055, routeVersion: 'new-route' },
    { lat: 38.7832, lng: -121.2048, routeVersion: 'new-route' },
  ], 410),
  routeVersion: 'new-route',
  navigationStatus: 'navigation_active',
});
assert.strictEqual(mixedRouteVersionsLine.status, 'unavailable');
assert.deepStrictEqual(
  mixedRouteVersionsLine.geometry,
  [],
  'Active guidance route line must reject geometry that mixes routeVersion-tagged coordinates.',
);

const failedLine = buildActiveGuidanceRouteLineSync({
  route: oldRoute,
  navigationStatus: 'navigation_active',
  routeConfidenceState: 'reroute_failed',
  routeStatusLabel: 'Unable to recalculate route',
});
assert.strictEqual(failedLine.status, 'reroute_failed');
assert.strictEqual(failedLine.statusLabel, 'Unable to recalculate route');
assert.deepStrictEqual(
  failedLine.geometry,
  oldGeometry,
  'Reroute failure should preserve the last active route line instead of clearing navigation.',
);

const mapRendererSource = fs.readFileSync(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'), 'utf8');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const directionsSource = fs.readFileSync(path.join(root, 'lib', 'activeGuidanceDirections.ts'), 'utf8');
const routeLineSyncSource = fs.readFileSync(
  path.join(root, 'lib', 'navigation', 'activeGuidanceRouteLineSync.ts'),
  'utf8',
);

assert(
  routeLineSyncSource.includes('ACTIVE_GUIDANCE_ROUTE_FINGERPRINT_MAX_POINTS') &&
    routeLineSyncSource.includes('selectGeometryFingerprintCoordinates') &&
    !routeLineSyncSource.includes(".map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`)"),
  'Active guidance route-line fingerprinting should sample long geometries instead of serializing every coordinate on the Navigate render path.',
);

assert(
  mapRendererSource.includes('routeLineKey?: string | null') &&
    mapRendererSource.includes('routeLineKey: props.routeLineKey ?? null') &&
    mapRendererSource.includes('lastRouteLineKey') &&
    mapRendererSource.includes('clearRouteSourcesExcept(null)') &&
    mapRendererSource.includes('routeSourceIdForRenderMode(mode)') &&
    mapRendererSource.includes('setGeoJson(activeRouteSourceId, fc)'),
  'MapRenderer should carry an explicit active route-line identity and clear the route source before keyed replacements.',
);
assert.strictEqual(
  (mapRendererSource.match(/mapSourceRegistry\.ensure\(ACTIVE_GUIDANCE_ROUTE_SOURCE_ID/g) || []).length,
  1,
  'MapRenderer should maintain one active guidance route source and replace its data on reroute.',
);
assert.strictEqual(
  (mapRendererSource.match(/routeLineLayerDefinition\(ACTIVE_GUIDANCE_ROUTE_LAYER_ID, ACTIVE_GUIDANCE_ROUTE_SOURCE_ID/g) || []).length,
  1,
  'MapRenderer should maintain one active guidance route layer during repeated reroutes.',
);
assert(
  navigateSource.includes('buildActiveGuidanceRouteLineSync') &&
    navigateSource.includes('activeRoadRouteLineSync') &&
    navigateSource.includes('route: activeRoadGuidanceRoute') &&
    navigateSource.includes('routeVersion: roadNavigation.session.activeGuidance?.routeVersion') &&
    navigateSource.includes('[ECS Guidance] route line version mismatch') &&
    !navigateSource.includes('fallbackGeometry: roadNavigation.session.route?.geometry') &&
    navigateSource.includes('routeLineKey={displayedRouteLineKey}'),
  'Navigate should derive the active road route line only from the versioned active guidance route and pass it to MapRenderer.',
);
assert(
  navigateSource.includes('const roadNavigationRouteLineRequired') &&
    navigateSource.includes('if (roadNavigationRouteLineRequired)') &&
    navigateSource.includes('return [];'),
  'Navigate should not fall back to stale preview/run geometry when an active guidance route line is unavailable.',
);
assert(
  navigateSource.includes('lastActiveRoadRouteLinePointsRef') &&
    navigateSource.includes('roadNavigationStoredRouteFallbackPoints') &&
    navigateSource.includes('fallbackRoutePoints={fallbackRoutePointsForMap}') &&
    mapRendererSource.includes('routeContinuityFallbackVisible') &&
    mapRendererSource.includes('payload.routeCoords.length < 2'),
  'Navigate may use cached active route geometry only for the native fallback continuity layer while the authoritative route line remains version-gated.',
);
assert(
  navigateSource.includes('previousActiveRoadRouteLineKeyRef') &&
    navigateSource.includes('followUser') &&
    navigateSource.includes('active_guidance_reroute_refit'),
  'Reroute camera refit should be gated by follow mode and route-line identity changes.',
);
assert(
  directionsSource.includes('progress.rerouteGeneration !== route.rerouteGeneration'),
  'Directions dropdown should reject progress from a stale reroute generation.',
);

console.log('Active guidance reroute map sync checks passed.');
