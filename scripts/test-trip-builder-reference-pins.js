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

const { buildTripPlan } = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderService.ts'));

const baseInput = {
  tripType: 'day_trip',
  timeWindow: 'full_day',
  groupType: 'solo',
  priorities: ['low_risk'],
  smartResupplyPreference: 'fuel_only',
  bailoutPlanRequested: true,
};

const route = {
  id: 'reference-pin-route',
  name: 'Reference Pin Route',
  distanceMiles: 12,
  estimatedDriveTimeHours: 2,
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-121.5, 40.1],
      [-121.45, 40.2],
      [-121.4, 40.3],
    ],
  },
};

const plan = buildTripPlan({
  route,
  input: baseInput,
  resupplyPoints: [{
    id: 'fuel-on-approach',
    name: 'Last Fuel On Approach',
    category: 'fuel',
    location: { latitude: 40.08, longitude: -121.52 },
    routeMileMarker: 0,
    source: 'operator_selected_pre_route_resupply',
    reliability: 'medium',
  }],
  referencePoints: [
    {
      id: 'operator-camp-1',
      type: 'camp',
      title: 'Operator camp candidate 1',
      coordinate: { latitude: 40.22, longitude: -121.44 },
      source: 'operator_drop',
      confidence: 'unknown',
      notes: ['Operator-marked potential camp. Legal access, land use, fire restrictions, and posted rules are unknown.'],
    },
    {
      id: 'operator-bailout-1',
      type: 'exit',
      title: 'Operator bailout reference',
      coordinate: { latitude: 40.18, longitude: -121.47 },
      source: 'operator_drop',
      confidence: 'medium',
      notes: ['Reference-only emergency bailout pin. Verify legal access and drivability.'],
    },
  ],
  capturedAt: '2026-06-14T12:00:00.000Z',
});

const fuelIndex = plan.suggestedStops.findIndex((stop) => stop.type === 'fuel');
const startIndex = plan.suggestedStops.findIndex((stop) => stop.type === 'start');
assert.ok(fuelIndex >= 0 && startIndex > fuelIndex, 'Pre-trail fuel should remain a required guidance stop before route start.');

const campReference = plan.suggestedStops.find((stop) => stop.id.includes('operator-camp-1'));
assert.ok(campReference, 'Operator camp pin should be preserved in the generated itinerary.');
assert.strictEqual(campReference.guidanceRole, 'reference_only');
assert.strictEqual(campReference.referenceType, 'camp_candidate');
assert.ok(
  campReference.notes.some((note) => /Legal access, land use, fire restrictions, and posted rules are unknown/i.test(note)),
  'Operator camp pins must not infer legal/access/fire status.',
);

const bailoutReference = plan.suggestedStops.find((stop) => stop.id.includes('operator-bailout-1'));
assert.ok(bailoutReference, 'Operator bailout pin should be preserved in the generated itinerary.');
assert.strictEqual(bailoutReference.guidanceRole, 'reference_only');
assert.strictEqual(bailoutReference.referenceType, 'bailout');

const referenceIds = new Set([campReference.id, bailoutReference.id]);
assert.ok(
  plan.segments.every((segment) => !referenceIds.has(segment.fromStopId) && !referenceIds.has(segment.toStopId)),
  'Reference-only camp and bailout pins must not create required navigation segments.',
);

console.log('Trip Builder reference pin checks passed.');
