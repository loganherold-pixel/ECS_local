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
  ROUTE_CONFIDENCE_DATA_STATES,
  evaluateRouteConfidence,
  routeConfidenceLabel,
} = require(path.join(root, 'lib', 'routeConfidenceEngine.ts'));

const {
  getTripConfidenceSummary,
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
  confidence: 'medium',
  source: 'fleet_profile',
};

function baseInput(overrides = {}) {
  return {
    itinerary: itinerary(overrides.itinerary ?? {}),
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
      ...(overrides.selectedRoute ?? {}),
    },
    vehicleProfile: Object.prototype.hasOwnProperty.call(overrides, 'vehicleProfile')
      ? overrides.vehicleProfile
      : completeVehicle,
    plan: overrides.plan ?? null,
    environment: overrides.environment ?? {
      weather: { status: 'available', source: 'live' },
      daylight: { status: 'available' },
      remoteness: { status: 'available' },
    },
    telemetry: Object.prototype.hasOwnProperty.call(overrides, 'telemetry')
      ? overrides.telemetry
      : { status: 'unavailable' },
  };
}

function labels(summary) {
  return summary.reasons.map((reason) => reason.label);
}

function section(summary, key) {
  return summary.sections.find((item) => item.key === key);
}

assert.deepStrictEqual(
  ROUTE_CONFIDENCE_DATA_STATES,
  ['unknown', 'unavailable', 'stale', 'demo', 'mock', 'partial', 'available', 'live', 'verified'],
  'Engine data-state contract must explicitly support unknown/unavailable/stale/demo/mock/partial/live/verified states.',
);

const high = evaluateRouteConfidence(baseInput());
assert.strictEqual(high.category, 'high_confidence');
assert.strictEqual(routeConfidenceLabel(high.category), 'High Confidence');
assert.ok(high.score >= 80, 'Complete route input should produce a high confidence score.');
assert.ok(high.sections.some((item) => item.key === 'route'));
assert.ok(high.dataConfidence);
assert.ok(Array.isArray(high.knownLimitations), 'Engine output should expose known limitations for future consumers.');
assert.ok(labels(high).includes('ECS Validated route'));
assert.strictEqual(high.recommendedAction.id, 'ready_to_start_trip');

const wrapper = getTripConfidenceSummary(baseInput());
assert.deepStrictEqual(
  {
    category: wrapper.category,
    score: wrapper.score,
    reasons: wrapper.reasons.map((reason) => reason.id),
    action: wrapper.recommendedAction.id,
  },
  {
    category: high.category,
    score: high.score,
    reasons: high.reasons.map((reason) => reason.id),
    action: high.recommendedAction.id,
  },
  'Trip Confidence Summary should preserve engine behavior through its compatibility wrapper.',
);

const missingVehicle = evaluateRouteConfidence(baseInput({
  vehicleProfile: null,
  itinerary: {
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
  },
}));
assert.strictEqual(missingVehicle.category, 'low_confidence');
assert.ok(labels(missingVehicle).includes('Vehicle profile missing'));
assert.strictEqual(missingVehicle.recommendedAction.id, 'complete_vehicle_profile');

const trailheadOnly = evaluateRouteConfidence(baseInput({
  itinerary: {
    routeGeometryStatus: 'trail_missing',
    trailRoute: null,
    trailWaypoints: [],
    trailEnd: null,
  },
  selectedRoute: {
    id: 'trailhead-only',
    name: 'Trailhead Only',
    routeMetadata: {
      routeTypeStatus: 'trailhead_guidance',
      routeAuthorityLabel: 'Trailhead Guidance',
    },
  },
  environment: { weather: { status: 'unknown' } },
}));
assert.strictEqual(trailheadOnly.category, 'insufficient_data');
assert.ok(labels(trailheadOnly).includes('Trailhead-only route'));
assert.ok(labels(trailheadOnly).includes('Route geometry missing'));

