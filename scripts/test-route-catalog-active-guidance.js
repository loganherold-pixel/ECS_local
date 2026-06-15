const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const storage = new Map();

global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' }, StyleSheet: { create: (value) => value } };
  }
  if (request === 'expo-secure-store') {
    return {
      async getItemAsync(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      async setItemAsync(key, value) {
        storage.set(key, String(value));
      },
      async deleteItemAsync(key) {
        storage.delete(key);
      },
    };
  }
  if (request.endsWith('/discoverEngine') || request.endsWith('\\discoverEngine') || request === '../discoverEngine') {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const {
  buildExploreNavigationPayload,
  classifyNavigationHandoff,
} = require(path.join(root, 'lib', 'navigationHandoffStore.ts'));

function makeCatalogRoute(overrides = {}) {
  return {
    id: 'trail-pack:usfs-mvum-tahoe-road-001',
    name: 'USFS MVUM Tahoe Road 001',
    region: 'Tahoe National Forest',
    regionGroup: 'sierra-nevada',
    distanceMiles: 4.2,
    terrainType: 'Forest road',
    remotenessScore: 6,
    estimatedFuelRequired: 1,
    suggestedCamps: 0,
    rigCompatibility: 92,
    difficultyRating: 'MODERATE',
    description: 'Verified aggregate route from official source segments.',
    highlights: ['Official access verified'],
    elevationGainFt: 0,
    estimatedDays: 1,
    bestSeason: 'Verify locally',
    permitRequired: false,
    imageTag: 'trail-pack',
    startLat: 39,
    startLng: -120,
    routeMetadata: {
      source: 'trail_pack',
      trailPackId: 'usfs-mvum-tahoe-road-001',
      trailPackSource: 'ecs_validated',
      catalogVerification: {
        sourceLabel: 'Official access verified',
        confidenceScore: 92,
      },
    },
    ...overrides,
  };
}

const connectedAggregate = buildExploreNavigationPayload(
  makeCatalogRoute({
    routeGeometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [-120, 39],
          [-120.001, 39.001],
        ],
        [
          [-120.001, 39.001],
          [-120.002, 39.002],
        ],
      ],
    },
  }),
);

assert.strictEqual(
  classifyNavigationHandoff(connectedAggregate),
  'hybrid',
  'Connected catalog MultiLineString geometry should classify as hybrid guidance when an access coordinate is present.',
);
assert.strictEqual(
  connectedAggregate.trailGeometry.length,
  3,
  'Connected aggregate source segments should flatten into one active guidance line without duplicate join points.',
);
assert.strictEqual(
  connectedAggregate.trailGeometrySegments.length,
  2,
  'Connected aggregate source segments should remain available for preview/source transparency.',
);
assert.strictEqual(
  connectedAggregate.routeMetadata.activeGuidanceStatus,
  'ready',
  'Connected aggregate geometry should be active-guidance-ready.',
);

const topologyResolvedAggregate = buildExploreNavigationPayload(
  makeCatalogRoute({
    id: 'trail-pack:usfs-mvum-tahoe-road-topology',
    name: 'USFS MVUM Tahoe Road Topology',
    startLat: 39,
    startLng: -120,
    routeGeometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [-120.002, 39.002],
          [-120.001, 39.001],
        ],
        [
          [-120, 39],
          [-120.001, 39.001],
        ],
      ],
    },
  }),
);

assert.strictEqual(
  topologyResolvedAggregate.trailGeometry.length,
  3,
  'Out-of-order aggregate source segments should topology-resolve into one active guidance line.',
);
assert.deepStrictEqual(
  topologyResolvedAggregate.trailGeometry.map((point) => [
    Number(point.lng.toFixed(3)),
    Number(point.lat.toFixed(3)),
  ]),
  [
    [-120, 39],
    [-120.001, 39.001],
    [-120.002, 39.002],
  ],
  'Topology-resolved aggregate geometry should start at the known route start and orient reversed segments safely.',
);
assert.strictEqual(
  topologyResolvedAggregate.routeMetadata.activeGuidanceTopologyResolved,
  true,
  'Topology-resolved aggregate geometry should expose the deterministic topology-resolution marker.',
);
assert.strictEqual(
  topologyResolvedAggregate.routeMetadata.activeGuidanceStatus,
  'ready',
  'Topology-resolved aggregate geometry should be active-guidance-ready.',
);

const disconnectedAggregate = buildExploreNavigationPayload(
  makeCatalogRoute({
    id: 'trail-pack:usfs-mvum-tahoe-road-disjoint',
    name: 'USFS MVUM Tahoe Road Disjoint',
    routeGeometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [-120, 39],
          [-120.001, 39.001],
        ],
        [
          [-121, 40],
          [-121.001, 40.001],
        ],
      ],
    },
  }),
);

