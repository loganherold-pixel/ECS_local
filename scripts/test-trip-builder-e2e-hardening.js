const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'node' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

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
const {
  addUserItineraryStop,
  addUserTrailWaypoint,
  applyTripItineraryEditSession,
  createTripItineraryEditSession,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryEditSession.ts'));
const {
  tripItineraryToMapboxRenderData,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryMapboxAdapter.ts'));
const {
  getTripItinerarySummary,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItinerarySummary.ts'));
const {
  validateTrailheadStart,
} = require(path.join(root, 'lib', 'tripBuilder', 'trailheadStartValidation.ts'));
const {
  generateOfflinePrepPackFromItinerary,
} = require(path.join(root, 'lib', 'offlinePrepPack', 'offlinePrepPackService.ts'));

function itemByType(manifest, type) {
  const found = manifest.items.find((item) => item.type === type);
  assert.ok(found, `Expected Offline Prep Pack item ${type}.`);
  return found;
}

const approachGeometry = {
  type: 'LineString',
  coordinates: [
    [-110.31, 37.89],
    [-110.2, 37.94],
    [-110.1, 38.0],
  ],
};

const approachOnlyItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'qa-approach-only',
    name: 'QA Approach Only Route',
    routeGeometry: approachGeometry,
  },
  userLocation: null,
  selectedPreTrailOptions: null,
  generatedAt: '2026-05-30T12:00:00.000Z',
});

assert.strictEqual(approachOnlyItinerary.userStart, null, 'Missing GPS should not crash or create a fake userStart.');
assert.strictEqual(approachOnlyItinerary.routeGeometryStatus, 'approach_only');
assert.ok(approachOnlyItinerary.approachRoute, 'Approach guidance should remain available when routeGeometry exists.');
assert.strictEqual(approachOnlyItinerary.approachRoute.phase, 'approach');
assert.strictEqual(approachOnlyItinerary.approachRoute.metadata.geometryRole, 'approach');
assert.strictEqual(approachOnlyItinerary.trailRoute, null, 'Approach geometry must not be promoted to trailRoute.');
assert.deepStrictEqual(approachOnlyItinerary.trailWaypoints, [], 'Missing trail geometry should not produce fake trail waypoints.');
assert.deepStrictEqual(approachOnlyItinerary.preTrailStops, {
  fuel: [],
  grocery: [],
  water: [],
  generalSupply: [],
});
assert.ok(
  approachOnlyItinerary.preTrailStopStatus.every((summary) => summary.status === 'provider_unavailable'),
  'Missing POI provider should be visible as provider_unavailable, not treated as confirmed no stops.',
);
assert.ok(
  !approachOnlyItinerary.stops.some((stop) => ['fuel', 'grocery', 'water', 'supply'].includes(stop.type)),
  'Approach-only itinerary should not fabricate resupply stops.',
);
assert.ok(
  !approachOnlyItinerary.waypoints.some((waypoint) => ['camp_potential', 'scenic_stop', 'bailout', 'hazard'].includes(waypoint.type)),
  'Approach-only itinerary should not fabricate camp, scenic, bailout, or hazard waypoints.',
);
assert.ok(
  approachOnlyItinerary.confidence.missingData.includes('trail route geometry'),
  'Missing true trail geometry should be recorded in confidence missingData.',
);
assert.ok(
  approachOnlyItinerary.trailheadStartCandidate &&
  approachOnlyItinerary.trailheadStartCandidate.isConfirmedTrailhead === false,
  'Trailhead derived from approach guidance should not be overclaimed as confirmed.',
);

const summary = getTripItinerarySummary(approachOnlyItinerary);
assert.strictEqual(summary.state, 'gps_missing');
assert.strictEqual(summary.metadata.hasTrailRoute, false);
assert.strictEqual(
  summary.phases.find((phase) => phase.key === 'trail_route').status,
  'missing',
  'Trip Builder summary should show missing trail route geometry.',
);
assert.strictEqual(
  summary.phases.find((phase) => phase.key === 'fuel_supplies').status,
  'pending',
  'Trip Builder summary should show scaffolded pre-trail buckets as pending when providers are unavailable.',
);
assert.ok(
  summary.dataNotes.some((note) => /true trail geometry is unavailable/i.test(note)),
  'Summary data notes should explain that approach guidance was not promoted to trail navigation.',
);

const renderData = tripItineraryToMapboxRenderData(approachOnlyItinerary);
assert.strictEqual(renderData.metadata.approachGeometryAvailable, true);
assert.strictEqual(renderData.metadata.trailGeometryAvailable, false);
assert.ok(renderData.metadata.missingGeometryPhases.includes('trail_navigation'));
assert.ok(
  renderData.routeFeatureCollection.features.every((feature) => feature.properties.renderRole !== 'trail_line'),
  'Mapbox adapter must not render approach geometry as a trail line.',
);
assert.ok(
  renderData.routeFeatureCollection.features.some((feature) => (
    feature.properties.phase === 'approach' &&
    feature.properties.renderRole === 'road_approach'
  )),
  'Mapbox adapter should preserve approach-phase road guidance.',
);

const genericTrailhead = validateTrailheadStart({
  suggestedRoute: {
    id: 'qa-generic-destination',
    name: 'Generic Destination Route',
    destinationCoordinate: { latitude: 38.2, longitude: -110.2 },
  },
  routeGeometryStatus: 'trail_missing',
});

