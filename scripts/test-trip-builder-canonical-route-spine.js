const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
global.__DEV__ = false;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad(request, parent, isMain);
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
  buildTripBuilderCanonicalRouteSpine,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderCanonicalRouteSpine.ts'));
const {
  buildTripPlan,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderService.ts'));
const {
  routeAllowsLoopGuidance,
} = require(path.join(root, 'lib', 'navigation', 'routeLoopGuidancePolicy.ts'));

const origin = { latitude: 38.9, longitude: -109.7 };
const trailhead = { latitude: 39, longitude: -109.6 };
const trailEnd = { latitude: 39.04, longitude: -109.54 };
const backwardApproach = [
  trailhead,
  { latitude: 38.95, longitude: -109.65 },
  origin,
];
const backwardTrail = [
  trailEnd,
  { latitude: 39.02, longitude: -109.57 },
  trailhead,
];

function route(id, source, geometry = backwardTrail) {
  return {
    id,
    name: `${source} route`,
    routeType: 'point_to_point',
    trailheadStart: trailhead,
    trailEnd,
    approachGeometry: { type: 'LineString', coordinates: backwardApproach.map((point) => [point.longitude, point.latitude]) },
    routeGeometry: { type: 'LineString', coordinates: geometry.map((point) => [point.longitude, point.latitude]) },
    trailGeometry: { type: 'LineString', coordinates: geometry.map((point) => [point.longitude, point.latitude]) },
    routeMetadata: {
      isTrailGeometry: true,
      geometryRole: 'trail',
      source,
    },
  };
}

function distanceMeters(left, right) {
  const toRadians = (value) => value * Math.PI / 180;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLng = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function linePoint(lineString, index) {
  const [longitude, latitude] = lineString.coordinates[index];
  return { latitude, longitude };
}

function assertCanonicalSpine(result, label) {
  assert.strictEqual(result.status, 'ready', `${label} should produce a ready canonical spine.`);
  assert.ok(result.lineString, `${label} should produce one primary LineString.`);
  assert.strictEqual(result.lineString.type, 'LineString');
  assert.strictEqual(result.sourceLineCount, 1, `${label} should expose one primary source line.`);
  assert.ok(result.coordinates.length >= 5, `${label} should retain the approach and trail shape.`);
  assert.ok(distanceMeters(result.coordinates[0], origin) < 1, `${label} should begin at the selected origin.`);
  assert.ok(
    result.coordinates.some((point) => distanceMeters(point, trailhead) < 1),
    `${label} should pass through the selected trailhead.`,
  );
  assert.ok(
    distanceMeters(result.coordinates[result.coordinates.length - 1], trailEnd) < 1,
    `${label} should end at the canonical trail end.`,
  );
  assert.ok(
    distanceMeters(result.coordinates[result.coordinates.length - 1], origin) > 1000,
    `${label} must not close the primary spine back to the origin.`,
  );
  result.coordinates.slice(1).forEach((point, index) => {
    assert.ok(
      distanceMeters(result.coordinates[index], point) > 0.01,
      `${label} should not contain a zero-length segment at index ${index}.`,
    );
  });
  const first = linePoint(result.lineString, 0);
  const last = linePoint(result.lineString, result.lineString.coordinates.length - 1);
  assert.ok(distanceMeters(first, origin) < 1);
  assert.ok(distanceMeters(last, trailEnd) < 1);
}

const suggested = buildTripBuilderCanonicalRouteSpine({
  route: route('suggested-route', 'ecs_validated'),
  origin,
  trailhead,
  trailEnd,
  includeApproach: true,
});
assertCanonicalSpine(suggested, 'Suggested route');

const imported = buildTripBuilderCanonicalRouteSpine({
  route: route('imported-route', 'trip_builder_import'),
  origin,
  trailhead,
  trailEnd,
  includeApproach: true,
});
assertCanonicalSpine(imported, 'Imported route');
assert.deepStrictEqual(
  imported.lineString,
  suggested.lineString,
  'Imported and suggested routes should enter the same canonical route-session geometry shape.',
);

const pointAnnotations = [
  { id: 'camp', coordinate: { latitude: 39.01, longitude: -109.8 } },
  { id: 'bailout', coordinate: { latitude: 39.03, longitude: -109.75 } },
  { id: 'supply', coordinate: { latitude: 38.93, longitude: -109.9 } },
];
assert.strictEqual(suggested.lineString.coordinates.length, 5);
assert.ok(
  pointAnnotations.every((annotation) => !suggested.coordinates.some((point) => (
    distanceMeters(point, annotation.coordinate) < 1
  ))),
  'Default camps, bailout options, and supply POIs must remain point annotations outside the primary spine.',
);

const trailOnly = buildTripBuilderCanonicalRouteSpine({
  route: route('trail-only', 'trip_builder_import'),
  trailhead,
  trailEnd,
  includeApproach: false,
});
assert.strictEqual(trailOnly.status, 'trail_only');
assert.ok(distanceMeters(trailOnly.coordinates[0], trailhead) < 1);
assert.ok(distanceMeters(trailOnly.coordinates[trailOnly.coordinates.length - 1], trailEnd) < 1);

const backwardWithoutDeclaredEnd = buildTripBuilderCanonicalRouteSpine({
  route: {
    id: 'backward-without-declared-end',
    name: 'Backward without declared end',
    routeType: 'point_to_point',
    trailheadStart: trailhead,
    trailGeometry: {
      type: 'LineString',
      coordinates: backwardTrail.map((point) => [point.longitude, point.latitude]),
    },
    routeMetadata: { isTrailGeometry: true },
  },
  trailhead,
  includeApproach: false,
});
assert.strictEqual(backwardWithoutDeclaredEnd.status, 'trail_only');
assert.ok(distanceMeters(backwardWithoutDeclaredEnd.coordinates[0], trailhead) < 1);
assert.ok(distanceMeters(backwardWithoutDeclaredEnd.coordinates.at(-1), trailEnd) < 1);

const interiorTrailhead = { latitude: 39.01, longitude: -109.585 };
const interiorStart = { latitude: 38.99, longitude: -109.615 };
const interiorEnd = { latitude: 39.04, longitude: -109.54 };
const interiorOpen = buildTripBuilderCanonicalRouteSpine({
  route: {
    id: 'interior-open',
    name: 'Interior trailhead open route',
    routeType: 'point_to_point',
    trailheadStart: interiorTrailhead,
    trailGeometry: {
      type: 'LineString',
      coordinates: [interiorStart, interiorTrailhead, interiorEnd]
        .map((point) => [point.longitude, point.latitude]),
    },
    routeMetadata: { isTrailGeometry: true },
  },
  trailhead: interiorTrailhead,
  includeApproach: false,
});
assert.strictEqual(interiorOpen.status, 'trail_only');
assert.ok(distanceMeters(interiorOpen.coordinates[0], interiorTrailhead) < 1);
assert.ok(distanceMeters(interiorOpen.coordinates.at(-1), interiorEnd) < 1);
assert.ok(
  interiorOpen.coordinates.every((point) => distanceMeters(point, interiorStart) > 1),
  'An open route should trim source geometry before the selected interior trailhead.',
);

const elevated = buildTripBuilderCanonicalRouteSpine({
  route: {
    id: 'elevated-import',
    name: 'Elevated imported route',
    routeType: 'point_to_point',
    trailheadStart: trailhead,
    trailGeometry: [
      { ...trailhead, elevationMeters: 1000 },
      { latitude: 39.02, longitude: -109.57, elevationMeters: 1200 },
      { ...trailEnd, elevationMeters: 1100 },
    ],
    routeMetadata: { sourceFileType: 'gpx', isTrailGeometry: true },
  },
  trailhead,
  includeApproach: false,
});
assert.deepStrictEqual(
  elevated.coordinates.map((point) => point.elevationMeters),
  [1000, 1200, 1100],
  'Canonicalization must preserve provider/imported elevation samples for Terrain Risk.',
);

const disjoint = buildTripBuilderCanonicalRouteSpine({
  route: route('disjoint-route', 'ecs_validated'),
  origin,
  approachGeometry: [origin, { latitude: 38.91, longitude: -109.69 }],
  trailhead,
  trailEnd,
  includeApproach: true,
});
assert.strictEqual(disjoint.status, 'invalid');
assert.strictEqual(disjoint.safeCode, 'TRIP_BUILDER_SPINE_APPROACH_TRAILHEAD_DISJOINT');
assert.strictEqual(disjoint.lineString, null, 'A large approach-to-trailhead jump must not render as a connector.');

const disjointMultiLineRoute = {
  id: 'disjoint-multiline',
  name: 'Disjoint multipart trail',
  routeType: 'point_to_point',
  trailheadStart: trailhead,
  trailEnd: { latitude: 40.01, longitude: -108.99 },
  trailGeometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [trailhead.longitude, trailhead.latitude],
        [-109.58, 39.01],
      ],
      [
        [-109, 40],
        [-108.99, 40.01],
      ],
    ],
  },
  routeMetadata: {
    isTrailGeometry: true,
    geometryRole: 'trail',
  },
};
const disjointMultiLine = buildTripBuilderCanonicalRouteSpine({
  route: disjointMultiLineRoute,
  trailhead,
  trailEnd: disjointMultiLineRoute.trailEnd,
  includeApproach: false,
});
assert.strictEqual(disjointMultiLine.status, 'invalid');
assert.strictEqual(disjointMultiLine.safeCode, 'TRIP_BUILDER_SPINE_TRAIL_TOPOLOGY_INVALID');
assert.strictEqual(
  disjointMultiLine.lineString,
  null,
  'Disconnected official source segments must not be flattened into an artificial connector.',
);

