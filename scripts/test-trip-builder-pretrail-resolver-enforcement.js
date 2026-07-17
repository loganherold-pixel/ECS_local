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
  filterBailoutPlanCandidates,
} = require(path.join(root, 'lib', 'tripBuilder', 'bailoutCandidateQuality.ts'));

const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
const itineraryBuilder = fs.readFileSync(path.join(root, 'lib', 'tripBuilder', 'tripItineraryBuilderService.ts'), 'utf8');

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), `${message} missing expected source: ${needle}`);
}

function statusFor(result, bucket) {
  return result.bucketSummaries.find((summary) => summary.bucket === bucket);
}

const generatedAt = '2026-06-07T12:00:00.000Z';
const trailheadStart = {
  id: 'repair-5-trailhead',
  type: 'trailhead_start',
  phase: 'trailhead',
  title: 'Repair 5 trailhead',
  coordinate: { latitude: 38, longitude: -110 },
  source: { label: 'explicit_trailhead_start', state: 'cached' },
  confidence: 'high',
};
const approachRoute = {
  id: 'repair-5-approach',
  phase: 'approach',
  title: 'Repair 5 approach',
  geometry: [
    { latitude: 37.97, longitude: -110.03 },
    { latitude: 37.99, longitude: -110.01 },
    { latitude: 38, longitude: -110 },
  ],
  segments: [],
  source: { label: 'fixture_approach', state: 'cached' },
  confidence: 'medium',
};

const anchoredChain = rankPreTrailStops({
  trailheadStart,
  approachRoute,
  candidates: {
    fuel: [
      {
        id: 'fuel-near-trailhead',
        category: 'fuel',
        name: 'Fuel Near Trailhead',
        coordinate: { latitude: 37.99, longitude: -110.01 },
        openStatus: 'open',
        confidence: 'high',
        score: 0.9,
        source: 'mapbox_search',
      },
    ],
    grocery: [
      {
        id: 'grocery-near-trailhead',
        category: 'grocery',
        name: 'Grocery Near Trailhead',
        coordinate: { latitude: 37.999, longitude: -110.001 },
        openStatus: 'open',
        confidence: 'high',
        score: 0.82,
        source: 'mapbox_search',
      },
      {
        id: 'grocery-near-refuel',
        category: 'grocery',
        name: 'Grocery Near Selected Refuel',
        coordinate: { latitude: 37.9904, longitude: -110.0104 },
        openStatus: 'open',
        confidence: 'high',
        score: 0.82,
        source: 'mapbox_search',
      },
    ],
  },
  providerAvailable: true,
  generatedAt,
});

assert.strictEqual(anchoredChain.preTrailStops.fuel[0].id, 'fuel-near-trailhead');
assert.strictEqual(
  anchoredChain.preTrailStops.grocery[0].id,
  'grocery-near-refuel',
  'When fuel and grocery are both planned, grocery should be ranked against the selected refuel stop instead of independently nearest the trailhead.',
);
assert.strictEqual(
  anchoredChain.preTrailStops.grocery[0].metadata.resupplyAnchorStopId,
  'fuel-near-trailhead',
  'Grocery metadata should disclose the refuel stop used as the sequencing anchor.',
);
assert.ok(
  anchoredChain.preTrailStops.grocery[0].metadata.distanceFromResupplyAnchorMiles <
    anchoredChain.preTrailStops.grocery[1].metadata.distanceFromResupplyAnchorMiles,
  'Resolver should expose the distance from the selected refuel anchor for downstream UI/status copy.',
);
assert.strictEqual(statusFor(anchoredChain, 'fuel').status, 'ranked');
assert.strictEqual(statusFor(anchoredChain, 'grocery').status, 'ranked');

const providerUnavailable = resolvePreTrailStops({
  trailheadStart,
  candidates: null,
  providerAvailable: false,
  generatedAt,
});
assert.ok(
  providerUnavailable.bucketSummaries.every((summary) => summary.status === 'provider_unavailable'),
  'Provider-unavailable pre-trail paths should remain explicit instead of pretending a live POI search returned no candidates.',
);

const emptyProviderResults = resolvePreTrailStops({
  trailheadStart,
  candidates: [],
  providerAvailable: true,
  generatedAt,
});
assert.ok(
  emptyProviderResults.bucketSummaries.every((summary) => summary.status === 'no_results'),
  'An available provider with an empty candidate list should be reported as no_results, not provider_unavailable.',
);

