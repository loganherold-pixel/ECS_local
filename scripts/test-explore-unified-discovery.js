const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
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

const {
  normalizeExploreDiscoveryItems,
  routeWithExploreDiscoveryProvenance,
} = require(path.join(root, 'lib', 'explore', 'exploreDiscoveryItem.ts'));
const {
  getExploreWizardSourceLabel,
  normalizeExploreWizardRouteCandidates,
} = require(path.join(root, 'lib', 'explore', 'exploreTripBuilderWizard.ts'));

function route(id, source, overrides = {}) {
  return {
    id,
    name: 'Rubicon Trail',
    region: 'Sierra Nevada',
    regionGroup: 'sierra-nevada',
    distanceMiles: 21,
    terrainType: 'technical trail',
    remotenessScore: 8,
    estimatedFuelRequired: 4,
    suggestedCamps: 1,
    description: 'Source-aware route fixture.',
    highlights: ['Source-backed'],
    elevationGainFt: 3200,
    estimatedDays: 1,
    bestSeason: 'Verify locally',
    permitRequired: false,
    imageTag: 'trail-pack',
    startLat: 39.006,
    startLng: -120.315,
    rigCompatibility: 90,
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-120.315, 39.006],
        [-120.25, 39.03],
        [-120.1, 39.06],
      ],
    },
    routeMetadata: {
      source,
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      legalAccessStatus: 'verified',
      vehicleFitStatus: 'compatible',
      confidenceScore: 94,
      sourceFingerprint: 'rubicon-geometry-v1',
      catalogVerification: {
        publicRecommendation: true,
        confidenceScore: 94,
        activeGuidance: { status: 'ready' },
        currentCondition: {
          status: 'clear',
          currentlyOpenStatus: 'no_known_closure',
          activeClosureCount: 0,
        },
      },
      providerToken: 'must-not-enter-sanitized-source-descriptors',
    },
    ...overrides,
  };
}

const official = route('trail-pack:rubicon-trail', 'trail_pack', {
  routeMetadata: {
    ...route('x', 'trail_pack').routeMetadata,
    trailPackId: 'rubicon-trail',
    trailPackSource: 'ecs_validated',
    trailPackSourceLabel: 'ECS validated route catalog',
    reviewStatus: 'approved',
    trailPackDataState: 'live',
  },
});
const hiddenGem = route('hidden-rubicon', 'hidden_gem', {
  routeMetadata: {
    ...route('x', 'hidden_gem').routeMetadata,
    legalAccessStatus: undefined,
  },
});
const aiIdea = route('ai-rubicon', 'ecs_idea', {
  isAIGenerated: true,
  confidence: 'explore',
  suggestedLabel: 'AI Suggested',
  generatedAt: '2026-07-12T12:00:00.000Z',
  routeMetadata: {
    ...route('x', 'ecs_idea').routeMetadata,
    legalAccessStatus: undefined,
    vehicleFitStatus: undefined,
    catalogVerification: {
      publicRecommendation: true,
      activeGuidance: { status: 'ready' },
    },
  },
});
const favorite = route('favorite:rubicon-trail', 'saved_built', {
  routeMetadata: {
    ...route('x', 'saved_built').routeMetadata,
    identityKey: 'catalog:rubicon-trail',
    externalSourceId: 'trail-pack:rubicon-trail',
    legalAccessStatus: undefined,
  },
});
const importedConflict = route('route:rubicon-import', 'imported_stitched', {
  rigCompatibility: 20,
  routeMetadata: {
    ...route('x', 'imported_stitched').routeMetadata,
    identityKey: 'catalog:rubicon-trail',
    sourceFingerprint: 'rubicon-geometry-v2',
    legalAccessStatus: undefined,
    vehicleFitStatus: 'incompatible',
    catalogVerification: {
      publicRecommendation: true,
      activeGuidance: { status: 'ready' },
      currentCondition: {
        status: 'blocked',
        currentlyOpenStatus: 'closed',
        activeClosureCount: 1,
      },
    },
  },
});

const sourceInputs = [
  { route: official, sourceKind: 'trail_pack' },
  { route: hiddenGem, sourceKind: 'hidden_gem' },
  { route: aiIdea, sourceKind: 'ecs_idea' },
  { route: favorite, sourceKind: 'saved_built' },
  { route: importedConflict, sourceKind: 'imported_stitched' },
];
const normalized = normalizeExploreDiscoveryItems(sourceInputs);
assert.strictEqual(normalized.length, 1, 'Cross-source aliases should produce one canonical discovery item.');
assert.strictEqual(normalized[0].primarySource.sourceKind, 'trail_pack');
assert.strictEqual(normalized[0].primarySource.generated, false);
assert(normalized[0].sources.some((source) => source.sourceKind === 'ecs_idea' && source.generated));
assert.strictEqual(normalized[0].dimensions.legalAccess, 'verified');
assert.strictEqual(normalized[0].dimensions.currentConditions, 'watch');
assert.strictEqual(normalized[0].dimensions.vehicleFit, 'caution');
assert(normalized[0].conflicts.some((conflict) => conflict.code === 'current_condition_conflict'));
assert(normalized[0].conflicts.some((conflict) => conflict.code === 'vehicle_fit_conflict'));
assert(normalized[0].conflicts.some((conflict) => conflict.code === 'geometry_provenance_conflict'));
assert(
  !JSON.stringify(normalized[0].sources).includes('must-not-enter-sanitized-source-descriptors'),
  'Normalized source descriptors must not copy arbitrary provider metadata.',
);
const sameStartDifferentVariant = route('ai-rubicon-long-variant', 'ecs_idea', {
  distanceMiles: 38,
  routeMetadata: {
    ...route('x', 'ecs_idea').routeMetadata,
    sourceFingerprint: undefined,
    legalAccessStatus: undefined,
  },
});
assert.strictEqual(
  normalizeExploreDiscoveryItems([
    { route: official, sourceKind: 'trail_pack' },
    { route: sameStartDifferentVariant, sourceKind: 'ecs_idea' },
  ]).length,
  2,
  'Same-name routes sharing a trailhead should remain separate when route distance indicates a different variant.',
);

const routeWithProvenance = routeWithExploreDiscoveryProvenance(normalized[0]);
assert.strictEqual(routeWithProvenance.routeMetadata.identityKey, normalized[0].canonicalKey);
assert.strictEqual(routeWithProvenance.routeMetadata.discoverySources.length, 5);
assert.deepStrictEqual(
  routeWithProvenance.routeMetadata.discoveryConflictCodes.sort(),
  ['current_condition_conflict', 'geometry_provenance_conflict', 'vehicle_fit_conflict'],
);

const candidateSet = normalizeExploreWizardRouteCandidates({
  trailPacks: [official],
  hiddenGemRoutes: [hiddenGem],
  ecsRouteIdeas: [aiIdea],
  favoriteRoutes: [favorite],
  savedRouteAssets: [importedConflict],
});
assert.strictEqual(candidateSet.candidates.length, 1, 'The shared card inventory should render one canonical route.');
assert.strictEqual(candidateSet.candidates[0].sourceKind, 'trail_pack');
assert.strictEqual(candidateSet.candidates[0].route.routeMetadata.discoverySources.length, 5);
assert.strictEqual(getExploreWizardSourceLabel('ecs_idea'), 'AI Route Idea');

console.log(JSON.stringify({
  metric: 'explore_cross_source_candidate_cards',
  before: sourceInputs.length,
  after: candidateSet.candidates.length,
  reductionPercent: 80,
}));
console.log('Explore unified discovery checks passed.');
