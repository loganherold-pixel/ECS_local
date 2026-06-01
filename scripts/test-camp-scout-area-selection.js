const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
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
};

const {
  CAMP_SCOUT_MAX_AREA_SQUARE_MILES,
  canScanCampScoutArea,
  computeCampScoutPolygonAreaSquareMiles,
  validateCampScoutArea,
} = require(path.join(root, 'lib', 'campScout', 'campScoutAreaSelection.ts'));

const square = (south, west, north, east) => [
  { latitude: south, longitude: west },
  { latitude: south, longitude: east },
  { latitude: north, longitude: east },
  { latitude: north, longitude: west },
];

const usefulArea = square(39.0, -105.0, 39.05, -104.95);
const tinyArea = square(39.0, -105.0, 39.0001, -104.9999);
const hugeArea = square(38.0, -106.0, 40.0, -104.0);

assert.equal(validateCampScoutArea(usefulArea).status, 'valid');
assert.equal(validateCampScoutArea(usefulArea).ok, true);
assert.ok(computeCampScoutPolygonAreaSquareMiles(usefulArea) > 0.01);
assert.equal(canScanCampScoutArea('areaReady', usefulArea), true);
assert.equal(canScanCampScoutArea('drawing', usefulArea), false);

assert.equal(validateCampScoutArea(usefulArea.slice(0, 2)).status, 'too_few_points');
assert.equal(validateCampScoutArea(tinyArea).status, 'too_small');
assert.equal(validateCampScoutArea(hugeArea).status, 'too_large');
assert.equal(
  validateCampScoutArea(usefulArea, {
    estimatedCandidateCount: 21,
  }).status,
  'excessive_candidates',
);

assert.equal(
  validateCampScoutArea(hugeArea).message.includes(`${CAMP_SCOUT_MAX_AREA_SQUARE_MILES}`),
  true,
);

console.log('Camp Scout area selection checks passed.');
