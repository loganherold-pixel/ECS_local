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
  preTrailProviderStateFromRequestStatus,
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

assert.strictEqual(preTrailProviderStateFromRequestStatus('loading'), 'pending');
assert.strictEqual(preTrailProviderStateFromRequestStatus('deferred'), 'pending');
assert.strictEqual(preTrailProviderStateFromRequestStatus('ready'), 'ready');
assert.strictEqual(preTrailProviderStateFromRequestStatus('empty'), 'empty');
assert.strictEqual(preTrailProviderStateFromRequestStatus('error'), 'error');

const independentProviderStates = resolvePreTrailStops({
  trailheadStart,
  providerStates: {
    fuel: 'pending',
    grocery: 'error',
    generalSupply: 'empty',
  },
  userPreferences: { smartResupplyPreference: 'fuel_supplies' },
  routeId: 'pre-trail-provider-state-test',
  generatedAt,
});
assert.strictEqual(statusFor(independentProviderStates, 'fuel').status, 'provider_pending');
assert.strictEqual(statusFor(independentProviderStates, 'fuel').providerState, 'pending');
assert.strictEqual(statusFor(independentProviderStates, 'grocery').status, 'provider_unavailable');
assert.strictEqual(statusFor(independentProviderStates, 'grocery').providerState, 'error');
assert.strictEqual(statusFor(independentProviderStates, 'generalSupply').status, 'no_results');
assert.strictEqual(statusFor(independentProviderStates, 'generalSupply').providerState, 'empty');
assert.strictEqual(statusFor(independentProviderStates, 'water').status, 'not_requested');
assert.notStrictEqual(
  statusFor(independentProviderStates, 'grocery').status,
  'no_results',
  'A terminal provider failure must never collapse into a valid-empty state merely because credentials or a search token exist.',
);

const retainedSelectionDuringProviderError = resolvePreTrailStops({
  trailheadStart,
  selectedPreTrailOptions: {
    fuel: [{
      id: 'retained-selected-fuel',
      title: 'Retained Selected Fuel',
      coordinate: { latitude: 37.99, longitude: -110.03 },
      source: 'operator_selected',
    }],
  },
  providerStates: { fuel: 'error' },
  userPreferences: { smartResupplyPreference: 'fuel_only' },
  routeId: 'pre-trail-retained-provider-error',
  generatedAt,
});
assert.strictEqual(statusFor(retainedSelectionDuringProviderError, 'fuel').status, 'selected');
assert.strictEqual(statusFor(retainedSelectionDuringProviderError, 'fuel').providerState, 'error');
assert.ok(
  statusFor(retainedSelectionDuringProviderError, 'fuel').warnings.some((warning) => /retained|remain visible/i.test(warning)),
  'A failed refresh should retain an operator-selected stop while preserving degraded provider evidence.',
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

const combinedPlaceIdentity = 'provider-place:mapbox:mapbox-combined-1';
const combinedSelection = {
  id: 'operator-combined-place',
  title: 'Confirmed Fuel Market',
  coordinate: { latitude: 37.985, longitude: -110.04 },
  source: 'operator_selected',
  metadata: {
    placeIdentity: combinedPlaceIdentity,
    mapboxId: 'mapbox-combined-1',
    categoryCoverage: ['fuel', 'food_supplies'],
    operatorSelected: true,
  },
};
const combinedProviderCandidates = {
  fuel: [{
    id: 'candidate-combined-fuel',
    providerPlaceId: 'mapbox-combined-1',
    category: 'fuel',
    name: 'Confirmed Fuel Market',
    coordinate: combinedSelection.coordinate,
    source: 'mapbox_search',
  }],
  grocery: [{
    id: 'candidate-other-grocery',
    providerPlaceId: 'other-grocery',
    category: 'grocery',
    name: 'Other Grocery',
    coordinate: { latitude: 37.98, longitude: -110.05 },
    source: 'mapbox_search',
  }],
};
const combinedResolution = resolvePreTrailStops({
  trailheadStart,
  selectedPreTrailOptions: {
    fuel: [combinedSelection],
    grocery: [combinedSelection],
  },
  candidates: combinedProviderCandidates,
  providerAvailable: true,
  routeId: 'combined-pre-trail-test',
  generatedAt,
});
assert.deepStrictEqual(
  combinedResolution.preTrailStops.fuel.map((stop) => stop.title),
  ['Confirmed Fuel Market'],
  'An operator-selected place must supersede its duplicate provider fuel candidate.',
);
assert.deepStrictEqual(
  combinedResolution.preTrailStops.grocery.map((stop) => stop.title),
  ['Confirmed Fuel Market'],
  'A confirmed combined selection must satisfy groceries without scheduling a different candidate.',
);

const combinedItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute,
  selectedPreTrailOptions: {
    fuel: [combinedSelection],
    grocery: [combinedSelection],
  },
  preTrailStopCandidates: combinedProviderCandidates,
  preTrailProviderAvailable: true,
  generatedAt,
});
assert.strictEqual(
  combinedItinerary.stops.filter((stop) => stop.metadata?.placeIdentity === combinedPlaceIdentity).length,
  1,
  'One combined physical place must appear only once in the scheduled itinerary.',
);
assert.strictEqual(
  combinedItinerary.stops.some((stop) => stop.title === 'Other Grocery'),
  false,
  'A combined operator selection must prevent an unrelated grocery candidate from being auto-scheduled.',
);

