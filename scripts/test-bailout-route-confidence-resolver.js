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
  resolveBailoutRouteConfidence,
} = require(path.join(root, 'lib', 'tripBuilder', 'bailoutRouteConfidenceResolver.ts'));
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

const bailoutWaypoint = {
  id: 'bailout-1',
  type: 'bailout',
  phase: 'trail_navigation',
  title: 'Bailout fork',
  coordinate: { latitude: 38.052, longitude: -109.978 },
  source: { label: 'trail_waypoint_intelligence', state: 'cached', source: 'supabase_route_record' },
  confidence: 'medium',
  isEcsSuggested: true,
};

const confirmedAccess = resolveBailoutRouteConfidence({
  bailoutWaypoint,
  trailRoute,
  knownRoads: [{
    id: 'verified-access-road',
    label: 'Verified access connector',
    category: 'access_route',
    accessRouteGeometry: [
      { latitude: 38.052, longitude: -109.978 },
      { latitude: 38.06, longitude: -109.95 },
    ],
    source: 'county_road_record',
    provider: 'county_gis',
    confidence: 0.9,
    isConfirmedAccess: true,
    reachableByVehicle: true,
    distanceToFuelMiles: 14,
    distanceToTownMiles: 18,
  }],
});

assert.strictEqual(confirmedAccess.appliesToWaypoint, true);
assert.strictEqual(confirmedAccess.status, 'confirmed');
assert.ok(confirmedAccess.bailoutConfidenceScore >= 0.78);
assert.strictEqual(confirmedAccess.nearestRoadOrAccessDistanceMiles, 0);
assert.strictEqual(confirmedAccess.nearestFuelDistanceMiles, 14);
assert.strictEqual(confirmedAccess.nearestTownDistanceMiles, 18);
assert.strictEqual(confirmedAccess.metadata.confirmedEvidenceCount, 1);
assert.ok(
  confirmedAccess.warnings.some((warning) => warning.includes('field conditions')),
  'Confirmed bailout access should still be conservatively worded.',
);

const weakNearbyRoad = resolveBailoutRouteConfidence({
  bailoutWaypoint,
  trailRoute,
  knownRoads: [{
    id: 'nearby-road-only',
    label: 'Nearby mapped road',
    category: 'road',
    coordinate: { latitude: 38.053, longitude: -109.977 },
    source: 'osm_feature',
    provider: 'openstreetmap',
    confidence: 0.58,
  }],
});

assert.strictEqual(weakNearbyRoad.status, 'weak');
assert.ok(weakNearbyRoad.bailoutConfidenceScore < 0.5);
assert.ok(weakNearbyRoad.nearestRoadOrAccessDistanceMiles < 0.2);
assert.ok(
  weakNearbyRoad.warnings.some((warning) => warning.includes('weak or unconfirmed')) &&
    weakNearbyRoad.accessEvidence[0].warnings.some((warning) => warning.includes('does not confirm')),
  'A nearby road by itself must not be promoted to confirmed access.',
);

const unknownAccess = resolveBailoutRouteConfidence({
  bailoutWaypoint,
  trailRoute,
});

assert.strictEqual(unknownAccess.status, 'unknown');
assert.strictEqual(unknownAccess.bailoutConfidenceScore, 0);
assert.deepStrictEqual(unknownAccess.accessEvidence, []);
assert.ok(unknownAccess.warnings[0].includes('No road, access route, service, town, fuel'));

const noWaypoint = resolveBailoutRouteConfidence({
  bailoutWaypoint: null,
  trailRoute,
  knownRoads: [{
    id: 'unused-road',
    coordinate: { latitude: 38.05, longitude: -109.98 },
  }],
});

assert.strictEqual(noWaypoint.appliesToWaypoint, false);
assert.strictEqual(noWaypoint.status, 'unknown');
assert.ok(noWaypoint.warnings[0].includes('No bailout waypoint'));

const nonBailoutWaypoint = resolveBailoutRouteConfidence({
  bailoutWaypoint: {
    ...bailoutWaypoint,
    id: 'scenic-1',
    type: 'scenic_stop',
  },
  trailRoute,
});

assert.strictEqual(nonBailoutWaypoint.appliesToWaypoint, false);
assert.strictEqual(nonBailoutWaypoint.status, 'unknown');
assert.ok(nonBailoutWaypoint.warnings[0].includes('only applies to bailout or turnaround'));

const missingTrailGeometry = resolveBailoutRouteConfidence({
  bailoutWaypoint,
  trailRoute: null,
  mapboxData: {
    routes: [{
      id: 'mapbox-access-route',
      label: 'Mapbox access trace',
      category: 'access_route',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-109.978, 38.052],
          [-109.95, 38.06],
        ],
      },
      source: 'mapbox_directions',
      provider: 'mapbox',
      reachableByVehicle: true,
      confidence: 0.72,
    }],
  },
});

assert.strictEqual(missingTrailGeometry.status, 'likely');
assert.strictEqual(missingTrailGeometry.metadata.missingTrailGeometry, true);
assert.ok(
  missingTrailGeometry.warnings.some((warning) => warning.includes('Trail route geometry is unavailable')),
  'Missing trail geometry should be explicit without blocking access evidence scoring.',
);

const routeContextLikely = resolveBailoutRouteConfidence({
  bailoutWaypoint,
  trailRoute,
  routeContext: {
    status: 'ready',
    confidence: { value: 0.8, tier: 'high', reasons: ['fixture'] },
    bailoutCandidates: [{
      id: 'route-context-bailout',
      label: 'Road access bailout',
      lat: 38.052,
      lng: -109.978,
      source: 'route_context_engine',
      category: 'road_access',
      reachableByVehicle: true,
      driveTimeToSafetySeconds: 1200,
      score: 0.76,
      confidence: { value: 0.76, reasons: ['route context provider result'] },
    }],
  },
});

assert.strictEqual(routeContextLikely.status, 'likely');
assert.strictEqual(routeContextLikely.metadata.likelyEvidenceCount, 1);
assert.strictEqual(routeContextLikely.accessEvidence[0].evidenceType, 'route_context_bailout');

const resolvedWaypoints = resolveTrailWaypoints({
  trailRoute,
  routeContext: {
    status: 'ready',
    confidence: { value: 0.8, tier: 'high', reasons: ['fixture'] },
    bailoutCandidates: [{
      id: 'route-context-bailout',
      label: 'Road access bailout',
      lat: 38.052,
      lng: -109.978,
      source: 'route_context_engine',
      category: 'road_access',
      reachableByVehicle: true,
      driveTimeToSafetySeconds: 1200,
      score: 0.76,
      confidence: { value: 0.76, reasons: ['route context provider result'] },
    }],
  },
});

assert.strictEqual(resolvedWaypoints.trailWaypoints.length, 1);
assert.strictEqual(resolvedWaypoints.trailWaypoints[0].type, 'bailout');
assert.strictEqual(resolvedWaypoints.metadata.bailoutConfidenceCount, 1);
assert.strictEqual(
  resolvedWaypoints.trailWaypoints[0].metadata.bailoutRouteConfidence.status,
  'likely',
);

console.log('Bailout route confidence resolver checks passed.');
