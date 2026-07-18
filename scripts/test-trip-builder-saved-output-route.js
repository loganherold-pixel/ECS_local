const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const storage = new Map();
global.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
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

const { routeStore } = require(path.join(root, 'lib', 'routeStore.ts'));
storage.clear();

const first = routeStore.createCustomRoute([{
  coordinates: [[-121.5, 39], [-121.45, 39.1], [-121.4, 39.2]],
}], {
  name: 'Trip plan',
  sourceApp: 'ecs_trip_builder',
  externalSourceId: 'plan-1',
  externalSourceType: 'trip_plan',
  idempotencyKey: 'trip-builder:plan-1',
  updateExisting: true,
  waypoints: [
    { lat: 39, lon: -121.5, ele: null, name: 'Trip origin', time: null },
    { lat: 39.1, lon: -121.45, ele: null, name: 'Fuel', time: null, waypointType: 'fuel' },
    { lat: 39.2, lon: -121.4, ele: null, name: 'Trailhead', time: null, waypointType: 'trailhead' },
  ],
});

const reordered = routeStore.createCustomRoute([{
  coordinates: [[-121.5, 39], [-121.47, 39.08], [-121.45, 39.1], [-121.4, 39.2]],
}], {
  name: 'Trip plan',
  sourceApp: 'ecs_trip_builder',
  externalSourceId: 'plan-1',
  externalSourceType: 'trip_plan',
  idempotencyKey: 'trip-builder:plan-1',
  updateExisting: true,
  waypoints: [
    { lat: 39, lon: -121.5, ele: null, name: 'Trip origin', time: null },
    { lat: 39.08, lon: -121.47, ele: null, name: 'Groceries', time: null, waypointType: 'fuel' },
    { lat: 39.1, lon: -121.45, ele: null, name: 'Fuel', time: null, waypointType: 'fuel' },
    { lat: 39.2, lon: -121.4, ele: null, name: 'Trailhead', time: null, waypointType: 'trailhead' },
  ],
});

assert.strictEqual(reordered.id, first.id, 'A repeat save should refresh the existing Trip Builder route identity.');
assert.strictEqual(routeStore.getAll().length, 1, 'A repeat save must not create a duplicate route.');
assert.strictEqual(reordered.segments[0].points.length, 4, 'The saved geometry should reflect the latest itinerary order.');
assert.deepStrictEqual(
  reordered.waypoints.map((point) => point.name),
  ['Trip origin', 'Groceries', 'Fuel', 'Trailhead'],
  'The saved route should retain named ordered guidance checkpoints.',
);

const rapidRepeat = routeStore.createCustomRoute([{
  coordinates: [[-121.5, 39], [-121.47, 39.08], [-121.45, 39.1], [-121.4, 39.2]],
}], {
  name: 'Trip plan',
  sourceApp: 'ecs_trip_builder',
  externalSourceId: 'plan-1',
  externalSourceType: 'trip_plan',
  idempotencyKey: 'trip-builder:plan-1',
  updateExisting: true,
  waypoints: reordered.waypoints,
});
assert.strictEqual(rapidRepeat.id, first.id);
assert.strictEqual(routeStore.getAll().length, 1);

routeStore.setActive(first.id);
assert.throws(
  () => routeStore.createCustomRoute([{
    coordinates: [[-121.5, 39], [-121.3, 39.25]],
  }], {
    name: 'Trip plan',
    sourceApp: 'ecs_trip_builder',
    externalSourceId: 'plan-1',
    externalSourceType: 'trip_plan',
    idempotencyKey: 'trip-builder:plan-1',
    updateExisting: true,
    waypoints: reordered.waypoints,
  }),
  /end active guidance/i,
  'A repeat save must not replace geometry underneath an active guidance session.',
);

console.log('Trip Builder saved route refresh behavioral checks passed.');