const selfRevisitTrail = [
  trailhead,
  { latitude: 39.02, longitude: -109.57 },
  { latitude: 39.00005, longitude: -109.60005 },
  trailEnd,
];
const selfRevisit = buildTripBuilderCanonicalRouteSpine({
  route: route('self-revisit', 'ecs_validated', selfRevisitTrail),
  trailhead,
  trailEnd,
  includeApproach: false,
});
assert.strictEqual(selfRevisit.status, 'invalid');
assert.strictEqual(selfRevisit.safeCode, 'TRIP_BUILDER_SPINE_TRAIL_TOPOLOGY_INVALID');
assert.strictEqual(selfRevisit.lineString, null, 'A non-loop self revisit must remain preview-only and outside the canonical spine.');

const nonLoopClosed = buildTripBuilderCanonicalRouteSpine({
  route: route('false-loop', 'ecs_validated', [
    trailhead,
    { latitude: 39.02, longitude: -109.57 },
    trailhead,
  ]),
  trailhead,
  trailEnd: trailhead,
  includeApproach: false,
  allowLoop: false,
});
assert.strictEqual(nonLoopClosed.status, 'invalid');
assert.strictEqual(nonLoopClosed.safeCode, 'TRIP_BUILDER_SPINE_UNEXPECTED_CLOSURE');