const providerUnavailable = evaluateRouteConfidence(baseInput({
  itinerary: {
    fuelStops: [],
    groceryStops: [],
    preTrailStopStatus: [
      { bucket: 'fuel', status: 'provider_unavailable', anchorCoordinate: pointA, stopCount: 0, warnings: ['Provider unavailable.'] },
      { bucket: 'grocery', status: 'provider_unavailable', anchorCoordinate: pointA, stopCount: 0, warnings: ['Provider unavailable.'] },
    ],
  },
}));
assert.ok(providerUnavailable.keyWarnings.some((warning) => /provider unavailable/i.test(warning)));
assert.ok(providerUnavailable.knownLimitations.some((item) => /provider unavailable/i.test(item)));

const demo = evaluateRouteConfidence(baseInput({
  itinerary: { metadata: { routeTypeStatus: 'demo_fixture', geometrySource: 'ecs_demo_full_route_fixture' } },
  selectedRoute: {
    id: 'demo-route',
    name: 'Demo Fixture',
    routeMetadata: {
      routeTypeStatus: 'demo_fixture',
      routeAuthorityLabel: 'Demo Fixture',
      geometrySource: 'ecs_demo_full_route_fixture',
    },
  },
}));
assert.strictEqual(demo.route.status, 'demo_fixture');
assert.ok(labels(demo).includes('Demo route, not verified'));
assert.ok(!labels(demo).includes('ECS Validated route'));

const preview = evaluateRouteConfidence(baseInput({
  itinerary: { metadata: { routeTypeStatus: 'preview_geometry' } },
  selectedRoute: {
    id: 'preview-route',
    name: 'Preview Geometry',
    routeMetadata: { routeTypeStatus: 'preview_geometry', routeAuthorityLabel: 'Preview Geometry' },
  },
}));
assert.ok(labels(preview).includes('Route geometry preview-only'));
assert.ok(!labels(preview).includes('ECS Validated route'));

const unknownWeather = evaluateRouteConfidence(baseInput({
  environment: { weather: { status: 'unknown' } },
}));
assert.ok(labels(unknownWeather).includes('Weather unavailable'));
assert.ok(!labels(unknownWeather).some((label) => /weather fair|weather safe/i.test(label)));
assert.strictEqual(section(unknownWeather, 'environment').status, 'unknown');

const unavailableTelemetry = evaluateRouteConfidence(baseInput({ telemetry: { status: 'unavailable' } }));
const staleTelemetry = evaluateRouteConfidence(baseInput({ telemetry: { status: 'stale' } }));
const mockTelemetry = evaluateRouteConfidence(baseInput({ telemetry: { status: 'mock' } }));
assert.ok(labels(staleTelemetry).includes('Stale telemetry ignored'));
assert.ok(labels(mockTelemetry).includes('Mock telemetry not used for confidence'));
assert.ok(mockTelemetry.keyWarnings.includes('Mock telemetry not used for confidence'));
assert.ok(mockTelemetry.knownLimitations.includes('Mock telemetry not used for confidence'));
assert.notStrictEqual(section(staleTelemetry, 'data').status, 'live');
assert.notStrictEqual(section(mockTelemetry, 'data').status, 'live');
assert.ok(staleTelemetry.score <= unavailableTelemetry.score, 'Stale telemetry must not improve confidence.');
assert.ok(mockTelemetry.score <= unavailableTelemetry.score, 'Mock telemetry must not improve confidence.');

const engineSource = fs.readFileSync(path.join(root, 'lib', 'routeConfidenceEngine.ts'), 'utf8');
assert.ok(!/TripConfidenceSummaryPanel|explore-trip-builder|from ['"]\.\.\/components|from ['"]\.\.\/app/.test(engineSource));

const summarySource = fs.readFileSync(path.join(root, 'lib', 'tripBuilder', 'tripConfidenceSummary.ts'), 'utf8');
assert.ok(summarySource.includes('evaluateRouteConfidence'), 'Trip Confidence Summary should consume the reusable engine API.');

console.log('Route Confidence Engine v1 checks passed.');
