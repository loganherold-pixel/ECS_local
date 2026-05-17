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
  applyECS5SourceObservationStaleness,
  assessECS5OfflineStaleness,
  buildECS5OfflineCacheMetadata,
  staleReasonFor,
} = loadTypeScriptModule('lib/ecs5OfflineStaleness.ts');
const {
  ECS5ObservationCache,
} = loadTypeScriptModule('lib/ecs5ObservationPipeline.ts');
const {
  evaluateRouteIntelligence,
  getRouteIntelligenceSummary,
} = loadTypeScriptModule('lib/ecs5RouteIntelligence.ts');

const freshNow = new Date('2026-04-29T18:00:00.000Z');
const staleNow = new Date('2026-04-29T22:00:00.000Z');

function observation(overrides = {}) {
  return {
    id: overrides.id ?? 'obs-1',
    providerId: overrides.providerId ?? 'openweather_onecall',
    sourceName: overrides.sourceName ?? 'Provider',
    sourceType: overrides.sourceType ?? 'commercial_weather',
    subjectType: overrides.subjectType ?? 'weather_forecast',
    subjectId: null,
    geometry: null,
    bbox: null,
    observedAt: overrides.observedAt ?? '2026-04-29T17:00:00.000Z',
    publishedAt: overrides.publishedAt ?? null,
    ingestedAt: overrides.ingestedAt ?? '2026-04-29T17:05:00.000Z',
    expiresAt: overrides.expiresAt ?? null,
    rawPayloadRef: 'hash:test',
    normalizedPayload: overrides.normalizedPayload ?? {},
    evidenceUrl: null,
    contentHash: overrides.contentHash ?? 'hash-1',
    confidenceScore: overrides.confidenceScore ?? 80,
    confidenceBreakdown: {
      providerDefault: 80,
      freshness: 85,
      sourceAuthority: 80,
      completeness: 70,
      stalePenalty: 0,
    },
    knownLimitations: overrides.knownLimitations ?? [],
    supersedesObservationId: null,
    offlineCacheEligible: overrides.offlineCacheEligible ?? true,
    ...overrides,
  };
}

let staleWeather = applyECS5SourceObservationStaleness(observation(), staleNow);
assert.ok(staleWeather.confidenceScore < 80, 'Stale weather should lower confidence.');
assert.ok(staleWeather.offlineWarning.includes('Cached / Offline'));
assert.ok(staleWeather.staleReason.includes('Weather data is time-sensitive'));

const staleAirNow = applyECS5SourceObservationStaleness(observation({
  id: 'airnow-1',
  providerId: 'airnow',
  sourceType: 'official_api',
  subjectType: 'smoke_aqi',
  observedAt: '2026-04-29T17:00:00.000Z',
  confidenceScore: 90,
}), staleNow);
assert.ok(staleAirNow.confidenceScore < 90, 'Stale AirNow should lower confidence.');
assert.ok(staleAirNow.offlineWarning.includes('AirNow AQI is preliminary data'));
assert.ok(staleAirNow.knownLimitations.some((item) => item.includes('Preliminary data')));

const staleFirms = applyECS5SourceObservationStaleness(observation({
  id: 'firms-1',
  providerId: 'nasa_firms',
  sourceType: 'satellite',
  subjectType: 'active_fire',
  observedAt: '2026-04-29T17:00:00.000Z',
  confidenceScore: 88,
}), staleNow);
assert.ok(staleFirms.confidenceScore < 88, 'Stale FIRMS should lower confidence.');
assert.ok(staleFirms.offlineWarning.includes('FIRMS active fire is a satellite detection'));
assert.ok(staleFirms.knownLimitations.some((item) => item.includes('Satellite detection')));

const mvumMetadata = buildECS5OfflineCacheMetadata({
  providerId: 'usfs_mvum',
  subjectType: 'legal_access',
  observedAt: '2026-04-01T00:00:00.000Z',
}, freshNow);
const mvum = assessECS5OfflineStaleness(mvumMetadata, {
  providerId: 'usfs_mvum',
  subjectType: 'legal_access',
}, new Date('2026-04-20T00:00:00.000Z'));
assert.strictEqual(mvum.isStale, false, 'MVUM baseline should persist longer than weather.');
assert.ok(staleReasonFor({ providerId: 'usfs_mvum', subjectType: 'legal_access' }).includes('legal baseline only'));

const expiredClosure = assessECS5OfflineStaleness(buildECS5OfflineCacheMetadata({
  recordKind: 'ClosureRecord',
  recordType: 'closure',
  observedAt: '2026-04-01T00:00:00.000Z',
  effectiveEndAt: '2026-04-10T00:00:00.000Z',
}, freshNow), {
  recordKind: 'ClosureRecord',
  recordType: 'closure',
  effectiveEndAt: '2026-04-10T00:00:00.000Z',
}, freshNow);
assert.strictEqual(expiredClosure.recommendation, 'historical_context_only');
assert.ok(expiredClosure.offlineWarning.includes('historical context'));

const cache = new ECS5ObservationCache();
const cached = cache.set('weather:key', 'openweather_onecall', [observation()], 60, freshNow);
assert.ok(cached.cachedAt);
assert.ok(cached.lastVerifiedAt);
assert.ok(cached.validUntil);
assert.ok(cached.staleAt);
const cacheHit = cache.get('weather:key', staleNow);
assert.ok(cacheHit.stale, 'Observation cache should surface stale status using staleAt.');

evaluateRouteIntelligence('offline-route', {
  validUntil: '2026-04-29T18:30:00.000Z',
  offline: true,
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
    providerId: 'manual_agency_ingestion',
    kind: 'closure',
    label: 'Closure feed',
    status: 'none',
    official: true,
  }],
  passability: [],
}, freshNow);
const routeSummary = getRouteIntelligenceSummary('offline-route', staleNow);
assert.ok(routeSummary.offlineReadiness.isStale);
assert.ok(routeSummary.offlineReadiness.staleWarning.includes('Cached / Offline'));
assert.notStrictEqual(routeSummary.overallRecommendation, 'proceed');
assert.ok(routeSummary.sourceConfidenceSummary.staleDataPenalty >= 35);
assert.ok(routeSummary.unknowns.some((item) => item.id === 'offline_stale_route_intelligence'));

const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5OfflineStaleness.ts'), 'utf8');
assert.ok(source.includes('openweather_onecall'));
assert.ok(source.includes('airnow'));
assert.ok(source.includes('nasa_firms'));
assert.ok(source.includes('usfs_mvum'));
assert.ok(source.includes('blm_plad'));
assert.ok(source.includes('historical_context_only'));

console.log('ECS 5.0 offline staleness tests passed.');
