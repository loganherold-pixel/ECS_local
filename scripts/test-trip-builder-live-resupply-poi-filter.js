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
  isLiveSmartResupplyPoiCandidate,
} = require(path.join(root, 'lib', 'tripBuilder', 'liveSmartResupplyPoiFilter.ts'));

function candidate(category, title, subtitle = '', raw = {}) {
  return isLiveSmartResupplyPoiCandidate({
    category,
    suggestion: { title, subtitle, raw },
    destination: { title, subtitle, raw },
  });
}

assert.strictEqual(
  candidate('fuel', 'Station Street', 'Sandy, Utah 84070', { feature_type: 'address' }),
  false,
  'Street/address results must not become live fuel resupply stops.',
);

assert.strictEqual(
  candidate('fuel', 'Diesel Drive', 'Winnemucca, Nevada 89445', { feature_type: 'address' }),
  false,
  'Road names containing fuel words must not pass as fuel POIs.',
);

assert.strictEqual(
  candidate('fuel', "J R's Fuel Stop", '425 S 6th St, Westcliffe, CO', { poi_category: ['gas station'] }),
  true,
  'Actual fuel-stop POIs should remain eligible.',
);

assert.strictEqual(
  candidate('food_supplies', 'City Market', 'Gunnison, Colorado', { poi_category: ['grocery', 'supermarket'] }),
  true,
  'Actual grocery/supply POIs should remain eligible.',
);

assert.strictEqual(
  candidate('food_supplies', 'Market Street', 'San Francisco, California', { feature_type: 'address' }),
  false,
  'Street names that contain grocery words must not pass as grocery/supply POIs.',
);

const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
assert.ok(
  screen.includes('isLiveSmartResupplyPoiCandidate({ category, suggestion, destination })'),
  'Trip Builder live resupply conversion should call the live POI filter before creating candidate stops.',
);

console.log('Trip Builder live resupply POI filter checks passed.');
