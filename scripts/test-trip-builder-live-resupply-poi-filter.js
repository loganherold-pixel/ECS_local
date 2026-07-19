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
  classifyLiveSmartResupplyPoiCandidate,
  isLiveSmartResupplyPoiCandidate,
} = require(path.join(root, 'lib', 'tripBuilder', 'liveSmartResupplyPoiFilter.ts'));
const {
  interleaveApproachSearchResults,
} = require(path.join(root, 'lib', 'tripBuilder', 'approachResupplyPlanner.ts'));

function candidate(category, title, subtitle = '', raw = {}) {
  return isLiveSmartResupplyPoiCandidate({
    category,
    suggestion: { title, subtitle, raw },
    destination: { title, subtitle, raw },
  });
}

function classification(title, subtitle = '', raw = {}) {
  return classifyLiveSmartResupplyPoiCandidate({
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
  candidate('fuel', 'Remote Service Plaza', 'Approach corridor', { feature_type: 'poi', poi_category_ids: ['gas_station'] }),
  true,
  'Mapbox underscore-separated gas-station category ids should normalize into an eligible fuel POI signal.',
);

assert.strictEqual(
  candidate('food_supplies', 'City Market', 'Gunnison, Colorado', { poi_category: ['grocery', 'supermarket'] }),
  true,
  'Actual grocery/supply POIs should remain eligible.',
);
assert.strictEqual(
  candidate('food_supplies', 'Approach Provisions', 'Nearest town', { feature_type: 'poi', poi_category_ids: ['grocery_store'] }),
  true,
  'Mapbox underscore-separated grocery category ids should normalize into an eligible supply POI signal.',
);

assert.strictEqual(
  candidate('food_supplies', 'Market Street', 'San Francisco, California', { feature_type: 'address' }),
  false,
  'Street names that contain grocery words must not pass as grocery/supply POIs.',
);

assert.deepStrictEqual(
  classification('Last Chance Fuel and Market', 'Approach corridor', {
    feature_type: 'poi',
    poi_category_ids: ['gas_station', 'grocery_store'],
  }),
  {
    categoryCoverage: ['fuel', 'food_supplies'],
    usefulness: 'combined',
    convenienceOnly: false,
  },
  'Provider evidence for fuel plus groceries should produce one combined resupply classification.',
);

assert.deepStrictEqual(
  classification('Roadside Mini Mart', 'Approach corridor', {
    feature_type: 'poi',
    poi_category_ids: ['convenience_store'],
  }),
  {
    categoryCoverage: ['food_supplies'],
    usefulness: 'convenience_only',
    convenienceOnly: true,
  },
  'A meaningful convenience store should remain a weaker supply-only match, not become fuel by implication.',
);

assert.deepStrictEqual(
  classification('Remote General Store', 'Last town', {
    feature_type: 'poi',
    poi_category_ids: ['general_store'],
  }),
  {
    categoryCoverage: ['food_supplies'],
    usefulness: 'category_specific',
    convenienceOnly: false,
  },
  'General stores should count as category-specific supply locations.',
);

assert.deepStrictEqual(
  classification('Fuel Stop Mini Mart', 'Approach corridor', {
    feature_type: 'poi',
    poi_category_ids: ['gas_station', 'convenience_store'],
  }),
  {
    categoryCoverage: ['fuel', 'food_supplies'],
    usefulness: 'convenience_only',
    convenienceOnly: true,
  },
  'Fuel with convenience-only supplies should expose both categories while retaining its weaker usefulness tier.',
);

[
  ['Trailhead Market Cafe', { feature_type: 'poi', poi_category_ids: ['restaurant'] }, 'restaurants'],
  ['General Store Hotel', { feature_type: 'poi', poi_category_ids: ['hotel'] }, 'lodging'],
  ['Fuel Trailhead Information', { feature_type: 'poi', poi_category_ids: ['trailhead'] }, 'trail facilities'],
  ['Market Parking Lot', { feature_type: 'poi', poi_category_ids: ['parking_lot'] }, 'parking'],
  ['City Market Apparel', { feature_type: 'poi', poi_category_ids: ['clothing_store'] }, 'unrelated retail'],
].forEach(([title, raw, label]) => {
  assert.strictEqual(
    classification(title, 'Approach corridor', raw),
    null,
    `Provider-classified ${label} must not pass because its name contains resupply terms.`,
  );
});

assert.strictEqual(
  candidate('fuel', 'Shell Recharge', 'Approach corridor', {
    feature_type: 'poi',
    poi_category_ids: ['ev_charging_station'],
  }),
  false,
  'EV charging must not be presented as fuel based on a fuel-brand name.',
);

assert.deepStrictEqual(
  classification('Market EV Charging', 'Approach corridor', {
    feature_type: 'poi',
    poi_category_ids: ['grocery_store', 'ev_charging_station'],
  }),
  {
    categoryCoverage: ['food_supplies'],
    usefulness: 'category_specific',
    convenienceOnly: false,
  },
  'A grocery with EV charging may remain a supply option but must not gain fuel coverage.',
);

const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
const routeContextMapboxAdapter = fs.readFileSync(
  path.join(root, 'lib', 'tripBuilder', 'mapboxRouteContextAdapters.ts'),
  'utf8',
);
assert.ok(
  screen.includes('classifyLiveSmartResupplyPoiCandidate({ suggestion, destination })'),
  'Trip Builder live resupply conversion should classify provider evidence before creating candidate stops.',
);
assert.ok(
  routeContextMapboxAdapter.includes('classifyLiveSmartResupplyPoiCandidate({') &&
    routeContextMapboxAdapter.includes('smartResupplyClassification?.categoryCoverage.includes(smartResupplyCategory)'),
  'The Mapbox Route Context adapter must apply the same hard POI category gate as direct Smart Resupply discovery.',
);
assert.ok(
  JSON.stringify(interleaveApproachSearchResults([[1, 2, 3], [4], [5, 6]]).slice(0, 4)) === JSON.stringify([1, 4, 5, 2]),
  'Provider detail retrieval should represent multiple approach anchors before consuming one anchor backlog.',
);

console.log('Trip Builder live resupply POI filter checks passed.');
