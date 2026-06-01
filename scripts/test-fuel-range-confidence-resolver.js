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
  resolveFuelRangeConfidence,
} = require(path.join(root, 'lib', 'tripBuilder', 'fuelRangeConfidenceResolver.ts'));
const {
  buildTripItineraryFromSuggestedRoute,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryBuilderService.ts'));

function route(id, phase, distanceMiles) {
  return {
    id,
    phase,
    title: id,
    geometry: null,
    segments: [],
    source: { label: `${id}_source`, state: 'cached' },
    confidence: 'medium',
    distanceMiles,
  };
}

const approachRoute = route('approach', 'approach', 25);
const trailRoute = route('trail', 'trail_navigation', 30);
const exitRoute = route('exit', 'trail_exit', 10);

const telemetryConfidence = resolveFuelRangeConfidence({
  vehicleProfile: {
    id: 'vehicle-telemetry-profile',
    fuelTankCapacityGal: 20,
    avgMpg: 18,
    rangeMiles: 300,
    rangeSource: 'manual',
  },
  telemetry: {
    sourceType: 'obd_live',
    sourceLabel: 'OBD2 live',
    freshness: 'live',
    confidence: 'high',
    rangeMiles: 140,
    fuelLevelPct: 50,
    timestamp: Date.parse('2026-05-29T12:00:00.000Z'),
    provider: 'obd2',
  },
  approachRoute,
  trailRoute,
  exitRoute,
  preTrailFuelStops: [{
    id: 'ranked-fuel',
    type: 'fuel',
    phase: 'pre_trail_resupply',
    title: 'Ranked Fuel',
    coordinate: { latitude: 38, longitude: -110 },
    sequence: 1,
    source: { label: 'ranked_pre_trail_candidate', state: 'cached' },
    confidence: 'medium',
  }],
});

assert.strictEqual(telemetryConfidence.estimatedTotalDistance, 65);
assert.strictEqual(telemetryConfidence.estimatedTrailDistance, 30);
assert.strictEqual(telemetryConfidence.knownFuelRange, 140);
assert.strictEqual(telemetryConfidence.estimatedFuelRemaining, 10);
assert.strictEqual(telemetryConfidence.fuelStatus, 'sufficient');
assert.ok(telemetryConfidence.confidenceScore >= 0.75);
assert.strictEqual(telemetryConfidence.fuelDataSource.label, 'vehicle_fuel_telemetry');
assert.strictEqual(telemetryConfidence.fuelDataSource.state, 'live');

const profileOnlyRecommended = resolveFuelRangeConfidence({
  vehicleProfile: {
    id: 'vehicle-profile-only',
    rangeMiles: 74,
    rangeSource: 'manual',
    confidence: 'medium',
  },
  telemetry: null,
  approachRoute,
  trailRoute,
  exitRoute,
});

assert.strictEqual(profileOnlyRecommended.knownFuelRange, 74);
assert.strictEqual(profileOnlyRecommended.fuelStatus, 'recommended');
assert.strictEqual(profileOnlyRecommended.fuelDataSource.label, 'vehicle_fuel_profile');
assert.ok(
  profileOnlyRecommended.warnings.some((warning) => warning.includes('Fuel is recommended')),
  'Profile-only tight range should recommend pre-trail fuel.',
);

const criticalRange = resolveFuelRangeConfidence({
  vehicleProfile: {
    id: 'critical-profile',
    rangeMiles: 40,
    rangeSource: 'manual',
  },
  approachRoute,
  trailRoute,
  exitRoute,
});

assert.strictEqual(criticalRange.fuelStatus, 'critical');
assert.ok(criticalRange.rangeMarginMiles < 0);

const noFuelData = resolveFuelRangeConfidence({
  vehicleProfile: null,
  telemetry: null,
  approachRoute,
  trailRoute,
  exitRoute,
});

assert.strictEqual(noFuelData.knownFuelRange, null);
assert.strictEqual(noFuelData.estimatedFuelRemaining, null);
assert.strictEqual(noFuelData.fuelStatus, 'unknown');
assert.ok(
  noFuelData.warnings.some((warning) => warning.includes('will not guess fuel range')),
  'Missing fuel data must remain unknown instead of guessed.',
);

const missingTrailDistance = resolveFuelRangeConfidence({
  vehicleProfile: {
    id: 'missing-trail-profile',
    rangeMiles: 220,
    rangeSource: 'manual',
  },
  approachRoute,
  trailRoute: null,
  exitRoute,
});

assert.strictEqual(missingTrailDistance.estimatedTrailDistance, null);
assert.strictEqual(missingTrailDistance.fuelStatus, 'recommended');
assert.ok(missingTrailDistance.confidenceScore < telemetryConfidence.confidenceScore);
assert.ok(
  missingTrailDistance.warnings.some((warning) => warning.includes('Trail distance is unavailable')),
  'Missing trail distance should lower confidence and remain visible.',
);

const profileTankMpg = resolveFuelRangeConfidence({
  vehicleProfile: {
    id: 'tank-mpg-profile',
    fuelTankCapacityGal: 18,
    avgMpg: 16,
    rangeSource: 'estimated',
  },
  approachRoute,
  trailRoute,
  exitRoute,
});

assert.strictEqual(profileTankMpg.knownFuelRange, 288);
assert.strictEqual(profileTankMpg.estimatedFuelRemaining, null);
assert.strictEqual(profileTankMpg.fuelStatus, 'sufficient');
assert.ok(
  profileTankMpg.warnings.some((warning) => warning.includes('full-tank range capacity')),
  'Tank and MPG fallback should disclose that current fuel is unknown.',
);

const itinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'fuel-confidence-route',
    name: 'Fuel Confidence Route',
    trailheadStart: {
      latitude: 38,
      longitude: -110,
      confidence: 'high',
    },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110.2, 37.8],
        [-110, 38],
      ],
    },
    trailGeometry: {
      type: 'LineString',
      coordinates: [
        [-110, 38],
        [-109.9, 38.1],
      ],
    },
  },
  vehicleProfile: {
    id: 'builder-profile',
    rangeMiles: 80,
    rangeSource: 'manual',
  },
  telemetry: {
    sourceType: 'obd_live',
    freshness: 'live',
    rangeMiles: 120,
    provider: 'obd2',
  },
  selectedPreTrailOptions: {
    fuel: [{
      id: 'builder-fuel-stop',
      title: 'Builder Fuel Stop',
      coordinate: { latitude: 37.99, longitude: -110.01 },
      confidence: 'medium',
      source: 'operator_selected',
    }],
  },
  generatedAt: '2026-05-29T12:00:00.000Z',
});

assert.ok(itinerary.fuelRangeConfidence, 'Trip Builder itinerary should include fuel range confidence.');
assert.strictEqual(itinerary.fuelRangeConfidence.fuelDataSource.label, 'vehicle_fuel_telemetry');
assert.strictEqual(itinerary.fuelRangeConfidence.preTrailFuelStopCount, 1);
assert.ok(
  itinerary.dataUsed.some((item) => item.label === 'vehicle_fuel_telemetry'),
  'Itinerary should expose fuel telemetry as data used.',
);

console.log('Fuel range confidence resolver checks passed.');
