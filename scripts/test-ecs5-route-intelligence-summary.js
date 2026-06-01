const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const path = require('path');
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
  getRouteIntelligenceSummary,
  getProviderHealthSummary,
  refreshRouteIntelligence,
} = loadTypeScriptModule('lib/ecs5RouteIntelligence.ts');
const {
  createECS5ProviderRegistry,
} = loadTypeScriptModule('lib/ecs5ProviderRegistry.ts');
const {
  evaluateBailoutRoutes,
} = loadTypeScriptModule('lib/ecs5BailoutRouteManagement.ts');

const now = new Date('2026-04-29T18:00:00.000Z');
const validUntil = '2026-04-29T20:00:00.000Z';

function signal(id, kind, status, overrides = {}) {
  return {
    id,
    providerId: overrides.providerId ?? providerForKind(kind),
    kind,
    label: overrides.label ?? id,
    status,
    severity: overrides.severity ?? null,
    official: overrides.official ?? kind !== 'community_report',
    observedAt: overrides.observedAt ?? '2026-04-29T17:00:00.000Z',
    expiresAt: overrides.expiresAt ?? '2026-04-30T00:00:00.000Z',
    detail: overrides.detail ?? null,
    confidence: overrides.confidence ?? 'high',
  };
}

function providerForKind(kind) {
  if (kind === 'weather') return 'nws';
  if (kind === 'fire') return 'nifc_wfigs';
  if (kind === 'smoke') return 'airnow';
  if (kind === 'community_report') return 'community';
  if (kind === 'closure') return 'manual_agency_ingestion';
  return 'usfs_mvum';
}

let summary = evaluateRouteIntelligence('green-route', {
  expeditionId: 'exp-1',
  validUntil,
  legalAccess: [signal('mvum-open', 'legal_access', 'open')],
  closures: [signal('closure-none', 'closure', 'none')],
  passability: [signal('condition-clear', 'passability', 'passable')],
  providerHealth: [{ providerId: 'nws', label: 'NWS', enabled: true, configured: true, lastSuccessAt: '2026-04-29T17:50:00.000Z' }],
}, now);
assert.strictEqual(summary.routeId, 'green-route');
assert.strictEqual(summary.expeditionId, 'exp-1');
assert.strictEqual(summary.overallRecommendation, 'proceed');
assert.strictEqual(summary.overallRiskLabel, 'low');
assert.strictEqual(summary.legalStatusSummary.status, 'legal_open');
assert.strictEqual(summary.closureSummary.activeClosures.length, 0);
assert.ok(summary.evidence.some((item) => item.id === 'mvum-open'));

summary = evaluateRouteIntelligence('closed-route', {
  validUntil,
  legalAccess: [signal('mvum-open', 'legal_access', 'open')],
  closures: [signal('closure-order', 'closure', 'closed by forest order', { label: 'Forest order' })],
  passability: [signal('condition-clear', 'passability', 'passable')],
}, now);
assert.strictEqual(summary.overallRecommendation, 'do_not_travel');
assert.strictEqual(summary.overallRiskLabel, 'severe');
assert.ok(summary.blockingIssues.some((item) => item.id === 'official_closure'));
assert.ok(summary.blockingIssues.every((item) => item.evidenceIds.length > 0));
assert.ok(summary.closureSummary.activeClosures.some((item) => item.id === 'closure-order'));

summary = evaluateRouteIntelligence('unknown-legal', {
  validUntil,
  closures: [signal('closure-none', 'closure', 'none')],
  passability: [signal('condition-clear', 'passability', 'passable')],
}, now);
assert.strictEqual(summary.legalStatusSummary.status, 'unknown');
assert.strictEqual(summary.overallRecommendation, 'verify');
assert.ok(summary.legalStatusSummary.verifyWithAgencyRequired);
assert.ok(summary.unknowns.some((item) => item.id === 'unknown_legal_access'));

summary = evaluateRouteIntelligence('fire-perimeter-route', {
  validUntil,
  legalAccess: [signal('mvum-open', 'legal_access', 'open')],
  closures: [signal('closure-none', 'closure', 'none')],
  passability: [signal('condition-clear', 'passability', 'passable')],
  weatherFireSmoke: [signal('wfigs-perimeter', 'fire', 'active perimeter intersects route', {
    providerId: 'nifc_wfigs',
    severity: 'critical',
    detail: 'WFIGS perimeter intersects route segment.',
  })],
}, now);
assert.strictEqual(summary.overallRecommendation, 'reroute');
assert.strictEqual(summary.fireSummary.perimeterIntersection, true);
assert.ok(summary.blockingIssues.some((item) => item.id === 'fire_perimeter'));

summary = evaluateRouteIntelligence('active-fire-nearby', {
  validUntil,
  legalAccess: [signal('mvum-open', 'legal_access', 'open')],
  closures: [signal('closure-none', 'closure', 'none')],
  passability: [signal('condition-clear', 'passability', 'passable')],
  weatherFireSmoke: [signal('firms-nearby', 'fire', 'nearby active fire detection', {
    providerId: 'nasa_firms',
    severity: 'warning',
    detail: 'Active fire detection 4 mi from route.',
  })],
}, now);
assert.strictEqual(summary.overallRecommendation, 'proceed_with_caution');
assert.ok(summary.fireSummary.activeFireProximity.includes('4 mi'));
assert.strictEqual(summary.fireSummary.fireWeatherContext, 'elevated');

