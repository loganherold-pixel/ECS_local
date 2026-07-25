const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

process.env.EXPO_PUBLIC_ECS_INTERNAL_DIAGNOSTICS = 'true';
process.env.EXPO_PUBLIC_ECS_BUILD_PROFILE = 'fieldtest';
const performance = require(path.join(root, 'lib/explore/explorePerformance.ts'));
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const emitted = [];
const originalInfo = console.info;
console.info = (line) => emitted.push(String(line));

try {
  performance.resetExplorePerformanceRecords();
  performance.recordExplorePerformanceEvent('explore_search_request_dispatched', {
    durationMs: 12,
    resultCount: 20,
    searchFingerprint: 'explore-1234abcd',
    cacheHit: false,
    generation: 7,
    qaRegionId: 'must-not-escape',
    radiusCategory: 'must-not-escape',
    exclusionReasonCounts: { must_not_escape: 1 },
  });
} finally {
  console.info = originalInfo;
}

assert.strictEqual(emitted.length, 1, 'Internal fieldtest must emit one package-scoped diagnostic line.');
assert.ok(emitted[0].startsWith(performance.INTERNAL_EXPLORE_DIAGNOSTIC_PREFIX));
const payload = JSON.parse(emitted[0].slice(performance.INTERNAL_EXPLORE_DIAGNOSTIC_PREFIX.length));
assert.deepStrictEqual(Object.keys(payload).sort(), [
  'aggregateRouteCount',
  'cacheHit',
  'durationMs',
  'event',
  'generation',
  'monotonicTimestampMs',
  'profile',
  'requestCorrelationHash',
]);
assert.strictEqual(payload.event, 'explore_search_request_dispatched');
assert.strictEqual(payload.aggregateRouteCount, 20);
assert.strictEqual(payload.requestCorrelationHash, 'explore-1234abcd');
assert.strictEqual(payload.profile, 'fieldtest');
assert.strictEqual(payload.generation, 7);
for (const forbidden of ['latitude', 'longitude', 'query', 'user', 'routeId', 'jwt', 'token', 'qaRegionId', 'radiusCategory', 'exclusionReasonCounts']) {
  assert.strictEqual(emitted[0].includes(forbidden), false, `Diagnostic line must not expose ${forbidden}.`);
}

assert.strictEqual(performance.resolveInternalExploreDiagnosticProfile({
  EXPO_PUBLIC_ECS_INTERNAL_DIAGNOSTICS: 'true',
  EXPO_PUBLIC_ECS_BUILD_PROFILE: 'route-discovery-qa',
}), 'route-discovery-qa');
assert.strictEqual(performance.resolveInternalExploreDiagnosticProfile({
  EXPO_PUBLIC_ECS_INTERNAL_DIAGNOSTICS: 'true',
  EXPO_PUBLIC_ECS_BUILD_PROFILE: 'production',
}), null);
assert.strictEqual(performance.resolveInternalExploreDiagnosticProfile({
  EXPO_PUBLIC_ECS_BUILD_PROFILE: 'fieldtest',
}), null);

process.env.EXPO_PUBLIC_ECS_BUILD_PROFILE = 'production';
const productionEmitted = [];
console.info = (line) => productionEmitted.push(String(line));
try {
  performance.recordExplorePerformanceEvent('explore_screen_focus');
} finally {
  console.info = originalInfo;
}
assert.deepStrictEqual(productionEmitted, [], 'Public production must not expose the diagnostic bridge.');
assert.strictEqual(eas.build.fieldtest.env.EXPO_PUBLIC_ECS_INTERNAL_DIAGNOSTICS, 'true');
assert.strictEqual(eas.build['route-discovery-qa'].env.EXPO_PUBLIC_ECS_INTERNAL_DIAGNOSTICS, 'true');
assert.strictEqual(eas.build.production.env?.EXPO_PUBLIC_ECS_INTERNAL_DIAGNOSTICS, undefined);

console.log('Explore internal native diagnostic bridge checks passed.');
