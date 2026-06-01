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
  getTripItinerarySummary,
  TRIP_ITINERARY_SUMMARY_MESSAGES,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItinerarySummary.ts'));

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

const routeWithTrailIntelligence = {
  id: 'summary-full-route',
  name: 'Summary Full Route',
  routeGeometry: approachGeometry,
  trailGeometry,
  trailheadStart: {
    latitude: 38,
    longitude: -110.02,
    name: 'Summary Trailhead',
  },
  waypoints: [
    {
      id: 'summary-camp',
      waypointType: 'camp_potential',
      title: 'Verified camp bench',
      coordinate: { latitude: 38.04, longitude: -109.99 },
      confidence: 'medium',
      source: 'supabase_fixture',
    },
    {
      id: 'summary-bailout',
      waypointType: 'bailout',
      title: 'Known exit spur',
      coordinate: { latitude: 38.06, longitude: -109.97 },
      confidence: 'medium',
      source: 'supabase_fixture',
    },
  ],
};

const fullItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: routeWithTrailIntelligence,
  userLocation,
  selectedPreTrailOptions: {
    fuel: [
      {
        id: 'summary-fuel',
        title: 'Selected trailhead fuel',
        coordinate: { latitude: 37.94, longitude: -110.11 },
        confidence: 'medium',
        source: 'operator_selected',
      },
    ],
  },
  generatedAt: '2026-05-30T12:00:00.000Z',
});
const fullSummary = getTripItinerarySummary(fullItinerary);

assert.strictEqual(fullSummary.state, 'full_itinerary_available');
assert.strictEqual(fullSummary.message, TRIP_ITINERARY_SUMMARY_MESSAGES.full_itinerary_available);
assert.strictEqual(fullSummary.metadata.hasUserStart, true);
assert.strictEqual(fullSummary.metadata.hasPreTrailStops, true);
assert.strictEqual(fullSummary.metadata.hasTrailRoute, true);
assert.strictEqual(fullSummary.metadata.hasTrailWaypoints, true);
assert.strictEqual(fullSummary.metadata.hasTrailEnd, true);
assert.strictEqual(fullSummary.phases.find((phase) => phase.key === 'start').status, 'available');
assert.strictEqual(fullSummary.phases.find((phase) => phase.key === 'fuel_supplies').status, 'available');
assert.strictEqual(fullSummary.phases.find((phase) => phase.key === 'trail_route').status, 'available');
assert.strictEqual(fullSummary.phases.find((phase) => phase.key === 'waypoints').status, 'available');

const missingTrailGeometryItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'summary-missing-trail',
    name: 'Summary Missing Trail',
    routeGeometry: approachGeometry,
  },
  userLocation,
  generatedAt: '2026-05-30T12:00:00.000Z',
});
const missingTrailSummary = getTripItinerarySummary(missingTrailGeometryItinerary);

assert.strictEqual(missingTrailSummary.state, 'trail_geometry_missing');
assert.strictEqual(missingTrailSummary.message, TRIP_ITINERARY_SUMMARY_MESSAGES.trail_geometry_missing);
assert.strictEqual(missingTrailSummary.metadata.hasTrailRoute, false);
assert.strictEqual(missingTrailSummary.phases.find((phase) => phase.key === 'trail_route').status, 'missing');
assert.strictEqual(missingTrailSummary.phases.find((phase) => phase.key === 'waypoints').status, 'unavailable');
assert.ok(
  missingTrailSummary.dataNotes.some((note) => note.includes('approach guidance was not promoted')),
  'Approach-only routes should explain that approach geometry is not trail navigation.',
);

const missingPoiItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: routeWithTrailIntelligence,
  userLocation,
  generatedAt: '2026-05-30T12:00:00.000Z',
});
const missingPoiSummary = getTripItinerarySummary(missingPoiItinerary);

assert.strictEqual(missingPoiSummary.state, 'pre_trail_poi_missing');
assert.strictEqual(missingPoiSummary.message, TRIP_ITINERARY_SUMMARY_MESSAGES.pre_trail_poi_missing);
assert.strictEqual(missingPoiSummary.metadata.hasPreTrailPoiUnavailable, true);
assert.strictEqual(missingPoiSummary.metadata.hasPreTrailStops, false);
assert.strictEqual(missingPoiSummary.phases.find((phase) => phase.key === 'fuel_supplies').status, 'pending');

const gpsMissingItinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: routeWithTrailIntelligence,
  userLocation: null,
  selectedPreTrailOptions: {
    fuel: [
      {
        id: 'summary-fuel-gps-missing',
        title: 'Selected trailhead fuel',
        coordinate: { latitude: 37.94, longitude: -110.11 },
        confidence: 'medium',
        source: 'operator_selected',
      },
    ],
  },
  generatedAt: '2026-05-30T12:00:00.000Z',
});
const gpsMissingSummary = getTripItinerarySummary(gpsMissingItinerary);

assert.strictEqual(gpsMissingSummary.state, 'gps_missing');
assert.strictEqual(gpsMissingSummary.message, TRIP_ITINERARY_SUMMARY_MESSAGES.gps_missing);
assert.strictEqual(gpsMissingSummary.metadata.hasUserStart, false);
assert.strictEqual(gpsMissingSummary.phases.find((phase) => phase.key === 'start').status, 'missing');

const pendingSummary = getTripItinerarySummary(null);
assert.strictEqual(pendingSummary.state, 'itinerary_pending');
assert.strictEqual(pendingSummary.message, TRIP_ITINERARY_SUMMARY_MESSAGES.itinerary_pending);

console.log('Trip itinerary summary checks passed.');
