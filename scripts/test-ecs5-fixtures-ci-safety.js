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

const fixturePath = path.join(process.cwd(), 'fixtures', 'ecs5', 'provider-fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const fixtureText = fs.readFileSync(fixturePath, 'utf8');
let networkCallCount = 0;
const originalFetch = global.fetch;
global.fetch = async () => {
  networkCallCount += 1;
  throw new Error('Live network calls are forbidden in ECS 5.0 fixture CI tests.');
};

const {
  createECS5ProviderRegistry,
  getProviderConfig,
} = loadTypeScriptModule('lib/ecs5ProviderRegistry.ts');
const {
  createOpenWeatherOneCallAdapter,
  normalizeOpenWeatherOneCallPayload,
} = loadTypeScriptModule('lib/openWeatherOneCallAdapter.ts');
const {
  createNwsWeatherAdapter,
  normalizeNwsWeatherPayload,
} = loadTypeScriptModule('lib/nwsWeatherAdapter.ts');
const {
  createAirNowAdapter,
  normalizeAirNowPayload,
} = loadTypeScriptModule('lib/airNowAdapter.ts');
const {
  createNasaFirmsAdapter,
  createWfigsAdapter,
  createInciWebAdapter,
  normalizeNasaFirmsPayload,
  normalizeWfigsPayload,
  normalizeInciWebPayload,
} = loadTypeScriptModule('lib/ecs5FireIntelligence.ts');
const {
  createAgencyFeed,
  normalizeAgencyFeedPayload,
} = loadTypeScriptModule('lib/ecs5AgencyIngestion.ts');
const {
  evaluateRouteIntelligence,
} = loadTypeScriptModule('lib/ecs5RouteIntelligence.ts');
const {
  evaluateBailoutRoutes,
} = loadTypeScriptModule('lib/ecs5BailoutRouteManagement.ts');

const now = new Date('2026-04-29T18:00:00.000Z');
const registry = createECS5ProviderRegistry({
  ENABLE_OPENWEATHER_ONECALL: 'true',
  OPENWEATHER_API_KEY: 'fixture-only',
  ENABLE_NWS: 'true',
  NWS_USER_AGENT: 'fixture@example.test',
  ENABLE_AIRNOW: 'true',
  AIRNOW_API_KEY: 'fixture-only',
  ENABLE_NASA_FIRMS: 'true',
  NASA_FIRMS_MAP_KEY: 'fixture-only',
  ENABLE_NIFC_WFIGS: 'true',
  ENABLE_INCIWEB: 'true',
  ENABLE_USFS_MVUM: 'true',
  ENABLE_BLM_PLAD: 'true',
  ENABLE_NPS: 'true',
  NPS_API_KEY: 'fixture-only',
  ENABLE_MANUAL_AGENCY_INGESTION: 'true',
}, [], now);

function provider(id) {
  const resolved = getProviderConfig(id, registry);
  assert.ok(resolved, `Expected provider config for ${id}`);
  return resolved;
}

function requireFixture(pathParts) {
  let current = fixtures;
  for (const part of pathParts) current = current?.[part];
  assert.ok(current != null, `Missing fixture ${pathParts.join('.')}`);
  return current;
}

for (const pathParts of [
  ['openWeather', 'normalForecast'],
  ['openWeather', 'severeWeatherAlert'],
  ['openWeather', 'snowForecast'],
  ['openWeather', 'heavyRainForecast'],
  ['openWeather', 'highWindForecast'],
  ['nws', 'points'],
  ['nws', 'hourlyForecast'],
  ['nws', 'activeAlertWithGeometry'],
  ['nws', 'redFlagWarning'],
  ['nws', 'floodWinterHighWindAlert'],
  ['airNow', 'good'],
  ['airNow', 'unhealthySensitive'],
  ['airNow', 'unhealthy'],
  ['airNow', 'veryUnhealthy'],
  ['airNow', 'hazardous'],
  ['airNow', 'staleAqi'],
  ['nasaFirms', 'activeFireFarFromRoute'],
  ['nasaFirms', 'activeFireNearRoute'],
  ['nasaFirms', 'activeFireIntersectingRouteBbox'],
  ['nasaFirms', 'lowConfidenceOlderDetection'],
  ['wfigs', 'perimeterNotIntersectingRoute'],
  ['wfigs', 'perimeterNearRoute'],
  ['wfigs', 'perimeterIntersectingRoute'],
  ['wfigs', 'inactiveHistoricalPerimeter'],
  ['inciWeb', 'incidentSummaryWithUrl'],
  ['inciWeb', 'incidentUpdate'],
  ['inciWeb', 'incidentWithClosureLanguage'],
  ['usfsMvum', 'roadOpenToHighwayLegalVehicles'],
  ['usfsMvum', 'trailOpenToMotorcyclesOnly'],
  ['usfsMvum', 'seasonalRoad'],
  ['usfsMvum', 'routeNotOpenToPublicMotorVehicleTravel'],
  ['usfsMvum', 'legalButLowStandardRoad'],
  ['blmPlad', 'legalAccessLine'],
  ['blmPlad', 'accessPolygon'],
  ['blmPlad', 'routeCrossingNonBlmLandWarningCase'],
  ['nps', 'parkAlert'],
  ['nps', 'roadClosureAlert'],
  ['nps', 'generalInformationalAlert'],
  ['dot511', 'activeRoadClosure'],
  ['dot511', 'chainControlRestriction'],
  ['dot511', 'detour'],
  ['dot511', 'expiredEvent'],
  ['manual', 'manualClosureWithSourceUrl'],
  ['manual', 'manualRestrictionWithExpiration'],
  ['manual', 'manualRoadConditionReport'],
  ['community', 'blockedRouteReport'],
  ['community', 'washoutReport'],
  ['community', 'gateClosedReport'],
  ['community', 'communityOpenConflictingWithOfficialClosure'],
]) {
  requireFixture(pathParts);
}

assert.ok(!/api[_-]?key|appid|token|secret|password/i.test(fixtureText), 'Fixtures must not contain API keys, tokens, or secrets.');

async function verifyFixtureModeFetches() {
  const noNetwork = async () => {
    networkCallCount += 1;
    throw new Error('serverFetch should not be called in fixture mode.');
  };
  const openWeatherAdapter = createOpenWeatherOneCallAdapter(provider('openweather_onecall'));
  const nwsAdapter = createNwsWeatherAdapter(provider('nws'));
  const airNowAdapter = createAirNowAdapter(provider('airnow'));
  const firmsAdapter = createNasaFirmsAdapter(provider('nasa_firms'));
  const wfigsAdapter = createWfigsAdapter(provider('nifc_wfigs'));
  const inciWebAdapter = createInciWebAdapter(provider('inciweb'));

  assert.deepStrictEqual(await openWeatherAdapter.fetch({ fixturePayload: fixtures.openWeather.normalForecast }, { fixtureMode: true, serverFetch: noNetwork }), fixtures.openWeather.normalForecast);
  assert.deepStrictEqual(await nwsAdapter.fetch({ fixturePayload: { points: fixtures.nws.points, forecastHourly: fixtures.nws.hourlyForecast, alerts: fixtures.nws.activeAlertWithGeometry } }, { fixtureMode: true, serverFetch: noNetwork }), { points: fixtures.nws.points, forecastHourly: fixtures.nws.hourlyForecast, alerts: fixtures.nws.activeAlertWithGeometry });
  assert.deepStrictEqual(await airNowAdapter.fetch({ fixturePayload: fixtures.airNow.good }, { fixtureMode: true, serverFetch: noNetwork }), fixtures.airNow.good);
  assert.deepStrictEqual(await firmsAdapter.fetch({ fixturePayload: fixtures.nasaFirms.activeFireNearRoute }, { fixtureMode: true, serverFetch: noNetwork }), fixtures.nasaFirms.activeFireNearRoute);
  assert.deepStrictEqual(await wfigsAdapter.fetch({ fixturePayload: fixtures.wfigs.perimeterIntersectingRoute }, { fixtureMode: true, serverFetch: noNetwork }), fixtures.wfigs.perimeterIntersectingRoute);
  assert.deepStrictEqual(await inciWebAdapter.fetch({ fixturePayload: fixtures.inciWeb.incidentSummaryWithUrl }, { fixtureMode: true, serverFetch: noNetwork }), fixtures.inciWeb.incidentSummaryWithUrl);
}

function verifyNormalizers() {
  const ow = normalizeOpenWeatherOneCallPayload(fixtures.openWeather.severeWeatherAlert, provider('openweather_onecall'), { now });
  assert.ok(ow.some((observation) => observation.subjectType === 'weather_alert' && observation.normalizedPayload.sender_name === 'National Weather Service'));

  const nws = normalizeNwsWeatherPayload({
    points: fixtures.nws.points,
    forecastHourly: fixtures.nws.hourlyForecast,
    alerts: fixtures.nws.activeAlertWithGeometry,
  }, provider('nws'), { now });
  assert.ok(nws.some((observation) => observation.subjectType === 'weather_forecast'));
  assert.ok(nws.some((observation) => observation.subjectType === 'weather_alert' && observation.geometry));

  const airNowHazardous = normalizeAirNowPayload(fixtures.airNow.hazardous, provider('airnow'), { now });
  assert.strictEqual(airNowHazardous[0].normalizedPayload.risk, 'severe');

  const firms = normalizeNasaFirmsPayload(fixtures.nasaFirms.activeFireNearRoute, provider('nasa_firms'), { now });
  assert.strictEqual(firms[0].subjectType, 'active_fire');

  const wfigs = normalizeWfigsPayload(fixtures.wfigs.perimeterIntersectingRoute, provider('nifc_wfigs'), { now });
  assert.ok(wfigs.some((observation) => observation.subjectType === 'fire_perimeter'));

  const inciWeb = normalizeInciWebPayload(fixtures.inciWeb.incidentWithClosureLanguage, provider('inciweb'), { now });
  assert.ok(inciWeb[0].normalizedPayload.closureLanguagePresent);
  assert.ok(inciWeb[0].knownLimitations.includes('closure_language_requires_careful_parsing'));
  assert.strictEqual(inciWeb[0].normalizedPayload.legalClosureSignal, false);

  const mvum = normalizeAgencyFeedPayload(createAgencyFeed({ id: 'mvum', providerId: 'usfs_mvum', name: 'MVUM', agencyName: 'USFS' }), fixtures.usfsMvum.roadOpenToHighwayLegalVehicles, now);
  assert.strictEqual(mvum[0].recordType, 'legal_access');

  const blm = normalizeAgencyFeedPayload(createAgencyFeed({ id: 'blm', providerId: 'blm_plad', name: 'BLM PLAD', agencyName: 'BLM' }), fixtures.blmPlad.routeCrossingNonBlmLandWarningCase, now);
  assert.ok(blm[0].knownLimitations.some((item) => item.includes('mapped_access')));

  const nps = normalizeAgencyFeedPayload(createAgencyFeed({ id: 'nps', providerId: 'nps', name: 'NPS Alerts', agencyName: 'NPS' }), fixtures.nps.roadClosureAlert, now);
  assert.ok(nps.some((observation) => observation.recordType === 'closure' || String(observation.normalizedPayload.status).includes('closure')));

  const dot = normalizeAgencyFeedPayload(createAgencyFeed({ id: 'dot', providerId: 'state_dot_511', name: 'DOT', agencyName: 'State DOT' }), fixtures.dot511.activeRoadClosure, now);
  assert.ok(dot.some((observation) => observation.recordType === 'closure'));

  const manual = normalizeAgencyFeedPayload(createAgencyFeed({ id: 'manual', providerId: 'manual_agency_ingestion', name: 'Manual', agencyName: 'Admin' }), fixtures.manual.manualClosureWithSourceUrl, now);
  assert.ok(manual.some((observation) => observation.recordType === 'closure'));
}

function sig(id, kind, status, overrides = {}) {
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
    confidence: 'high',
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

function baseContext(overrides = {}) {
  return {
    validUntil: '2026-04-29T20:00:00.000Z',
    legalAccess: [sig('mvum-open', 'legal_access', 'open')],
    closures: [sig('closure-none', 'closure', 'none')],
    passability: [sig('condition-passable', 'passability', 'passable')],
    weatherFireSmoke: [],
    communityReports: [],
    bailoutRoutes: [{ id: 'bailout-1', label: 'Pavement exit', status: 'available', sourceConfidence: 'high' }],
    ...overrides,
  };
}

function verifyEndToEndScenarios() {
  let summary = evaluateRouteIntelligence('clean-route', baseContext(), now);
  assert.strictEqual(summary.overallRecommendation, 'proceed');
  assert.strictEqual(summary.overallRiskLabel, 'low');
  assert.strictEqual(summary.bailoutSummary.rankedBailouts.length, 0);

  summary = evaluateRouteIntelligence('official-closure-route', baseContext({
    closures: [sig('agency-closure', 'closure', 'closed by forest order')],
  }), now);
  assert.strictEqual(summary.overallRecommendation, 'do_not_travel');
  assert.ok(summary.blockingIssues.some((issue) => issue.id === 'official_closure'));

  summary = evaluateRouteIntelligence('community-blockage-route', baseContext({
    communityReports: [sig(fixtures.community.washoutReport.id, 'community_report', fixtures.community.washoutReport.status, {
      official: false,
      severity: 'warning',
      detail: fixtures.community.washoutReport.detail,
    })],
    passability: [sig('community-passability', 'passability', 'washed out', { providerId: 'community', severity: 'warning', official: false })],
  }), now);
  assert.strictEqual(summary.legalStatusSummary.status, 'legal_open');
  assert.strictEqual(summary.passabilitySummary.status, 'impassable');

  summary = evaluateRouteIntelligence('fire-perimeter-route', baseContext({
    weatherFireSmoke: [sig('wfigs-intersect', 'fire', 'active perimeter intersects route', { providerId: 'nifc_wfigs', severity: 'critical' })],
  }), now);
  assert.strictEqual(summary.overallRecommendation, 'reroute');
  assert.strictEqual(summary.fireSummary.perimeterIntersection, true);
  assert.strictEqual(summary.legalStatusSummary.status, 'legal_open');

  summary = evaluateRouteIntelligence('active-fire-nearby-route', baseContext({
    weatherFireSmoke: [sig('firms-near', 'fire', 'nearby active fire detection', { providerId: 'nasa_firms', severity: 'warning', detail: 'FIRMS detection 4 mi from route.' })],
  }), now);
  assert.strictEqual(summary.overallRecommendation, 'proceed_with_caution');
  assert.ok(summary.fireSummary.activeFireProximity.includes('4 mi'));

  summary = evaluateRouteIntelligence('smoke-route', baseContext({
    weatherFireSmoke: [sig('airnow-hazardous', 'smoke', 'Hazardous AQI 340', { providerId: 'airnow', severity: 'severe' })],
  }), now);
  assert.strictEqual(summary.overallRecommendation, 'delay');
  assert.ok(summary.smokeAqiSummary.crewHealthWarning);

  summary = evaluateRouteIntelligence('severe-weather-route', baseContext({
    weatherFireSmoke: [sig('nws-severe', 'weather', 'Severe Thunderstorm Warning', { providerId: 'nws', severity: 'severe' })],
  }), now);
  assert.strictEqual(summary.overallRecommendation, 'delay');
  assert.ok(summary.warnings.some((issue) => issue.id === 'severe_weather'));

  summary = evaluateRouteIntelligence('unknown-legality-route', baseContext({
    legalAccess: [],
  }), now);
  assert.strictEqual(summary.overallRecommendation, 'verify');

  const noValidBailout = evaluateBailoutRoutes({
    primaryRouteId: 'primary-no-bailout',
    bailoutRoutes: [
      { id: 'closed-bailout', name: 'Closed bailout', closureStatus: 'active_closure', legalStatus: 'closed', passabilityStatus: 'closed', evidenceIds: ['closure'] },
      { id: 'private-bailout', name: 'Private bailout', legalStatus: 'private', closureStatus: 'unknown', passabilityStatus: 'unknown', evidenceIds: ['unknown'] },
    ],
    evidence: [{ id: 'closure', providerId: 'manual_agency_ingestion', sourceName: 'Closure', recordType: 'closure', status: 'closed', official: true }],
    now,
  });
  summary = evaluateRouteIntelligence('no-valid-bailout-route', baseContext({ bailoutDecision: noValidBailout }), now);
  assert.strictEqual(summary.bailoutSummary.recommendation, 'no_verified_bailout');
  assert.ok(summary.warnings.some((issue) => issue.id === 'no_verified_bailout'));

  const disabledRegistry = createECS5ProviderRegistry({}, [], now);
  for (const id of ['openweather_road_risk', 'openweather_air_pollution', 'openweather_fire_index']) {
    assert.strictEqual(getProviderConfig(id, disabledRegistry).status, 'intentionally_disabled');
  }
}

verifyNormalizers();
verifyEndToEndScenarios();

verifyFixtureModeFetches()
  .then(() => {
    assert.strictEqual(networkCallCount, 0, 'Fixture CI test should not make live network calls.');
    const packageJson = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
    assert.ok(packageJson.includes('test:ecs5-fixtures-ci-safety'));
    console.log('ECS 5.0 fixture and CI safety tests passed.');
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
