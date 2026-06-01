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
  resolveTrailWaypoints,
} = require(path.join(root, 'lib', 'tripBuilder', 'trailWaypointIntelligenceResolver.ts'));
const {
  buildTripItineraryFromSuggestedRoute,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryBuilderService.ts'));

const trailRoute = {
  id: 'white-rim-trail-navigation',
  phase: 'trail_navigation',
  title: 'White Rim trail route',
  geometry: [
    { latitude: 38, longitude: -110.02 },
    { latitude: 38.05, longitude: -109.98 },
    { latitude: 38.1, longitude: -109.94 },
  ],
  segments: [{
    id: 'white-rim-trail-segment-1',
    phase: 'trail_navigation',
    sequence: 1,
    geometry: [
      { latitude: 38, longitude: -110.02 },
      { latitude: 38.05, longitude: -109.98 },
      { latitude: 38.1, longitude: -109.94 },
    ],
  }],
  source: { label: 'fixture_trail_geometry', state: 'cached' },
  confidence: 'medium',
  distanceMiles: 8.2,
  unavailableReason: null,
};

const noTrailGeometry = resolveTrailWaypoints({
  trailRoute: null,
  waypointRecords: [{
    id: 'known-hazard-without-trail-geometry',
    waypointType: 'hazard',
    title: 'Known washout',
    coordinate: { latitude: 38.03, longitude: -110 },
    confidence: 0.8,
    source: 'supabase_route_record',
  }],
  routeId: 'missing-trail-geometry',
});

assert.deepStrictEqual(noTrailGeometry.trailWaypoints, []);
assert.strictEqual(noTrailGeometry.metadata.missingTrailGeometry, true);
assert.strictEqual(noTrailGeometry.metadata.sourceRecordCount, 1);
assert.ok(
  noTrailGeometry.warnings.some((warning) => warning.includes('Trail route geometry is unavailable')),
  'Missing true trail geometry should be visible to callers.',
);
assert.strictEqual(noTrailGeometry.dataUsed[0].state, 'missing');

const noWaypointData = resolveTrailWaypoints({
  trailRoute,
  routeId: 'trail-with-no-waypoints',
});

assert.deepStrictEqual(noWaypointData.trailWaypoints, []);
assert.strictEqual(noWaypointData.metadata.missingTrailGeometry, false);
assert.strictEqual(noWaypointData.metadata.sourceRecordCount, 0);
assert.strictEqual(noWaypointData.metadata.normalizedWaypointCount, 0);
assert.strictEqual(noWaypointData.dataUsed[0].state, 'missing');
assert.ok(
  noWaypointData.dataUsed[0].notes.some((note) => note.includes('No real trail waypoint source records')),
  'An empty waypoint set should mean no source records, not generated placeholders.',
);

const normalizedRecords = resolveTrailWaypoints({
  trailRoute,
  routeId: 'white-rim',
  waypointRecords: [
    {
      id: 'hazard-rockfall',
      waypointType: 'hazard',
      title: 'Known rockfall shelf',
      description: 'Operator-reviewed rockfall record attached to the route.',
      coordinate: { latitude: 38.04, longitude: -109.99 },
      confidence: 0.82,
      source: 'supabase_route_record',
      providerMetadata: { providerId: 'ecs_supabase' },
    },
    {
      id: 'camp-bench',
      type: 'camp_candidate',
      name: 'Bench camp candidate',
      location: { latitude: 38.055, longitude: -109.975 },
      confidence: { value: 0.56, reasons: ['existing route-context camp candidate'] },
      source: 'route_context_engine',
    },
    {
      id: 'scenic-rim',
      category: 'overlook',
      name: 'Rim overlook',
      point: [-109.965, 38.065],
      score: 0.7,
      source: 'mapbox_trail_feature',
    },
    {
      id: 'turnaround-flat',
      type: 'turnaround',
      title: 'Turnaround flat',
      lat: 38.075,
      lng: -109.955,
      reliability: 'medium',
      source: 'offline_prep_pack',
    },
    {
      id: 'operator-note',
      type: 'user_added',
      title: 'Operator note',
      coordinate: { latitude: 38.085, longitude: -109.945 },
      source: 'operator_manual',
      isUserAdded: true,
    },
    {
      id: 'no-coordinate',
      waypointType: 'hazard',
      title: 'Dropped invalid waypoint',
      source: 'supabase_route_record',
    },
  ],
});

assert.strictEqual(normalizedRecords.trailWaypoints.length, 5);
assert.strictEqual(normalizedRecords.metadata.sourceRecordCount, 6);
assert.strictEqual(normalizedRecords.metadata.normalizedWaypointCount, 5);

const hazard = normalizedRecords.trailWaypoints.find((waypoint) => waypoint.id === 'hazard-rockfall');
assert.strictEqual(hazard.type, 'hazard');
assert.strictEqual(hazard.phase, 'trail_navigation');
assert.strictEqual(hazard.description, 'Operator-reviewed rockfall record attached to the route.');
assert.strictEqual(hazard.confidence, 'high');
assert.strictEqual(hazard.confidenceScore, 0.82);
assert.strictEqual(hazard.isUserAdded, false);
assert.strictEqual(hazard.metadata.providerMetadata.providerId, 'ecs_supabase');

const camp = normalizedRecords.trailWaypoints.find((waypoint) => waypoint.id === 'camp-bench');
assert.strictEqual(camp.type, 'camp_potential');
assert.strictEqual(camp.phase, 'trail_navigation');
assert.strictEqual(camp.confidenceScore, 0.56);

const scenic = normalizedRecords.trailWaypoints.find((waypoint) => waypoint.id === 'scenic-rim');
assert.strictEqual(scenic.type, 'scenic_stop');
assert.strictEqual(scenic.coordinate.latitude, 38.065);
assert.strictEqual(scenic.coordinate.longitude, -109.965);

const operatorNote = normalizedRecords.trailWaypoints.find((waypoint) => waypoint.id === 'operator-note');
assert.strictEqual(operatorNote.type, 'user_added');
assert.strictEqual(operatorNote.isUserAdded, true);
assert.strictEqual(operatorNote.isEcsSuggested, false);
assert.strictEqual(operatorNote.source.state, 'manual');

assert.ok(
  normalizedRecords.trailWaypoints.every((waypoint) => waypoint.metadata.providerHooks.includes('offline_prep_pack')),
  'Normalized waypoints should carry provider hook labels for future source-specific resolvers.',
);
assert.ok(
  !normalizedRecords.trailWaypoints.some((waypoint) => waypoint.id === 'no-coordinate'),
  'Waypoint-like records without coordinates should be dropped instead of guessed.',
);

const routeContextWaypoints = resolveTrailWaypoints({
  trailRoute,
  routeId: 'route-context-route',
  routeContext: {
    campCandidates: [{
      id: 'route-context-camp-1',
      name: 'Known route-context camp',
      lat: 38.045,
      lng: -109.985,
      source: 'route_context_engine',
      score: 0.61,
      confidence: { value: 0.61, reasons: ['camp candidate provider result'] },
      warnings: [{ code: 'verify_legality', message: 'Verify legal access before use.' }],
    }],
    bailoutCandidates: [{
      id: 'route-context-bailout-1',
      label: 'Road access bailout',
      lat: 38.088,
      lng: -109.952,
      source: 'route_context_engine',
      category: 'road_access',
      score: 0.74,
      confidence: { value: 0.74, reasons: ['bailout provider result'] },
    }],
  },
});

assert.strictEqual(routeContextWaypoints.trailWaypoints.length, 2);
assert.strictEqual(routeContextWaypoints.trailWaypoints[0].type, 'camp_potential');
assert.strictEqual(routeContextWaypoints.trailWaypoints[0].isEcsSuggested, true);
assert.strictEqual(routeContextWaypoints.trailWaypoints[0].metadata.waypointSourceKind, 'route_context_camp_candidate');
assert.strictEqual(routeContextWaypoints.trailWaypoints[1].type, 'bailout');
assert.strictEqual(routeContextWaypoints.trailWaypoints[1].isEcsSuggested, true);
assert.strictEqual(routeContextWaypoints.trailWaypoints[1].metadata.waypointSourceKind, 'route_context_bailout_candidate');

const builtWithRealWaypoints = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'builder-waypoint-route',
    name: 'Builder waypoint route',
    trailheadStart: { latitude: 38, longitude: -110.02, confidence: 'high' },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110.2, 37.9],
        [-110.02, 38],
      ],
    },
    trailGeometry: {
      type: 'LineString',
      coordinates: [
        [-110.02, 38],
        [-109.98, 38.05],
        [-109.94, 38.1],
      ],
    },
    waypoints: [{
      id: 'builder-hazard',
      waypointType: 'hazard',
      title: 'Builder hazard record',
      coordinate: { latitude: 38.05, longitude: -109.98 },
      confidence: 'medium',
      source: 'supabase_route_record',
    }],
  },
  userLocation: { latitude: 37.9, longitude: -110.2 },
  generatedAt: '2026-05-29T12:00:00.000Z',
});