summary = evaluateRouteIntelligence('smoke-route', {
  validUntil,
  legalAccess: [signal('mvum-open', 'legal_access', 'open')],
  closures: [signal('closure-none', 'closure', 'none')],
  passability: [signal('condition-clear', 'passability', 'passable')],
  weatherFireSmoke: [signal('airnow-hazardous', 'smoke', 'Hazardous AQI 310', {
    providerId: 'airnow',
    severity: 'severe',
  })],
}, now);
assert.strictEqual(summary.overallRecommendation, 'delay');
assert.strictEqual(summary.smokeAqiSummary.worstAqi, 310);
assert.ok(summary.smokeAqiSummary.crewHealthWarning);
assert.ok(summary.smokeAqiSummary.limitationNote.includes('does not imply legal closure'));

summary = evaluateRouteIntelligence('weather-route', {
  validUntil,
  legalAccess: [signal('mvum-open', 'legal_access', 'open')],
  closures: [signal('closure-none', 'closure', 'none')],
  passability: [signal('condition-clear', 'passability', 'passable')],
  weatherFireSmoke: [signal('nws-warning', 'weather', 'Severe Thunderstorm Warning', {
    providerId: 'nws',
    severity: 'severe',
  })],
  weatherSegmentRisks: [{ segmentId: 'seg-1', riskLabel: 'severe', reasons: ['Severe thunderstorm warning'], evidenceObservationIds: ['nws-warning'] }],
}, now);
assert.strictEqual(summary.overallRecommendation, 'delay');
assert.ok(summary.weatherSummary.alerts.some((item) => item.id === 'nws-warning'));
assert.strictEqual(summary.weatherSummary.segmentRisks[0].segmentId, 'seg-1');

const noBailout = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [{
    id: 'closed-bailout',
    name: 'Closed Exit',
    legalStatus: 'closed',
    closureStatus: 'active_closure',
    passabilityStatus: 'closed',
    confidenceScore: 88,
    evidenceIds: ['closure-order'],
  }],
  evidence: [{ id: 'closure-order', providerId: 'manual_agency_ingestion', sourceName: 'Forest order', recordType: 'closure', status: 'closed', official: true }],
  now,
});
summary = evaluateRouteIntelligence('no-bailout-route', {
  validUntil,
  legalAccess: [signal('mvum-open', 'legal_access', 'open')],
  closures: [signal('closure-none', 'closure', 'none')],
  passability: [signal('condition-clear', 'passability', 'passable')],
  bailoutDecision: noBailout,
}, now);
assert.strictEqual(summary.bailoutSummary.recommendation, 'no_verified_bailout');
assert.ok(summary.bailoutSummary.noVerifiedBailoutReason);
assert.ok(summary.warnings.some((item) => item.id === 'no_verified_bailout'));

const registry = createECS5ProviderRegistry({
  ENABLE_OPENWEATHER_ONECALL: 'true',
  OPENWEATHER_API_KEY: 'key',
  ENABLE_NWS: 'true',
  NWS_USER_AGENT: 'ecs@example.test',
  ENABLE_AIRNOW: 'true',
  ENABLE_NASA_FIRMS: 'true',
  ENABLE_NIFC_WFIGS: 'true',
  ENABLE_INCIWEB: 'true',
  ENABLE_USFS_MVUM: 'true',
  ENABLE_BLM_PLAD: 'true',
  ENABLE_NPS: 'true',
  ENABLE_MANUAL_AGENCY_INGESTION: 'true',
}, [], now);
const providerSummary = getProviderHealthSummary(registry, [], now);
assert.ok(providerSummary.configuredProviders.includes('openweather_onecall'));
assert.ok(providerSummary.missingConfigProviders.includes('airnow'));
assert.ok(providerSummary.intentionallyDisabledProviders.includes('openweather_road_risk'));
assert.ok(providerSummary.intentionallyDisabledProviders.includes('openweather_air_pollution'));
assert.ok(providerSummary.intentionallyDisabledProviders.includes('openweather_fire_index'));

refreshRouteIntelligence('cached-route', {
  validUntil: '2026-04-29T17:00:00.000Z',
  offline: true,
  legalAccess: [signal('mvum-open', 'legal_access', 'open')],
  closures: [signal('closure-none', 'closure', 'none')],
  passability: [signal('condition-clear', 'passability', 'passable')],
}, now);
summary = getRouteIntelligenceSummary('cached-route', now);
assert.strictEqual(summary.offlineReadiness.isStale, true);
assert.ok(summary.offlineReadiness.staleWarning.includes('stale'));

const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5RouteIntelligence.ts'), 'utf8');
assert.ok(source.includes('export interface RouteIntelligenceSummary'));
assert.ok(source.includes('evaluateRouteIntelligence'));
assert.ok(!source.includes('fetch('), 'Unified route intelligence must stay offline/pure.');

console.log('ECS 5.0 route intelligence summary tests passed.');