assert.strictEqual(
  classifyNavigationHandoff(disconnectedAggregate),
  'hybrid',
  'Disconnected aggregate source geometry should still classify as a hybrid route preview when an access coordinate is present.',
);
assert.strictEqual(
  disconnectedAggregate.trailGeometry.length,
  0,
  'Disconnected aggregate source segments must not be flattened into an active guidance line.',
);
assert.strictEqual(
  disconnectedAggregate.trailGeometrySegments.length,
  2,
  'Disconnected aggregate routes should preserve source-backed preview segments.',
);
assert.strictEqual(
  disconnectedAggregate.routeMetadata.activeGuidanceStatus,
  'preview_only',
  'Disconnected aggregate routes should be marked preview-only for active guidance.',
);
assert(
  String(disconnectedAggregate.routeMetadata.activeGuidanceUnavailableReason).includes(
    'disconnected official source segments',
  ),
  'Preview-only aggregate routes should explain that active guidance is blocked by disconnected source segments.',
);

const branchingAggregate = buildExploreNavigationPayload(
  makeCatalogRoute({
    id: 'trail-pack:usfs-mvum-tahoe-road-branching',
    name: 'USFS MVUM Tahoe Branching Road',
    routeGeometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [-120, 39],
          [-120.001, 39.001],
        ],
        [
          [-120.001, 39.001],
          [-120.002, 39.002],
        ],
        [
          [-120.001, 39.001],
          [-120.003, 39],
        ],
      ],
    },
  }),
);

assert.strictEqual(
  branchingAggregate.routeMetadata.activeGuidanceStatus,
  'preview_only',
  'Branching aggregate source networks should remain preview-only until a curated route path is selected.',
);
assert.strictEqual(
  branchingAggregate.trailGeometry.length,
  0,
  'Branching aggregate source networks should not be flattened into active guidance geometry.',
);

const revisitingLineString = buildExploreNavigationPayload(
  makeCatalogRoute({
    id: 'trail-pack:usfs-mvum-tahoe-road-revisit',
    name: 'USFS MVUM Tahoe Road Revisit',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-120, 39],
        [-120.001, 39.001],
        [-120.002, 39.002],
        [-120.001, 39.001],
        [-120.003, 39.003],
      ],
    },
  }),
);

assert.strictEqual(
  revisitingLineString.routeMetadata.activeGuidanceStatus,
  'preview_only',
  'Single LineString routes that revisit an interior junction should stay preview-only until curated into one point-to-point spine.',
);
assert.strictEqual(
  revisitingLineString.trailGeometry.length,
  0,
  'Revisiting LineString routes must not stage a looping or branching trail line for active guidance.',
);
assert.strictEqual(
  revisitingLineString.trailGeometrySegments.length,
  1,
  'Revisiting LineString routes should keep their source-backed preview segment available for map display.',
);
assert(
  String(revisitingLineString.routeMetadata.activeGuidanceUnavailableReason).includes('revisits'),
  'Preview-only revisiting LineString routes should explain that the source line revisits the same corridor or junction.',
);

const declaredLoopLineString = buildExploreNavigationPayload(
  makeCatalogRoute({
    id: 'trail-pack:usfs-mvum-tahoe-loop-road',
    name: 'USFS MVUM Tahoe Loop Road',
    routeMetadata: {
      source: 'trail_pack',
      trailPackId: 'usfs-mvum-tahoe-loop-road',
      trailPackRouteType: 'loop',
      catalogVerification: {
        sourceLabel: 'Official loop verified',
        confidenceScore: 93,
      },
    },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-120, 39],
        [-120.001, 39.001],
        [-120.002, 39],
        [-120, 39],
      ],
    },
  }),
);

assert.strictEqual(
  declaredLoopLineString.routeMetadata.activeGuidanceStatus,
  'ready',
  'Explicitly labeled loop routes should remain active-guidance-ready when the only revisit is the closing endpoint.',
);
assert.strictEqual(
  declaredLoopLineString.trailGeometry.length,
  4,
  'Declared loop routes should preserve their closing route geometry for guidance staging.',
);

const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
assert(
  navigateSource.includes('getNavigationHandoffActiveGuidanceUnavailableReason') &&
    navigateSource.includes('activeGuidanceUnavailableReason') &&
    navigateSource.includes('trailGeometrySegments'),
  'Navigate should consume active guidance readiness metadata and source segment preview geometry.',
);
assert(
  navigateSource.includes("showToast('ROUTE PREVIEW ONLY - ACTIVE GUIDANCE NEEDS CONTINUOUS GEOMETRY')"),
  'Navigate auto-start should block preview-only aggregate routes instead of starting active trail guidance.',
);

console.log('Route catalog active guidance checks passed');
