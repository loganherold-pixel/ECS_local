const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const discoverPath = path.join(root, 'app', '(tabs)', 'discover.tsx');
const catalogPath = path.join(root, 'lib', 'explore', 'routeCatalog.ts');
const readyInventoryPath = path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts');

global.__DEV__ = false;

const discover = fs.readFileSync(discoverPath, 'utf8');
const catalog = fs.readFileSync(catalogPath, 'utf8');
const readyInventory = fs.readFileSync(readyInventoryPath, 'utf8');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
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

const {
  buildExploreGuidanceReadyInventory,
  defaultExploreReadyRouteEligibility,
} = require(path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'));
const {
  deriveExploreLiveConfidence,
} = require(path.join(root, 'lib', 'explore', 'exploreLiveConfidence.ts'));

function makeRoute(id, overrides = {}) {
  return {
    id,
    name: `Remote Ready ${id}`,
    region: 'Regression Range',
    regionGroup: 'great-basin',
    distanceMiles: 42,
    terrainType: 'remote two-track',
    remotenessScore: 8,
    estimatedDays: 1,
    startLat: 38,
    startLng: -110,
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110, 38],
        [-109.95, 38.05],
        [-109.9, 38.1],
      ],
    },
    routeMetadata: {
      routeTypeStatus: 'suggested_trailhead',
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      confidenceScore: 90,
    },
    ...overrides,
  };
}

assert(
  discover.includes('Guidance Ready Routes') &&
    discover.includes('guidanceReadyRouteOptions') &&
    discover.includes('routePassesExploreMapLength') &&
    discover.includes('MIN_DISCOVERY_ROUTE_MILES'),
  'Explore should expose a Guidance Ready route set while preserving the 5+ mile minimum.',
);
assert(
  readyInventory.includes('hasExploreGuidanceReadyGeometry') &&
    readyInventory.includes('normalizeNavigationGuidanceGeometry') &&
    readyInventory.includes('activeGuidance') &&
    readyInventory.includes('routeGeometryMode'),
  'Explore guidance-ready filtering should require shared usable stitched/full route geometry metadata.',
);
assert(
  discover.includes('source-backed') &&
    discover.includes('confidence') &&
    discover.includes('data state'),
  'Explore guidance-ready copy should keep source, confidence, and data-state visibility.',
);
assert(
  catalog.includes("activeGuidance?: ECSTrailPackActiveGuidance") &&
    catalog.includes("routeGeometryMode?: 'full' | 'preview_simplified' | 'omitted'"),
  'Route catalog types should expose active guidance and route geometry mode for guidance-ready filtering.',
);

assert(
  discover.includes('buildExploreGuidanceReadyInventory') &&
    discover.includes('defaultExploreReadyRouteEligibility') &&
    discover.includes('isExploreGuidanceReadyRoute') &&
    discover.includes('exploreGuidanceReadyInventory.refinementCounts') &&
    discover.includes('exploreGuidanceReadyInventory.readyCount') &&
    discover.includes('exploreGuidanceReadyInventory.totalReadyCount'),
  'Discover should drive filter chips, map preview, and Guidance Ready Routes from the shared ready-route eligibility.',
);
assert(
  !discover.includes('function hasGuidanceReadyLineGeometry') &&
    !discover.includes('function hasGuidanceReadyGeometry'),
  'Discover should not keep a looser local guidance-ready geometry gate that can admit preview-only split route geometry.',
);
assert(
  !discover.includes('routes are hidden because') &&
    !discover.includes('were hidden because active-guidance geometry was unavailable') &&
    !discover.includes('geometry was not ready for active guidance') &&
    !discover.includes('ECS will not save, stitch, or navigate those routes from Explore') &&
    !discover.includes('exploreWizardHiddenNotice') &&
    !discover.includes('exploreWizardHiddenText'),
  'Explore should keep hidden/not-ready route diagnostics out of user-facing Guidance Ready copy and containers.',
);
assert(
  !discover.includes('visibleTrailPacks\n        .map((trailPack) => trailPackToExpeditionOpportunity(trailPack))') &&
    !discover.includes('visibleAIRoutes\n          .filter(routePassesExploreMapLength)'),
  'TripBuilder ready counts must not be built from page-sized visible Trail Pack or AI route windows.',
);