assert.deepStrictEqual(genericTrailhead.coordinate, { latitude: 38.2, longitude: -110.2 });
assert.strictEqual(genericTrailhead.isConfirmedTrailhead, false);
assert.strictEqual(genericTrailhead.status, 'likely');
assert.ok(genericTrailhead.confidenceScore < 55);
assert.ok(
  genericTrailhead.warnings.some((warning) => /generic destination coordinate/i.test(warning)),
  'Generic destination coordinates should carry a low-confidence trailhead warning.',
);

const editSession = createTripItineraryEditSession(approachOnlyItinerary, '2026-05-30T12:05:00.000Z');
const withUserStop = addUserItineraryStop(editSession, {
  id: 'qa-user-stop',
  title: 'Operator-added supply note',
  bucket: 'generalSupply',
  coordinate: { latitude: 37.96, longitude: -110.22 },
}, '2026-05-30T12:06:00.000Z');
const withUserWaypoint = addUserTrailWaypoint(withUserStop, {
  id: 'qa-user-waypoint',
  title: 'Operator-added waypoint note',
  waypointType: 'user_added',
  coordinate: { latitude: 38.03, longitude: -110.05 },
}, '2026-05-30T12:07:00.000Z');
const editedItinerary = applyTripItineraryEditSession(approachOnlyItinerary, withUserWaypoint);

const userStop = editedItinerary.preTrailStops.generalSupply.find((stop) => stop.id === 'qa-user-stop');
assert.ok(userStop, 'User-added stop should be included in the edited itinerary copy.');
assert.strictEqual(userStop.isUserAdded, true);
assert.strictEqual(userStop.isEcsSuggested, false);
assert.strictEqual(userStop.source.state, 'manual');
assert.strictEqual(userStop.metadata.sourceRecordMutated, false);

const userWaypoint = editedItinerary.trailWaypoints.find((waypoint) => waypoint.id === 'qa-user-waypoint');
assert.ok(userWaypoint, 'User-added waypoint should be included in the edited itinerary copy.');
assert.strictEqual(userWaypoint.isUserAdded, true);
assert.strictEqual(userWaypoint.isEcsSuggested, false);
assert.strictEqual(userWaypoint.source.state, 'manual');
assert.strictEqual(userWaypoint.metadata.sourceRecordMutated, false);
assert.ok(
  editedItinerary.trailWaypoints.every((waypoint) => waypoint.isUserAdded === true || waypoint.isEcsSuggested === true || waypoint.source.state !== 'manual'),
  'Manual user-added waypoints should remain distinguishable from ECS/provider suggestions.',
);

const offlineMapAdapter = {
  prepareRouteRegion({ bounds, routePointCount }) {
    return {
      supported: true,
      status: 'ready',
      availability: routePointCount >= 2 ? 'available' : 'unavailable',
      summary: routePointCount >= 2
        ? 'Offline map preparation can use available itinerary geometry.'
        : 'Offline map preparation needs route geometry.',
      estimatedSizeMB: routePointCount >= 2 ? 18 : null,
      cacheKey: routePointCount >= 2 ? 'qa-offline-region' : null,
      metadata: { bounds, routePointCount },
    };
  },
};

const offlinePack = generateOfflinePrepPackFromItinerary({
  itinerary: editedItinerary,
  weatherSnapshot: null,
  remotenessSnapshot: null,
  sunlightWindow: null,
  elevationSnapshot: null,
  emergencyNotes: null,
  capturedAt: '2026-05-30T12:10:00.000Z',
}, { offlineMapAdapter });
const manifest = offlinePack.manifest;

assert.strictEqual(itemByType(manifest, 'approach_route').status, 'ready');
assert.strictEqual(itemByType(manifest, 'trail_route').status, 'unavailable');
assert.strictEqual(itemByType(manifest, 'trail_route').availability, 'unavailable');
assert.strictEqual(itemByType(manifest, 'offline_map').metadata.trailGeometryIncluded, false);
assert.strictEqual(itemByType(manifest, 'pre_trail_stops').count, 1);
assert.strictEqual(itemByType(manifest, 'trail_waypoints').count, 1);
assert.strictEqual(
  itemByType(manifest, 'trail_waypoints').metadata.waypoints[0].isUserAdded,
  true,
  'Offline Prep Pack should preserve user-added waypoint labeling.',
);
assert.strictEqual(
  itemByType(manifest, 'trail_waypoints').metadata.waypoints[0].isEcsSuggested,
  false,
  'Offline Prep Pack should not present user-added waypoints as ECS-confirmed.',
);
assert.ok(
  itemByType(manifest, 'missing_data_warnings').metadata.warnings.some((warning) => /trail route geometry is unavailable/i.test(warning)),
  'Offline Prep Pack should preserve missing trail geometry warnings.',
);
assert.ok(
  itemByType(manifest, 'missing_data_warnings').metadata.warnings.some((warning) => /weather snapshot is missing/i.test(warning)),
  'Offline Prep Pack should mark missing snapshots instead of presenting them as available.',
);
assert.ok(
  manifest.errors.some((error) => error.id === 'itinerary-trail-route-missing'),
  'Offline Prep Pack should carry an explicit missing trail route error.',
);

console.log('Trip Builder e2e hardening checks passed.');