assert.strictEqual(builtWithRealWaypoints.trailWaypoints.length, 1);
assert.strictEqual(builtWithRealWaypoints.trailWaypoints[0].id, 'builder-hazard');
assert.strictEqual(builtWithRealWaypoints.trailWaypoints[0].phase, 'trail_navigation');
assert.strictEqual(builtWithRealWaypoints.metadata.trailWaypointIntelligence.normalizedWaypointCount, 1);
assert.ok(
  !builtWithRealWaypoints.trailWaypoints.some((waypoint) => waypoint.type === 'camp_potential' || waypoint.type === 'bailout'),
  'Builder integration should not add unverified trail-intelligence categories.',
);

const builtWithoutTrailGeometry = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'builder-no-trail-geometry',
    name: 'Builder no trail geometry',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110.2, 37.9],
        [-110.02, 38],
      ],
    },
    waypoints: [{
      id: 'ignored-without-trail-geometry',
      waypointType: 'hazard',
      title: 'Ignored without trail geometry',
      coordinate: { latitude: 38.05, longitude: -109.98 },
      source: 'supabase_route_record',
    }],
  },
  userLocation: { latitude: 37.9, longitude: -110.2 },
  generatedAt: '2026-05-29T12:00:00.000Z',
});

assert.deepStrictEqual(builtWithoutTrailGeometry.trailWaypoints, []);
assert.strictEqual(builtWithoutTrailGeometry.metadata.trailWaypointIntelligence.missingTrailGeometry, true);

console.log('Trail waypoint intelligence resolver checks passed.');
