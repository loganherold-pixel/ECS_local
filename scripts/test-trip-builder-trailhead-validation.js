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
  validateTrailheadStart,
} = require(path.join(root, 'lib', 'tripBuilder', 'trailheadStartValidation.ts'));
const {
  buildTripItineraryFromSuggestedRoute,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryBuilderService.ts'));

const explicit = validateTrailheadStart({
  suggestedRoute: {
    id: 'explicit-trailhead',
    name: 'Explicit Trailhead Route',
    trailheadStart: {
      latitude: 38.1,
      longitude: -110.1,
      name: 'Mineral Bottom Trailhead',
      confidence: 0.96,
    },
  },
  routeGeometryStatus: 'trail_available',
});

assert.deepStrictEqual(explicit.coordinate, { latitude: 38.1, longitude: -110.1 });
assert.strictEqual(explicit.name, 'Mineral Bottom Trailhead');
assert.strictEqual(explicit.isConfirmedTrailhead, true);
assert.strictEqual(explicit.status, 'confirmed');
assert.ok(explicit.confidenceScore >= 90);

const namedDestination = validateTrailheadStart({
  suggestedRoute: {
    id: 'named-destination',
    name: 'Named Destination Route',
    destinationCoordinate: { latitude: 38.2, longitude: -110.2 },
    routeMetadata: {
      destinationName: 'Shafer Trailhead',
    },
  },
  routeGeometryStatus: 'approach_only',
});

assert.deepStrictEqual(namedDestination.coordinate, { latitude: 38.2, longitude: -110.2 });
assert.strictEqual(namedDestination.name, 'Shafer Trailhead');
assert.strictEqual(namedDestination.isConfirmedTrailhead, true);
assert.strictEqual(namedDestination.status, 'confirmed');
assert.ok(namedDestination.confidenceScore >= 80);

const genericDestination = validateTrailheadStart({
  suggestedRoute: {
    id: 'generic-destination',
    name: 'Generic Destination Route',
    destinationCoordinate: { latitude: 38.3, longitude: -110.3 },
  },
  routeGeometryStatus: 'unknown',
});

assert.deepStrictEqual(genericDestination.coordinate, { latitude: 38.3, longitude: -110.3 });
assert.strictEqual(genericDestination.name, null);
assert.strictEqual(genericDestination.isConfirmedTrailhead, false);
assert.strictEqual(genericDestination.status, 'likely');
assert.ok(genericDestination.confidenceScore < 55);
assert.ok(
  genericDestination.warnings.some((warning) => warning.includes('Generic destination coordinate')),
  'Generic destination coordinates should remain visibly low-confidence.',
);

const startCoordinate = validateTrailheadStart({
  suggestedRoute: {
    id: 'start-coordinate',
    name: 'Start Coordinate Route',
    startLat: 38.4,
    startLng: -110.4,
  },
  routeGeometryStatus: 'approach_only',
});

assert.deepStrictEqual(startCoordinate.coordinate, { latitude: 38.4, longitude: -110.4 });
assert.strictEqual(startCoordinate.isConfirmedTrailhead, false);
assert.strictEqual(startCoordinate.status, 'likely');
assert.ok(startCoordinate.confidenceScore >= 55 && startCoordinate.confidenceScore < 80);

const missing = validateTrailheadStart({
  suggestedRoute: {
    id: 'missing-trailhead',
    name: 'Missing Trailhead Route',
  },
  routeGeometryStatus: 'unknown',
});

assert.strictEqual(missing.coordinate, null);
assert.strictEqual(missing.name, null);
assert.strictEqual(missing.isConfirmedTrailhead, false);
assert.strictEqual(missing.status, 'unavailable');
assert.strictEqual(missing.confidenceScore, 0);

const itinerary = buildTripItineraryFromSuggestedRoute({
  suggestedRoute: {
    id: 'generic-destination',
    name: 'Generic Destination Route',
    destinationCoordinate: { latitude: 38.3, longitude: -110.3 },
  },
  generatedAt: '2026-05-29T12:00:00.000Z',
});

assert.strictEqual(itinerary.trailheadStartCandidate.status, 'likely');
assert.strictEqual(itinerary.trailheadStartCandidate.isConfirmedTrailhead, false);
assert.ok(
  itinerary.warnings.some((warning) => warning.id === 'trailhead_start_unconfirmed'),
  'Trip Builder should retain an unconfirmed trailhead warning for generic destination coordinates.',
);
assert.strictEqual(itinerary.confidence.trailheadStatus, 'likely');
assert.strictEqual(itinerary.confidence.trailheadConfidenceScore, 42);

console.log('Trip Builder trailhead validation checks passed.');
