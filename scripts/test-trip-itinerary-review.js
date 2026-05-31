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
  getTripItineraryReview,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryReview.ts'));

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

function phase(review, key) {
  return review.phases.find((item) => item.key === key);
}

const fullItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'review-full-route',
    name: 'Review Full Route',
    routeGeometry: approachGeometry,
    trailGeometry,
    trailheadStart: { latitude: 38, longitude: -110.02 },
    waypoints: [
      {
        id: 'review-camp',
        waypointType: 'camp_potential',
        title: 'Verified camp bench',
        coordinate: { latitude: 38.04, longitude: -109.99 },
        confidence: 'medium',
        source: 'supabase_fixture',
      },
      {
        id: 'review-bailout',
        waypointType: 'bailout',
        title: 'Known exit spur',
        coordinate: { latitude: 38.06, longitude: -109.97 },
        confidence: 'medium',
        source: 'supabase_fixture',
      },
    ],
    exitGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.94, 38.1],
        [-109.9, 38.12],
      ],
    },
  },
  userLocation,
  selectedPreTrailOptions: {
    fuel: [
      {
        id: 'review-fuel',
        title: 'Selected trailhead fuel',
        coordinate: { latitude: 37.94, longitude: -110.11 },
        confidence: 'medium',
        source: 'operator_selected',
      },
    ],
  },
  generatedAt: '2026-05-30T12:00:00.000Z',
});
const fullReview = getTripItineraryReview(fullItinerary);

assert.strictEqual(fullReview.title, 'Confidence-Built Itinerary Review');
assert.deepStrictEqual(
  fullReview.phases.map((item) => item.key),
  [
    'approach',
    'pre_trail_resupply',
    'trailhead_start',
    'trail_navigation',
    'trail_waypoints',
    'trail_end',
    'trail_exit',
  ],
);
assert.strictEqual(phase(fullReview, 'approach').availability, 'available');
assert.strictEqual(phase(fullReview, 'pre_trail_resupply').items.length, 1);
assert.strictEqual(phase(fullReview, 'trail_navigation').availability, 'available');
assert.strictEqual(phase(fullReview, 'trail_waypoints').items.length, 2);
assert.strictEqual(phase(fullReview, 'trail_exit').availability, 'available');
assert.strictEqual(fullReview.confidenceSummary.routeGeometryStatus, 'trail_available');
assert.strictEqual(fullReview.metadata.realWaypointCount, 2);

const missingTrailItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'review-missing-trail',
    name: 'Review Missing Trail',
    routeGeometry: approachGeometry,
  },
  userLocation,
  generatedAt: '2026-05-30T12:00:00.000Z',
});
const missingTrailReview = getTripItineraryReview(missingTrailItinerary);

assert.strictEqual(phase(missingTrailReview, 'trail_navigation').availability, 'missing');
assert.ok(
  missingTrailReview.missingDataWarnings.some((warning) => warning.includes('true trail geometry') || warning.includes('trail route geometry')),
  'Missing trail geometry should be visible in review warnings.',
);
assert.strictEqual(phase(missingTrailReview, 'trail_waypoints').availability, 'unavailable');
assert.strictEqual(phase(missingTrailReview, 'trail_waypoints').items.length, 0);

const missingPreTrailProviderItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'review-missing-provider',
    name: 'Review Missing Provider',
    routeGeometry: approachGeometry,
    trailGeometry,
    trailheadStart: { latitude: 38, longitude: -110.02 },
    waypoints: [
      {
        id: 'review-scenic',
        waypointType: 'scenic_stop',
        title: 'Mapped overlook',
        coordinate: { latitude: 38.05, longitude: -109.98 },
        confidence: 'medium',
        source: 'supabase_fixture',
      },
    ],
  },
  userLocation,
  generatedAt: '2026-05-30T12:00:00.000Z',
});
const missingProviderReview = getTripItineraryReview(missingPreTrailProviderItinerary);

assert.strictEqual(phase(missingProviderReview, 'pre_trail_resupply').availability, 'pending');
assert.strictEqual(phase(missingProviderReview, 'pre_trail_resupply').items.length, 0);
assert.ok(
  missingProviderReview.missingDataWarnings.some((warning) => warning.includes('Pre-trail') || warning.includes('pre-trail')),
  'Missing pre-trail provider data should be visible in review warnings.',
);

const noWaypointItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'review-no-waypoints',
    name: 'Review No Waypoints',
    routeGeometry: approachGeometry,
    trailGeometry,
    trailheadStart: { latitude: 38, longitude: -110.02 },
  },
  userLocation,
  selectedPreTrailOptions: {
    fuel: [
      {
        id: 'review-fuel-no-waypoints',
        title: 'Selected trailhead fuel',
        coordinate: { latitude: 37.94, longitude: -110.11 },
        confidence: 'medium',
        source: 'operator_selected',
      },
    ],
  },
  generatedAt: '2026-05-30T12:00:00.000Z',
});
const noWaypointReview = getTripItineraryReview(noWaypointItinerary);

assert.strictEqual(phase(noWaypointReview, 'trail_waypoints').availability, 'pending');
assert.strictEqual(phase(noWaypointReview, 'trail_waypoints').items.length, 0);
assert.ok(
  phase(noWaypointReview, 'trail_waypoints').warnings.some((warning) => warning.includes('No fake')),
  'No-waypoint reviews should explicitly avoid fake waypoint data.',
);

const userAddedWaypointItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'review-user-waypoint',
    name: 'Review User Waypoint',
    routeGeometry: approachGeometry,
    trailGeometry,
    trailheadStart: { latitude: 38, longitude: -110.02 },
    waypoints: [
      {
        id: 'operator-turnaround',
        type: 'user_added',
        title: 'Operator turnaround marker',
        coordinate: { latitude: 38.03, longitude: -110.0 },
        confidence: 'medium',
        source: 'operator_manual',
        isUserAdded: true,
      },
    ],
  },
  userLocation,
  generatedAt: '2026-05-30T12:00:00.000Z',
});
const userAddedReview = getTripItineraryReview(userAddedWaypointItinerary);
const userAddedItems = phase(userAddedReview, 'trail_waypoints').items;

assert.strictEqual(userAddedItems.length, 1);
assert.strictEqual(userAddedItems[0].isUserAdded, true);
assert.strictEqual(userAddedReview.metadata.userAddedWaypointCount, 1);

console.log('Trip itinerary review checks passed.');
