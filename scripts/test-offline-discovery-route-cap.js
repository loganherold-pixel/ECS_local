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

const storePath = path.join(root, 'lib', 'offlineExpeditionDbStore.ts');
const bridgePath = path.join(root, 'lib', 'offlineDiscoveryBridge.ts');
const trailEntries = Array.from({ length: 51 }, (_, index) => ({
  id: `offline-route-${String(index).padStart(2, '0')}`,
  category: 'trails',
  name: `Offline route ${index}`,
  latitude: 39,
  longitude: -120,
  description: 'Privacy-safe offline route fixture',
  difficulty_rating: 3,
  trail_distance_mi: index === 50 ? 30 : 10,
  elevation_gain_ft: index === 50 ? 2500 : 500,
  terrain_type: 'Mixed',
  tags: [],
  source: 'offline-test',
}));
trailEntries.push({ ...trailEntries[0], name: 'Duplicate offline route' });
trailEntries.unshift({ id: 'invalid', category: 'trails', name: 'Invalid route' });

const mockStore = {
  isInitialized: () => true,
  evaluateReadiness: () => ({ has_offline_data: true }),
  coversPosition: () => true,
  query: (query) => ({
    entries: query.category === 'trails' ? trailEntries : [],
    source_regions: ['privacy-safe-test-region'],
  }),
};
require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: { offlineExpeditionDbStore: mockStore },
};

const { offlineDiscoveryBridge } = require(bridgePath);
const result = offlineDiscoveryBridge.queryForDiscovery(39, -120, 500);

assert.strictEqual(result.trails.length, 20, 'Offline search snapshots must contain exactly the top 20 routes.');
assert.strictEqual(new Set(result.trails.map((trail) => trail.id)).size, 20, 'Offline duplicates cannot consume result positions.');
assert.strictEqual(result.trails[0].id, 'offline-route-50', 'Offline ranking must run before the final route slice.');
assert(
  result.status_message.startsWith('Showing the 20 best matches.'),
  'Offline overflow should use the truthful shared result-cap notice.',
);

console.log('Offline discovery route-cap checks passed.');
