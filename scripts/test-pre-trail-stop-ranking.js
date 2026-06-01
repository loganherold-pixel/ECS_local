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
  rankPreTrailStops,
  resolvePreTrailStops,
} = require(path.join(root, 'lib', 'tripBuilder', 'preTrailResupplyResolver.ts'));
const {
  routeContextToTripBuilderItineraryContext,
} = require(path.join(root, 'lib', 'tripBuilder', 'routeContextTripBuilderAdapter.ts'));
const {
  buildTripItineraryFromSuggestedRoute,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryBuilderService.ts'));

const generatedAt = '2026-05-29T12:00:00.000Z';
const trailheadStart = {
  id: 'trailhead',
  type: 'trailhead_start',
  phase: 'trailhead',
  title: 'Trailhead',
  coordinate: { latitude: 38, longitude: -110 },
  source: { label: 'explicit_trailhead_start', state: 'cached' },
  confidence: 'high',
};
const approachRoute = {
  id: 'approach',
  phase: 'approach',
  title: 'Approach',
  geometry: [
    { latitude: 37.8, longitude: -110.2 },
    { latitude: 37.9, longitude: -110.1 },
    { latitude: 38, longitude: -110 },
  ],
  segments: [],
  source: { label: 'fixture_approach', state: 'cached' },
  confidence: 'medium',
};

function statusFor(result, bucket) {
  return result.bucketSummaries.find((summary) => summary.bucket === bucket);
}

const nearVsFar = rankPreTrailStops({
  trailheadStart,
  approachRoute,
  candidates: [
    {
      id: 'far-fuel',
      category: 'fuel',
      name: 'Far Fuel',
      coordinate: { latitude: 37.55, longitude: -110.55 },
      openStatus: 'open',
      confidence: 'high',
      source: 'mapbox_search',
    },
    {
      id: 'near-fuel',
      category: 'fuel',
      name: 'Near Trailhead Fuel',
      coordinate: { latitude: 37.99, longitude: -110.01 },
      openStatus: 'open',
      confidence: 'medium',
      source: 'mapbox_search',
      providerPlaceId: 'mapbox-near-fuel',
    },
  ],
  providerAvailable: true,
  generatedAt,
});

assert.strictEqual(statusFor(nearVsFar, 'fuel').status, 'ranked');
assert.strictEqual(nearVsFar.preTrailStops.fuel[0].id, 'near-fuel');
assert.ok(
  nearVsFar.preTrailStops.fuel[0].metadata.distanceFromTrailheadMiles <
    nearVsFar.preTrailStops.fuel[1].metadata.distanceFromTrailheadMiles,
  'Closer fuel should rank ahead of far fuel when other data is comparable.',
);
assert.strictEqual(nearVsFar.preTrailStops.fuel[0].metadata.distanceBasis, 'trailhead_start');
assert.strictEqual(nearVsFar.preTrailStops.fuel[0].metadata.providerPlaceId, 'mapbox-near-fuel');

const approachPreferred = rankPreTrailStops({
  trailheadStart,
  approachRoute,
  candidates: [
    {
      id: 'nearest-high-detour',
      category: 'fuel',
      name: 'Nearest Off Approach',
      coordinate: { latitude: 37.999, longitude: -110.001 },
      detourDistanceMeters: 40000,
      openStatus: 'open',
      confidence: 'high',
      source: 'route_context_engine',
    },
    {
      id: 'approach-low-detour',
      category: 'fuel',
      name: 'Approach Fuel',
      coordinate: { latitude: 37.9, longitude: -110.1 },
      detourDistanceMeters: 500,
      openStatus: 'open',
      confidence: 'medium',
      source: 'route_context_engine',
    },
  ],
  providerAvailable: true,
  generatedAt,
});

assert.strictEqual(approachPreferred.preTrailStops.fuel[0].id, 'approach-low-detour');
assert.ok(
  approachPreferred.preTrailStops.fuel[0].metadata.routeDeviationMiles <
    approachPreferred.preTrailStops.fuel[1].metadata.routeDeviationMiles,
  'Stops along the approach route should beat a near stop with a large detour.',
);
assert.strictEqual(approachPreferred.preTrailStops.fuel[0].metadata.beforeTrailEntry, true);

const grouped = rankPreTrailStops({
  trailheadStart,
  approachRoute,
  candidates: [
    {
      id: 'trail-market',
      category: 'grocery',
      name: 'Trail Market',
      coordinate: { latitude: 37.98, longitude: -110.02 },
      openStatus: 'unknown',
      confidence: 0.8,
      source: 'supabase_poi',
      providerMetadata: { providerId: 'ecs_supabase_poi', categoryMatchQuality: 0.96 },
    },
    {
      id: 'water-refill',
      category: 'water',
      name: 'Water Refill',
      coordinate: { latitude: 37.97, longitude: -110.03 },
      confidence: 'medium',
      source: 'operator_verified',
    },
    {
      id: 'hardware-supply',
      category: 'supply',
      name: 'Trail Supply Hardware',
      coordinate: { latitude: 37.96, longitude: -110.04 },
      confidence: 'medium',
      source: 'supabase_poi',
    },
  ],
  providerAvailable: true,
  generatedAt,
});

assert.strictEqual(grouped.preTrailStops.grocery.length, 1);
assert.strictEqual(grouped.preTrailStops.water.length, 1);
assert.strictEqual(grouped.preTrailStops.generalSupply.length, 1);
assert.strictEqual(grouped.preTrailStops.grocery[0].metadata.openStatus, 'unknown');
assert.strictEqual(grouped.preTrailStops.grocery[0].metadata.providerMetadata.providerId, 'ecs_supabase_poi');

const closedVsOpen = rankPreTrailStops({
  trailheadStart,
  approachRoute,
  candidates: [
    {
      id: 'closed-near',
      category: 'fuel',
      name: 'Closed Fuel',
      coordinate: { latitude: 37.995, longitude: -110.005 },
      openStatus: 'closed',
      confidence: 'high',
      source: 'mapbox_search',
    },
    {
      id: 'open-farther',
      category: 'fuel',
      name: 'Open Fuel',
      coordinate: { latitude: 37.94, longitude: -110.06 },
      openStatus: 'open',
      confidence: 'medium',
      source: 'mapbox_search',
    },
  ],
  providerAvailable: true,
  generatedAt,
});

assert.strictEqual(closedVsOpen.preTrailStops.fuel[0].id, 'open-farther');
assert.ok(
  closedVsOpen.preTrailStops.fuel[1].notes.some((note) => note.includes('closed')),
  'Closed provider status should be preserved as a warning, not treated as open.',
);

const duplicateRemoval = rankPreTrailStops({
  trailheadStart,
  candidates: [
    {
      id: 'fuel-a',
      providerPlaceId: 'same-provider-place',
      category: 'fuel',
      name: 'Duplicate Fuel',
      coordinate: { latitude: 37.99, longitude: -110.01 },
      confidence: 'medium',
      source: 'mapbox_search',
    },
    {
      id: 'fuel-b',
      providerPlaceId: 'same-provider-place',
      category: 'fuel',
      name: 'Duplicate Fuel',
      coordinate: { latitude: 37.9901, longitude: -110.0101 },
      confidence: 'medium',
      source: 'mapbox_search',
    },
  ],
  providerAvailable: true,
  generatedAt,
});

assert.strictEqual(duplicateRemoval.preTrailStops.fuel.length, 1);
assert.strictEqual(statusFor(duplicateRemoval, 'fuel').metadata.duplicateCount, 1);

const providerUnavailable = rankPreTrailStops({
  trailheadStart,
  candidates: null,
  providerAvailable: false,
  generatedAt,
});

assert.deepStrictEqual(providerUnavailable.preTrailStops, {
  fuel: [],
  grocery: [],
  water: [],
  generalSupply: [],
});
assert.ok(
  providerUnavailable.bucketSummaries.every((summary) => summary.status === 'provider_unavailable'),
  'Missing provider should remain unavailable instead of pretending there are no stops.',
);

const providerNoResults = rankPreTrailStops({
  trailheadStart,
  candidates: [],
  providerAvailable: true,
  generatedAt,
});

assert.ok(
  providerNoResults.bucketSummaries.every((summary) => summary.status === 'no_results'),
  'Available provider with zero candidates should report no_results.',
);

const fallbackAnchor = rankPreTrailStops({
  trailheadStart: null,
  approachRoute,
  candidates: [{
    id: 'fallback-fuel',
    category: 'fuel',
    name: 'Fallback Anchor Fuel',
    coordinate: { latitude: 37.99, longitude: -110.01 },
    confidence: 'medium',
  }],
  providerAvailable: true,
  generatedAt,
});

assert.strictEqual(fallbackAnchor.anchorBasis, 'approach_route_end_fallback');
assert.strictEqual(statusFor(fallbackAnchor, 'fuel').status, 'ranked');
assert.strictEqual(fallbackAnchor.preTrailStops.fuel[0].metadata.distanceBasis, 'approach_route_end_fallback');

const routeContext = {
  id: 'route-context:ranking',
  trailId: 'ranking-trail',
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
  supplyCandidates: [
    {
      id: 'route-gas',
      providerPlaceId: 'provider-route-gas',
      category: 'gas',
      name: 'Route Context Fuel',
      lat: 37.99,
      lng: -110.01,
      address: '1 Fuel Rd',
      distanceToTrailheadMeters: 1400,
      detourDistanceMeters: 500,
      openStatus: 'open',
      confidence: { value: 0.82, reasons: ['Fixture.'] },
      score: 0.91,
      warnings: [],
      providerMetadata: { providerId: 'test-places', providerPlaceId: 'provider-route-gas' },
    },
    {
      id: 'route-market',
      providerPlaceId: 'provider-route-market',
      category: 'grocery',
      name: 'Route Context Market',
      lat: 37.98,
      lng: -110.02,
      address: '2 Market Rd',
      distanceToTrailheadMeters: 2400,
      detourDistanceMeters: 900,
      openStatus: 'open',
      confidence: { value: 0.78, reasons: ['Fixture.'] },
      score: 0.88,
      warnings: [],
      providerMetadata: { providerId: 'test-places', providerPlaceId: 'provider-route-market' },
    },
  ],
  selectedSupplyPlan: {
    mode: 'gas_and_grocery',
    orderedStops: [
      { candidateId: 'route-market', category: 'grocery', sequence: 1 },
      { candidateId: 'route-gas', category: 'gas', sequence: 2 },
    ],
    score: 0.9,
    confidence: { value: 0.8, reasons: ['Fixture.'] },
    warnings: [],
  },
  routeGeometry: null,
  campCandidates: [],
  bailoutCandidates: [],
  confidence: { value: 0.8, reasons: ['Fixture.'] },
  warnings: [],
  createdAt: generatedAt,
  updatedAt: generatedAt,
};

const itineraryContext = routeContextToTripBuilderItineraryContext(routeContext, 'gas_and_grocery');
const routeContextResolved = resolvePreTrailStops({
  trailheadStart,
  approachRoute,
  routeContext: itineraryContext,
  generatedAt,
});

assert.strictEqual(routeContextResolved.preTrailStops.fuel[0].id, 'route-gas');
assert.strictEqual(routeContextResolved.preTrailStops.grocery[0].id, 'route-market');
assert.strictEqual(statusFor(routeContextResolved, 'fuel').status, 'ranked');
assert.strictEqual(statusFor(routeContextResolved, 'fuel').metadata.routeContextCandidateCount, 2);
assert.strictEqual(routeContextResolved.preTrailStops.fuel[0].metadata.providerPlaceId, 'provider-route-gas');

const itinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'ranking-builder-route',
    name: 'Ranking Builder Route',
    trailheadStart: {
      latitude: 38,
      longitude: -110,
      confidence: 'high',
    },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110.2, 37.8],
        [-110.1, 37.9],
        [-110, 38],
      ],
    },
  },
  routeContext: itineraryContext,
  generatedAt,
});

assert.strictEqual(itinerary.preTrailStops.fuel[0].id, 'route-gas');
assert.strictEqual(itinerary.preTrailStops.grocery[0].id, 'route-market');
assert.strictEqual(
  itinerary.preTrailStopStatus.find((summary) => summary.bucket === 'fuel').status,
  'ranked',
);

console.log('Pre-trail stop ranking checks passed.');
