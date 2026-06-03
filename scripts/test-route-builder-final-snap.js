const assert = require('assert');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = require('fs').readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

const {
  finalizeRouteBuilderSegmentSnap,
  resampleMapMatchingCoordinates,
  canSaveRouteBuilderSegments,
} = require(path.join(root, 'lib', 'routeBuilderSnapFinalization.ts'));

function coord(lng, lat) {
  return [lng, lat];
}

const raw = [
  coord(-120.0000, 39.0000),
  coord(-120.0005, 39.0004),
  coord(-120.0010, 39.0008),
];

const matched = [
  coord(-120.00001, 39.00001),
  coord(-120.00052, 39.00042),
  coord(-120.00101, 39.00081),
];

const accepted = finalizeRouteBuilderSegmentSnap({
  segment: {
    id: 'stroke-1',
    coordinates: raw,
    rawSegment: raw,
    snappedSegment: raw,
    snapStatus: 'network_pending',
    snapConfidence: 'medium',
    snapSource: 'trail',
  },
  mapboxMatch: {
    coordinates: matched,
    confidence: 0.82,
    distanceM: 123,
  },
  mapboxAvailable: true,
});

assert.strictEqual(accepted.segment.snapStatus, 'snapped');
assert.strictEqual(accepted.segment.snapProvider, 'mapbox_map_matching');
assert.strictEqual(accepted.segment.snapProfile, 'driving');
assert.deepStrictEqual(accepted.segment.coordinates, matched);
assert.strictEqual(accepted.accepted, true);

const lowConfidence = finalizeRouteBuilderSegmentSnap({
  segment: {
    id: 'stroke-2',
    coordinates: raw,
    rawSegment: raw,
    snappedSegment: raw,
    snapStatus: 'network_pending',
    snapConfidence: 'medium',
    snapSource: 'trail',
  },
  mapboxMatch: {
    coordinates: matched,
    confidence: 0.4,
    distanceM: 123,
  },
  mapboxAvailable: true,
});
assert.strictEqual(lowConfidence.accepted, false);
assert.strictEqual(lowConfidence.segment.snapStatus, 'blocked');
assert.strictEqual(canSaveRouteBuilderSegments([lowConfidence.segment]), false);

const rawFallback = finalizeRouteBuilderSegmentSnap({
  segment: {
    id: 'stroke-3',
    coordinates: raw,
    rawSegment: raw,
    snappedSegment: [],
    snapStatus: 'raw_smoothed',
    snapConfidence: 'low',
    snapSource: 'raw-smoothed',
  },
  mapboxAvailable: false,
});
assert.strictEqual(rawFallback.accepted, false);
assert.strictEqual(rawFallback.segment.snapStatus, 'blocked');
assert.strictEqual(canSaveRouteBuilderSegments([rawFallback.segment]), false);

const localFallback = finalizeRouteBuilderSegmentSnap({
  segment: {
    id: 'stroke-4',
    coordinates: matched,
    rawSegment: raw,
    snappedSegment: matched,
    snapStatus: 'snapped',
    snapConfidence: 'medium',
    snapSource: 'trail',
  },
  mapboxAvailable: false,
});
assert.strictEqual(localFallback.accepted, true);
assert.strictEqual(localFallback.segment.snapProvider, 'rendered_features');
assert.strictEqual(localFallback.segment.snapStatus, 'snapped');
assert.strictEqual(canSaveRouteBuilderSegments([localFallback.segment]), true);

const longTrace = Array.from({ length: 175 }, (_, index) =>
  coord(-120 + index * 0.0001, 39 + index * 0.0001),
);
const resampled = resampleMapMatchingCoordinates(longTrace, 100);
assert(resampled.length <= 100, 'Mapbox map matching traces must stay at or below 100 coordinates.');
assert.deepStrictEqual(resampled[0], longTrace[0], 'Resampling should preserve the raw start.');
assert.deepStrictEqual(
  resampled[resampled.length - 1],
  longTrace[longTrace.length - 1],
  'Resampling should preserve the raw end.',
);

console.log('Route builder final snap checks passed.');
