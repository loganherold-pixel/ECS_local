const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const cachePath = path.join(root, 'lib', 'explore', 'routeCatalogSummaryCache.ts');
const liveCatalogPath = path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts');
const discoverPath = path.join(root, 'app', '(tabs)', 'discover.tsx');
const summaryCardPath = path.join(root, 'components', 'discover', 'RouteCatalogSummaryCard.tsx');
const packagePath = path.join(root, 'package.json');

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

assert(fs.existsSync(cachePath), 'Explore summary cache helper should exist.');

const {
  EXPLORE_CATALOG_SUMMARY_CACHE_KEY,
  createRouteCatalogSummaryCache,
  exploreCatalogRegionCacheKey,
  paginateRouteCatalogSummaries,
} = require(cachePath);

assert.strictEqual(
  EXPLORE_CATALOG_SUMMARY_CACHE_KEY,
  'explore.catalog.summary.v1',
  'Global Explore summary cache key should be stable.',
);
assert.strictEqual(
  exploreCatalogRegionCacheKey('Sierra Nevada / Tahoe NF'),
  'explore.catalog.region.sierra-nevada-tahoe-nf.v1',
  'Region summary cache key should normalize human region ids.',
);

const cache = createRouteCatalogSummaryCache({ ttlMs: 100, staleMs: 300 });
const sampleSummaries = Array.from({ length: 25 }, (_, index) => ({
  routeId: `route-${index}`,
  title: `Route ${index}`,
  region: 'Sierra Nevada',
  forestName: 'Tahoe National Forest',
  distanceMeters: 1000 + index,
  estimatedDurationSeconds: 600,
  difficulty: 'moderate',
  popularityScore: index,
  communityRating: null,
  sourceType: 'official',
  bbox: null,
  trailheadCoordinate: { latitude: 39 + index * 0.01, longitude: -120 },
  thumbnailUrl: null,
  thumbnailAssetKey: null,
  updatedAt: '2026-06-29T00:00:00.000Z',
  tags: ['tahoe'],
}));
cache.set(EXPLORE_CATALOG_SUMMARY_CACHE_KEY, sampleSummaries, 1_000);
assert.strictEqual(cache.get(EXPLORE_CATALOG_SUMMARY_CACHE_KEY, 1_050).status, 'hit');
assert.strictEqual(cache.get(EXPLORE_CATALOG_SUMMARY_CACHE_KEY, 1_250).status, 'stale');
assert.strictEqual(cache.get(EXPLORE_CATALOG_SUMMARY_CACHE_KEY, 1_500).status, 'miss');

const boundedCache = createRouteCatalogSummaryCache({ maxEntries: 2 });
boundedCache.set('region-a', sampleSummaries, 1_000);
boundedCache.set('region-b', sampleSummaries, 1_001);
boundedCache.set('region-c', sampleSummaries, 1_002);
assert.strictEqual(boundedCache.entries.size, 2, 'Summary cache should retain only its bounded LRU window.');
assert.strictEqual(boundedCache.get('region-a', 1_003).status, 'miss');
assert.strictEqual(boundedCache.get('region-c', 1_003).status, 'hit');

const page = paginateRouteCatalogSummaries(sampleSummaries, { pageIndex: 1, pageSize: 10 });
assert.deepStrictEqual(
  page.items.map((summary) => summary.routeId),
  sampleSummaries.slice(10, 20).map((summary) => summary.routeId),
  'Route catalog summaries should paginate without loading route details.',
);
assert.strictEqual(page.totalPages, 3);

const liveCatalog = fs.readFileSync(liveCatalogPath, 'utf8');
assert(
  liveCatalog.includes('EXPLORE_CATALOG_SUMMARY_CACHE_KEY') &&
    liveCatalog.includes('exploreCatalogRegionCacheKey') &&
    liveCatalog.includes('readCachedRouteCatalogSummarySnapshot') &&
    liveCatalog.includes('writeRouteCatalogSummaryCache'),
  'Live catalog store should hydrate summary cache before network refresh and write summary cache after refresh.',
);
assert(
  liveCatalog.includes('limit: criteria.limit ?? ROUTE_CATALOG_SUMMARY_PAGE_SIZE') &&
    liveCatalog.includes('regionId: criteria.regionId'),
  'Explore summary search should be paged/region-scoped instead of requesting the full catalog.',
);
assert(
  liveCatalog.includes('includeGeometry: false') &&
    liveCatalog.includes('const includePreviewGeometry = criteria.includePreviewGeometry === true'),
  'Explore summary search must not request full or preview geometry by default.',
);

const discover = fs.readFileSync(discoverPath, 'utf8');
assert(fs.existsSync(summaryCardPath), 'RouteCatalogSummaryCard should render summary-only route cards.');
assert(
  discover.includes('RouteCatalogSummaryCard') &&
    discover.includes('visibleRouteCatalogSummaries') &&
    discover.includes('handlePreviewRouteCatalogSummary') &&
    discover.includes('handleStartRouteCatalogSummaryGuidance'),
  'Discover Trail Packs panel should render and act from RouteCatalogSummary records.',
);
assert(
  !discover.includes('visibleTrailPacks.map((trailPack') &&
    !discover.includes('const trailPackRoute = trailPackToExpeditionOpportunity(trailPack);'),
  'Explore route cards should not render from full Trail Pack detail records.',
);
assert(
  discover.includes('fetchRouteCatalogTrailPackDetail(routeId, {') &&
    discover.includes('sourceVersion: summary.updatedAt') &&
    discover.includes('routeId: summary.routeId'),
  'Preview/Navigate actions should pass routeId plus source version to the detail loader instead of passing hydrated route geometry.',
);
assert(
  !discover.includes('routeGeometryViewportOverlayEnabled') &&
    !discover.includes('route-geometry-segments'),
  'Explore must not mount Navigate MVUM overlay logic or initialize MVUM sources.',
);
assert(
  discover.includes('const [routeCatalogPreviewGeometryRequested, setRouteCatalogPreviewGeometryRequested] = useState(true)') &&
    discover.includes('const EXPLORE_ROUTE_CATALOG_REQUEST_LIMIT = 500') &&
    discover.includes('includePreviewGeometry: routeCatalogPreviewGeometryRequested') &&
    discover.includes('setRouteCatalogPreviewGeometryRequested(true)'),
  'Explore should preserve summary-card rendering while deliberately requesting bounded preview geometry needed for readiness.',
);
assert(
  discover.includes('showGuidanceReadyGeometryLoading') &&
    discover.includes('Loading Verified Route Previews...') &&
    discover.includes('Full route detail remains deferred until you preview, save, build, or start a route.'),
  'Explore should expose the staged preview refresh without treating in-flight summary records as missing geometry.',
);

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
assert.strictEqual(
  packageJson.scripts['test:explore-summary-first-performance'],
  'node ./scripts/test-explore-summary-first-performance.js',
  'package.json should expose the Explore summary-first regression.',
);

console.log('Explore summary-first performance checks passed.');
