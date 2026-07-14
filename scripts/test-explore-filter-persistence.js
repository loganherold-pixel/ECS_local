const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const values = new Map();
let setCount = 0;
let flushCount = 0;

global.__DEV__ = false;

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === './keyValuePersistence' && parent?.filename.endsWith(path.join('lib', 'exploreFilterStateStore.ts'))) {
    return {
      createPersistedKeyValueCache() {
        return {
          get: (key) => values.get(key) ?? null,
          set: (key, value) => {
            setCount += 1;
            values.set(key, value);
          },
          flush: async () => {
            flushCount += 1;
          },
          waitForHydration: async () => {},
        };
      },
    };
  }
  return originalLoad.apply(this, [request, parent, isMain]);
};

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

const store = require(path.join(root, 'lib', 'exploreFilterStateStore.ts'));

(async () => {
  values.set('ecs_explore_filter_state_v1', JSON.stringify({
    radiusMiles: 50,
    refinement: 'dayTrip',
    activeCategoryPanel: 'favorites',
    resultSetSummary: null,
    updatedAt: '2026-07-01T00:00:00.000Z',
  }));
  const migrated = await store.loadExploreFilterStateSnapshot();
  assert.strictEqual(migrated.schemaVersion, 2);
  assert.strictEqual(migrated.refinement, 'dayTrip');
  assert.strictEqual(migrated.activeCategoryPanel, 'favorites');
  const saved = await store.saveExploreFilterStateSnapshot({
    radiusMiles: 250,
    refinement: 'weekendTrip',
    activeCategoryPanel: 'trailPacks',
    resultSetSummary: {
      displayedRouteCount: 12,
      candidateCount: 18,
      skippedMissingGeometryCount: 4,
      cappedCount: 2,
    },
  });
  assert.strictEqual(saved.schemaVersion, 2);
  assert.strictEqual(saved.radiusMiles, 250);
  assert.strictEqual(saved.refinement, 'weekendTrip');
  assert.strictEqual(saved.activeCategoryPanel, 'trailPacks');
  assert(saved.updatedAt);

  await store.saveExploreFilterStateSnapshot({
    radiusMiles: 250,
    refinement: 'weekendTrip',
    activeCategoryPanel: 'trailPacks',
    resultSetSummary: {
      displayedRouteCount: 12,
      candidateCount: 18,
      skippedMissingGeometryCount: 4,
      cappedCount: 2,
    },
  });
  assert.strictEqual(setCount, 1, 'Identical filter state should not trigger another persistence write.');
  assert.strictEqual(flushCount, 1, 'Identical filter state should not trigger another flush.');

  const restored = await store.loadExploreFilterStateSnapshot();
  assert.strictEqual(restored.refinement, 'weekendTrip');
  assert.strictEqual(restored.activeCategoryPanel, 'trailPacks');
  console.log('Explore filter persistence checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
