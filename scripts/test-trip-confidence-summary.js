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
  getTripConfidenceSummary,
  tripConfidenceLabel,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripConfidenceSummary.ts'));

const baseSource = { label: 'fixture', state: 'cached' };
const pointA = { latitude: 38, longitude: -110 };
const pointB = { latitude: 38.1, longitude: -110.1 };

function waypoint(id, type, coordinate = pointA) {
  return {
    id,
    type,
    phase: type === 'trailhead_start' ? 'trailhead' : 'trail_navigation',
    title: id,
    coordinate,
    source: baseSource,
    confidence: 'high',
  };
}

function routeSegment(id, phase, geometry = [pointA, pointB]) {
  return {
    id,
    phase,
    sequence: 1,
    title: id,
    geometry,
    segments: [],
    source: baseSource,
    confidence: 'high',
    distanceMiles: 12,
  };
}

function stop(id, type, coordinate = pointA, metadata = {}) {
  return {
    ...waypoint(id, type, coordinate),
    phase: 'pre_trail_resupply',
    sequence: 1,
    plannedDay: 1,
    stopRole: 'pre_trail_resupply',
    metadata,
  };
}

function itinerary(overrides = {}) {
  const fuel = overrides.fuelStops ?? [stop('fuel-near-trailhead', 'fuel')];
  const grocery = overrides.groceryStops ?? [
    stop('grocery-near-refuel', 'grocery', pointB, { resupplyAnchorStopId: fuel[0]?.id ?? null }),
  ];
  const trailhead = overrides.trailheadStart === undefined
    ? waypoint('trailhead', 'trailhead_start')
    : overrides.trailheadStart;
  const trailRoute = overrides.trailRoute === undefined
    ? routeSegment('trail-route', 'trail_navigation')
    : overrides.trailRoute;
  const trailEnd = overrides.trailEnd === undefined
    ? waypoint('trail-end', 'trail_end', pointB)
    : overrides.trailEnd;

  return {
    id: 'trip-itinerary-fixture',
    sourceRouteId: 'route-1',
    routeId: 'route-1',
    suggestedRouteId: 'route-1',
    title: 'Fixture itinerary',
    status: 'draft',
    createdAt: '2026-06-08T12:00:00.000Z',
    updatedAt: '2026-06-08T12:00:00.000Z',
    userStart: pointA,
    approachRoute: routeSegment('approach-route', 'approach'),
    preTrailStops: {
      fuel,
      grocery,
      water: overrides.waterStops ?? [],
      generalSupply: overrides.generalSupplyStops ?? [],
    },
    preTrailStopStatus: overrides.preTrailStopStatus ?? [
      { bucket: 'fuel', status: fuel.length ? 'selected' : 'no_results', anchorCoordinate: pointA, stopCount: fuel.length },
      { bucket: 'grocery', status: grocery.length ? 'selected' : 'no_results', anchorCoordinate: pointA, stopCount: grocery.length },
      { bucket: 'water', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
      { bucket: 'generalSupply', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
    ],
    fuelRangeConfidence: overrides.fuelRangeConfidence ?? {
      estimatedTotalDistance: 42,
      estimatedTrailDistance: 20,
      knownFuelRange: 260,
      estimatedFuelRemaining: 220,
      fuelStatus: 'sufficient',
      confidenceScore: 0.8,
      warnings: [],
      preTrailFuelStopCount: fuel.length,
    },
    trailheadStart: trailhead,
    trailRoute,
    routeGeometryStatus: overrides.routeGeometryStatus ?? 'trail_available',
    trailEnd,
    exitRoute: overrides.exitRoute ?? null,
    exitEnd: null,
    trailWaypoints: overrides.trailWaypoints ?? [waypoint('camp', 'camp_potential'), waypoint('bailout', 'bailout')],
    phases: ['approach', 'pre_trail_resupply', 'trailhead', 'trail_navigation', 'trail_exit'],
    phaseSummaries: [],
    stops: [],
    waypoints: [],
    segments: [],
    confidence: {
      overall: 'high',
      routeGeometry: 'high',
      routeGeometryStatus: overrides.routeGeometryStatus ?? 'trail_available',
      trailhead: trailhead ? 'high' : 'unknown',
      resupply: fuel.length || grocery.length ? 'medium' : 'unknown',
      trailWaypoints: 'medium',
      exitRoute: 'unknown',
      reasons: [],
      missingData: [],
    },
    dataUsed: [],
    warnings: [],
    metadata: overrides.metadata ?? {},
    ...overrides,
  };
}

const completeVehicle = {
  id: 'rig-1',
  label: 'Overlander',
  vehicleType: 'truck',
  rangeMiles: 260,
  rangeSource: 'manual',
  fuelTankCapacityGal: 31,
  avgMpg: 13,
  supportReadiness: {
    water: true,
    foodSupplies: true,
    repair: true,
    medical: true,
    recovery: true,
    source: 'test loadout',
    labels: ['water', 'food', 'repair'],
  },
  confidence: 'medium',
  source: 'fleet_profile',
};

function labels(summary) {
  return summary.reasons.map((reason) => reason.label);
}

function section(summary, key) {
  return summary.sections.find((item) => item.key === key);
}

const high = getTripConfidenceSummary({
  itinerary: itinerary(),
  selectedRoute: {
    id: 'route-1',
    name: 'FR 23N18 Coldwater',
    distanceMiles: 42,
    startLat: 38,
    startLng: -110,
    routeMetadata: {
      routeTypeStatus: 'live_verified_geometry',
      routeAuthorityLabel: 'ECS Validated',
      geometrySource: 'ecs_validated_route_catalog',
    },
  },
  vehicleProfile: completeVehicle,
  environment: {
    weather: { status: 'available', source: 'live' },
    daylight: { status: 'available' },
    remoteness: { status: 'available' },
  },
  telemetry: { status: 'unavailable' },
});

assert.strictEqual(high.category, 'high_confidence');
assert.strictEqual(tripConfidenceLabel(high.category), 'High Confidence');
assert.ok(high.score >= 80, 'Complete trip should produce an explainable high score.');
assert.ok(labels(high).includes('ECS Validated route'));
assert.ok(labels(high).includes('Vehicle profile complete'));
assert.ok(labels(high).includes('Refuel stop found near trailhead'));
assert.ok(labels(high).includes('Resupply stop found near refuel'));
assert.ok(labels(high).includes('Weather available'));
assert.strictEqual(high.recommendedAction.id, 'ready_to_start_trip');

const moderate = getTripConfidenceSummary({
  itinerary: itinerary({
    trailWaypoints: [],
    trailEnd: null,
    exitRoute: null,
  }),
  selectedRoute: {
    id: 'route-1',
    name: 'Imported GPX',
    distanceMiles: 18,
    routeMetadata: {
      routeTypeStatus: 'imported_geometry',
      routeAuthorityLabel: 'Imported Geometry',
      geometrySource: 'gpx_import',
    },
  },
  vehicleProfile: completeVehicle,
  environment: {
    weather: { status: 'available', source: 'cache' },
    daylight: { status: 'unknown' },
    remoteness: { status: 'available' },
  },
});

assert.strictEqual(moderate.category, 'moderate_confidence');
assert.ok(labels(moderate).includes('Camp not selected'));
assert.ok(labels(moderate).includes('Bailout unavailable'));
assert.strictEqual(moderate.recommendedAction.id, 'select_camp');

const lowVehicle = getTripConfidenceSummary({
  itinerary: itinerary({
    fuelRangeConfidence: {
      estimatedTotalDistance: 160,
      estimatedTrailDistance: 35,
      knownFuelRange: null,
      estimatedFuelRemaining: null,
      fuelStatus: 'unknown',
      confidenceScore: 0.2,
      warnings: ['Vehicle range unknown'],
      preTrailFuelStopCount: 0,
    },
    fuelStops: [],
  }),
  selectedRoute: {
    id: 'route-2',
    name: 'Remote Route',
    distanceMiles: 160,
    routeMetadata: { routeTypeStatus: 'imported_geometry', routeAuthorityLabel: 'Imported Geometry' },
  },
  vehicleProfile: null,
  environment: {
    weather: { status: 'available' },
    daylight: { status: 'available' },
    remoteness: { status: 'unknown' },
  },
});

assert.strictEqual(lowVehicle.category, 'low_confidence');
assert.ok(labels(lowVehicle).includes('Vehicle profile missing'));
assert.ok(labels(lowVehicle).includes('Vehicle range unknown'));
assert.notStrictEqual(lowVehicle.category, 'insufficient_data', 'Explicit no-vehicle state should remain low rather than becoming implicit/null.');
assert.strictEqual(lowVehicle.recommendedAction.id, 'complete_vehicle_profile');

const trailheadOnly = getTripConfidenceSummary({
  itinerary: itinerary({
    routeGeometryStatus: 'trail_missing',
    trailRoute: null,
    trailWaypoints: [],
    trailEnd: null,
  }),
  selectedRoute: {
    id: 'trailhead-only',
    name: 'Trailhead Only',
    startLat: 38,
    startLng: -110,
    routeMetadata: {
      routeTypeStatus: 'trailhead_guidance',
      routeAuthorityLabel: 'Trailhead Guidance',
    },
  },
  vehicleProfile: completeVehicle,
  environment: { weather: { status: 'unknown' } },
});

assert.strictEqual(trailheadOnly.category, 'insufficient_data');
assert.ok(labels(trailheadOnly).includes('Trailhead-only route'));
assert.ok(labels(trailheadOnly).includes('Route geometry missing'));
assert.strictEqual(trailheadOnly.recommendedAction.id, 'confirm_route_geometry');

const providerUnavailable = getTripConfidenceSummary({
  itinerary: itinerary({
    fuelStops: [],
    groceryStops: [],
    preTrailStopStatus: [
      { bucket: 'fuel', status: 'provider_unavailable', anchorCoordinate: pointA, stopCount: 0, warnings: ['Pre-trail POI provider unavailable.'] },
      { bucket: 'grocery', status: 'provider_unavailable', anchorCoordinate: pointA, stopCount: 0, warnings: ['Pre-trail POI provider unavailable.'] },
    ],
  }),
  selectedRoute: { id: 'route-3', name: 'Provider Down', routeMetadata: { routeTypeStatus: 'imported_geometry' } },
  vehicleProfile: completeVehicle,
});

assert.ok(providerUnavailable.keyWarnings.some((warning) => /provider unavailable/i.test(warning)));
assert.ok(labels(providerUnavailable).includes('POI provider unavailable'));

const demo = getTripConfidenceSummary({
  itinerary: itinerary({
    metadata: { routeTypeStatus: 'demo_fixture', geometrySource: 'ecs_demo_full_route_fixture' },
  }),
  selectedRoute: {
    id: 'demo-route',
    name: 'Demo Fixture',
    routeMetadata: {
      routeTypeStatus: 'demo_fixture',
      routeAuthorityLabel: 'Demo Fixture',
      geometrySource: 'ecs_demo_full_route_fixture',
    },
  },
  vehicleProfile: completeVehicle,
  environment: { weather: { status: 'available' } },
});

assert.strictEqual(demo.route.status, 'demo_fixture');
assert.ok(labels(demo).includes('Demo route, not verified'));
assert.ok(!labels(demo).includes('ECS Validated route'), 'Demo geometry must not be promoted as validated.');

const preview = getTripConfidenceSummary({
  itinerary: itinerary({
    metadata: { routeTypeStatus: 'preview_geometry' },
  }),
  selectedRoute: {
    id: 'preview-route',
    name: 'Preview Geometry',
    routeMetadata: { routeTypeStatus: 'preview_geometry', routeAuthorityLabel: 'Preview Geometry' },
  },
  vehicleProfile: completeVehicle,
  environment: { weather: { status: 'available' } },
});

assert.ok(labels(preview).includes('Route geometry preview-only'));
assert.ok(!labels(preview).includes('ECS Validated route'), 'Preview geometry must not be promoted as validated.');

const unknownWeather = getTripConfidenceSummary({
  itinerary: itinerary(),
  selectedRoute: { id: 'route-4', name: 'Unknown Weather', routeMetadata: { routeTypeStatus: 'imported_geometry' } },
  vehicleProfile: completeVehicle,
  environment: { weather: { status: 'unknown' } },
});

assert.ok(labels(unknownWeather).includes('Weather unavailable'));
assert.ok(!labels(unknownWeather).some((label) => /weather fair/i.test(label)), 'Unknown weather must not read as fair/safe.');
assert.strictEqual(section(unknownWeather, 'environment').status, 'unknown');

const staleTelemetry = getTripConfidenceSummary({
  itinerary: itinerary(),
  selectedRoute: { id: 'route-5', name: 'Stale Telemetry', routeMetadata: { routeTypeStatus: 'imported_geometry' } },
  vehicleProfile: completeVehicle,
  telemetry: { status: 'stale', source: 'blu_power_authority', updatedAt: '2026-06-08T10:00:00.000Z' },
});

assert.ok(labels(staleTelemetry).includes('Stale telemetry ignored'));
assert.notStrictEqual(section(staleTelemetry, 'data').status, 'live', 'Stale telemetry must not label the data section live.');

const screenSource = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
assert.ok(
  screenSource.includes('getTripConfidenceSummary') &&
    screenSource.includes('TripConfidenceSummaryPanel') &&
    screenSource.includes('trip-builder-trip-confidence-summary'),
  'Trip Builder summary flow should render the deterministic Trip Confidence Summary panel.',
);

console.log('Trip Confidence Summary MVP checks passed.');
