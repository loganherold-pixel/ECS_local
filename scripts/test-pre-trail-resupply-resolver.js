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

const {
  resolvePreTrailStops,
} = require(path.join(root, 'lib', 'tripBuilder', 'preTrailResupplyResolver.ts'));
const {
  buildTripItineraryFromSuggestedRoute,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryBuilderService.ts'));

const generatedAt = '2026-05-29T12:00:00.000Z';
const trailheadStart = {
  id: 'route-trailhead-start',
  type: 'trailhead_start',
  phase: 'trailhead',
  title: 'Confirmed trailhead',
  coordinate: { latitude: 38, longitude: -110.02 },
  source: { label: 'explicit_trailhead_start', state: 'cached' },
  confidence: 'high',
};

function statusFor(result, bucket) {
  return result.bucketSummaries.find((summary) => summary.bucket === bucket);
}

const fuelOnly = resolvePreTrailStops({
  trailheadStart,
  selectedPreTrailOptions: {
    fuel: [{
      id: 'selected-fuel',
      title: 'Operator-selected fuel',
      coordinate: { latitude: 37.99, longitude: -110.03 },
      source: 'operator_selected',
      confidence: 'medium',
    }],
  },
  routeId: 'pre-trail-test',
  generatedAt,
});

assert.strictEqual(fuelOnly.preTrailStops.fuel.length, 1);
assert.strictEqual(fuelOnly.preTrailStops.grocery.length, 0);
assert.strictEqual(fuelOnly.preTrailStops.water.length, 0);
assert.strictEqual(fuelOnly.preTrailStops.generalSupply.length, 0);
assert.strictEqual(statusFor(fuelOnly, 'fuel').status, 'selected');
assert.strictEqual(statusFor(fuelOnly, 'grocery').status, 'provider_unavailable');
assert.deepStrictEqual(statusFor(fuelOnly, 'fuel').anchorCoordinate, trailheadStart.coordinate);
assert.strictEqual(fuelOnly.preTrailStops.fuel[0].phase, 'pre_trail_resupply');
assert.strictEqual(fuelOnly.preTrailStops.fuel[0].stopRole, 'pre_trail_resupply');
assert.strictEqual(fuelOnly.preTrailStops.fuel[0].metadata.distanceBasis, 'trailhead_start');
assert.strictEqual(fuelOnly.preTrailStops.fuel[0].metadata.preTrailAnchor.latitude, 38);

const groceryOnly = resolvePreTrailStops({
  trailheadStart,
  selectedPreTrailOptions: {
    grocery: [{
      id: 'selected-grocery',
      title: 'Operator-selected grocery',
      coordinate: { latitude: 37.98, longitude: -110.04 },
      source: 'operator_selected',
      confidence: 'medium',
    }],
  },
  routeId: 'pre-trail-test',
  generatedAt,
});

assert.strictEqual(groceryOnly.preTrailStops.fuel.length, 0);
assert.strictEqual(groceryOnly.preTrailStops.grocery.length, 1);
assert.strictEqual(statusFor(groceryOnly, 'grocery').status, 'selected');
assert.strictEqual(groceryOnly.preTrailStops.grocery[0].metadata.distanceBasis, 'trailhead_start');

const noOptions = resolvePreTrailStops({
  trailheadStart,
  selectedPreTrailOptions: null,
  routeId: 'pre-trail-test',
  generatedAt,
});

assert.deepStrictEqual(noOptions.preTrailStops, {
  fuel: [],
  grocery: [],
  water: [],
  generalSupply: [],
});
assert.ok(
  noOptions.bucketSummaries.every((summary) => summary.status === 'provider_unavailable'),
  'Empty buckets should mean provider data is unavailable, not confirmed no stops found.',
);
assert.ok(
  noOptions.bucketSummaries.every((summary) => summary.metadata.searchAnchor === 'trailhead_start'),
  'Pre-trail provider hooks should be anchored to trailheadStart.',
);

const routeContextOnly = resolvePreTrailStops({
  trailheadStart,
  routeContext: {
    status: 'ready',
    supplyMode: 'gas_and_grocery',
    supplyCandidateCount: 3,
  },
  routeId: 'pre-trail-test',
  generatedAt,
});

assert.deepStrictEqual(routeContextOnly.preTrailStops, {
  fuel: [],
  grocery: [],
  water: [],
  generalSupply: [],
});
assert.strictEqual(statusFor(routeContextOnly, 'fuel').status, 'provider_unavailable');
assert.strictEqual(statusFor(routeContextOnly, 'fuel').metadata.routeContextCandidateCount, 3);
assert.ok(
  statusFor(routeContextOnly, 'fuel').warnings.some((warning) => warning.includes('Route context reports supply candidates')),
  'Route context candidates should be disclosed without converting them into fake itinerary stops.',
);

const liveRouteContextCandidateMerge = resolvePreTrailStops({
  trailheadStart,
  approachRoute: [
    { latitude: 37.9, longitude: -110.2 },
    { latitude: 37.98, longitude: -110.08 },
    trailheadStart.coordinate,
  ],
  candidates: {
    fuel: [{
      id: 'mapbox-live-fuel',
      providerPlaceId: 'mapbox-fuel-1',
      category: 'fuel',
      name: 'Last Fuel Before Trail',
      coordinate: { latitude: 37.98, longitude: -110.08 },
      distanceFromTrailheadMiles: 4.8,
      source: 'mapbox_search',
      provider: 'mapbox_search',
      confidence: 'medium',
      score: 0.74,
    }],
  },
  routeContext: {
    status: 'ready',
    supplyMode: 'gas_and_grocery',
    supplyCandidateCount: 2,
    supplyCandidates: [{
      id: 'route-context-grocery-1',
      providerPlaceId: 'mapbox-grocery-1',
      category: 'grocery',
      name: 'Trailhead Market',
      lat: 37.985,
      lng: -110.075,
      address: '12 Approach Rd',
      distanceToTrailheadMeters: 7400,
      detourDistanceMeters: 800,
      openStatus: 'unknown',
      confidence: { value: 0.78, reasons: ['Mapbox Route Context candidate.'] },
      score: 0.8,
      warnings: [],
      source: 'route_context_engine',
      providerMetadata: {
        providerId: 'mapbox_route_context_places',
        source: 'mapbox_search',
        searchCategory: 'grocery',
      },
    }],
  },
  routeId: 'pre-trail-live-route-context',
  generatedAt,
});

assert.strictEqual(liveRouteContextCandidateMerge.preTrailStops.fuel.length, 1);
assert.strictEqual(liveRouteContextCandidateMerge.preTrailStops.grocery.length, 1);
assert.strictEqual(statusFor(liveRouteContextCandidateMerge, 'fuel').status, 'ranked');
assert.strictEqual(statusFor(liveRouteContextCandidateMerge, 'grocery').status, 'ranked');
assert.strictEqual(
  statusFor(liveRouteContextCandidateMerge, 'grocery').metadata.routeContextCandidateCount,
  1,
  'Route Context candidate counts should be bucket-specific once detailed candidates are available.',
);
assert.strictEqual(
  liveRouteContextCandidateMerge.preTrailStops.grocery[0].source.state,
  'live',
  'Mapbox-backed Route Context candidates should stay live evidence when converted into itinerary stops.',
);
assert.strictEqual(
  liveRouteContextCandidateMerge.preTrailStops.grocery[0].source.provider,
  'mapbox_route_context_places',
);
assert.strictEqual(
  liveRouteContextCandidateMerge.preTrailStops.grocery[0].metadata.providerPlaceId,
  'mapbox-grocery-1',
);
assert.ok(
  !liveRouteContextCandidateMerge.bucketSummaries
    .flatMap((summary) => summary.warnings ?? [])
    .some((warning) => /not wired|scaffold/i.test(warning)),
  'Live Route Context candidates should not retain provider-unavailable scaffold warnings.',
);

const missingAnchor = resolvePreTrailStops({
  trailheadStart: null,
  selectedPreTrailOptions: null,
  routeId: 'pre-trail-test',
  generatedAt,
});

assert.ok(
  missingAnchor.bucketSummaries.every((summary) => summary.status === 'missing_anchor'),
  'Missing trailheadStart should be visible to Trip Builder.',
);
assert.deepStrictEqual(missingAnchor.preTrailStops, {
  fuel: [],
  grocery: [],
  water: [],
  generalSupply: [],
});

const suggestedRoute = {
  id: 'pre-trail-builder-route',
  name: 'Pre-trail Builder Route',
  trailheadStart: {
    latitude: 38,
    longitude: -110.02,
    confidence: 'high',
  },
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110.2, 37.9],
      [-110.02, 38],
    ],
  },
  trailGeometry: {
    type: 'LineString',
    coordinates: [
      [-110.02, 38],
      [-109.98, 38.04],
    ],
  },
};

const bothSelectedItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute,
  selectedPreTrailOptions: {
    fuel: [{
      id: 'builder-fuel',
      title: 'Builder selected fuel',
      coordinate: { latitude: 37.99, longitude: -110.03 },
      source: 'operator_selected',
    }],
    grocery: [{
      id: 'builder-grocery',
      title: 'Builder selected grocery',
      coordinate: { latitude: 37.98, longitude: -110.04 },
      source: 'operator_selected',
    }],
  },
  vehicleProfile: {
    id: 'vehicle-1',
    label: 'Rig',
    rangeMiles: 240,
    confidence: 'medium',
  },
  routeContext: {
    status: 'ready',
    supplyMode: 'gas_and_grocery',
    supplyCandidateCount: 2,
  },
  generatedAt,
});

assert.strictEqual(bothSelectedItinerary.preTrailStops.fuel.length, 1);
assert.strictEqual(bothSelectedItinerary.preTrailStops.grocery.length, 1);
assert.strictEqual(bothSelectedItinerary.preTrailStops.water.length, 0);
assert.strictEqual(bothSelectedItinerary.preTrailStops.generalSupply.length, 0);
assert.strictEqual(
  bothSelectedItinerary.preTrailStopStatus.find((summary) => summary.bucket === 'fuel').status,
  'selected',
);
assert.strictEqual(
  bothSelectedItinerary.preTrailStopStatus.find((summary) => summary.bucket === 'grocery').status,
  'selected',
);
assert.strictEqual(
  bothSelectedItinerary.preTrailStops.fuel[0].metadata.distanceBasis,
  'trailhead_start',
);
assert.ok(
  bothSelectedItinerary.dataUsed.some((source) => source.label === 'pre_trail_vehicle_profile'),
  'Vehicle profile should be accepted by the pre-trail resolver without generating fake stops.',
);
assert.ok(
  bothSelectedItinerary.dataUsed.some((source) => source.label === 'pre_trail_route_context'),
  'Route context should be accepted by the pre-trail resolver without generating fake stops.',
);
assert.ok(
  !bothSelectedItinerary.stops.some((stop) => stop.type === 'water' || stop.type === 'camp_potential' || stop.type === 'scenic_stop'),
  'Builder should not invent water points, campsites, or scenic stops.',
);

const noOptionsItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute,
  selectedPreTrailOptions: null,
  generatedAt,
});

assert.deepStrictEqual(noOptionsItinerary.preTrailStops, {
  fuel: [],
  grocery: [],
  water: [],
  generalSupply: [],
});
assert.ok(
  noOptionsItinerary.preTrailStopStatus.every((summary) => summary.status === 'provider_unavailable'),
  'Trip itinerary should preserve no-data-yet status for pre-trail buckets.',
);
assert.ok(
  noOptionsItinerary.confidence.reasons.some((reason) => reason.includes('not confirmed absence of stops')),
  'Confidence summary should distinguish no data yet from no stops found.',
);

console.log('Pre-trail resupply resolver checks passed.');
