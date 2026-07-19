const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
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
  canStartTrailPackGuidance,
  getDefaultECSTrailPacks,
  getDiscoverableTrailPacks,
  getTrailPackSourceLabel,
  isPublicSuggestedTrailheadRoute,
  isPublicSuggestedTrailheadTrailPack,
  trailPackToExpeditionOpportunity,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

const user = { latitude: 38.5733, longitude: -109.5507 };

const defaultPacks = getDefaultECSTrailPacks();
assert(defaultPacks.length >= 4, 'ECS Trail Pack seed catalog should contain discoverable scaffolding');
assert(
  defaultPacks.every((pack) => pack.dataState === 'fixture'),
  'Default ECS Trail Pack seed catalog should be explicitly marked as fixture data',
);
assert(
  defaultPacks.every((pack) => pack.source !== 'partner_source' || pack.reviewStatus !== 'approved'),
  'Partner-source scaffolding must not be discoverable by default',
);
assert(
  defaultPacks.every((pack) => !isPublicSuggestedTrailheadTrailPack(pack)),
  'Fixture Trail Pack scaffolding must never qualify as public Suggested Trailheads',
);
assert.strictEqual(getTrailPackSourceLabel('partner_source'), 'Partner Source');

const discoverable = getDiscoverableTrailPacks(defaultPacks, user, 75);
assert(discoverable.length > 0, 'Approved Trail Packs near the active radius should be returned');
assert(
  discoverable.every((pack) => pack.reviewStatus === 'approved'),
  'Explore discovery should default to approved Trail Packs only',
);
assert(
  discoverable.every((pack) => pack.distanceFromUserMiles <= 75),
  'Trail Packs should respect the selected Explore radius',
);

for (let index = 1; index < discoverable.length; index += 1) {
  const previous = discoverable[index - 1];
  const current = discoverable[index];
  assert(
    previous.confidenceScore >= current.confidenceScore ||
      previous.distanceFromUserMiles <= current.distanceFromUserMiles,
    'Trail Pack sort should prefer confidence before proximity',
  );
}

const approvedWithGeometry = discoverable.find(canStartTrailPackGuidance);
assert(approvedWithGeometry, 'At least one approved Trail Pack should include geometry');
const opportunity = trailPackToExpeditionOpportunity(approvedWithGeometry);
assert.strictEqual(opportunity.id, `trail-pack:${approvedWithGeometry.id}`);
assert.strictEqual(opportunity.matchScore, approvedWithGeometry.confidenceScore);
assert(opportunity.routeGeometry, 'Converted Trail Pack opportunity should carry route geometry for Navigate staging');
assert.strictEqual(
  isPublicSuggestedTrailheadRoute(opportunity),
  false,
  'Fixture-backed Trail Pack opportunities must not pass the public Suggested Trailheads route guard',
);

const elevationAwareOpportunity = trailPackToExpeditionOpportunity({
  ...approvedWithGeometry,
  id: 'elevation-aware-pack',
  difficulty: 'technical',
  routeIntelligence: {
    elevationGainFt: 3200,
    elevationLossFt: 2800,
    terrainRiskScore: 72,
    terrainRiskEvents: ['shelf road exposure', 'steep grade'],
  },
});
assert.strictEqual(
  elevationAwareOpportunity.elevationGainFt,
  3200,
  'Trail Pack opportunity projection should preserve route-profile elevation instead of defaulting to zero.',
);
assert.strictEqual(
  elevationAwareOpportunity.routeMetadata.routeTerrainConfidence.terrainRiskEventCount,
  2,
  'Trail Pack opportunity metadata should carry terrain-risk event context for route-specific confidence.',
);

const liveCatalogPack = {
  ...approvedWithGeometry,
  id: 'live-route-catalog-pack',
  dataState: 'live',
  reviewStatus: 'approved',
  catalogVerification: {
    status: 'normal',
    sourceLabel: 'Official access verified',
    publicRecommendation: true,
    confidenceScore: 92,
    warnings: [],
    blockers: [],
    dataUsed: [],
    lastEvaluatedAt: '2026-06-01T00:00:00.000Z',
  },
};
const oversizedCatalog = [
  {
    ...liveCatalogPack,
    id: 'blocked-before-cap',
    reviewStatus: 'rejected',
    featuredRouteScore: 1_000,
  },
  ...Array.from({ length: 51 }, (_, index) => ({
    ...liveCatalogPack,
    id: `ranked-live-${String(index).padStart(2, '0')}`,
    name: `Ranked live route ${index}`,
    featuredRouteScore: index === 50 ? 100 : 0,
    confidenceScore: 82 + (index % 10),
  })),
  { ...liveCatalogPack, id: 'ranked-live-00', name: 'Duplicate live route' },
];
const cappedDiscoverable = getDiscoverableTrailPacks(oversizedCatalog, user, 75);
assert.strictEqual(cappedDiscoverable.length, 20, 'Application Trail Pack results must never exceed 20 routes.');
assert.strictEqual(new Set(cappedDiscoverable.map((pack) => pack.id)).size, 20, 'Duplicate Trail Packs do not consume result positions.');
assert.strictEqual(cappedDiscoverable[0].id, 'ranked-live-50', 'Ranking must run before the final 20-result slice.');
assert(!cappedDiscoverable.some((pack) => pack.id === 'blocked-before-cap'), 'Review filtering must run before the result cap.');
assert.strictEqual(
  isPublicSuggestedTrailheadTrailPack(liveCatalogPack),
  true,
  'Live approved route-catalog Trail Packs should qualify for public Suggested Trailheads',
);
assert.strictEqual(
  isPublicSuggestedTrailheadRoute(trailPackToExpeditionOpportunity(liveCatalogPack)),
  true,
  'Live approved route-catalog opportunities should pass the public Suggested Trailheads route guard',
);
assert.strictEqual(
  isPublicSuggestedTrailheadRoute({
    ...opportunity,
    id: 'demo-seed-route',
    routeMetadata: {
      geometrySource: 'ecs_demo_full_route_fixture',
      sourceLabel: 'ECS demo suggested-route geometry',
    },
  }),
  false,
  'Demo full-route geometry fixtures must be blocked from public Suggested Trailheads and handoffs',
);

const missingGeometryPack = defaultPacks.find((pack) => pack.id === 'north-georgia-ridge-scout');
assert(missingGeometryPack, 'Missing-geometry fixture should exist');
assert.strictEqual(
  canStartTrailPackGuidance(missingGeometryPack),
  false,
  'Start Guidance should be guarded when Trail Pack geometry is unavailable',
);

const draftPack = defaultPacks.find((pack) => pack.reviewStatus === 'draft');
assert(draftPack, 'Draft Trail Pack fixture should exist');
const withOwnDraft = getDiscoverableTrailPacks(defaultPacks, user, 75, {
  includeOwnDrafts: true,
  ownTrailPackIds: [draftPack.id],
});
assert(
  withOwnDraft.some((pack) => pack.id === draftPack.id),
  'Own draft Trail Packs can be included only through the explicit own-draft path',
);

console.log('Trail Pack domain checks passed');
