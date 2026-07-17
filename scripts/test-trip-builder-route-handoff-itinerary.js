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
  buildTripBuilderSuggestedRouteHandoff,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderSuggestedRouteHandoff.ts'));

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const tripBuilderSource = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');

const routeWithGeometry = {
  id: 'explore-known-geometry',
  name: 'Explore Known Geometry',
  startLat: 38,
  startLng: -110,
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110.2, 37.9],
      [-110.1, 37.95],
      [-110, 38],
    ],
  },
  trailGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.95, 38.05],
      [-109.9, 38.1],
    ],
  },
};

const liveHandoff = buildTripBuilderSuggestedRouteHandoff(routeWithGeometry, {
  userLocation: {
    latitude: 37.9,
    longitude: -110.2,
    accuracyMeters: 12,
  },
  createdAt: '2026-05-29T12:00:00.000Z',
});

assert.strictEqual(liveHandoff.userLocationState, 'live');
assert.strictEqual(liveHandoff.draftItinerary.sourceRouteId, routeWithGeometry.id);
assert.strictEqual(liveHandoff.draftItinerary.routeGeometryStatus, 'trail_available');
assert.deepStrictEqual(liveHandoff.draftItinerary.userStart, {
  latitude: 37.9,
  longitude: -110.2,
  accuracyMeters: 12,
});
assert.ok(liveHandoff.draftItinerary.approachRoute, 'Known approach geometry should be available.');
assert.ok(liveHandoff.draftItinerary.trailRoute, 'Known trail geometry should be available.');
assert.ok(
  liveHandoff.draftItinerary.preTrailStopStatus.every((summary) => summary.status === 'provider_unavailable'),
  'Suggested route handoff should scaffold pre-trail stop buckets without creating fake stops.',
);
assert.strictEqual(liveHandoff.route.itinerary.id, liveHandoff.draftItinerary.id);
assert.strictEqual(
  liveHandoff.route.routeMetadata.tripBuilderDraftItineraryId,
  liveHandoff.draftItinerary.id,
);

const missingTrailHandoff = buildTripBuilderSuggestedRouteHandoff({
  id: 'missing-trail-route',
  name: 'Missing Trail Route',
  startLat: 38,
  startLng: -110,
  routeGeometry: routeWithGeometry.routeGeometry,
}, {
  userLocation: { latitude: 37.9, longitude: -110.2 },
  createdAt: '2026-05-29T12:00:00.000Z',
});

assert.strictEqual(missingTrailHandoff.draftItinerary.trailRoute, null);
assert.strictEqual(missingTrailHandoff.draftItinerary.routeGeometryStatus, 'approach_only');
assert.ok(
  missingTrailHandoff.draftItinerary.warnings.some((warning) => warning.id === 'trail_geometry_missing'),
  'Missing trail geometry should remain an honest incomplete-intelligence warning.',
);

const pendingGpsHandoff = buildTripBuilderSuggestedRouteHandoff(routeWithGeometry, {
  userLocation: null,
  createdAt: '2026-05-29T12:00:00.000Z',
});

assert.strictEqual(pendingGpsHandoff.userLocationState, 'pending');
assert.strictEqual(pendingGpsHandoff.draftItinerary.userStart, null);
assert.ok(
  pendingGpsHandoff.draftItinerary.confidence.missingData.includes('user GPS location'),
  'Missing GPS should not crash and should remain visible in confidence data.',
);

const summaryOnlyHandoff = buildTripBuilderSuggestedRouteHandoff({
  id: 'summary-only-route',
  name: 'Summary Only Route',
  description: 'Explore summary metadata without detail geometry.',
  startLat: 38,
  startLng: -110,
  routeMetadata: {
    source: 'trail_pack',
    trailPackId: 'summary-only-route',
    routeGeometryMode: 'omitted',
  },
}, {
  deferItineraryBuild: true,
  createdAt: '2026-07-16T12:00:00.000Z',
});

assert.strictEqual(
  summaryOnlyHandoff.draftItinerary,
  null,
  'Explore summary handoff must not prebuild an itinerary or detailed geometry.',
);
assert.strictEqual(summaryOnlyHandoff.route.itinerary, undefined);
assert.strictEqual(
  summaryOnlyHandoff.route.routeMetadata.tripBuilderDraftItineraryId,
  null,
  'The existing persisted handoff should carry summary identity without claiming a prepared itinerary.',
);

assert.ok(
  discoverSource.includes('stageTripBuilderItineraryHandoff(op);') &&
    discoverSource.includes('setAnalysisVisible(true);'),
  'Opening an Explore suggested route should stage the Trip Builder itinerary draft while preserving the analysis modal.',
);
assert.ok(
  discoverSource.includes('deferItineraryBuild: true') &&
    discoverSource.includes('stageTripBuilderItineraryHandoff(route);') &&
    discoverSource.includes("pathname: '/explore-trip-builder'"),
  'Build Trip should keep the existing persisted handoff while deferring geometry preparation.',
);
assert.ok(
  tripBuilderSource.includes('continueTripBuilderRoutePreparation(started, selectedRoute') &&
    tripBuilderSource.includes('saveTripBuilderRouteHandoff(ready.canonicalRoute') &&
    tripBuilderSource.includes("routePreparationState.status === 'awaiting_trailhead_selection'"),
  'Trip Builder should own detail loading, canonical persistence, and trailhead confirmation.',
);
assert.ok(
  tripBuilderSource.includes('handoffDraftItinerary') &&
    tripBuilderSource.includes('itinerary: handoffDraftItinerary'),
  'Trip Builder should receive the draft itinerary through the selected route handoff.',
);

console.log('Trip Builder route handoff itinerary checks passed.');
