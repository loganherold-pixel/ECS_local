const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

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

const { buildTripPlan } = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderService.ts'));
const {
  routeContextToTripBuilderItineraryContext,
} = require(path.join(root, 'lib', 'tripBuilder', 'routeContextTripBuilderAdapter.ts'));
const {
  resolveTrailWaypoints,
} = require(path.join(root, 'lib', 'tripBuilder', 'trailWaypointIntelligenceResolver.ts'));

const baseInput = {
  tripType: 'day_trip',
  timeWindow: 'full_day',
  groupType: 'two_vehicle',
  priorities: ['low_risk'],
};

const sparseRoute = {
  id: 'context-route',
  name: 'Context Route',
};

const readyContext = {
  id: 'route-context:ready',
  trailId: 'context-route',
  status: 'ready',
  trailheadAnchor: {
    lat: 38,
    lng: -110,
    source: 'explicit_trailhead',
    confidence: { value: 0.96, reasons: ['Known trailhead.'] },
    warnings: [],
  },
  selectedSupplyMode: 'gas_and_grocery',
  supplyCandidates: [
    {
      id: 'gas-1',
      category: 'gas',
      name: 'Trail Fuel',
      lat: 37.98,
      lng: -110.02,
      confidence: { value: 0.84, reasons: ['Provider confidence.'] },
      score: 0.9,
      warnings: [],
    },
    {
      id: 'grocery-1',
      category: 'grocery',
      name: 'Trail Market',
      lat: 37.99,
      lng: -110.01,
      confidence: { value: 0.8, reasons: ['Provider confidence.'] },
      score: 0.88,
      warnings: [],
    },
  ],
  selectedSupplyPlan: {
    mode: 'gas_and_grocery',
    orderedStops: [
      { candidateId: 'gas-1', category: 'gas', sequence: 1 },
      { candidateId: 'grocery-1', category: 'grocery', sequence: 2 },
    ],
    score: 0.89,
    confidence: { value: 0.82, reasons: ['Fixture.'] },
    warnings: [],
  },
  routeGeometry: {
    origin: { lat: 37.9, lng: -110.2 },
    destination: { lat: 38, lng: -110 },
    waypoints: [],
    coordinates: [
      { lat: 38, lng: -110 },
      { lat: 38.05, lng: -109.95 },
      { lat: 38.1, lng: -109.9 },
    ],
    distanceMeters: 32186.88,
    durationSeconds: 5400,
    bbox: { west: -110, south: 38, east: -109.9, north: 38.1 },
    corridor: null,
    segments: [],
  },
  campEndpointPlan: {
    routeId: 'context-route',
    tripId: 'trip-1',
    generatedAt: '2026-06-02T18:00:00.000Z',
    windows: [],
    endpointCandidates: [{
      candidate: {
        id: 'context-endpoint-1',
        name: 'Context Camp Endpoint',
        location: { latitude: 38.05, longitude: -109.95 },
        source: 'route_endpoint_candidate',
        sourceConfidence: 'high',
        score: 82,
      },
      enrichment: {
        candidateId: 'context-endpoint-1',
        dataConfidence: 'high',
        dataLimitations: [],
      },
      routeEndpoint: {
        windowId: 'context-route:camp-endpoint-window-1',
        routeSide: 'right',
        routeMileMarker: 10,
        nearestSegmentIndex: 1,
        distanceFromRouteMiles: 0.2,
        exactness: 'area_candidate',
      },
      role: 'primary',
    }],
    recommendationsByWindow: {},
    selectedEndpointIds: ['context-endpoint-1'],
    warnings: [],
  },
  campCandidates: [],
  bailoutCandidates: [],
  confidence: { value: 0.86, reasons: ['Ready fixture.'] },
  warnings: [],
  createdAt: '2026-05-29T12:00:00.000Z',
  updatedAt: '2026-05-29T12:00:00.000Z',
};

