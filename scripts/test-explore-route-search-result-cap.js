const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
require.extensions['.ts'] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const policy = require(path.join(root, 'lib', 'explore', 'routeSearchResultPolicy.ts'));

assert.strictEqual(policy.ECS_ROUTE_SEARCH_RESULT_LIMIT, 20);
assert.strictEqual(
  policy.ECS_ROUTE_SEARCH_RESULT_CAP_NOTICE,
  'Showing the 20 best matches. Refine the search area or filters to narrow the results.',
);
for (const value of [undefined, null, NaN, Infinity, 0, -1, '20', 'bad']) {
  assert.strictEqual(policy.normalizeRouteSearchResultLimit(value), 20);
}
assert.strictEqual(policy.normalizeRouteSearchResultLimit(500), 20);
assert.strictEqual(policy.normalizeRouteSearchResultLimit(21), 20);
assert.strictEqual(policy.normalizeRouteSearchResultLimit(7.9), 7);

const ranked = [
  { id: 'best', score: 100 },
  { id: 'BEST', score: 99 },
  ...Array.from({ length: 50 }, (_, index) => ({ id: `route-${index}`, score: 98 - index })),
];
const selected = policy.capUniqueRankedRoutes(ranked, (route) => route.id, 500);
assert.strictEqual(selected.length, 20, '51 unique qualifying routes must expose exactly 20');
assert.strictEqual(new Set(selected.map((route) => route.id.toLowerCase())).size, 20);
assert.strictEqual(selected[0].id, 'best', 'ranking must be preserved before the final slice');

const filteredBeforeSlice = policy.capUniqueRankedRoutes(
  ranked.filter((route) => route.score < 90),
  (route) => route.id,
);
assert(filteredBeforeSlice.every((route) => route.score < 90), 'filtering must precede the final slice');
assert.strictEqual(filteredBeforeSlice.length, 20);

const liveCatalog = fs.readFileSync(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'), 'utf8');
const routeCatalog = fs.readFileSync(path.join(root, 'lib', 'explore', 'routeCatalog.ts'), 'utf8');
const discover = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase', 'functions', 'route-catalog-search', 'index.ts'), 'utf8');

assert(liveCatalog.includes('normalizeRouteSearchResultLimit(criteria.limit)'));
assert(liveCatalog.includes('.limit(ECS_ROUTE_SEARCH_RESULT_LIMIT)'));
assert(liveCatalog.includes('isAuthoritativeRequest'), 'stale searches must be rejected');
assert(routeCatalog.includes('verification.publicRecommendation'), 'validation must precede selection');
assert(routeCatalog.includes('capUniqueRankedRoutes'), 'normalized responses must be capped');
assert(discover.includes('const pageSize = ECS_ROUTE_SEARCH_RESULT_LIMIT'));
assert(discover.includes('explore-route-search-result-cap-notice'));
assert(discover.includes('ECS_ROUTE_SEARCH_RESULT_CAP_NOTICE'));
assert(!discover.includes('Load More Verified Routes'));
assert(!discover.includes('Retry More Verified Routes'));
assert(edge.includes('ROUTE_SEARCH_INTERNAL_CANDIDATE_LIMIT = 500'));
assert(edge.includes('const additionalMatchesExist = rankedRecords.length > limit'));
assert(edge.includes('nextPage: null'));
assert(edge.includes('nextCursor: null'));
assert(edge.includes(".order('id', { ascending: true })"), 'server ordering must have a stable tie-breaker');
assert(edge.indexOf('dedupeRankedRecords(radiusFiltered.records)') < edge.indexOf('rankedRecords.slice(0, limit)'));

console.log('Explore strict twenty-route search cap checks passed');
