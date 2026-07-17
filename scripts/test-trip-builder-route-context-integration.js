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
  isUsableRouteContext,
  routeContextEvidenceState,
  routeContextRoutePoints,
  routeContextSupplyCandidatesToResupplyPoints,
  routeContextTrailheadCoordinate,
  routeContextToTripBuilderItineraryContext,
  routeWithRouteContext,
} = require(path.join(root, 'lib', 'tripBuilder', 'routeContextTripBuilderAdapter.ts'));
const { buildTripPlan } = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderService.ts'));

const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), `${message} missing expected source: ${needle}`);
}

const supplyCandidates = [
  {
    id: 'gas-1',
    providerPlaceId: 'provider-gas-1',
    category: 'gas',
    name: 'Route Fuel',
    lat: 37.99,
    lng: -110.02,
    address: '1 Fuel Rd',
    distanceToTrailheadMeters: 2500,
    driveDistanceToTrailheadMeters: 3000,
    detourDistanceMeters: 640,
    detourDurationSeconds: 300,
    openStatus: 'unknown',
    confidence: { value: 0.82, reasons: ['Fixture.'] },
    score: 0.91,
    warnings: [],
  },
  {
    id: 'grocery-1',
    providerPlaceId: 'provider-grocery-1',
    category: 'grocery',
    name: 'Route Market',
    lat: 37.98,
    lng: -110.03,
    address: '2 Market Rd',
    distanceToTrailheadMeters: 4000,
    confidence: { value: 0.78, reasons: ['Fixture.'] },
    score: 0.88,
    warnings: [],
  },
];

const routeContext = {
  id: 'route-context:integration',
  trailId: 'integration-trail',
  status: 'ready',
  trailheadAnchor: {
    lat: 38,
    lng: -110,
    label: 'Resolved Trailhead',
    source: 'explicit_trailhead',
    confidence: { value: 0.95, reasons: ['Fixture.'] },
    warnings: [],
  },
  selectedSupplyMode: 'gas_and_grocery',
  supplyCandidates,
  selectedSupplyPlan: {
    mode: 'gas_and_grocery',
    orderedStops: [
      { candidateId: 'gas-1', category: 'gas', sequence: 1 },
      { candidateId: 'grocery-1', category: 'grocery', sequence: 2 },
    ],
    score: 0.9,
    confidence: { value: 0.8, reasons: ['Fixture.'] },
    warnings: [],
  },
  routeGeometry: {
    origin: { lat: 37.9, lng: -110.2 },
    destination: { lat: 38, lng: -110 },
    waypoints: [
      { lat: 37.98, lng: -110.03 },
      { lat: 37.99, lng: -110.02 },
    ],
    coordinates: [
      { lat: 37.9, lng: -110.2 },
      { lat: 37.98, lng: -110.03 },
      { lat: 37.99, lng: -110.02 },
      { lat: 38, lng: -110 },
    ],
    distanceMeters: 18000,
    durationSeconds: 2100,
    bbox: { west: -110.2, south: 37.9, east: -110, north: 38 },
    corridor: null,
    segments: [],
  },
  campCandidates: [],
  bailoutCandidates: [],
  confidence: { value: 0.8, reasons: ['Fixture.'] },
  warnings: [],
  createdAt: '2026-05-29T12:00:00.000Z',
  updatedAt: '2026-05-29T12:00:00.000Z',
};

const enriched = routeWithRouteContext({ id: 'integration-trail', name: 'Integration Trail' }, routeContext);
assert.deepStrictEqual(routeContextTrailheadCoordinate(routeContext), { latitude: 38, longitude: -110 });
assert.deepStrictEqual(routeContextRoutePoints(routeContext)[0], { latitude: 37.9, longitude: -110.2 });
assert.strictEqual(enriched.startLat, 38);
assert.strictEqual(enriched.startLng, -110);
assert.strictEqual(enriched.distanceMiles, 11.2);
assert.strictEqual(enriched.estimatedDriveTimeHours, 0.6);
assert.strictEqual(enriched.routeGeometry.type, 'LineString');
assert.strictEqual(enriched.routeMetadata.routeContext.providerMetadata, undefined);
assert.strictEqual(routeContextRoutePoints(routeContext).length, 4);