const closedCandidateResolution = resolvePreTrailStops({
  trailheadStart,
  candidates: {
    fuel: [{
      id: 'closed-route-context-fuel',
      providerPlaceId: 'closed-fuel',
      category: 'fuel',
      name: 'Closed Fuel',
      coordinate: { latitude: 37.99, longitude: -110.03 },
      openStatus: 'closed',
      source: 'route_context_engine',
    }],
  },
  providerAvailable: true,
  routeId: 'closed-pre-trail-test',
  generatedAt,
});
assert.strictEqual(
  closedCandidateResolution.preTrailStops.fuel.length,
  0,
  'A known-closed Route Context candidate must not bypass the approach planner and enter the itinerary.',
);
assert.ok(
  closedCandidateResolution.warnings.some((warning) => /excluded.*closed/i.test(warning)),
  'Known-closed candidate exclusion must remain visible in resolver diagnostics.',
);

const invalidSelectedWithAlternative = resolvePreTrailStops({
  trailheadStart,
  approachRoute: [
    { latitude: 37.9, longitude: -110.12 },
    trailheadStart.coordinate,
  ],
  selectedPreTrailOptions: {
    fuel: [
      {
        id: 'invalid-selected-fuel',
        title: 'Invalid Selected Fuel',
        coordinate: { latitude: 120, longitude: -110.05 },
        source: 'operator_selected',
      },
      {
        id: 'closed-selected-fuel',
        title: 'Closed Selected Fuel',
        coordinate: { latitude: 37.96, longitude: -110.06 },
        source: 'operator_selected',
        metadata: { openStatus: 'closed' },
      },
    ],
  },
  candidates: {
    fuel: [{
      id: 'viable-unselected-fuel',
      providerPlaceId: 'viable-unselected-fuel',
      category: 'fuel',
      name: 'Viable but Unselected Fuel',
      coordinate: { latitude: 37.97, longitude: -110.05 },
      source: 'mapbox_search',
    }],
  },
  providerAvailable: true,
  routeId: 'invalid-selected-does-not-substitute',
  generatedAt,
});
const invalidSelectedFuelSummary = statusFor(invalidSelectedWithAlternative, 'fuel');
assert.strictEqual(
  invalidSelectedWithAlternative.preTrailStops.fuel.length,
  0,
  'An invalid or known-closed operator selection must not silently substitute a different provider candidate.',
);
assert.strictEqual(invalidSelectedFuelSummary.metadata.suppressedAlternativeCount, 1);
assert.strictEqual(invalidSelectedFuelSummary.metadata.duplicateCount, 0);
assert.strictEqual(invalidSelectedFuelSummary.metadata.excludedCount, 2);
assert.ok(
  invalidSelectedWithAlternative.warnings.some((warning) => /must be reselected/i.test(warning)) &&
    invalidSelectedWithAlternative.warnings.some((warning) => /Closed Selected Fuel.*closed/i.test(warning)),
  'Invalid selected-stop state must stay visible and require an explicit operator choice.',
);

