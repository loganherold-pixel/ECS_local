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
  buildTripItineraryFromSuggestedRoute,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryBuilderService.ts'));

const userLocation = {
  latitude: 37.91,
  longitude: -110.21,
  accuracyMeters: 9,
};

const approachGeometry = {
  type: 'LineString',
  coordinates: [
    [-110.21, 37.91],
    [-110.12, 37.96],
    [-110.02, 38.0],
  ],
};

const trailGeometry = {
  type: 'LineString',
  coordinates: [
    [-110.02, 38.0],
    [-109.98, 38.05],
    [-109.94, 38.1],
  ],
};

const fullRoute = {
  id: 'white-rim-suggested',
  name: 'White Rim Suggested Route',
  startLat: 38,
  startLng: -110.02,
  trailheadStart: {
    latitude: 38,
    longitude: -110.02,
    confidence: 'high',
  },
  routeGeometry: approachGeometry,
  trailGeometry,
  waypoints: [
    {
      id: 'known-rockfall',
      waypointType: 'hazard',
      title: 'Known rockfall shelf',
      coordinate: { latitude: 38.06, longitude: -109.97 },
      confidence: 'medium',
      source: 'operator_fixture',
    },
  ],
};

const fullItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: fullRoute,
  userLocation,
  userPreferences: {
    supplyMode: 'fuel_and_grocery',
  },
  selectedPreTrailOptions: {
    fuel: [
      {
        id: 'selected-fuel',
        title: 'Selected trail fuel',
        coordinate: { latitude: 37.93, longitude: -110.18 },
        source: 'operator_selected',
        confidence: 'medium',
      },
    ],
    grocery: [
      {
        id: 'selected-grocery',
        title: 'Selected grocery stop',
        coordinate: { latitude: 37.94, longitude: -110.17 },
        source: 'operator_selected',
        confidence: 'medium',
      },
    ],
  },
  generatedAt: '2026-05-29T12:00:00.000Z',
});

assert.strictEqual(fullItinerary.sourceRouteId, 'white-rim-suggested');
assert.deepStrictEqual(fullItinerary.userStart, userLocation);
assert.strictEqual(fullItinerary.routeGeometryStatus, 'trail_available');
assert.strictEqual(fullItinerary.approachRoute.geometry.length, 3);
assert.strictEqual(fullItinerary.trailRoute.geometry.length, 3);
assert.strictEqual(fullItinerary.approachRoute.phase, 'approach');
assert.strictEqual(fullItinerary.trailRoute.phase, 'trail_navigation');
assert.strictEqual(fullItinerary.exitRoute, null);
assert.strictEqual(fullItinerary.trailheadStart.coordinate.latitude, 38);
assert.strictEqual(fullItinerary.trailheadStart.phase, 'trailhead');
assert.strictEqual(fullItinerary.trailEnd.phase, 'trail_navigation');
assert.ok(
  fullItinerary.segments.some((segment) => segment.phase === 'approach'),
  'Approach geometry should produce an approach-phase segment.',
);
assert.ok(
  fullItinerary.segments.some((segment) => segment.phase === 'trail_navigation'),
  'Trail geometry should produce a trail-navigation segment.',
);
const fullApproachPhase = fullItinerary.phaseSummaries.find((phase) => phase.phase === 'approach');
const fullTrailheadPhase = fullItinerary.phaseSummaries.find((phase) => phase.phase === 'trailhead');
const fullTrailNavigationPhase = fullItinerary.phaseSummaries.find((phase) => phase.phase === 'trail_navigation');
const fullTrailExitPhase = fullItinerary.phaseSummaries.find((phase) => phase.phase === 'trail_exit');
assert.strictEqual(fullApproachPhase.status, 'available');
assert.strictEqual(fullTrailheadPhase.transitionFromPhase, 'approach');
assert.strictEqual(fullTrailheadPhase.transitionToPhase, 'trail_navigation');
assert.strictEqual(fullTrailNavigationPhase.status, 'available');
assert.ok(
  fullTrailNavigationPhase.waypointIds.includes(fullItinerary.trailEnd.id),
  'Trail end should mark the end of the trail_navigation phase.',
);
assert.strictEqual(fullTrailExitPhase.status, 'optional');
assert.strictEqual(fullItinerary.preTrailStops.fuel.length, 1);
assert.strictEqual(fullItinerary.preTrailStops.grocery.length, 1);
assert.strictEqual(fullItinerary.preTrailStops.water.length, 0);
assert.strictEqual(fullItinerary.preTrailStops.generalSupply.length, 0);
assert.strictEqual(
  fullItinerary.preTrailStopStatus.find((summary) => summary.bucket === 'fuel').status,
  'selected',
);
assert.strictEqual(
  fullItinerary.preTrailStopStatus.find((summary) => summary.bucket === 'grocery').status,
  'selected',
);
assert.strictEqual(
  fullItinerary.preTrailStopStatus.find((summary) => summary.bucket === 'water').status,
  'not_requested',
);
assert.strictEqual(
  fullItinerary.preTrailStops.fuel[0].metadata.distanceBasis,
  'trailhead_start',
);
assert.ok(
  fullItinerary.trailWaypoints.some((waypoint) => waypoint.id === 'known-rockfall' && waypoint.type === 'hazard'),
  'Real route waypoint data should be preserved as trailWaypoints.',
);
const fullHazardWaypoint = fullItinerary.trailWaypoints.find((waypoint) => waypoint.id === 'known-rockfall');
assert.strictEqual(fullHazardWaypoint.phase, 'trail_navigation');
assert.strictEqual(fullHazardWaypoint.isEcsSuggested, false);
assert.strictEqual(fullHazardWaypoint.metadata.waypointSourceKind, 'suggested_route_waypoint');
assert.strictEqual(
  fullItinerary.metadata.trailWaypointIntelligence.normalizedWaypointCount,
  1,
);
assert.ok(
  !fullItinerary.waypoints.some((waypoint) => waypoint.type === 'camp_potential' || waypoint.type === 'scenic_stop' || waypoint.type === 'bailout'),
  'Itinerary builder must not invent camps, scenic stops, or bailout points.',
);

