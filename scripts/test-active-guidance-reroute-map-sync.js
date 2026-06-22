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
  route: newRoute,
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

assert(
  mapRendererSource.includes('routeLineKey?: string | null') &&
    mapRendererSource.includes('routeLineKey: props.routeLineKey ?? null') &&
    mapRendererSource.includes('routeLineKey'),
  'MapRenderer should carry an explicit active route-line identity through the map bridge payload.',
);
assert(
  navigateSource.includes('buildActiveGuidanceRouteLineSync') &&
    navigateSource.includes('activeRoadRouteLineSync') &&
    navigateSource.includes('routeLineKey={displayedRouteLineKey}'),
  'Navigate should derive the active road route line from EcsGuidanceRoute identity and pass it to MapRenderer.',
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
