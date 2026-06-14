const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
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

const scrubber = require(path.join(root, 'lib', 'navigateRouteProfileScrubber.ts'));

const profile = [
  { distanceMiles: 0, elevationFeet: 5200, riskScore: 12, riskLevel: 'low' },
  { distanceMiles: 1, elevationFeet: 5520, riskScore: 48, riskLevel: 'moderate' },
  { distanceMiles: 2, elevationFeet: 6100, riskScore: 76, riskLevel: 'high' },
];
const routeCoordinates = [
  { latitude: 38.0, longitude: -110.0 },
  { latitude: 38.01, longitude: -110.01 },
  { latitude: 38.02, longitude: -110.02 },
];
const events = [
  { id: 'event-high-grade', distanceMiles: 2, label: 'Steep grade', riskLevel: 'high' },
];

const middle = scrubber.resolveNavigateRouteProfileFocus({
  profile,
  routeCoordinates,
  referenceEvents: events,
  distanceMiles: 1.05,
});

assert(middle, 'Profile focus should resolve for route/profile data.');
assert.strictEqual(middle.point.riskLevel, 'moderate');
assert(Math.abs(middle.coordinate.latitude - 38.01) < 0.001, 'Profile focus should map scrub distance to route geometry.');
assert.strictEqual(middle.referenceEvent, null, 'Middle focus should not invent a risk event.');

const high = scrubber.resolveNavigateRouteProfileFocus({
  profile,
  routeCoordinates,
  referenceEvents: events,
  distanceRatio: 1,
});

assert(high, 'Profile focus should resolve by distance ratio.');
assert.strictEqual(high.point.riskLevel, 'high');
assert.strictEqual(high.referenceEvent.id, 'event-high-grade', 'Nearby terrain risk reference event should surface while scrubbing.');

assert.strictEqual(
  scrubber.resolveNavigateRouteProfileFocus({ profile: [], routeCoordinates, distanceRatio: 0.5 }),
  null,
  'Unavailable elevation profile should return null instead of a fake focus point.',
);

console.log('Navigate route profile scrubber checks passed.');
