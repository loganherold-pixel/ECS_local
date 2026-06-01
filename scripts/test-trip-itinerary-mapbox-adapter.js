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
assert.strictEqual(fullRender.routeFeatureCollection.features.length, 3);
assert.deepStrictEqual(
  fullRender.routeFeatureCollection.features.map((feature) => feature.properties.renderRole),
  ['road_approach', 'trail_line', 'exit_route'],
);

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
  'Legacy renderer bridge should expose trail segments without replacing existing route rendering.',
);
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

console.log('Trip itinerary Mapbox adapter checks passed.');