const resupplyPoints = routeContextSupplyCandidatesToResupplyPoints(routeContext, 'gas_and_grocery');
assert.deepStrictEqual(resupplyPoints.map((point) => point.category), ['fuel', 'food_supplies']);
assert.strictEqual(resupplyPoints[0].name, 'Route Fuel');
assert.strictEqual(resupplyPoints[0].distanceFromStartMiles, null, 'Candidate-to-trailhead distance must not masquerade as origin distance.');
assert.strictEqual(resupplyPoints[0].distanceFromRouteMiles, 0.4);
assert.strictEqual(resupplyPoints[0].approachEvidence.distanceBeforeTrailheadMiles, 1.9);
assert.strictEqual(resupplyPoints[0].approachEvidence.detourDurationMinutes, 5);
assert.strictEqual(resupplyPoints[0].approachEvidence.operatingStatus, 'unknown');
assert.strictEqual(resupplyPoints[0].selectionState, 'route_context_selected');
const itineraryContext = routeContextToTripBuilderItineraryContext(routeContext, 'gas_and_grocery');
assert.strictEqual(itineraryContext.confidence.tier, 'high');
assert.strictEqual(itineraryContext.supplyMode, 'gas_and_grocery');
assert.strictEqual(itineraryContext.routeDistanceMiles, 11.2);
assert.deepStrictEqual(itineraryContext.selectedSupplyPlan.orderedStops.map((stop) => stop.category), ['gas', 'grocery']);

const partialRouteContext = {
  ...routeContext,
  status: 'partial',
  warnings: [{ code: 'provider_unavailable', message: 'Provider unavailable.', severity: 'watch' }],
  confidence: { value: 0.55, reasons: ['Partial fixture.'] },
};
assert.strictEqual(isUsableRouteContext(partialRouteContext), true);
assert.strictEqual(routeContextToTripBuilderItineraryContext(partialRouteContext, 'gas_and_grocery').confidence.tier, 'partial');
assert.strictEqual(routeContextSupplyCandidatesToResupplyPoints(partialRouteContext, 'gas_and_grocery').length, 2);
assert.strictEqual(routeContextEvidenceState(partialRouteContext), 'partial');
assert.match(
  routeContextSupplyCandidatesToResupplyPoints(partialRouteContext, 'gas_and_grocery')[0].source,
  /^partial_route_context_engine$/,
);

const staleRouteContext = {
  ...routeContext,
  status: 'stale',
  warnings: [{ code: 'stale_cached_context', message: 'Cached Route Context.', severity: 'watch' }],
  confidence: { value: 0.62, reasons: ['Stale fixture.'] },
};
assert.strictEqual(isUsableRouteContext(staleRouteContext), true);
assert.strictEqual(routeContextEvidenceState(staleRouteContext), 'stale');
const staleResupplyPoints = routeContextSupplyCandidatesToResupplyPoints(staleRouteContext, 'gas_and_grocery');
assert.strictEqual(staleResupplyPoints[0].source, 'stale_route_context_engine');
assert.ok(
  staleResupplyPoints[0].notes.some((note) => /cached\/stale/i.test(note)),
  'Cached Route Context supply evidence must remain visibly stale when live provider refresh is unavailable.',
);
assert.strictEqual(routeContextToTripBuilderItineraryContext(staleRouteContext, 'gas_and_grocery').status, 'stale');

const errorRouteContext = {
  ...routeContext,
  status: 'error',
  confidence: { value: 0.1, reasons: ['Error fixture.'] },
};
assert.strictEqual(isUsableRouteContext(errorRouteContext), false);
assert.strictEqual(routeContextToTripBuilderItineraryContext(errorRouteContext, 'gas_and_grocery'), null);
assert.strictEqual(routeContextSupplyCandidatesToResupplyPoints(errorRouteContext, 'gas_and_grocery').length, 0);

const inaccessibleRouteContext = {
  ...routeContext,
  selectedSupplyMode: 'gas',
  supplyCandidates: [{ ...supplyCandidates[0], id: 'gas-inaccessible', accessStatus: 'inaccessible' }],
  selectedSupplyPlan: {
    ...routeContext.selectedSupplyPlan,
    mode: 'gas',
    orderedStops: [{ candidateId: 'gas-inaccessible', category: 'gas', sequence: 1 }],
  },
};
const inaccessibleResupplyPoints = routeContextSupplyCandidatesToResupplyPoints(inaccessibleRouteContext, 'gas');
assert.strictEqual(inaccessibleResupplyPoints[0].accessStatus, 'inaccessible');
const inaccessiblePlan = buildTripPlan({
  route: {
    id: 'inaccessible-route-context-plan',
    name: 'Inaccessible Route Context Plan',
    distanceMiles: 20,
    startLat: 38,
    startLng: -110,
    destinationCoordinate: { latitude: 38.2, longitude: -109.8 },
    waypoints: [],
  },
  input: {
    tripType: 'day_trip',
    timeWindow: 'full_day',
    groupType: 'solo',
    priorities: [],
    smartResupplyPreference: 'fuel_only',
  },
  vehicleProfile: {
    id: 'route-context-fixture-vehicle',
    label: 'Fixture Vehicle',
    rangeMiles: 250,
    confidence: 'medium',
  },
  resupplyPoints: inaccessibleResupplyPoints,
  capturedAt: '2026-05-29T12:00:00.000Z',
});
assert.strictEqual(
  inaccessiblePlan.smartResupplyPlan.fuel.keyPoint,
  null,
  'An inaccessible Route Context POI must not become the mounted Smart Resupply recommendation.',
);
assert.ok(
  inaccessiblePlan.suggestedStops.every((stop) => !stop.title.includes('Route Fuel')),
  'An inaccessible Route Context POI must not leak into the generated itinerary support stops.',
);

