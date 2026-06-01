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
  scoreTrailWaypointCandidates,
} = require(path.join(root, 'lib', 'tripBuilder', 'trailWaypointScoring.ts'));
const {
  resolveTrailWaypoints,
} = require(path.join(root, 'lib', 'tripBuilder', 'trailWaypointIntelligenceResolver.ts'));

const trailRoute = {
  id: 'trail-route',
  phase: 'trail_navigation',
  title: 'Trail route',
  geometry: [
    { latitude: 38, longitude: -110.02 },
    { latitude: 38.05, longitude: -109.98 },
    { latitude: 38.1, longitude: -109.94 },
  ],
  segments: [],
  source: { label: 'fixture_trail_geometry', state: 'cached' },
  confidence: 'medium',
};

const trailheadStart = {
  id: 'trailhead',
  type: 'trailhead_start',
  phase: 'trailhead',
  title: 'Trailhead',
  coordinate: { latitude: 38, longitude: -110.02 },
  source: { label: 'trailhead_start', state: 'cached' },
  confidence: 'high',
};

const noCandidates = scoreTrailWaypointCandidates({
  candidates: [],
  trailRoute,
  trailheadStart,
});

assert.deepStrictEqual(noCandidates, []);

const userAddedWaypoint = {
  id: 'operator-note',
  type: 'user_added',
  phase: 'trail_navigation',
  title: 'Operator note',
  coordinate: { latitude: 38.05, longitude: -109.98, accuracyMeters: 12 },
  source: { label: 'trail_waypoint_intelligence', state: 'manual', source: 'operator_manual' },
  confidence: 'medium',
  isUserAdded: true,
  isEcsSuggested: false,
  metadata: {
    waypointSourceKind: 'user_added_points',
  },
};

const userAddedScores = scoreTrailWaypointCandidates({
  candidates: [userAddedWaypoint],
  trailRoute,
  trailheadStart,
  userPreferences: { safetyPriority: 'conservative' },
});

assert.strictEqual(userAddedScores.length, 1);
assert.strictEqual(userAddedScores[0].waypointType, 'user_added');
assert.strictEqual(userAddedScores[0].metadata.isUserAdded, true);
assert.strictEqual(userAddedScores[0].metadata.isEcsSuggested, false);
assert.strictEqual(userAddedScores[0].proximityToRoute.status, 'on_route');
assert.strictEqual(userAddedScores[0].metadata.coordinatePrecision, 'precise');
assert.ok(userAddedScores[0].sourceScore >= 0.7);
assert.ok(userAddedScores[0].warnings.some((warning) => warning.includes('User-added waypoint')));
assert.ok(userAddedScores[0].distanceFromTrailhead.miles > 0);

const providerHazard = {
  id: 'supabase-hazard',
  type: 'hazard',
  phase: 'trail_navigation',
  title: 'Provider hazard',
  coordinate: { latitude: 38.049, longitude: -109.981, accuracyMeters: 8 },
  source: {
    label: 'trail_waypoint_intelligence',
    state: 'cached',
    source: 'supabase_route_record',
    provider: 'ecs_supabase',
    confidence: 0.88,
  },
  confidence: 'high',
  confidenceScore: 0.86,
  isUserAdded: false,
  isEcsSuggested: true,
  metadata: {
    waypointSourceKind: 'supabase_route_records',
    providerMetadata: {
      providerId: 'ecs_supabase',
      minClearanceInches: 9,
      vehicleSuitability: 'suitable',
    },
  },
};

const providerScores = scoreTrailWaypointCandidates({
  candidates: [providerHazard],
  trailRoute,
  trailheadStart,
  vehicleProfile: {
    id: 'vehicle-1',
    label: 'Field vehicle',
    clearanceInches: 11,
    trailerAttached: false,
  },
  userPreferences: { safety: true, hazards: true },
  routeContext: {
    status: 'ready',
    confidence: { value: 0.84, tier: 'high', reasons: ['fixture'] },
  },
});