const missingTrailGeometryRoute = {
  id: 'missing-trail-geometry',
  name: 'Missing Trail Geometry Route',
  routeGeometry: approachGeometry,
};

const missingTrailGeometryItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: missingTrailGeometryRoute,
  userLocation,
  generatedAt: '2026-05-29T12:00:00.000Z',
});

assert.strictEqual(missingTrailGeometryItinerary.sourceRouteId, 'missing-trail-geometry');
assert.strictEqual(missingTrailGeometryItinerary.routeGeometryStatus, 'approach_only');
assert.ok(missingTrailGeometryItinerary.approachRoute, 'Approach geometry should be used when supplied.');
assert.strictEqual(missingTrailGeometryItinerary.approachRoute.phase, 'approach');
assert.deepStrictEqual(missingTrailGeometryItinerary.trailheadStart.coordinate, {
  latitude: 38,
  longitude: -110.02,
});
assert.strictEqual(missingTrailGeometryItinerary.trailRoute, null);
assert.strictEqual(missingTrailGeometryItinerary.exitRoute, null);
const missingTrailNavigationPhase = missingTrailGeometryItinerary.phaseSummaries.find((phase) => phase.phase === 'trail_navigation');
assert.strictEqual(missingTrailNavigationPhase.status, 'missing');
assert.ok(
  missingTrailNavigationPhase.warnings.some((warning) => warning.includes('approach geometry was not promoted')),
  'Approach-only routes must not be represented as trail-navigation geometry.',
);
assert.deepStrictEqual(missingTrailGeometryItinerary.trailWaypoints, []);
assert.deepStrictEqual(missingTrailGeometryItinerary.preTrailStops, {
  fuel: [],
  grocery: [],
  water: [],
  generalSupply: [],
});
assert.ok(
  missingTrailGeometryItinerary.preTrailStopStatus.every((summary) => summary.status === 'provider_unavailable'),
  'Empty pre-trail buckets should report provider_unavailable instead of implying no stops exist.',
);
assert.ok(
  missingTrailGeometryItinerary.confidence.missingData.includes('trail route geometry'),
  'Missing trail geometry should be visible in confidence summary.',
);
assert.ok(
  missingTrailGeometryItinerary.warnings.some((warning) => warning.id === 'trail_geometry_missing'),
  'Missing trail geometry should produce an honest warning.',
);

const missingApproachGeometryRoute = {
  id: 'missing-approach-geometry',
  name: 'Missing Approach Geometry Route',
  trailheadStart: {
    latitude: 38,
    longitude: -110.02,
  },
  trailGeometry,
};

const missingApproachGeometryItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: missingApproachGeometryRoute,
  userLocation,
  generatedAt: '2026-05-29T12:00:00.000Z',
});

assert.strictEqual(missingApproachGeometryItinerary.sourceRouteId, 'missing-approach-geometry');
assert.strictEqual(missingApproachGeometryItinerary.routeGeometryStatus, 'trail_available');
assert.strictEqual(missingApproachGeometryItinerary.approachRoute, null);
assert.ok(missingApproachGeometryItinerary.trailRoute, 'Trail geometry should be used when supplied.');
const missingApproachPhase = missingApproachGeometryItinerary.phaseSummaries.find((phase) => phase.phase === 'approach');
const missingApproachTrailPhase = missingApproachGeometryItinerary.phaseSummaries.find((phase) => phase.phase === 'trail_navigation');
assert.strictEqual(missingApproachPhase.status, 'missing');
assert.strictEqual(missingApproachTrailPhase.status, 'available');
assert.ok(
  missingApproachGeometryItinerary.confidence.missingData.includes('approach route geometry'),
  'Missing approach geometry should be visible in confidence summary.',
);
assert.strictEqual(missingApproachGeometryItinerary.trailWaypoints.length, 0);
assert.ok(
  !missingApproachGeometryItinerary.stops.some((stop) => (
    stop.type === 'fuel' ||
    stop.type === 'grocery' ||
    stop.type === 'water' ||
    stop.type === 'supply' ||
    stop.type === 'camp_potential' ||
    stop.type === 'scenic_stop' ||
    stop.type === 'bailout'
  )),
  'Missing geometry fixtures should not create fake resupply or route-intel stops.',
);

const explicitExitRoute = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'explicit-exit-route',
    name: 'Explicit Exit Route',
    trailheadStart: {
      latitude: 38,
      longitude: -110.02,
    },
    trailGeometry,
    exitGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.94, 38.1],
        [-109.9, 38.12],
      ],
    },
  },
  userLocation,
  generatedAt: '2026-05-29T12:00:00.000Z',
});

assert.ok(explicitExitRoute.exitRoute, 'Explicit exit geometry should create an optional trail_exit route.');
assert.strictEqual(explicitExitRoute.exitRoute.phase, 'trail_exit');
assert.ok(
  explicitExitRoute.segments.some((segment) => segment.phase === 'trail_exit'),
  'Exit geometry should stay in the trail_exit phase.',
);
assert.strictEqual(
  explicitExitRoute.phaseSummaries.find((phase) => phase.phase === 'trail_exit').status,
  'available',
);

console.log('Trip Builder itinerary builder checks passed.');
