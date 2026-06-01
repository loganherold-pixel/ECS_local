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
  ECS5_INTENTIONALLY_DISABLED_OPENWEATHER_PROVIDERS,
  buildECS5ProviderHealth,
  buildUnifiedECS5RouteIntelligence,
  assessECS5SourceConfidence,
} = loadTypeScriptModule('lib/ecs5RouteIntelligence.ts');

const now = new Date('2026-04-29T18:00:00.000Z');

let output = buildUnifiedECS5RouteIntelligence({
  routeId: 'route-closed',
  routeName: 'Forest Spur',
  legalAccess: [{
    id: 'mvum-static-open',
    providerId: 'usfs_mvum',
    kind: 'legal_access',
    label: 'USFS MVUM static route access',
    status: 'open',
    official: true,
    observedAt: '2026-04-29T16:00:00.000Z',
  }],
  closures: [{
    id: 'closure-order-1',
    providerId: 'manual_agency_ingestion',
    kind: 'closure',
    label: 'Agency closure order',
    status: 'closed',
    official: true,
    observedAt: '2026-04-29T17:00:00.000Z',
  }],
  passability: [{
    id: 'condition-clear',
    providerId: 'state_dot_511',
    kind: 'passability',
    label: 'Road condition report',
    status: 'clear',
    official: true,
    observedAt: '2026-04-29T17:00:00.000Z',
  }],
}, now);

assert.strictEqual(output.legalStatus, 'closed', 'Official closures must override static legal access data.');
assert.strictEqual(output.closureStatus, 'active_closure');
assert.strictEqual(output.safetyRisk, 'critical');
assert.ok(output.conflicts.some((item) => item.includes('Official closure overrides')));
assert.ok(output.legalAdvisory.includes('not legal advice'));

output = buildUnifiedECS5RouteIntelligence({
  routeId: 'route-community-open',
  legalAccess: [{
    id: 'nps-closure',
    providerId: 'nps',
    kind: 'legal_access',
    label: 'NPS access feed',
    status: 'open',
    official: true,
    observedAt: '2026-04-29T15:00:00.000Z',
  }],
  closures: [{
    id: 'nps-active-closure',
    providerId: 'nps',
    kind: 'closure',
    label: 'NPS active closure',
    status: 'closed',
    official: true,
    observedAt: '2026-04-29T16:00:00.000Z',
  }],
  communityReports: [{
    id: 'community-passable',
    providerId: 'community',
    kind: 'community_report',
    label: 'Community report',
    status: 'open and passable yesterday',
    official: false,
    observedAt: '2026-04-29T16:30:00.000Z',
  }],
}, now);

assert.strictEqual(output.closureStatus, 'active_closure');
assert.ok(
  output.conflicts.some((item) => item.includes('Community reports cannot reopen')),
  'Community reports may not legally reopen an official closure.',
);

output = buildUnifiedECS5RouteIntelligence({
  routeId: 'route-open-not-safe',
  legalAccess: [{
    id: 'blm-open',
    providerId: 'blm_plad',
    kind: 'legal_access',
    label: 'BLM PLAD',
    status: 'open',
    official: true,
    observedAt: '2026-04-29T16:00:00.000Z',
  }],
  closures: [{
    id: 'no-closure',
    providerId: 'manual_agency_ingestion',
    kind: 'closure',
    label: 'No known closure',
    status: 'none',
    official: true,
    observedAt: '2026-04-29T16:00:00.000Z',
  }],
  passability: [{
    id: 'mud-passability',
    providerId: 'state_dot_511',
    kind: 'passability',
    label: 'Road condition',
    status: 'impaired by mud',
    official: true,
    observedAt: '2026-04-29T16:00:00.000Z',
  }],
  weatherFireSmoke: [{
    id: 'firms-fire-nearby',
    providerId: 'nasa_firms',
    kind: 'fire',
    label: 'NASA FIRMS fire detection',
    status: 'nearby active fire detection',
    severity: 'critical',
    official: true,
    observedAt: '2026-04-29T17:20:00.000Z',
  }],
}, now);

assert.strictEqual(output.legalStatus, 'legal_open');
assert.strictEqual(output.closureStatus, 'open');
assert.strictEqual(output.passabilityStatus, 'impaired');
assert.strictEqual(output.safetyRisk, 'critical', 'Legal/open must not imply safe or passable.');
assert.ok(output.notes.some((item) => item.includes('Legal/open status is evaluated separately')));

const providerHealth = buildECS5ProviderHealth([
  {
    providerId: 'nws',
    label: 'NWS API',
    enabled: true,
    configured: true,
    lastSuccessAt: '2026-04-29T17:50:00.000Z',
  },
  {
    providerId: 'airnow',
    label: 'AirNow API',
    enabled: true,
    configured: false,
  },
], now);

assert.ok(
  providerHealth.filter((provider) => provider.status === 'intentionally_disabled').length >= 3,
  'Out-of-scope OpenWeather providers should be intentionally disabled in health output.',
);
assert.ok(
  providerHealth
    .filter((provider) => provider.status === 'intentionally_disabled')
    .every((provider) => provider.requiresAttention === false && provider.missingConfig === false),
  'Intentionally disabled providers must not show as missing-config errors.',
);
assert.strictEqual(
  providerHealth.find((provider) => provider.providerId === 'airnow').status,
  'missing_config',
  'Enabled providers with missing config should still be surfaced.',
);

const confidence = assessECS5SourceConfidence({
  offline: true,
  dataSources: [{
    id: 'closure-cache',
    providerId: 'manual_agency_ingestion',
    label: 'Closure cache',
    kind: 'closure',
    origin: 'agency',
    available: true,
    required: true,
    freshness: 'stale',
  }],
});
assert.ok(confidence.reasons.includes('stale_data'));
assert.ok(confidence.reasons.includes('offline_estimate'));

output = buildUnifiedECS5RouteIntelligence({
  routeId: 'route-no-bailout',
  legalAccess: [{
    id: 'mvum-open',
    providerId: 'usfs_mvum',
    kind: 'legal_access',
    label: 'USFS MVUM',
    status: 'open',
    official: true,
  }],
  closures: [{
    id: 'closure-none',
    providerId: 'usfs_mvum',
    kind: 'closure',
    label: 'Closure feed',
    status: 'none',
    official: true,
  }],
  passability: [{
    id: 'condition-passable',
    providerId: 'state_dot_511',
    kind: 'passability',
    label: 'Condition',
    status: 'passable',
    official: true,
  }],
  bailoutRoutes: [],
}, now);
assert.ok(output.topConcerns.includes('No bailout routes recorded'));
assert.ok(output.recommendedActions.some((item) => item.includes('bailout')));

assert.strictEqual(ECS5_INTENTIONALLY_DISABLED_OPENWEATHER_PROVIDERS.length, 3);

const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5RouteIntelligence.ts'), 'utf8');
assert.ok(source.includes('ECS route access output is operational guidance, not legal advice'));
assert.ok(source.includes('Community reports may raise operational risk but cannot legally reopen a closed route.'));
assert.ok(!source.includes('fetch('), 'ECS 5.0 route intelligence tests must stay offline/pure.');

console.log('ECS 5.0 route intelligence tests passed.');