const explicitLoop = buildTripBuilderCanonicalRouteSpine({
  route: {
    ...route('true-loop', 'ecs_validated', [
      trailhead,
      { latitude: 39.02, longitude: -109.57 },
      trailhead,
    ]),
    routeType: 'loop',
  },
  trailhead,
  trailEnd: trailhead,
  includeApproach: false,
  allowLoop: true,
});
assert.strictEqual(explicitLoop.status, 'trail_only');
assert.strictEqual(
  explicitLoop.coordinates.filter((point) => distanceMeters(point, trailhead) < 1).length,
  2,
  'An explicit source loop should preserve its single source closure without appending another closing coordinate.',
);

const interiorLoopTrailhead = { latitude: 39.02, longitude: -109.57 };
const interiorLoop = buildTripBuilderCanonicalRouteSpine({
  route: {
    id: 'interior-loop',
    name: 'Interior selected loop trailhead',
    routeType: 'closed_loop',
    trailheadStart: interiorLoopTrailhead,
    trailGeometry: {
      type: 'LineString',
      coordinates: [
        [trailhead.longitude, trailhead.latitude],
        [interiorLoopTrailhead.longitude, interiorLoopTrailhead.latitude],
        [trailEnd.longitude, trailEnd.latitude],
        [trailhead.longitude, trailhead.latitude],
      ],
    },
    routeMetadata: { isTrailGeometry: true },
  },
  trailhead: interiorLoopTrailhead,
  includeApproach: false,
});
assert.strictEqual(interiorLoop.status, 'trail_only');
assert.ok(distanceMeters(interiorLoop.coordinates[0], interiorLoopTrailhead) < 1);
assert.ok(distanceMeters(interiorLoop.coordinates.at(-1), interiorLoopTrailhead) < 1);
assert.strictEqual(
  interiorLoop.coordinates.filter((point) => distanceMeters(point, interiorLoopTrailhead) < 1).length,
  2,
  'A selected interior loop trailhead should rotate the source loop and retain exactly one closure.',
);

const conflictingLoop = {
  ...route('conflicting-loop', 'ecs_validated', [
    trailhead,
    { latitude: 39.02, longitude: -109.57 },
    trailhead,
  ]),
  routeType: 'point_to_point',
  isLoop: true,
  allowLoopGuidance: false,
};
assert.strictEqual(routeAllowsLoopGuidance(conflictingLoop), false);
const conflictingLoopSpine = buildTripBuilderCanonicalRouteSpine({
  route: conflictingLoop,
  trailhead,
  trailEnd: trailhead,
  includeApproach: false,
  allowLoop: true,
});
assert.strictEqual(conflictingLoopSpine.status, 'invalid');
assert.strictEqual(conflictingLoopSpine.safeCode, 'TRIP_BUILDER_SPINE_UNEXPECTED_CLOSURE');

