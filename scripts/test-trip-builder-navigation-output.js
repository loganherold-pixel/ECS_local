const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  buildTripBuilderNavigationOutput,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderNavigationOutput.ts'));

const origin = { latitude: 39, longitude: -121.5 };
const fuel = { latitude: 39.1, longitude: -121.45 };
const trailhead = { latitude: 39.2, longitude: -121.4 };
const destination = { latitude: 39.3, longitude: -121.35 };
const preparedRoadRoute = {
  id: 'road-route',
  guidanceMode: 'turn_by_turn',
  geometry: [origin, fuel, trailhead].map((point) => ({ lat: point.latitude, lng: point.longitude })),
  orderedWaypoints: [{
    id: 'fuel-stop',
    title: 'Last Fuel',
    subtitle: null,
    coordinate: { lat: fuel.latitude, lng: fuel.longitude },
    role: 'fuel',
  }],
};
const basePayload = {
  id: 'route-1',
  source: 'explore',
  type: 'hybrid_route',
  title: 'Imported route',
  subtitle: null,
  coordinate: { lat: destination.latitude, lng: destination.longitude },
  trailheadCoordinate: { lat: trailhead.latitude, lng: trailhead.longitude },
  roadDestinationCoordinate: { lat: trailhead.latitude, lng: trailhead.longitude },
  trailGeometry: [
    { lat: trailhead.latitude, lng: trailhead.longitude },
    { lat: destination.latitude, lng: destination.longitude },
  ],
  trailLengthMiles: 12,
  trailCategory: 'Imported GPX',
  tripMode: 'hybrid',
  trailWaypoints: [{
    id: 'source-gpx-extra',
    coordinate: { lat: 39.25, lng: -121.37 },
    name: 'Source waypoint that is not an itinerary stop',
    type: 'waypoint',
  }],
  trailDecisionPoints: [],
  routeMetadata: { tripBuilderCanonicalState: 'ready' },
  landmarkMetadata: null,
  raw: null,
  createdAt: '2026-07-17T12:00:00.000Z',
};
const plan = {
  id: 'plan-1',
  route: { routeId: 'route-1', name: 'Imported route' },
  suggestedStops: [
    {
      id: 'camp-reference',
      type: 'camp',
      title: 'Camp reference',
      sequence: 2,
      plannedDay: 1,
      coordinate: { latitude: 39.15, longitude: -121.42 },
      routeMileMarker: null,
      etaOffsetHours: null,
      source: 'fixture',
      confidence: 'medium',
      guidanceRole: 'reference_only',
      referenceType: 'camp_candidate',
    },
    {
      id: 'fuel-stop',
      type: 'fuel',
      title: 'Last Fuel',
      sequence: 1,
      plannedDay: 1,
      coordinate: fuel,
      routeMileMarker: null,
      etaOffsetHours: null,
      source: 'fixture',
      confidence: 'medium',
      guidanceRole: 'required',
    },
  ],
};
const spinePoints = [origin, fuel, trailhead, destination];
const output = buildTripBuilderNavigationOutput({
  basePayload,
  plan,
  preparedRoadRoute,
  spinePoints,
  origin,
  trailhead,
  destination,
  canonicalRoute: { id: 'route-1' },
});

assert.strictEqual(output.routeSource, 'built');
assert.strictEqual(output.requiresOnlineRouting, false);
assert.strictEqual(output.preparedRoadRoute, preparedRoadRoute);
assert.deepStrictEqual(
  output.trailWaypoints.map((point) => ({ name: point.name, type: point.type })),
  [
    { name: 'Trip origin', type: 'origin' },
    { name: 'Last Fuel', type: 'resupply' },
    { name: 'Trailhead', type: 'trailhead' },
    { name: 'Route end', type: 'destination' },
  ],
  'The actual handoff should replace source-file extras with the exact guidance itinerary.',
);
assert.deepStrictEqual(
  output.routeMetadata.tripBuilderPrimarySpine.coordinates,
  spinePoints.map((point) => [point.longitude, point.latitude]),
);
assert.strictEqual(output.routeMetadata.autoStartNavigation, true);
assert.strictEqual(output.routeMetadata.routePreviewStartGuidance, true);
assert.strictEqual(output.routeMetadata.tripBuilderPrimarySpinePointCount, 4);
assert.strictEqual(output.raw.tripPlan, plan);

console.log('Trip Builder actual navigation output behavioral checks passed.');