assertIncludes(screen, 'routeContextOrchestrator.prefetchForTrailSelection', 'Trail selection should trigger background route context prefetch.');
assertIncludes(screen, 'routeContextOrchestrator.getContext', 'Itinerary generation should read cached route context.');
assertIncludes(screen, 'routeContextSupplySelectionFromSmartOptions(selectedSmartFuel, selectedSmartSupply)', 'Trip Builder should derive Route Context selected supply IDs from manual picker choices.');
assertIncludes(screen, 'selectedRefuelCandidateId: selectedRouteContextSupplySelection.selectedRefuelCandidateId', 'Trip Builder should pass selected refuel candidates into Route Context prefetch and lookup.');
assertIncludes(screen, 'selectedResupplyCandidateId: selectedRouteContextSupplySelection.selectedResupplyCandidateId', 'Trip Builder should pass selected resupply candidates into Route Context prefetch and lookup.');
assertIncludes(screen, 'selectedSupplyCandidateIds: selectedRouteContextSupplySelection.selectedSupplyCandidateIds', 'Trip Builder should pass selected supply candidate IDs into Route Context prefetch and lookup.');
assertIncludes(screen, 'const cachedRouteContext = routeContextOrchestrator.getContext({', 'Trail selection should perform a cache-only route context read before feature-flagged prefetch.');
assert.ok(!screen.includes('providerMetadata: candidate.providerMetadata'), 'Trip Builder smart resupply options should not carry provider metadata in UI payloads.');
assertIncludes(screen, 'routeWithRouteContext(selectedRoute as unknown as TripBuilderRouteInput, routeContext)', 'Trip Builder should enrich route geometry before planning.');
assertIncludes(screen, 'routeContextToTripBuilderItineraryContext(routeContext, selectedSupplyMode)', 'Trip Builder should pass RouteContext into the itinerary generator.');
assertIncludes(screen, 'routeContextSupplyCandidatesToResupplyPoints(routeContext, selectedSupplyMode)', 'Trip Builder should pass RouteContext POI data into Smart Resupply.');
assertIncludes(screen, 'const selectedTrailheadResupplyAnchorCoordinate = useMemo(', 'Trip Builder should keep a stable trailhead endpoint as the fallback Smart Resupply anchor.');
assertIncludes(screen, 'approachRoute: liveApproachRoutePoints', 'Trip Builder should search fuel along the approach route before falling back to the trailhead endpoint.');
assertIncludes(screen, 'fallbackAnchor: selectedPreTrailSupplyAnchorCoordinate', 'Trip Builder should search groceries along the approach route with the selected refuel stop as fallback.');
assertIncludes(screen, 'mergeAndRankSmartResupplyOptions({', 'Fuel and grocery candidates should be merged and reranked through the canonical approach model.');
assertIncludes(screen, 'function compareSmartResupplyOptionsByApproach', 'Smart Resupply merge should rank approach-corridor stops before source-priority tie breakers.');
assertIncludes(screen, "candidate.routeEvidenceState === 'provider_route'", 'Provider-routed evidence should survive the Route Context adapter without becoming unconditional source priority.');
assertIncludes(screen, 'orderedCandidateIds.get(left.id)', 'Smart Resupply options should use selected SupplyPlan order before raw candidate score.');
assertIncludes(screen, 'orderSelectedSmartResupplyPoints', 'Gas+grocery selected stops should preserve route context order when available.');
assertIncludes(screen, 'accessStatus: option.accessStatus', 'Mounted Smart Resupply adapters should preserve access evidence through planning handoff.');
assertIncludes(screen, 'smartResupplyOptionCoversFuelAndSupplies', 'Combined fuel and grocery copy should require explicit multi-category coverage.');
assertIncludes(screen, "option.providerResultState === 'stale'", 'Mounted Smart Resupply cards should visibly label cached/stale Route Context evidence.');
assertIncludes(screen, 'smartResupplyProviderFreshnessRank', 'Fresh live provider evidence should supersede stale Route Context presentation when identities reconcile.');

console.log('Trip Builder Route Context integration checks passed.');