const readyInput = routeContextToTripBuilderItineraryContext(readyContext, 'gas_and_grocery');
assert.strictEqual(
  readyInput.campEndpointPlan.endpointCandidates[0].routeEndpoint.routeSide,
  'right',
  'RouteContext adapter should preserve Camp Endpoint plans for Trip Builder itinerary insertion.',
);
const trailGeometry = {
  id: 'context-route',
  name: 'Context Route',
  geometry: [
    { latitude: 38, longitude: -110 },
    { latitude: 38.1, longitude: -109.9 },
  ],
  segments: [],
};
const selectedEndpointResolution = resolveTrailWaypoints({
  trailRoute: trailGeometry,
  routeContext: { campEndpointPlan: readyInput.campEndpointPlan },
});
assert.strictEqual(selectedEndpointResolution.metadata.sourceRecordCount, 1);
const recommendationOnlyResolution = resolveTrailWaypoints({
  trailRoute: trailGeometry,
  routeContext: {
    campEndpointPlan: {
      ...readyInput.campEndpointPlan,
      selectedEndpointIds: [],
    },
  },
});
assert.strictEqual(
  recommendationOnlyResolution.metadata.sourceRecordCount,
  0,
  'CampOps recommendations must not enter the Trip Builder itinerary until the user explicitly selects one.',
);
const readyPlan = buildTripPlan({
  route: sparseRoute,
  input: baseInput,
  routeContext: readyInput,
  capturedAt: '2026-05-29T12:00:00.000Z',
});
assert.strictEqual(readyPlan.route.startCoordinate.latitude, 38);
assert.strictEqual(readyPlan.route.distanceMiles, 20);
assert.strictEqual(readyPlan.route.estimatedDriveTimeHours, 1.5);
assert.strictEqual(readyPlan.route.routeDataConfidence, 'high');
assert.strictEqual(readyPlan.route.routeContextConfidence, 'high');
assert.ok(readyPlan.estimate.basis.includes('route context distance'));
assert.ok(readyPlan.estimate.basis.includes('route context travel-time estimate'));

const partialInput = {
  status: 'partial',
  trailheadAnchor: {
    coordinate: { latitude: 38, longitude: -110 },
    source: 'centroid_fallback',
    confidence: 0.35,
  },
  supplyMode: 'gas',
  selectedSupplyPlan: null,
  routeGeometry: null,
  warnings: [
    { code: 'missing_origin', message: 'Missing origin.' },
    { code: 'provider_unavailable', message: 'Provider unavailable.' },
    { code: 'no_supply_candidates_found', message: 'No gas candidates.' },
  ],
  confidence: { value: 0.35, reasons: ['Partial fixture.'] },
  supplyCandidateCount: 0,
};
const partialPlan = buildTripPlan({
  route: sparseRoute,
  input: baseInput,
  routeContext: partialInput,
  capturedAt: '2026-05-29T12:00:00.000Z',
});
assert.strictEqual(partialPlan.route.routeContextConfidence, 'partial');
assert.ok(partialPlan.suggestedStops.some((stop) => stop.type === 'start'));

const fallbackPlan = buildTripPlan({
  route: sparseRoute,
  input: baseInput,
  capturedAt: '2026-05-29T12:00:00.000Z',
});
assert.strictEqual(fallbackPlan.route.routeContextConfidence, null);
assert.strictEqual(fallbackPlan.route.routeDataConfidence, 'low');
assert.ok(!fallbackPlan.estimate.basis.includes('route context distance'));

const fuelInput = routeContextToTripBuilderItineraryContext(readyContext, 'gas');
const groceryInput = routeContextToTripBuilderItineraryContext(readyContext, 'grocery');
assert.strictEqual(fuelInput.supplyMode, 'gas');
assert.strictEqual(fuelInput.supplyCandidateCount, 1);
assert.strictEqual(groceryInput.supplyMode, 'grocery');
assert.strictEqual(groceryInput.supplyCandidateCount, 1);

console.log('Trip Builder RouteContext itinerary input checks passed.');
