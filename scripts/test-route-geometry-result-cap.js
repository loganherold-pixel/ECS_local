/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const policyPath = path.join(
  root,
  'supabase',
  'functions',
  'route-geometry-segments',
  'resultPolicy.ts',
);

require.extensions['.ts'] = function compileTypescript(module, filename) {
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
  ROUTE_GEOMETRY_CANDIDATE_INSPECTION_LIMIT,
  ROUTE_GEOMETRY_SEARCH_RESULT_LIMIT,
  normalizeRouteGeometryResultLimit,
  selectRouteGeometrySearchResults,
} = require(policyPath);

assert.strictEqual(ROUTE_GEOMETRY_SEARCH_RESULT_LIMIT, 20);
assert.strictEqual(ROUTE_GEOMETRY_CANDIDATE_INSPECTION_LIMIT, 500);
assert.strictEqual(normalizeRouteGeometryResultLimit(undefined), 20);
assert.strictEqual(normalizeRouteGeometryResultLimit('invalid'), 20);
assert.strictEqual(normalizeRouteGeometryResultLimit(-1), 20);
assert.strictEqual(normalizeRouteGeometryResultLimit(51), 20);
assert.strictEqual(normalizeRouteGeometryResultLimit('7.9'), 7);

function candidate(index, overrides = {}) {
  const routeIdentity = overrides.routeIdentity ?? `route-${String(index).padStart(2, '0')}`;
  return {
    value: {
      id: overrides.valueId ?? routeIdentity,
      rank: overrides.confidenceScore ?? index,
    },
    routeIdentity,
    confidenceScore: overrides.confidenceScore ?? index,
    sourceLastUpdated: overrides.sourceLastUpdated ?? '2026-07-19T00:00:00.000Z',
    routeName: overrides.routeName ?? `Route ${String(index).padStart(2, '0')}`,
    stableKey: overrides.stableKey ?? `geometry-${String(index).padStart(2, '0')}`,
  };
}

const fiftyOneValid = Array.from({ length: 51 }, (_, index) => candidate(index));
const selected = selectRouteGeometrySearchResults(fiftyOneValid, 500);
assert.strictEqual(selected.records.length, 20);
assert.strictEqual(selected.resultLimit, 20);
assert.strictEqual(selected.qualifyingUniqueCount, 51);
assert.strictEqual(selected.cappedCount, 31);
assert.strictEqual(selected.additionalMatchesAvailable, true);
assert.deepStrictEqual(
  selected.records.map((record) => record.id),
  Array.from({ length: 20 }, (_, offset) => `route-${String(50 - offset).padStart(2, '0')}`),
  'The final slice must follow quality ranking instead of provider insertion order.',
);

const duplicateSelection = selectRouteGeometrySearchResults([
  candidate(1, { routeIdentity: 'duplicate-route', confidenceScore: 1, valueId: 'duplicate-low' }),
  candidate(2, { routeIdentity: 'duplicate-route', confidenceScore: 99, valueId: 'duplicate-high' }),
  ...Array.from({ length: 20 }, (_, index) => candidate(index + 10)),
], 20);
assert.strictEqual(duplicateSelection.records.length, 20);
assert.strictEqual(duplicateSelection.deduplicatedCount, 1);
assert.strictEqual(duplicateSelection.records[0].id, 'duplicate-high');
assert.strictEqual(
  duplicateSelection.records.filter((record) => record.id.startsWith('duplicate-')).length,
  1,
  'Duplicate route identities must consume one result position and retain the best-ranked record.',
);

const determinismInput = [
  candidate(3, { confidenceScore: 50, routeName: 'Same name' }),
  candidate(1, { confidenceScore: 50, routeName: 'Same name' }),
  candidate(2, { confidenceScore: 50, routeName: 'Same name' }),
];
const forward = selectRouteGeometrySearchResults(determinismInput, 20).records.map((record) => record.id);
const reversed = selectRouteGeometrySearchResults([...determinismInput].reverse(), 20).records.map((record) => record.id);
assert.deepStrictEqual(forward, ['route-01', 'route-02', 'route-03']);
assert.deepStrictEqual(reversed, forward, 'Provider order must not change deterministic result ordering.');

console.log('Route geometry result-cap checks passed.');
