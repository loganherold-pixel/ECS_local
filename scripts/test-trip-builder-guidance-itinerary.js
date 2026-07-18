const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
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
  buildTripBuilderGuidanceItinerary,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderGuidanceItinerary.ts'));

const origin = { latitude: 39, longitude: -121.5 };
const fuel = { latitude: 39.1, longitude: -121.45 };
const trailhead = { latitude: 39.2, longitude: -121.4 };
const destination = { latitude: 39.3, longitude: -121.35 };
const line = {
  type: 'LineString',
  coordinates: [origin, fuel, trailhead, destination]
    .map((point) => [point.longitude, point.latitude]),
};

const point = (overrides) => ({
  id: overrides.id,
  type: overrides.type,
  title: overrides.title,
  sequence: overrides.sequence,
  plannedDay: 1,
  coordinate: overrides.coordinate,
  routeMileMarker: null,
  etaOffsetHours: null,
  source: 'fixture',
  confidence: 'medium',
  guidanceRole: overrides.guidanceRole,
  referenceType: overrides.referenceType,
});

const itinerary = buildTripBuilderGuidanceItinerary({
  plan: {
    id: 'plan-1',
    suggestedStops: [
      point({
        id: 'camp-reference',
        type: 'camp',
        title: 'Camp reference',
        sequence: 2,
        coordinate: { latitude: 39.15, longitude: -121.42 },
        guidanceRole: 'reference_only',
        referenceType: 'camp_candidate',
      }),
      point({
        id: 'fuel',
        type: 'fuel',
        title: 'Last Fuel',
        sequence: 3,
        coordinate: fuel,
        guidanceRole: 'required',
      }),
      point({
        id: 'combined-supplies',
        type: 'supply',
        title: 'Groceries and Supplies',
        sequence: 4,
        coordinate: { latitude: fuel.latitude + 0.00001, longitude: fuel.longitude },
        guidanceRole: 'required',
      }),
      point({
        id: 'bailout-reference',
        type: 'exit',
        title: 'Bailout reference',
        sequence: 5,
        coordinate: { latitude: 39.25, longitude: -121.37 },
        guidanceRole: 'reference_only',
        referenceType: 'bailout',
      }),
    ],
  },
  origin,
  trailhead,
  destination,
  routeGeometry: line,
});

assert.deepStrictEqual(
  itinerary.map((entry) => entry.role),
  ['origin', 'resupply', 'trailhead', 'destination'],
  'Guidance must contain only origin, selected resupply, trailhead, and route end.',
);
assert.match(
  itinerary[1].title,
  /Last Fuel \+ Groceries and Supplies/,
  'One physical stop that covers two categories should remain one combined guidance point.',
);
assert.ok(
  itinerary.every((entry) => entry.routeIndex != null && entry.distanceFromSpineM < 10),
  'Every guidance point should project onto the canonical route spine.',
);
assert.ok(
  itinerary.every((entry) => !/camp|bailout/i.test(entry.title)),
  'Camp and bailout references must not create default guidance legs.',
);

const reordered = buildTripBuilderGuidanceItinerary({
  plan: {
    id: 'plan-2',
    suggestedStops: [
      point({
        id: 'supply-first',
        type: 'supply',
        title: 'Supplies',
        sequence: 1,
        coordinate: { latitude: 39.05, longitude: -121.475 },
        guidanceRole: 'required',
      }),
      point({
        id: 'fuel-second',
        type: 'fuel',
        title: 'Fuel',
        sequence: 2,
        coordinate: fuel,
        guidanceRole: 'required',
      }),
    ],
  },
  origin,
  trailhead,
  destination,
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [origin.longitude, origin.latitude],
      [-121.475, 39.05],
      [fuel.longitude, fuel.latitude],
      [trailhead.longitude, trailhead.latitude],
      [destination.longitude, destination.latitude],
    ],
  },
});
assert.deepStrictEqual(
  reordered.filter((entry) => entry.role === 'resupply').map((entry) => entry.title),
  ['Supplies', 'Fuel'],
  'Saved itinerary order must control the stop sequence used for guidance.',
);

const noTrailhead = buildTripBuilderGuidanceItinerary({
  plan: {
    id: 'plan-3',
    suggestedStops: [
      point({
        id: 'invalid-fuel',
        type: 'fuel',
        title: 'Invalid fuel record',
        sequence: 1,
        coordinate: { latitude: 999, longitude: -121.4 },
        guidanceRole: 'required',
      }),
    ],
  },
  origin,
  destination,
  routeGeometry: line,
});
assert.deepStrictEqual(
  noTrailhead.map((entry) => entry.role),
  ['origin', 'destination'],
  'A route without a distinct trailhead should remain usable without fabricating one, and invalid stop coordinates must be ignored.',
);

console.log('Trip Builder guidance itinerary regression passed.');
