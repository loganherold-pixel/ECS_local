const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  evaluateRouteIntelligence,
  guardRouteIntelligenceCopy,
} = loadTypeScriptModule('lib/ecs5RouteIntelligence.ts');
const {
  buildRouteBriefAdvisory,
  publishRouteBriefAdvisory,
  resetRouteBriefPublisherForTests,
} = loadTypeScriptModule('lib/routeBriefPublisher.ts');
const { briefCadLogStore } = loadTypeScriptModule('lib/briefCadLogStore.ts');

const now = new Date('2026-05-05T16:00:00.000Z');

function signal(id, kind, status, overrides = {}) {
  return {
    id,
    providerId: overrides.providerId ?? 'manual_agency_ingestion',
    kind,
    label: overrides.label ?? id,
    status,
    official: overrides.official ?? true,
    observedAt: overrides.observedAt ?? '2026-05-05T15:00:00.000Z',
    detail: overrides.detail ?? null,
    confidence: overrides.confidence ?? 'high',
    severity: overrides.severity ?? null,
  };
}

assert.strictEqual(
  guardRouteIntelligenceCopy('AI-Inferred route is guaranteed safe'),
  'ECS-Inferred route is needs field verification',
  'Route copy guard should replace AI-Inferred and guaranteed claims.',
);

let summary = evaluateRouteIntelligence('missing-weather-route', {
  validUntil: '2026-05-05T18:00:00.000Z',
  legalAccess: [signal('mvum-open', 'legal_access', 'open', { providerId: 'usfs_mvum' })],
  closures: [signal('closure-none', 'closure', 'none')],
  dataSources: [{
    id: 'route-weather',
    providerId: 'nws',
    label: 'Route weather',
    kind: 'weather',
    origin: 'weather_provider',
    available: false,
    required: true,
    freshness: 'unknown',
  }],
}, now);

assert.ok(
  summary.unknowns.some((item) => item.id === 'unknown_passability'),
  'Missing passability should be represented as unavailable/needs verification.',
);
assert.ok(
  summary.unknowns.some((item) => item.id === 'route_weather_unavailable'),
  'Required missing route weather should produce an explicit unavailable issue.',
);
assert.ok(
  summary.sourceFreshnessNotes.some((item) => item.includes('Unavailable route source data')),
  'Route notes should carry unavailable source data.',
);
assert.ok(
  summary.recommendedActions.some((item) => item.includes('field verification')),
  'Recommended actions should avoid fake certainty when data is missing.',
);

const allCopy = JSON.stringify(summary);
assert.ok(!/\bAI-Inferred\b/.test(allCopy), 'Route intelligence output should not use AI-Inferred copy.');
assert.ok(!/\bguaranteed\s+(safe|open|accessible|passable)\b/i.test(allCopy), 'Route intelligence output should not include guaranteed route claims.');

const advisory = buildRouteBriefAdvisory(summary);
assert.ok(advisory, 'Missing route source data should produce a route brief advisory.');
assert.ok(advisory.message.includes('ROUTE ADVISORY'), 'Route brief copy should be CAD-style and concise.');
assert.ok(advisory.sourceLine.includes('Source confidence'), 'Route brief advisory should include source confidence.');

resetRouteBriefPublisherForTests();
briefCadLogStore.clear();
let result = publishRouteBriefAdvisory(summary, { now: now.getTime() });
assert.strictEqual(result.emitted, true, 'First route advisory should publish.');
assert.strictEqual(result.reason, 'emitted');

result = publishRouteBriefAdvisory(summary, { now: now.getTime() + 60_000 });
assert.strictEqual(result.emitted, false, 'Repeated identical route advisory should be suppressed.');
assert.strictEqual(result.reason, 'duplicate_suppressed');
assert.ok(
  briefCadLogStore.getEntries().filter((entry) => entry.source === 'ecs-route-intelligence').length <= 1,
  'Suppressed route advisories should not duplicate CAD/ECS Brief entries.',
);

summary = evaluateRouteIntelligence('stale-route', {
  validUntil: '2026-05-05T18:00:00.000Z',
  legalAccess: [signal('mvum-open-stale', 'legal_access', 'open', {
    providerId: 'usfs_mvum',
    observedAt: '2026-05-01T15:00:00.000Z',
  })],
  closures: [signal('closure-none-stale', 'closure', 'none', {
    observedAt: '2026-05-01T15:00:00.000Z',
  })],
  passability: [signal('passability-stale', 'passability', 'passable', {
    observedAt: '2026-05-01T15:00:00.000Z',
  })],
}, now);

assert.ok(
  summary.sourceFreshnessNotes.some((item) => item.includes('Source freshness') && item.includes('stale')),
  'Stale source freshness should be surfaced in route intelligence notes.',
);

console.log('route intelligence truthfulness checks passed');
