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
  tripItineraryToMapboxRenderData,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryMapboxAdapter.ts'));
const {
  buildTripItineraryFromSuggestedRoute,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryBuilderService.ts'));

const approachGeometry = {
  type: 'LineString',
  coordinates: [
    [-110.21, 37.91],
    [-110.12, 37.96],
    [-110.02, 38],
  ],
};

const trailGeometry = {
  type: 'LineString',
  coordinates: [
    [-110.02, 38],
    [-109.98, 38.05],
    [-109.94, 38.1],
  ],
};

const approachOnlyItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'approach-only-render',
    name: 'Approach Only Render',
    routeGeometry: approachGeometry,
  },
  userLocation: { latitude: 37.91, longitude: -110.21 },
  generatedAt: '2026-05-30T10:00:00.000Z',
});

const approachOnlyRender = tripItineraryToMapboxRenderData(approachOnlyItinerary);
assert.strictEqual(approachOnlyRender.routeFeatureCollection.type, 'FeatureCollection');
assert.strictEqual(approachOnlyRender.routeFeatureCollection.features.length, 1);
assert.strictEqual(approachOnlyRender.routeFeatureCollection.features[0].geometry.type, 'LineString');
assert.strictEqual(approachOnlyRender.routeFeatureCollection.features[0].properties.phase, 'approach');
assert.strictEqual(approachOnlyRender.routeFeatureCollection.features[0].properties.renderRole, 'road_approach');
assert.strictEqual(approachOnlyRender.metadata.approachGeometryAvailable, true);
assert.strictEqual(approachOnlyRender.metadata.trailGeometryAvailable, false);
assert.ok(approachOnlyRender.metadata.missingGeometryPhases.includes('trail_navigation'));
assert.strictEqual(approachOnlyRender.legacyMapRenderer.points.length, 3);
assert.strictEqual(approachOnlyRender.legacyMapRenderer.segments[0].kind, 'road_approach');

const fullItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'full-render',
    name: 'Full Render',
    trailheadStart: {
      latitude: 38,
      longitude: -110.02,
      confidence: 'high',
    },
    routeGeometry: approachGeometry,
    trailGeometry,
    exitGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.94, 38.1],
        [-109.9, 38.12],
      ],
    },
    waypoints: [
      {
        id: 'hazard-1',
        waypointType: 'hazard',
        title: 'Known hazard',
        coordinate: { latitude: 38.04, longitude: -109.99 },
        confidence: 0.8,
        source: 'supabase_route_record',
      },
      {
        id: 'camp-1',
        type: 'camp_candidate',
        title: 'Camp bench',
        coordinate: { latitude: 38.055, longitude: -109.975 },
        confidence: 0.58,
        source: 'route_context_engine',
      },
      {
        id: 'bailout-1',
        type: 'bailout',
        title: 'Road access bailout',
        coordinate: { latitude: 38.08, longitude: -109.955 },
        confidence: 0.62,
        source: 'route_context_engine',
      },
    ],
  },
  userLocation: { latitude: 37.91, longitude: -110.21 },
  selectedPreTrailOptions: {
    fuel: [{
      id: 'fuel-stop',
      title: 'Selected fuel',
      coordinate: { latitude: 37.94, longitude: -110.17 },
      source: 'operator_selected',
      confidence: 'medium',
    }],
    grocery: [{
      id: 'grocery-stop',
      title: 'Selected grocery',
      coordinate: { latitude: 37.945, longitude: -110.16 },
      source: 'operator_selected',
      confidence: 'medium',
    }],
  },
  generatedAt: '2026-05-30T10:00:00.000Z',
});

const fullRender = tripItineraryToMapboxRenderData(fullItinerary);
assert.strictEqual(fullRender.metadata.approachGeometryAvailable, true);
assert.strictEqual(fullRender.metadata.trailGeometryAvailable, true);
assert.strictEqual(fullRender.metadata.exitGeometryAvailable, true);
assert.strictEqual(fullRender.routeFeatureCollection.features.length, 1);
assert.deepStrictEqual(
  fullRender.routeFeatureCollection.features.map((feature) => feature.properties.renderRole),
  ['trail_line'],
);
assert.strictEqual(fullRender.routeFeatureCollection.features[0].properties.metadata.canonicalPrimarySpine, true);
assert.strictEqual(fullRender.routeFeatureCollection.features[0].geometry.type, 'LineString');
assert.deepStrictEqual(
  fullRender.routeFeatureCollection.features[0].geometry.coordinates[0],
  approachGeometry.coordinates[0],
  'The primary spine should begin at the approach origin.',
);
assert.deepStrictEqual(
  fullRender.routeFeatureCollection.features[0].geometry.coordinates.at(-1),
  trailGeometry.coordinates.at(-1),
  'The primary spine should end at the trail end rather than appending exit or origin geometry.',
);
assert.ok(
  fullRender.routeFeatureCollection.features[0].geometry.coordinates.some(([longitude, latitude]) => (
    longitude === -110.02 && latitude === 38
  )),
  'The primary spine should pass through the selected trailhead.',
);
assert.strictEqual(fullRender.alternateRouteFeatureCollection.features.length, 1);
assert.strictEqual(
  fullRender.alternateRouteFeatureCollection.features[0].properties.renderRole,
  'exit_route',
  'Exit/egress geometry should remain semantically separate from the default primary spine.',
);
assert.strictEqual(fullRender.metadata.routeFeatureCount, 1);
assert.strictEqual(fullRender.metadata.alternateRouteFeatureCount, 1);