const farBailoutFilter = filterBailoutPlanCandidates({
  providerCandidates: [{
    id: 'mapbox-tennessee-noise',
    title: 'Tennessee Highway 197',
    source: 'mapbox_search',
    coordinate: { latitude: 35.63, longitude: -88.62 },
    distanceFromRouteStartMiles: 1800.5,
  }],
  routeFallbackCandidates: [{
    id: 'ecs-mid-route-bailout-search',
    title: 'Mid-route bailout search',
    source: 'ecs_suggested',
    coordinate: { latitude: 38.04, longitude: -110.04 },
    distanceFromRouteStartMiles: 3.8,
  }],
  routeStart: trailheadStart.coordinate,
  routePoints: approachRoute.geometry,
  limit: 5,
});
assert.deepStrictEqual(
  farBailoutFilter.candidates.map((candidate) => candidate.id),
  ['ecs-mid-route-bailout-search'],
  'Far-away provider bailout noise should be rejected while route-derived fallback candidates remain.',
);
assert.strictEqual(farBailoutFilter.rejectedProviderCount, 1);
assert.strictEqual(farBailoutFilter.usedRouteFallback, true);

const noBailoutCandidates = filterBailoutPlanCandidates({
  providerCandidates: [{
    id: 'mapbox-far-noise',
    title: 'Wrong state highway',
    source: 'mapbox_search',
    coordinate: { latitude: 42, longitude: -74 },
    distanceFromRouteStartMiles: 1600,
  }],
  routeFallbackCandidates: [],
  routeStart: trailheadStart.coordinate,
  routePoints: approachRoute.geometry,
  limit: 5,
});
assert.deepStrictEqual(
  noBailoutCandidates.candidates,
  [],
  'Rejected provider candidates with no route-derived fallback should leave no usable bailout candidates.',
);

const skippedSmartResupply = resolvePreTrailStops({
  trailheadStart,
  candidates: null,
  providerAvailable: false,
  userPreferences: { smartResupplyPreference: 'no' },
  generatedAt,
});
assert.ok(
  skippedSmartResupply.bucketSummaries.every((summary) => summary.status === 'not_requested'),
  'Skipping smart resupply should emit not_requested instead of provider_unavailable.',
);

const fuelOnlyResupply = resolvePreTrailStops({
  trailheadStart,
  candidates: null,
  providerAvailable: false,
  userPreferences: { smartResupplyPreference: 'fuel_only' },
  generatedAt,
});
assert.strictEqual(
  statusFor(fuelOnlyResupply, 'fuel').status,
  'provider_unavailable',
  'Fuel-only planning still requests refuel lookup, so provider failure should remain visible.',
);
assert.strictEqual(
  statusFor(fuelOnlyResupply, 'grocery').status,
  'not_requested',
  'Fuel-only planning should not report grocery/resupply lookup as provider unavailable.',
);
assert.strictEqual(
  statusFor(fuelOnlyResupply, 'water').status,
  'not_requested',
  'Fuel-only planning should keep water lookup neutral when not requested.',
);

assertIncludes(
  itineraryBuilder,
  'resolvePreTrailStops({',
  'Trip itinerary builder should use the canonical pre-trail resolver',
);
assertIncludes(
  screen,
  'const preTrailDraftResolution = useMemo(',
  'Trip Builder UI should derive draft POI status from the canonical resolver',
);
assertIncludes(
  screen,
  'resolvePreTrailStops({',
  'Trip Builder UI should call the canonical resolver before consuming pre-trail POI selections',
);
assertIncludes(
  screen,
  'const routeContextItineraryInput = useMemo(',
  'Trip Builder UI should normalize Route Context once for draft and final itinerary generation',
);
assertIncludes(
  screen,
  'preTrailProviderStateFromRequestStatus(smartResupplyFuelRequest.status)',
  'Trip Builder draft POI state should derive fuel availability from the actual terminal request state',
);
assert.ok(
  /preTrailProviderStateFromRequestStatus\([\s\S]*?smartResupplySupplyRequest\.status[\s\S]*?\)/.test(screen),
  'Trip Builder draft POI state should keep grocery/supply request lifecycle independent from fuel or a combined stop',
);
assertIncludes(
  screen,
  'routeContext: routeContextItineraryInput,',
  'Trip Builder draft and final itinerary generation should pass Route Context into the pre-trail resolver',
);
assertIncludes(
  screen,
  'const selectedPreTrailSupplyAnchorCoordinate = useMemo(',
  'Grocery/supply lookup should use a stable anchor derived from the selected refuel when one exists',
);
assertIncludes(
  screen,
  'selectedSmartFuelLatitude != null && selectedSmartFuelLongitude != null',
  'Grocery/supply lookup should prefer the selected refuel coordinate before the trailhead fallback',
);
assertIncludes(
  screen,
  'fallbackAnchor: selectedPreTrailSupplyAnchorCoordinate',
  'Live grocery/supply search should keep the selected refuel as the fallback anchor while ranking against the approach route',
);
assert(
  !screen.includes('filterBailoutPlanCandidates({'),
  'Trip Builder should not run suggested bailout/rendezvous provider filtering in setup',
);
assert(
  !screen.includes('setBailoutOptionsLoading(false);'),
  'Trip Builder should not expose bailout suggestion loading state after removing suggested bailout search',
);
assert(
  !screen.includes('No usable bailout candidates were found near this route.'),
  'Trip Builder should not show no-results copy for removed bailout suggestions',
);

console.log('Trip Builder pre-trail resolver enforcement checks passed.');
