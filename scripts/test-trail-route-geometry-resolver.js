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
  resolveTrailRouteGeometry,
} = require(path.join(root, 'lib', 'tripBuilder', 'trailRouteGeometryResolver.ts'));
const {
  buildTripItineraryFromSuggestedRoute,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryBuilderService.ts'));

const approachGeometry = {
  type: 'LineString',
  coordinates: [
    [-110.3, 37.9],
    [-110.2, 37.95],
    [-110.1, 38],
  ],
};

const trailGeometry = {
  type: 'LineString',
  coordinates: [
    [-110.1, 38],
    [-110.02, 38.05],
    [-109.95, 38.1],
  ],
};

const approachOnly = resolveTrailRouteGeometry({
  suggestedRoute: {
    id: 'approach-only',
    name: 'Approach Only',
    routeGeometry: approachGeometry,
  },
});

assert.strictEqual(approachOnly.routeGeometryStatus, 'approach_only');
assert.strictEqual(approachOnly.approachRoute.length, 3);
assert.strictEqual(approachOnly.trailRoute.length, 0);
assert.strictEqual(approachOnly.hasApproachGeometryOnly, true);
assert.strictEqual(approachOnly.hasTrueTrailGeometry, false);
assert.deepStrictEqual(approachOnly.trailheadStart, { latitude: 38, longitude: -110.1 });
assert.strictEqual(approachOnly.trailEnd, null);

const approachOnlyItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'approach-only',
    name: 'Approach Only',
    routeGeometry: approachGeometry,
  },
  generatedAt: '2026-05-29T12:00:00.000Z',
});

assert.strictEqual(approachOnlyItinerary.routeGeometryStatus, 'approach_only');
assert.ok(approachOnlyItinerary.approachRoute, 'Approach route should be preserved for trailhead guidance.');
assert.strictEqual(approachOnlyItinerary.trailRoute, null);
assert.strictEqual(approachOnlyItinerary.trailEnd, null);
assert.ok(
  approachOnlyItinerary.warnings.some((warning) => warning.id === 'trail_geometry_missing'),
  'Approach-only routes should report missing true trail geometry.',
);

const trueTrail = resolveTrailRouteGeometry({
  suggestedRoute: {
    id: 'true-trail',
    name: 'True Trail',
    routeGeometry: approachGeometry,
    trailGeometry,
  },
});

assert.strictEqual(trueTrail.routeGeometryStatus, 'trail_available');
assert.strictEqual(trueTrail.approachRoute.length, 3);
assert.strictEqual(trueTrail.trailRoute.length, 3);
assert.strictEqual(trueTrail.hasTrueTrailGeometry, true);
assert.deepStrictEqual(trueTrail.trailEnd, { latitude: 38.1, longitude: -109.95 });
assert.strictEqual(trueTrail.trailGeometryCompleteEnoughForWaypointGeneration, true);

const noGeometry = resolveTrailRouteGeometry({
  suggestedRoute: {
    id: 'no-geometry',
    name: 'No Geometry',
  },
});

assert.strictEqual(noGeometry.routeGeometryStatus, 'unknown');
assert.strictEqual(noGeometry.routeGeometryMissing, true);
assert.strictEqual(noGeometry.trailRoute.length, 0);
assert.strictEqual(noGeometry.approachRoute.length, 0);

const trailheadNoEnd = resolveTrailRouteGeometry({
  suggestedRoute: {
    id: 'trailhead-no-end',
    name: 'Trailhead No End',
    trailheadStart: { latitude: 38, longitude: -110.1 },
  },
});

assert.strictEqual(trailheadNoEnd.routeGeometryStatus, 'trail_missing');
assert.deepStrictEqual(trailheadNoEnd.trailheadStart, { latitude: 38, longitude: -110.1 });
assert.strictEqual(trailheadNoEnd.trailEnd, null);

const namedTrailheadDestination = resolveTrailRouteGeometry({
  suggestedRoute: {
    id: 'named-trailhead-destination',
    name: 'Named Trailhead Destination',
    destinationCoordinate: { latitude: 38.2, longitude: -110.2 },
    routeMetadata: {
      destinationName: 'Shafer Trailhead',
    },
  },
});

assert.strictEqual(namedTrailheadDestination.routeGeometryStatus, 'trail_missing');
assert.deepStrictEqual(namedTrailheadDestination.trailheadStart, { latitude: 38.2, longitude: -110.2 });
assert.strictEqual(namedTrailheadDestination.trailheadStartCandidate.name, 'Shafer Trailhead');
assert.strictEqual(namedTrailheadDestination.trailheadStartCandidate.isConfirmedTrailhead, true);

const mapboxOnly = resolveTrailRouteGeometry({
  suggestedRoute: {
    id: 'mapbox-only',
    name: 'Mapbox Only',
  },
  mapboxRouteData: {
    routes: [
      {
        geometry: approachGeometry,
      },
    ],
  },
});

assert.strictEqual(mapboxOnly.routeGeometryStatus, 'approach_only');
assert.strictEqual(mapboxOnly.approachRoute.length, 3);
assert.strictEqual(mapboxOnly.trailRoute.length, 0);
assert.strictEqual(mapboxOnly.hasTrueTrailGeometry, false);

const importedRoute = resolveTrailRouteGeometry({
  importedRouteData: {
    id: 'imported-gpx',
    name: 'Imported GPX Route',
    routeGeometry: trailGeometry,
    routeMetadata: {
      source: 'trip_builder_import',
      sourceFileType: 'gpx',
    },
  },
});

assert.strictEqual(importedRoute.routeGeometryStatus, 'trail_available');
assert.strictEqual(importedRoute.approachRoute.length, 0);
assert.strictEqual(importedRoute.trailRoute.length, 3);
assert.deepStrictEqual(importedRoute.trailheadStart, { latitude: 38, longitude: -110.1 });
assert.deepStrictEqual(importedRoute.trailEnd, { latitude: 38.1, longitude: -109.95 });

console.log('Trail route geometry resolver checks passed.');