const remoteReadyRoutes = Array.from({ length: 9 }, (_, index) => makeRoute(`remote-ready-${index + 1}`));
const previewOnlyRoute = makeRoute('preview-only', {
  routeGeometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [-110, 38],
        [-109.98, 38.02],
      ],
      [
        [-109.9, 38.1],
        [-109.86, 38.14],
      ],
    ],
  },
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'preview_simplified',
  },
});
const activeGuidanceReadySearchPreviewRoute = makeRoute('active-ready-search-preview', {
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.98, 38.02],
      [-109.96, 38.04],
    ],
  },
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'preview_simplified',
    catalogVerification: {
      publicRecommendation: true,
      activeGuidance: {
        status: 'ready',
        topologyResolved: true,
        sourceSegmentCount: 4,
        componentCount: 1,
        branchDetected: false,
        joinedSegmentGapCount: 0,
        disjointSegmentGapCount: 0,
        maxJoinGapMeters: 0,
        maxSegmentGapMeters: 0,
        unavailableReason: null,
      },
    },
  },
});
const shortRoute = makeRoute('too-short', { distanceMiles: 3 });
const privateRoute = makeRoute('private-route', {
  routeMetadata: { routeTypeStatus: 'private', routeGeometryMode: 'full' },
});
const foldedLineRoute = makeRoute('folded-line-route', {
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.95, 38.05],
      [-109.9, 38.1],
      [-109.95, 38.05],
      [-109.85, 38.15],
    ],
  },
  routeMetadata: {
    routeTypeStatus: 'suggested_trailhead',
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready' },
  },
});
const inventory = buildExploreGuidanceReadyInventory({
  trailPacks: remoteReadyRoutes.slice(0, 5),
  hiddenGemRoutes: remoteReadyRoutes.slice(5, 7),
  ecsRouteIdeas: remoteReadyRoutes.slice(7),
  favoriteRoutes: [previewOnlyRoute, shortRoute, privateRoute, foldedLineRoute],
  selectedRefinement: 'remoteness',
});

assert.strictEqual(
  inventory.refinementCounts.remoteness,
  9,
  'Remoteness chip count should equal the guidance-ready filtered route count.',
);
assert.strictEqual(
  inventory.candidateSet.candidates.length,
  9,
  'Guidance Ready Routes count should use the same ready inventory as the active refinement count.',
);
assert.strictEqual(inventory.readyCount, 9, 'Ready count should ignore pagination-sized source windows.');
assert.strictEqual(inventory.hiddenTotal, 4, 'Routes hidden for geometry/public/length gates should be tracked separately.');
assert.strictEqual(
  defaultExploreReadyRouteEligibility(previewOnlyRoute).eligible,
  false,
  'Preview-only split geometry must not be treated as active-guidance-ready.',
);
assert.strictEqual(
  defaultExploreReadyRouteEligibility(activeGuidanceReadySearchPreviewRoute).eligible,
  true,
  'Source-backed search-preview geometry should stay eligible when catalog active-guidance metadata says the full route is ready and detail hydration will supply it before navigation.',
);
assert.strictEqual(
  defaultExploreReadyRouteEligibility(foldedLineRoute).eligible,
  false,
  'Folded LineString geometry must not count as guidance-ready even when stale metadata claims full ready geometry.',
);

const unselectedInventory = buildExploreGuidanceReadyInventory({
  trailPacks: remoteReadyRoutes,
  selectedRefinement: null,
});
assert.strictEqual(
  unselectedInventory.totalReadyCount,
  remoteReadyRoutes.length,
  'Range-only inventory should still count guidance-ready routes for refinement badges.',
);
assert.strictEqual(
  unselectedInventory.refinementCounts.remoteness,
  remoteReadyRoutes.length,
  'Range-only refinement counts should be available before a refinement is selected.',
);
assert.strictEqual(
  unselectedInventory.candidateSet.candidates.length,
  0,
  'Explorer should not build or render route cards until the user selects a refinement bucket.',
);
assert.strictEqual(
  unselectedInventory.readyCount,
  0,
  'The selected ready count should remain zero until a refinement bucket is active.',
);

const performanceRoutes = Array.from({ length: 18 }, (_, index) => makeRoute(`perf-ready-${index + 1}`));
let performanceEligibilityCalls = 0;
const performanceInventory = buildExploreGuidanceReadyInventory({
  trailPacks: performanceRoutes,
  selectedRefinement: 'remoteness',
  isRouteEligible: (route) => {
    performanceEligibilityCalls += 1;
    return defaultExploreReadyRouteEligibility(route);
  },
});
assert.strictEqual(
  performanceInventory.refinementCounts.remoteness,
  performanceRoutes.length,
  'Remoteness refinement badges should still count every ready route in the selected radius.',
);
assert.strictEqual(
  performanceInventory.readyCount,
  performanceRoutes.length,
  'Guidance Ready Routes should stay in parity with the selected refinement after the inventory is optimized.',
);
assert.strictEqual(
  performanceEligibilityCalls,
  performanceRoutes.length,
  'Explore inventory should evaluate ready-route eligibility once per loaded route and reuse it for total/refinement counts.',
);