const composedClosure = buildTripBuilderCanonicalRouteSpine({
  route: {
    id: 'composed-origin-closure',
    name: 'Composed origin closure',
    routeType: 'point_to_point',
    trailheadStart: trailhead,
    trailGeometry: {
      type: 'LineString',
      coordinates: [
        [trailhead.longitude, trailhead.latitude],
        [origin.longitude, origin.latitude],
      ],
    },
    routeMetadata: { isTrailGeometry: true },
  },
  origin,
  approachGeometry: [origin, trailhead],
  trailhead,
  includeApproach: true,
});
assert.strictEqual(composedClosure.status, 'invalid');
assert.strictEqual(
  composedClosure.safeCode,
  'TRIP_BUILDER_SPINE_UNEXPECTED_CLOSURE',
  'A non-loop full spine must not finish back at the trip origin.',
);

const declaredLoopWithOpenSourceClosure = buildTripBuilderCanonicalRouteSpine({
  route: {
    id: 'declared-loop-open-source',
    name: 'Declared loop with open source',
    routeType: 'loop',
    trailheadStart: trailhead,
    trailGeometry: {
      type: 'LineString',
      coordinates: [
        [trailhead.longitude, trailhead.latitude],
        [origin.longitude, origin.latitude],
      ],
    },
    routeMetadata: { isTrailGeometry: true },
  },
  origin,
  approachGeometry: [origin, trailhead],
  trailhead,
  includeApproach: true,
});
assert.strictEqual(declaredLoopWithOpenSourceClosure.status, 'invalid');
assert.strictEqual(
  declaredLoopWithOpenSourceClosure.safeCode,
  'TRIP_BUILDER_SPINE_UNEXPECTED_CLOSURE',
  'A loop declaration must not authorize full-spine closure when the source trail itself is open.',
);

const connectedOutOfOrder = buildTripBuilderCanonicalRouteSpine({
  route: {
    id: 'connected-out-of-order',
    name: 'Connected multipart route',
    routeType: 'point_to_point',
    trailheadStart: trailhead,
    trailGeometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [-109.57, 39.02],
          [trailEnd.longitude, trailEnd.latitude],
        ],
        [
          [trailhead.longitude, trailhead.latitude],
          [-109.57, 39.02],
        ],
      ],
    },
    routeMetadata: { isTrailGeometry: true },
  },
  trailhead,
  includeApproach: false,
});
assert.strictEqual(connectedOutOfOrder.status, 'trail_only');
assert.ok(distanceMeters(connectedOutOfOrder.coordinates[0], trailhead) < 1);
assert.ok(distanceMeters(connectedOutOfOrder.coordinates.at(-1), trailEnd) < 1);

const rejectedNonLoopPlan = buildTripPlan({
  route: route('rejected-non-loop-plan', 'ecs_validated', [
    trailhead,
    { latitude: 39.02, longitude: -109.57 },
    trailhead,
  ]),
  input: {
    tripType: 'day_trip',
    timeWindow: 'full_day',
    groupType: 'solo',
    priorities: [],
  },
  capturedAt: '2026-07-16T12:00:00.000Z',
});
assert.strictEqual(
  rejectedNonLoopPlan.route.distanceMiles,
  null,
  'Trip Plan calculations must not re-admit raw geometry after the canonical builder rejects an unexpected closure.',
);
assert.strictEqual(rejectedNonLoopPlan.route.startCoordinate, null);
assert.strictEqual(rejectedNonLoopPlan.route.endCoordinate, null);

const rejectedTopologyPlan = buildTripPlan({
  route: route('rejected-topology-plan', 'ecs_validated', selfRevisitTrail),
  input: {
    tripType: 'day_trip',
    timeWindow: 'full_day',
    groupType: 'solo',
    priorities: [],
  },
  capturedAt: '2026-07-16T12:00:00.000Z',
});
assert.strictEqual(
  rejectedTopologyPlan.route.distanceMiles,
  null,
  'Trip Plan calculations must not re-admit a topology-invalid trail through raw geometry fallback.',
);
assert.strictEqual(rejectedTopologyPlan.route.startCoordinate, null);
assert.strictEqual(rejectedTopologyPlan.route.endCoordinate, null);

console.log('Trip Builder canonical route spine behavioral checks passed.');