const sparseTrailheadStart = {
  ...trailheadStart,
  id: 'sparse-route-trailhead',
  coordinate: { latitude: 1, longitude: 0 },
};
const sparseRouteResolution = resolvePreTrailStops({
  trailheadStart: sparseTrailheadStart,
  approachRoute: [
    { latitude: 0, longitude: 0 },
    sparseTrailheadStart.coordinate,
  ],
  candidates: {
    fuel: [
      {
        id: 'sparse-midpoint-fuel',
        category: 'fuel',
        name: 'Sparse Route Midpoint Fuel',
        coordinate: { latitude: 0.5, longitude: 0 },
        source: 'mapbox_search',
      },
      {
        id: 'sparse-behind-origin-fuel',
        category: 'fuel',
        name: 'Sparse Behind Origin Fuel',
        coordinate: { latitude: -0.05, longitude: 0 },
        source: 'mapbox_search',
      },
      {
        id: 'sparse-beyond-trailhead-fuel',
        category: 'fuel',
        name: 'Sparse Beyond Trailhead Fuel',
        coordinate: { latitude: 1.05, longitude: 0 },
        source: 'mapbox_search',
      },
    ],
  },
  providerAvailable: true,
  routeId: 'sparse-route-position-test',
  generatedAt,
});
assert.deepStrictEqual(
  sparseRouteResolution.preTrailStops.fuel.map((stop) => stop.id),
  ['sparse-midpoint-fuel'],
  'Segment projection must retain the on-route midpoint and exclude endpoint extensions.',
);
assert.strictEqual(sparseRouteResolution.preTrailStops.fuel[0].metadata.routeDeviationMiles, 0);
assert.strictEqual(sparseRouteResolution.preTrailStops.fuel[0].metadata.approachRoutePosition, 'on_approach');
assert.ok(sparseRouteResolution.warnings.some((warning) => /Sparse Behind Origin Fuel.*behind the trip origin/i.test(warning)));
assert.ok(sparseRouteResolution.warnings.some((warning) => /Sparse Beyond Trailhead Fuel.*after the trailhead/i.test(warning)));

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

const providerFailureItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute,
  userPreferences: { smartResupplyPreference: 'fuel_only' },
  preTrailProviderStates: { fuel: 'error' },
  generatedAt,
});
assert.strictEqual(
  providerFailureItinerary.preTrailStopStatus.find((summary) => summary.bucket === 'fuel').providerState,
  'error',
);
assert.strictEqual(
  providerFailureItinerary.metadata.preTrailStopStatus.find((summary) => summary.bucket === 'fuel').providerState,
  'error',
  'Itinerary metadata must preserve the provider terminal state across persistence and hydration boundaries.',
);
assert.ok(
  providerFailureItinerary.warnings.some((warning) => warning.id === 'pre_trail_poi_provider_unavailable'),
  'A provider failure must surface as unavailable rather than a valid empty result.',
);

const fuelOnlyEmptyItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute,
  userPreferences: { smartResupplyPreference: 'fuel_only' },
  preTrailProviderStates: {
    fuel: 'empty',
    grocery: 'pending',
    water: 'unavailable',
    generalSupply: 'pending',
  },
  generatedAt,
});
assert.ok(
  !fuelOnlyEmptyItinerary.warnings.some((warning) => (
    warning.id === 'pre_trail_poi_provider_pending' || warning.id === 'pre_trail_poi_provider_unavailable'
  )),
  'Unrequested grocery, water, and general-supply lifecycle states must not degrade a fuel-only itinerary.',
);

const smartResupplyDisabledItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute,
  userPreferences: { smartResupplyPreference: 'no' },
  preTrailProviderStates: {
    fuel: 'pending',
    grocery: 'pending',
    water: 'pending',
    generalSupply: 'pending',
  },
  generatedAt,
});
assert.ok(
  smartResupplyDisabledItinerary.preTrailStopStatus.every((summary) => summary.status === 'not_requested'),
);
assert.ok(
  !smartResupplyDisabledItinerary.warnings.some((warning) => warning.id.includes('pre_trail_poi_provider')),
  'Disabled Smart Resupply must not emit provider lifecycle warnings for unrequested buckets.',
);

console.log('Pre-trail resupply resolver checks passed.');