const pointRoles = fullRender.pointFeatureCollection.features.map((feature) => feature.properties.renderRole);
assert.ok(pointRoles.includes('pre_trail_resupply'), 'Pre-trail stops should render as phase-aware point features.');
assert.ok(pointRoles.includes('trail_start'), 'Trailhead start should render as a transition point.');
assert.ok(pointRoles.includes('hazard'), 'Hazard waypoints should keep their type for future styling.');
assert.ok(pointRoles.includes('camp_potential'), 'Camp potential waypoints should keep their type for future styling.');
assert.ok(pointRoles.includes('bailout'), 'Bailout waypoints should keep their type for future styling.');
assert.ok(pointRoles.includes('trail_end'), 'Trail end should render as a trail end point.');

const hazardFeature = fullRender.pointFeatureCollection.features.find((feature) => feature.properties.waypointId === 'hazard-1');
assert.strictEqual(hazardFeature.properties.phase, 'trail_navigation');
assert.strictEqual(hazardFeature.properties.waypointType, 'hazard');
assert.strictEqual(hazardFeature.properties.renderRole, 'hazard');
assert.strictEqual(hazardFeature.geometry.coordinates[0], -109.99);
assert.strictEqual(hazardFeature.geometry.coordinates[1], 38.04);

assert.ok(
  fullRender.legacyMapRenderer.trailSegments.some((segment) => segment.kind === 'trail_line'),
  'Legacy renderer bridge should expose the one canonical primary spine.',
);
assert.strictEqual(fullRender.legacyMapRenderer.segments.length, 1);
assert.strictEqual(fullRender.legacyMapRenderer.alternateSegments.length, 1);
assert.ok(
  fullRender.legacyMapRenderer.bailoutMarkers.some((marker) => marker.type === 'bailout'),
  'Legacy renderer bridge should expose bailout markers separately.',
);
assert.ok(
  fullRender.legacyMapRenderer.pinMarkers.some((marker) => marker.type === 'hazard'),
  'Legacy renderer bridge should preserve typed pin markers.',
);

const missingGeometryItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'missing-geometry-render',
    name: 'Missing Geometry Render',
    trailheadStart: {
      latitude: 38,
      longitude: -110.02,
    },
    waypoints: [{
      id: 'ignored-without-trail',
      waypointType: 'hazard',
      title: 'Ignored without trail geometry',
      coordinate: { latitude: 38.04, longitude: -109.99 },
      source: 'supabase_route_record',
    }],
  },
  userLocation: null,
  generatedAt: '2026-05-30T10:00:00.000Z',
});

const missingGeometryRender = tripItineraryToMapboxRenderData(missingGeometryItinerary);
assert.strictEqual(missingGeometryRender.routeFeatureCollection.features.length, 0);
assert.strictEqual(missingGeometryRender.legacyMapRenderer.points.length, 0);
assert.ok(missingGeometryRender.metadata.missingGeometryPhases.includes('approach'));
assert.ok(missingGeometryRender.metadata.missingGeometryPhases.includes('trail_navigation'));
assert.ok(
  missingGeometryRender.pointFeatureCollection.features.some((feature) => feature.properties.renderRole === 'trail_start'),
  'Missing route geometry should not prevent known trailhead point rendering.',
);
assert.ok(
  !missingGeometryRender.pointFeatureCollection.features.some((feature) => feature.properties.renderRole === 'hazard'),
  'Waypoint intelligence should not fabricate trail waypoint rendering when true trail geometry is missing.',
);

const reversedApproachWithoutOrigin = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'reversed-approach-no-origin',
    name: 'Reversed Approach No Origin',
    trailheadStart: { latitude: 38, longitude: -110.02 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [...approachGeometry.coordinates].reverse(),
    },
    trailGeometry,
  },
  userLocation: null,
  generatedAt: '2026-05-30T10:00:00.000Z',
});
const reversedApproachRender = tripItineraryToMapboxRenderData(reversedApproachWithoutOrigin);
assert.strictEqual(reversedApproachRender.routeFeatureCollection.features.length, 1);
assert.deepStrictEqual(
  reversedApproachRender.routeFeatureCollection.features[0].geometry.coordinates[0],
  approachGeometry.coordinates[0],
  'Without a user origin, the central spine builder should orient the approach from its non-trailhead endpoint.',
);
assert.deepStrictEqual(
  reversedApproachRender.routeFeatureCollection.features[0].geometry.coordinates.at(-1),
  trailGeometry.coordinates.at(-1),
  'A reversed approach without user GPS must retain the canonical trail through its end.',
);

const disconnectedApproachItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'disconnected-approach',
    name: 'Disconnected Approach',
    trailheadStart: { latitude: 38, longitude: -110.02 },
    routeGeometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [-110.21, 37.91],
          [-110.18, 37.93],
        ],
        [
          [-108.2, 36.5],
          [-110.02, 38],
        ],
      ],
    },
    trailGeometry,
  },
  userLocation: { latitude: 37.91, longitude: -110.21 },
  generatedAt: '2026-05-30T10:00:00.000Z',
});
assert.strictEqual(
  disconnectedApproachItinerary.approachRoute,
  null,
  'Disconnected approach source segments must be rejected before itinerary persistence.',
);
const disconnectedApproachRender = tripItineraryToMapboxRenderData(disconnectedApproachItinerary);
assert.strictEqual(disconnectedApproachRender.routeFeatureCollection.features.length, 1);
assert.strictEqual(disconnectedApproachRender.metadata.approachGeometryAvailable, false);
assert.deepStrictEqual(
  disconnectedApproachRender.routeFeatureCollection.features[0].geometry.coordinates,
  trailGeometry.coordinates,
  'A disconnected approach should degrade to the canonical trail without an artificial approach connector.',
);

const loopGeometry = {
  type: 'LineString',
  coordinates: [
    [-110.02, 38],
    [-109.98, 38.05],
    [-109.94, 38.02],
    [-110.02, 38],
  ],
};
const explicitLoopItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'explicit-loop-render',
    name: 'Explicit Loop Render',
    routeType: 'loop',
    trailheadStart: { latitude: 38, longitude: -110.02 },
    trailGeometry: loopGeometry,
  },
  userLocation: null,
  generatedAt: '2026-05-30T10:00:00.000Z',
});
assert.strictEqual(explicitLoopItinerary.trailRoute.metadata.routeType, 'loop');
assert.strictEqual(explicitLoopItinerary.trailRoute.metadata.allowLoopGuidance, true);
const explicitLoopRender = tripItineraryToMapboxRenderData(explicitLoopItinerary);
assert.strictEqual(explicitLoopRender.routeFeatureCollection.features.length, 1);
assert.deepStrictEqual(
  explicitLoopRender.routeFeatureCollection.features[0].geometry.coordinates,
  loopGeometry.coordinates,
  'An explicitly declared loop should retain its source closure exactly once.',
);

const elevatedItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'elevated-itinerary',
    name: 'Elevated Itinerary',
    routeType: 'point_to_point',
    trailheadStart: { latitude: 38, longitude: -110.02 },
    trailGeometry: [
      { latitude: 38, longitude: -110.02, elevationMeters: 1000 },
      { latitude: 38.05, longitude: -109.98, elevationMeters: 1200 },
      { latitude: 38.1, longitude: -109.94, elevationMeters: 1100 },
    ],
    routeMetadata: { isTrailGeometry: true, sourceFileType: 'gpx' },
  },
  userLocation: null,
  generatedAt: '2026-05-30T10:00:00.000Z',
});
assert.deepStrictEqual(
  elevatedItinerary.trailRoute.geometry.map((point) => point.elevationMeters),
  [1000, 1200, 1100],
  'Itinerary construction must retain canonical elevation samples for Terrain Risk consumers.',
);

const disjointTrailItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'disjoint-trail-render',
    name: 'Disjoint Trail Render',
    trailheadStart: { latitude: 38, longitude: -110.02 },
    routeGeometry: approachGeometry,
    trailGeometry: {
      type: 'LineString',
      coordinates: [
        [-108.2, 36.5],
        [-108.1, 36.6],
      ],
    },
  },
  userLocation: { latitude: 37.91, longitude: -110.21 },
  generatedAt: '2026-05-30T10:00:00.000Z',
});
const disjointTrailRender = tripItineraryToMapboxRenderData(disjointTrailItinerary);
assert.strictEqual(
  disjointTrailRender.routeFeatureCollection.features.length,
  0,
  'A rejected trail join must not silently fall back to an approach-only primary line.',
);

const disjointMultipartItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'disjoint-multipart-render',
    name: 'Disjoint Multipart Render',
    trailheadStart: { latitude: 38, longitude: -110.02 },
    trailGeometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [-110.02, 38],
          [-110, 38.02],
        ],
        [
          [-108.2, 36.5],
          [-108.1, 36.6],
        ],
      ],
    },
  },
  userLocation: null,
  generatedAt: '2026-05-30T10:00:00.000Z',
});
assert.strictEqual(disjointMultipartItinerary.trailRoute, null);
assert.strictEqual(disjointMultipartItinerary.routeGeometryStatus, 'partial_trail');
const disjointMultipartRender = tripItineraryToMapboxRenderData(disjointMultipartItinerary);
assert.strictEqual(
  disjointMultipartRender.routeFeatureCollection.features.length,
  0,
  'Disconnected multipart trail segments must not become a primary itinerary connector.',
);

console.log('Trip itinerary Mapbox adapter checks passed.');