assert.strictEqual(providerScores[0].waypointType, 'hazard');
assert.strictEqual(providerScores[0].metadata.isEcsSuggested, true);
assert.strictEqual(providerScores[0].metadata.provider, 'ecs_supabase');
assert.strictEqual(providerScores[0].metadata.originalMetadata.providerMetadata.providerId, 'ecs_supabase');
assert.ok(providerScores[0].confidenceScore >= 0.75);
assert.ok(providerScores[0].usefulnessScore >= 0.75);
assert.ok(providerScores[0].safetyScore >= 0.85);
assert.ok(providerScores[0].sourceScore >= 0.75);
assert.strictEqual(providerScores[0].vehicleSuitability.status, 'suitable');

const lowConfidenceScenic = {
  id: 'approx-scenic',
  type: 'scenic_stop',
  phase: 'trail_navigation',
  title: 'Approx scenic record',
  coordinate: { latitude: 39, longitude: -111, accuracyMeters: 1200 },
  source: { label: 'trail_waypoint_intelligence', state: 'estimated', source: 'osm_feature', provider: 'openstreetmap' },
  confidence: 'low',
  confidenceScore: 0.28,
  isEcsSuggested: true,
  metadata: {
    waypointSourceKind: 'osm_features',
    approximate: true,
  },
};

const lowConfidenceScores = scoreTrailWaypointCandidates({
  candidates: [lowConfidenceScenic],
  trailRoute,
  trailheadStart,
});

assert.strictEqual(lowConfidenceScores[0].waypointType, 'scenic_stop');
assert.ok(lowConfidenceScores[0].confidenceScore < 0.5);
assert.strictEqual(lowConfidenceScores[0].metadata.coordinatePrecision, 'approximate');
assert.strictEqual(lowConfidenceScores[0].proximityToRoute.status, 'off_route');
assert.ok(
  lowConfidenceScores[0].warnings.some((warning) => warning.includes('approximate')) &&
    lowConfidenceScores[0].warnings.some((warning) => warning.includes('more than one mile')) &&
    lowConfidenceScores[0].warnings.some((warning) => warning.includes('confidence is low')),
  'Low-confidence waypoint scoring should preserve warnings instead of presenting certainty.',
);

const missingGeometryScores = scoreTrailWaypointCandidates({
  candidates: [providerHazard],
  trailRoute: null,
  trailheadStart,
});

assert.strictEqual(missingGeometryScores.length, 1);
assert.strictEqual(missingGeometryScores[0].proximityToRoute.source, 'missing_trail_geometry');
assert.strictEqual(missingGeometryScores[0].proximityToRoute.distanceMiles, null);
assert.ok(missingGeometryScores[0].confidenceScore <= 0.62);
assert.ok(
  missingGeometryScores[0].warnings.some((warning) => warning.includes('Trail route geometry is unavailable')),
  'Missing trail geometry should be explicit in scoring warnings.',
);

const resolvedWaypoints = resolveTrailWaypoints({
  trailRoute,
  trailheadStart,
  waypointRecords: [{
    id: 'resolved-hazard',
    waypointType: 'hazard',
    title: 'Resolved hazard',
    coordinate: { latitude: 38.05, longitude: -109.98, accuracyMeters: 10 },
    confidence: 0.8,
    source: 'supabase_route_record',
    providerMetadata: { providerId: 'ecs_supabase' },
  }],
  routeId: 'scored-resolver',
});

assert.strictEqual(resolvedWaypoints.metadata.scoredWaypointCount, 1);
assert.strictEqual(resolvedWaypoints.trailWaypoints.length, 1);
assert.strictEqual(
  resolvedWaypoints.trailWaypoints[0].metadata.trailWaypointScoring.waypointType,
  'hazard',
);
assert.ok(resolvedWaypoints.trailWaypoints[0].metadata.trailWaypointScoring.safetyScore > 0.8);

console.log('Trail waypoint scoring checks passed.');
