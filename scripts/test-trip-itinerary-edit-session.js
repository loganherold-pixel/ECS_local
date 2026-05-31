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
const {
  acceptTripItineraryEditItem,
  addUserItineraryStop,
  addUserTrailWaypoint,
  applyTripItineraryEditSession,
  createTripItineraryEditSession,
  dismissTripItineraryEditItem,
  reorderTripItineraryStop,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryEditSession.ts'));

const userLocation = { latitude: 37.91, longitude: -110.21 };
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

const itinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'edit-session-route',
    name: 'Edit Session Route',
    routeGeometry: approachGeometry,
    trailGeometry,
    trailheadStart: { latitude: 38, longitude: -110.02 },
    waypoints: [
      {
        id: 'ecs-bailout',
        waypointType: 'bailout',
        title: 'ECS bailout option',
        coordinate: { latitude: 38.06, longitude: -109.97 },
        confidence: 'medium',
        source: 'route_context_engine',
        isEcsSuggested: true,
      },
      {
        id: 'provider-scenic',
        waypointType: 'scenic_stop',
        title: 'Provider scenic stop',
        coordinate: { latitude: 38.04, longitude: -109.99 },
        confidence: 'medium',
        source: 'supabase_fixture',
      },
    ],
  },
  userLocation,
  selectedPreTrailOptions: {
    fuel: [
      {
        id: 'fuel-a',
        title: 'Fuel A',
        coordinate: { latitude: 37.94, longitude: -110.11 },
        confidence: 'medium',
        source: 'operator_selected',
      },
      {
        id: 'fuel-b',
        title: 'Fuel B',
        coordinate: { latitude: 37.95, longitude: -110.1 },
        confidence: 'medium',
        source: 'operator_selected',
      },
    ],
  },
  generatedAt: '2026-05-30T12:00:00.000Z',
});

const session = createTripItineraryEditSession(itinerary, '2026-05-30T12:05:00.000Z');

assert.ok(session.items.some((item) => item.sourceItemId === 'ecs-bailout' && item.isEcsSuggested));
assert.ok(
  !session.items.some((item) => item.waypointType === 'trailhead_start' || item.waypointType === 'trail_end'),
  'Trailhead and trail end should not be accidentally editable.',
);

const dismissedSession = dismissTripItineraryEditItem(session, 'ecs-bailout', '2026-05-30T12:06:00.000Z');
const dismissedApplied = applyTripItineraryEditSession(itinerary, dismissedSession);

assert.strictEqual(
  dismissedApplied.trailWaypoints.some((waypoint) => waypoint.id === 'ecs-bailout'),
  false,
  'Dismissed ECS waypoint should be excluded from the edited itinerary copy.',
);
assert.strictEqual(
  itinerary.trailWaypoints.some((waypoint) => waypoint.id === 'ecs-bailout'),
  true,
  'Dismissing a suggestion must not mutate the source itinerary/provider copy.',
);
assert.strictEqual(dismissedApplied.metadata.itineraryUserEdits.dismissedSuggestions.length, 1);
assert.strictEqual(dismissedApplied.metadata.itineraryUserEdits.sourceRecordsMutated, false);

const acceptedAgain = acceptTripItineraryEditItem(dismissedSession, 'ecs-bailout', '2026-05-30T12:07:00.000Z');
const acceptedApplied = applyTripItineraryEditSession(itinerary, acceptedAgain);

assert.strictEqual(
  acceptedApplied.trailWaypoints.some((waypoint) => waypoint.id === 'ecs-bailout'),
  true,
  'Accepted suggestion should remain in the edited itinerary copy.',
);

const withUserWaypoint = addUserTrailWaypoint(session, {
  id: 'user-waypoint',
  title: 'User ridge note',
  coordinate: { latitude: 38.07, longitude: -109.96 },
}, '2026-05-30T12:08:00.000Z');
const userWaypointApplied = applyTripItineraryEditSession(itinerary, withUserWaypoint);
const userWaypoint = userWaypointApplied.trailWaypoints.find((waypoint) => waypoint.id === 'user-waypoint');

assert.ok(userWaypoint, 'User-added waypoint should be added to trailWaypoints.');
assert.strictEqual(userWaypoint.isUserAdded, true);
assert.strictEqual(userWaypoint.isEcsSuggested, false);
assert.strictEqual(userWaypoint.phase, 'trail_navigation');
assert.strictEqual(userWaypoint.source.state, 'manual');

const withUserStop = addUserItineraryStop(session, {
  id: 'user-stop',
  title: 'User supply stop',
}, '2026-05-30T12:09:00.000Z');
const userStopApplied = applyTripItineraryEditSession(itinerary, withUserStop);
const userStop = userStopApplied.preTrailStops.generalSupply.find((stop) => stop.id === 'user-stop');

assert.ok(userStop, 'User-added stop should be added to pre-trail stop buckets.');
assert.strictEqual(userStop.isUserAdded, true);
assert.strictEqual(userStop.isEcsSuggested, false);
assert.strictEqual(userStop.coordinate, null);
assert.strictEqual(userStop.source.state, 'manual');

const reordered = reorderTripItineraryStop(session, 'fuel-b', -1, '2026-05-30T12:10:00.000Z');
const reorderedApplied = applyTripItineraryEditSession(itinerary, reordered);
const reorderedFuelIds = reorderedApplied.preTrailStops.fuel.map((stop) => stop.id);

assert.deepStrictEqual(reorderedFuelIds, ['fuel-b', 'fuel-a']);
assert.ok(
  reorderedApplied.stops.every((stop) => stop.phase === 'pre_trail_resupply' || stop.phase === 'trailhead' || stop.phase === 'trail_navigation'),
  'Reordering stops should not corrupt phase assignments.',
);

console.log('Trip itinerary edit session checks passed.');
