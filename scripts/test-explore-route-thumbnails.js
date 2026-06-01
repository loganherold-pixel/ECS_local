/* global __dirname */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

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

const thumbnails = require(path.join(root, 'lib', 'exploreTrailThumbnails.ts'));
const thumbnailSource = fs.readFileSync(path.join(root, 'lib', 'exploreTrailThumbnails.ts'), 'utf8');
const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const enrichedCardSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'EnrichedRouteCard.tsx'),
  'utf8',
);
const aiRouteCardSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'AIRouteCard.tsx'),
  'utf8',
);
const trailPackCardSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'TrailPackCard.tsx'),
  'utf8',
);

function getLiteralValue(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function extractSeedRoutes() {
  const source = fs.readFileSync(path.join(root, 'lib', 'discoverEngine.ts'), 'utf8');
  const sourceFile = ts.createSourceFile('discoverEngine.ts', source, ts.ScriptTarget.Latest, true);
  let seedArray = null;

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'SEED_OPPORTUNITIES' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      seedArray = node.initializer;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.ok(seedArray, 'Discover seed route dataset should be parseable for thumbnail coverage checks.');

  return seedArray.elements
    .filter(ts.isObjectLiteralExpression)
    .map((routeNode) => {
      const route = {};
      for (const property of routeNode.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = property.name;
        const key = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
        if (!key) continue;
        const value = getLiteralValue(property.initializer);
        if (value !== undefined) route[key] = value;
      }
      return route;
    })
    .filter((route) => route.id);
}

function makeRoute(overrides) {
  return {
    id: 'route',
    name: 'Route',
    region: 'Canyonlands, Utah',
    imageTag: 'desert-canyon',
    terrainType: 'Desert canyon',
    regionGroup: 'utah-canyonlands',
    ...overrides,
  };
}

function urisFor(routes) {
  return Array.from(thumbnails.getExploreRouteThumbnailAssignments(routes, 'hiddenGems').values()).map(
    (assignment) => assignment && assignment.uri,
  );
}

const hiddenGemRoutes = [
  makeRoute({ id: 'white-rim-trail' }),
  makeRoute({ id: 'shafer-trail' }),
  makeRoute({ id: 'cathedral-valley-loop' }),
  makeRoute({ id: 'hole-in-the-rock', imageTag: 'desert-sand' }),
  makeRoute({ id: 'high-rock-canyon', regionGroup: 'great-basin' }),
];

const hiddenGemAssignments = thumbnails.getExploreRouteThumbnailAssignments(hiddenGemRoutes, 'hiddenGems');
const hiddenGemUris = Array.from(hiddenGemAssignments.values()).map((assignment) => assignment && assignment.uri);

assert.strictEqual(
  new Set(hiddenGemUris).size,
  hiddenGemUris.length,
  'Hidden Gems should avoid repeated route thumbnails while unused suitable fallbacks remain.',
);
assert.strictEqual(
  hiddenGemAssignments.get('shafer-trail').sourceKey,
  'canyon-switchbacks',
  'Dedicated route thumbnails should be preferred when their image has not already been used in the visible list.',
);
assert.strictEqual(
  hiddenGemAssignments.get('shafer-trail').state,
  'route_specific',
  'Dedicated route matches should be marked as route-specific.',
);

const fallbackAssignment = thumbnails
  .getExploreRouteThumbnailAssignments(
    [
      makeRoute({
        id: 'unknown-forest-spur',
        imageTag: undefined,
        terrainType: 'Forest gravel',
        regionGroup: 'upper-midwest',
      }),
    ],
    'popularTrails',
  )
  .get('unknown-forest-spur');

assert.ok(fallbackAssignment && fallbackAssignment.uri, 'Routes without dedicated images should still receive a fallback.');
assert.ok(
  ['region_fallback', 'terrain_fallback'].includes(fallbackAssignment.state),
  'Fallback assignment should be categorized as region or terrain fallback.',
);

const contextFallbacks = [
  {
    route: makeRoute({
      id: 'tahoe-no-image',
      name: 'Tahoe Forest Connector',
      region: 'Lake Tahoe, California',
      regionGroup: 'sierra-nevada',
      imageTag: undefined,
      terrainType: undefined,
    }),
    expectedSources: ['sierra-tahoe-forest', 'alpine-lake-track', 'alpine-granite', 'forest-lake-road', 'alpine-pass'],
  },
  {
    route: makeRoute({
      id: 'mojave-no-image',
      name: 'Mojave High Desert Spur',
      region: 'Mojave Desert, California',
      regionGroup: 'california-desert',
      imageTag: undefined,
      terrainType: undefined,
    }),
    expectedSources: ['desert-playa-track', 'desert-wash-road', 'high-desert-track', 'desert-open'],
  },
  {
    route: makeRoute({
      id: 'coastal-no-image',
      name: 'Olympic Coastal Forest Track',
      region: 'Olympic Peninsula, Washington',
      regionGroup: 'pacific-northwest',
      imageTag: undefined,
      terrainType: undefined,
    }),
    expectedSources: ['coastal-redwoods', 'forest-coastal-track', 'forest-ridgeline', 'forest-lake-road'],
  },
  {
    route: makeRoute({
      id: 'forest-no-image',
      name: 'North Georgia Ridge Road',
      region: 'North Georgia Mountains',
      regionGroup: 'southern-appalachians',
      imageTag: undefined,
      terrainType: undefined,
    }),
    expectedSources: ['forest-mountain-creek', 'forest-ridgeline', 'forest-gravel', 'forest-lake-road'],
  },
  {
    route: makeRoute({
      id: 'canyon-no-image',
      name: 'Moab Canyon Rock Shelf',
      region: 'Moab, Utah',
      regionGroup: 'utah-canyonlands',
      imageTag: undefined,
      terrainType: undefined,
    }),
    expectedSources: ['canyon-rim-road', 'canyon-switchbacks', 'desert-canyon', 'desert-monoliths', 'alpine-rock-shelf'],
  },
];

for (const { route, expectedSources } of contextFallbacks) {
  const assignment = thumbnails.getExploreRouteThumbnail(route);
  assert.ok(assignment && assignment.uri, `${route.id} should receive a non-empty contextual fallback image.`);
  assert.ok(
    expectedSources.includes(assignment.sourceKey),
    `${route.id} should use a regionally sensible fallback source, got ${assignment.sourceKey}.`,
  );
}

const mismatchedDirectAssignment = thumbnails.getExploreTrailThumbnail(
  makeRoute({
    id: 'mismatched-direct-image',
    name: 'Mojave Desert Track',
    region: 'Mojave Desert, California',
    regionGroup: 'california-desert',
    imageTag: 'forest-mountain',
    terrainType: 'Desert Sand / Rock',
  }),
);
assert.ok(
  mismatchedDirectAssignment && mismatchedDirectAssignment.uri,
  'Mismatched direct image tags should fall back to contextual imagery instead of blank thumbnails.',
);
assert.notStrictEqual(
  mismatchedDirectAssignment.state,
  'suppressed_mismatch',
  'Mismatched direct image tags should not render as suppressed blank thumbnails.',
);

const genericAssignment = thumbnails.getExploreRouteThumbnail({
  id: 'unknown-no-context',
  imageTag: undefined,
  terrainType: undefined,
  regionGroup: undefined,
});
assert.ok(genericAssignment && genericAssignment.uri, 'Routes with minimal context should still receive a generic overland fallback.');
assert.strictEqual(
  genericAssignment.sourceKey,
  'generic-overland-landscape',
  'Routes with minimal context should use the generic overland fallback as a last resort.',
);

assert.deepStrictEqual(
  urisFor(hiddenGemRoutes),
  urisFor(hiddenGemRoutes),
  'Thumbnail assignment should be deterministic across renders.',
);

const exhaustedPoolRoutes = Array.from({ length: 12 }, (_, index) =>
  makeRoute({
    id: `synthetic-utah-route-${index}`,
    imageTag: undefined,
    terrainType: 'Desert canyon',
    regionGroup: 'utah-canyonlands',
  }),
);
const exhaustedUris = urisFor(exhaustedPoolRoutes);
assert.strictEqual(
  exhaustedUris.filter(Boolean).length,
  exhaustedPoolRoutes.length,
  'Finite fallback pools should still provide stable thumbnails after unique variants are exhausted.',
);
assert.deepStrictEqual(
  exhaustedUris,
  urisFor(exhaustedPoolRoutes),
  'Finite fallback cycling should stay deterministic.',
);

assert.ok(
  !thumbnailSource.includes('Math.random'),
  'Explore route thumbnail assignment should not use random selection.',
);
assert.ok(
  thumbnailSource.includes('ROUTE_THUMBNAIL_BY_ID') &&
    thumbnailSource.includes('usedImageUris') &&
    thumbnailSource.includes('finite_pool_cycled') &&
    thumbnailSource.includes('EXPLORE_ROUTE_THUMBNAIL_ASSET_PLACEHOLDERS') &&
    thumbnailSource.includes('LANDSCAPE_FALLBACK_POOL_BY_GROUP'),
  'Explore thumbnail resolver should centralize route-specific mapping, per-list uniqueness, contextual fallback pools, and documented pool cycling.',
);

const seedRoutes = extractSeedRoutes();
const seedAssignments = thumbnails.getExploreRouteThumbnailAssignments(seedRoutes, 'seed-audit');
const missingSeedThumbnails = seedRoutes
  .filter((route) => {
    const assignment = seedAssignments.get(String(route.id));
    return !assignment || !assignment.uri;
  })
  .map((route) => route.id);
assert.deepStrictEqual(
  missingSeedThumbnails,
  [],
  `Every Discover seed route should resolve to a non-empty thumbnail. Missing: ${missingSeedThumbnails.join(', ')}`,
);

const routesWithoutDedicatedImages = seedRoutes.filter((route) => !thumbnailSource.includes(`'${route.id}':`));
assert.ok(
  routesWithoutDedicatedImages.length > 0,
  'The thumbnail coverage check should include routes without dedicated route-specific mappings.',
);
for (const route of routesWithoutDedicatedImages) {
  const assignment = thumbnails.getExploreRouteThumbnail(route);
  assert.ok(
    assignment && assignment.uri,
    `Route without dedicated thumbnail should still receive contextual fallback: ${route.id}`,
  );
}

assert.ok(
  enrichedCardSource.includes('thumbnailOverride?: ExploreTrailThumbnailAssignment | null') &&
    enrichedCardSource.includes('const thumbnail = thumbnailOverride ?? getExploreTrailThumbnail(route);'),
  'Enriched route cards should accept list-level thumbnail assignments without losing card fallback behavior.',
);
assert.ok(
  discoverSource.includes('getExploreRouteThumbnailAssignments') &&
    discoverSource.includes('hiddenGemThumbnailAssignments') &&
    discoverSource.includes('popularTrailThumbnailAssignments') &&
    discoverSource.includes('knownRouteThumbnailAssignments') &&
    discoverSource.includes('trailPackThumbnailAssignments') &&
    discoverSource.includes('aiRouteThumbnailAssignments') &&
    discoverSource.includes('favoriteTrailThumbnailAssignments') &&
    discoverSource.includes('thumbnailOverride={hiddenGemThumbnailAssignments.get(String(route.id)) ?? null}') &&
    discoverSource.includes('thumbnailOverride={popularTrailThumbnailAssignments.get(String(route.id)) ?? null}') &&
    discoverSource.includes('thumbnailOverride={knownRouteThumbnailAssignments.get(String(route.id)) ?? null}') &&
    discoverSource.includes('thumbnailOverride={trailPackThumbnailAssignments.get(String(trailPackRoute.id)) ?? null}') &&
    discoverSource.includes('thumbnailOverride={aiRouteThumbnailAssignments.get(String(route.id)) ?? null}') &&
    discoverSource.includes('favoriteThumbnail?.uri') &&
    discoverSource.includes('accessibilityLabel={`${favorite.title} saved trail thumbnail`}'),
  'Explore visible route, Trail Pack, ECS route idea, and saved-trail favorites lists should use deterministic per-list thumbnails.',
);
assert.ok(
  aiRouteCardSource.includes('thumbnailOverride?: ExploreTrailThumbnailAssignment | null') &&
    aiRouteCardSource.includes('const thumbnail = thumbnailOverride ?? getExploreTrailThumbnail(enrichedRoute ?? route);') &&
    aiRouteCardSource.includes('accessibilityLabel={`${route.name} route thumbnail`}'),
  'ECS route idea cards should render list-level thumbnails with a route-card fallback.',
);
assert.ok(
  trailPackCardSource.includes('thumbnailOverride?: ExploreTrailThumbnailAssignment | null') &&
    trailPackCardSource.includes("thumbnailOverride.state !== 'suppressed_mismatch'") &&
    trailPackCardSource.includes('accessibilityLabel={`${trailPack.name} trail thumbnail`}'),
  'Trail Pack cards should render list-level thumbnails for trail category routes.',
);

console.log('Explore route thumbnail checks passed.');