const sameSourceHighGeometryRoute = makeRoute('same-source-rich-geometry', {
  distanceMiles: 24,
  terrainDifficulty: 4,
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.99, 38.01],
      [-109.98, 38.02],
      [-109.97, 38.03],
      [-109.96, 38.04],
      [-109.95, 38.05],
      [-109.94, 38.06],
      [-109.93, 38.07],
      [-109.92, 38.08],
      [-109.91, 38.09],
    ],
  },
  routeMetadata: {
    routeGeometryMode: 'full',
    activeGuidance: {
      status: 'ready',
      topologyResolved: true,
      sourceSegmentCount: 10,
      componentCount: 1,
      branchDetected: false,
      joinedSegmentGapCount: 0,
      disjointSegmentGapCount: 0,
    },
    catalogVerification: {
      confidenceScore: 92,
      publicRecommendation: true,
      warnings: [],
      blockers: [],
      dataUsed: [
        { label: 'Official route geometry', freshness: 'fresh' },
        { label: 'Recent completion signal', freshness: 'fresh' },
      ],
      currentCondition: {
        status: 'clear',
        activeClosureCount: 0,
        warnings: [],
        blockers: [],
      },
    },
  },
});

const sameSourceSparseContextRoute = makeRoute('same-source-sparse-context', {
  distanceMiles: 92,
  terrainDifficulty: 8,
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.4, 38.6],
      [-108.8, 39.2],
    ],
  },
  routeMetadata: {
    routeGeometryMode: 'full',
    activeGuidance: {
      status: 'ready',
      topologyResolved: false,
      sourceSegmentCount: 3,
      componentCount: 1,
      branchDetected: false,
      joinedSegmentGapCount: 1,
      disjointSegmentGapCount: 0,
      maxJoinGapMeters: 42,
    },
    catalogVerification: {
      confidenceScore: 92,
      publicRecommendation: true,
      warnings: ['Sparse route geometry needs field review'],
      blockers: [],
      dataUsed: [
        { label: 'Official route geometry', freshness: 'aging' },
      ],
      currentCondition: {
        status: 'watch',
        activeClosureCount: 0,
        warnings: ['Seasonal condition requires review'],
        blockers: [],
      },
    },
  },
});

const richGeometryConfidence = deriveExploreLiveConfidence(sameSourceHighGeometryRoute);
const sparseContextConfidence = deriveExploreLiveConfidence(sameSourceSparseContextRoute);

assert.notStrictEqual(
  richGeometryConfidence.score,
  sparseContextConfidence.score,
  'Routes with the same source confidence must still render independent live scores from geometry/readiness/support criteria.',
);
assert(
  richGeometryConfidence.score > sparseContextConfidence.score,
  'Richer route geometry and cleaner verification support should score above sparse aging route context.',
);

const flatTerrainConfidence = deriveExploreLiveConfidence(makeRoute('same-source-flat-terrain', {
  distanceMiles: 18,
  terrainDifficulty: 3,
  remotenessScore: 4,
  elevationGainFt: 120,
  routeMetadata: {
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready', topologyResolved: true },
    elevationGainFt: 120,
    routeTerrainConfidence: {
      elevationGainFt: 120,
      terrainRiskScore: 8,
      terrainRiskEventCount: 0,
    },
    catalogVerification: {
      confidenceScore: 92,
      publicRecommendation: true,
      warnings: [],
      blockers: [],
      dataUsed: [{ label: 'Official route geometry', freshness: 'fresh' }],
      currentCondition: { status: 'clear', activeClosureCount: 0, warnings: [], blockers: [] },
    },
  },
}));
const mountainTerrainConfidence = deriveExploreLiveConfidence(makeRoute('same-source-mountain-terrain', {
  distanceMiles: 18,
  terrainDifficulty: 7,
  remotenessScore: 8,
  elevationGainFt: 3200,
  routeMetadata: {
    routeGeometryMode: 'full',
    activeGuidance: { status: 'ready', topologyResolved: true },
    elevationGainFt: 3200,
    routeTerrainConfidence: {
      elevationGainFt: 3200,
      elevationLossFt: 2800,
      terrainRiskScore: 78,
      terrainRiskEvents: ['shelf road exposure', 'steep grade', 'recovery obstacle'],
    },
    catalogVerification: {
      confidenceScore: 92,
      publicRecommendation: true,
      warnings: [],
      blockers: [],
      dataUsed: [{ label: 'Official route geometry', freshness: 'fresh' }],
      currentCondition: { status: 'clear', activeClosureCount: 0, warnings: [], blockers: [] },
    },
  },
}));

assert(
  flatTerrainConfidence.score > mountainTerrainConfidence.score,
  'Same-source Explore confidence should drop for high elevation gain and terrain-risk events.',
);
assert(
  flatTerrainConfidence.score - mountainTerrainConfidence.score >= 8,
  'Explore preview confidence should not display the same 92 for flat and 3,000 ft riskier route profiles.',
);

console.log('Explore guidance-ready routes checks passed.');
