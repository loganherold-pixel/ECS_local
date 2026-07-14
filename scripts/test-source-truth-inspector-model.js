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
  buildSourceTruthInspectorModel,
  formatSourceTruthAge,
} = loadTypeScriptModule('lib/sourceTruthPresentation.ts');
const {
  buildConvoyLocationSourceTruthBinding,
  buildEstablishedCampgroundSourceTruthBinding,
  buildFleetWeightSourceTruthBinding,
  buildReadinessAssessmentSourceTruthBinding,
  buildRouteCampAccessSourceTruthBinding,
  buildRouteCatalogSourceTruthBinding,
  buildWeatherSourceTruthBinding,
} = loadTypeScriptModule('lib/sourceTruthAdapters.ts');

const now = Date.parse('2026-07-12T19:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
const minutesAgo = (minutes) => iso(now - minutes * 60_000);

function source(overrides = {}) {
  return {
    id: 'source-test',
    origin: 'live',
    authority: 'National Weather Service',
    provider: 'ECS Weather Pipeline',
    observedAt: minutesAgo(5),
    fetchedAt: minutesAgo(4),
    expiresAt: null,
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflict: false,
    warningCodes: [],
    ...overrides,
  };
}

const complete = buildSourceTruthInspectorModel({
  source: source(),
  policyKey: 'weather_observation',
  dependencies: ['Current weather assessment.'],
  now,
});
assert.strictEqual(complete.sourceName, 'National Weather Service');
assert.strictEqual(complete.freshnessLabel, 'Current');
assert.strictEqual(complete.originLabel, 'Live');
assert.strictEqual(complete.availabilityLabel, 'Usable');
assert.strictEqual(complete.coverageLabel, 'Complete');
assert.strictEqual(complete.confidenceLabel, 'High');
assert.strictEqual(complete.ageLabel, '5 minutes old');
assert.strictEqual(complete.triggerTone, 'live');
assert.deepStrictEqual(complete.dependencies, ['Current weather assessment.']);

const partial = buildSourceTruthInspectorModel({
  source: source({ coverage: 'partial', confidence: 'medium' }),
  policyKey: 'weather_observation',
  now,
});
assert.strictEqual(partial.coverageLabel, 'Partial');
assert.strictEqual(partial.confidenceLabel, 'Medium');
assert.deepStrictEqual(partial.dependencies, ['Decision dependency is unknown.']);

const stale = buildSourceTruthInspectorModel({
  source: source({ observedAt: minutesAgo(90) }),
  policyKey: 'weather_observation',
  now,
});
assert.strictEqual(stale.freshnessLabel, 'Stale');
assert.strictEqual(stale.availabilityLabel, 'Degraded / partial');
assert.strictEqual(stale.triggerTone, 'warning');
assert(stale.warnings.some((warning) => warning.code === 'stale_source'));

const cached = buildSourceTruthInspectorModel({
  source: source({ origin: 'cached' }),
  policyKey: 'weather_observation',
  now,
});
assert.strictEqual(cached.originLabel, 'Cached');
assert.strictEqual(cached.freshnessLabel, 'Current');
assert.strictEqual(cached.triggerLabel, 'Cached / Current');
assert.match(cached.summary, /saved data and is not live/i);
assert(cached.warnings.some((warning) => warning.code === 'origin_cached'));

const manual = buildSourceTruthInspectorModel({
  source: source({
    origin: 'manual',
    authority: 'User-entered vehicle profile',
    provider: null,
    observedAt: minutesAgo(60),
  }),
  policyKey: 'manual_user_state',
  now,
});
assert.strictEqual(manual.originLabel, 'Manual');
assert.strictEqual(manual.freshnessLabel, 'Current');
assert.strictEqual(manual.triggerLabel, 'Manual / Current');
assert.match(manual.summary, /manual input/i);

const lastGood = buildSourceTruthInspectorModel({
  sources: [
    source({
      id: 'live-weather-expired',
      origin: 'live',
      role: 'primary',
      policyKey: 'weather_observation',
      observedAt: minutesAgo(180),
    }),
    source({
      id: 'last-good-weather',
      origin: 'cached',
      role: 'last_good',
      policyKey: 'weather_observation',
      observedAt: minutesAgo(20),
    }),
  ],
  now,
});
assert.strictEqual(lastGood.triggerLabel, 'Last known / Live expired');
assert.strictEqual(lastGood.triggerTone, 'warning');
assert.strictEqual(lastGood.assessment.facts.usingLastGoodCache, true);
assert.match(lastGood.summary, /live source is expired/i);
assert.match(lastGood.summary, /cached rather than live/i);
assert(lastGood.warnings.some((warning) => warning.code === 'using_last_good_cache'));

const conflict = buildSourceTruthInspectorModel({
  source: source({
    conflict: true,
    confidence: 'low',
    warningCodes: ['agency_conflict'],
  }),
  policyKey: 'condition_closure_advisory',
  now,
});
assert.strictEqual(conflict.conflict, true);
assert.strictEqual(conflict.triggerTone, 'unavailable');
assert(conflict.warnings.some((warning) => warning.code === 'conflict_detected'));
assert(conflict.warnings.some((warning) => warning.code === 'agency_conflict'));

const unavailable = buildSourceTruthInspectorModel({
  source: null,
  policyKey: 'weather_observation',
  now,
});
assert.strictEqual(unavailable.sourceName, 'Unknown source');
assert.strictEqual(unavailable.freshnessLabel, 'Unavailable');
assert.strictEqual(unavailable.availabilityLabel, 'Unavailable');
assert.strictEqual(unavailable.confidenceLabel, 'Unknown');
assert.strictEqual(unavailable.ageLabel, 'Unknown');
assert(unavailable.warnings.some((warning) => warning.code === 'missing_source_truth'));

const sensitive = buildSourceTruthInspectorModel({
  source: source({
    id: 'weather-secret-source',
    authority: 'Bearer secret-session-value',
    provider: 'RIDB_API_KEY=provider-secret-value',
    warningCodes: ['authorization=bearer-secret-value'],
    rawProviderResponse: { apiKey: 'raw-secret-value' },
    restrictedCoordinates: '39.123456,-120.654321',
  }),
  dependencies: ['token=dependency-secret-value'],
  policyKey: 'weather_observation',
  now,
});
const sensitiveText = JSON.stringify(sensitive);
for (const forbidden of [
  'secret-session-value',
  'provider-secret-value',
  'bearer-secret-value',
  'raw-secret-value',
  'dependency-secret-value',
  '39.123456',
  '-120.654321',
]) {
  assert.strictEqual(sensitiveText.includes(forbidden), false, `Inspector model must omit ${forbidden}.`);
}
assert.strictEqual(sensitive.sourceName, 'Restricted source');
assert.deepStrictEqual(sensitive.dependencies, ['Restricted dependency detail omitted.']);

const readinessBinding = buildReadinessAssessmentSourceTruthBinding({
  updatedAt: minutesAgo(1),
  confidence: 'medium',
  sourceFreshness: {
    weather: {
      isStale: true,
      isMissing: false,
      isMock: false,
      isDemo: false,
      isInferred: false,
    },
  },
  dataIntegrity: {
    unmarkedSyntheticData: [],
  },
});
assert.strictEqual(readinessBinding.ref.origin, 'inferred');
assert.strictEqual(readinessBinding.ref.availability, 'degraded');
assert.strictEqual(readinessBinding.ref.confidence, 'medium');
assert.strictEqual(readinessBinding.ref.coverage, 'complete');
assert.strictEqual(readinessBinding.policyKey, 'default');
assert(readinessBinding.ref.warningCodes.includes('readiness_sources_stale'));

const weatherBinding = buildWeatherSourceTruthBinding({
  source: 'cache_fresh',
  provider: 'ECS Weather Pipeline',
  observedAt: minutesAgo(5),
  retrievedAt: now - 2 * 60_000,
  available: true,
  stale: false,
  hasCurrentConditions: true,
  hasForecast: false,
});
assert.strictEqual(weatherBinding.ref.origin, 'cached');
assert.strictEqual(weatherBinding.ref.coverage, 'partial');
assert.strictEqual(weatherBinding.ref.confidence, 'unknown');
assert.strictEqual(weatherBinding.policyKey, 'weather_observation');

const weatherFallbackBinding = buildWeatherSourceTruthBinding({
  source: 'cache_fresh',
  provider: 'ECS Weather Pipeline',
  observedAt: minutesAgo(5),
  retrievedAt: now - 2 * 60_000,
  available: true,
  hasCurrentConditions: true,
  hasForecast: true,
  providerLimited: true,
});
assert.strictEqual(weatherFallbackBinding.sources.length, 2);
assert.strictEqual(weatherFallbackBinding.sources[0].origin, 'live');
assert.strictEqual(weatherFallbackBinding.sources[0].availability, 'unavailable');
assert.strictEqual(weatherFallbackBinding.sources[1].role, 'last_good');
const weatherFallbackModel = buildSourceTruthInspectorModel({
  source: weatherFallbackBinding.ref,
  sources: weatherFallbackBinding.sources,
  now,
});
assert.strictEqual(weatherFallbackModel.assessment.facts.usingLastGoodCache, true);

const fleetBinding = buildFleetWeightSourceTruthBinding({
  vehicleId: 'vehicle-1',
  vehicleName: 'Trail Truck',
  updatedAt: minutesAgo(30),
  weightResult: {
    baseNetWeight: {
      lbs: 5100,
      source: 'scale_ticket',
      confidence: 98,
      sourceLabel: 'Certified scale ticket',
      verifiedAt: minutesAgo(30),
      verificationId: 'restricted-document-id',
    },
    gvwr: {
      lbs: 7200,
      source: 'manufacturer_spec',
      confidence: 92,
      sourceLabel: 'Manufacturer specification',
    },
  },
});
assert.strictEqual(fleetBinding.sources[0].origin, 'manual');
assert.strictEqual(fleetBinding.sources[0].authorityKind, 'verified_document');
assert.strictEqual(fleetBinding.sources[1].origin, 'cached');
assert.strictEqual(fleetBinding.sources[1].authorityKind, 'official');
assert.strictEqual(JSON.stringify(fleetBinding).includes('restricted-document-id'), false);

const routeCampBinding = buildRouteCampAccessSourceTruthBinding({
  id: 'camp-access-test',
  authority: 'US Forest Service official order',
  authorityKind: 'official',
  provider: 'USFS',
  legalAccessVerified: true,
  legalObservedAt: minutesAgo(30),
  currentConditionsKnown: false,
  passabilityKnown: false,
  availabilityKnown: false,
  confidence: 'high',
});
assert.strictEqual(routeCampBinding.sources[0].availability, 'usable');
assert.strictEqual(routeCampBinding.sources[0].authorityKind, 'official');
assert.strictEqual(routeCampBinding.sources[1].availability, 'unavailable');
assert(routeCampBinding.sources[1].warningCodes.includes('current_conditions_unknown'));
assert(routeCampBinding.sources[2].warningCodes.includes('passability_unknown'));
assert(routeCampBinding.sources[3].warningCodes.includes('camp_availability_unknown'));

const campgroundBinding = buildEstablishedCampgroundSourceTruthBinding({
  id: 'camp-1',
  name: 'Provider Camp',
  latitude: 39,
  longitude: -120,
  facilityType: 'campground',
  managingAgency: 'National Forest',
  managingOrg: null,
  reservationUrl: null,
  detailUrl: null,
  status: 'open',
  availabilityStatus: 'unknown',
  siteCount: null,
  siteTypes: null,
  amenities: null,
  sourceConfidence: 90,
  primaryProvider: 'ridb',
  attribution: 'Recreation provider',
  lastSyncedAt: minutesAgo(10),
  lastVerifiedAt: minutesAgo(30),
  sources: [{
    providerId: 'ridb',
    providerRecordId: 'secret-record-id',
    sourceUrl: 'https://provider.invalid?api_key=secret',
    rawJson: { apiKey: 'raw-secret' },
    payloadHash: 'sensitive-hash',
    firstSeenAt: minutesAgo(60),
    lastSeenAt: minutesAgo(10),
  }],
});
const campgroundText = JSON.stringify(campgroundBinding);
for (const forbidden of ['secret-record-id', 'api_key', 'raw-secret', 'sensitive-hash', '39', '-120']) {
  assert.strictEqual(campgroundText.includes(forbidden), false, `Camp adapter must omit ${forbidden}.`);
}

const convoyBinding = buildConvoyLocationSourceTruthBinding({
  memberId: 'member-7',
  sourceLabel: 'Realtime GPS',
  observedAt: minutesAgo(12),
  accuracyMeters: 18,
  stale: true,
});
const convoyModel = buildSourceTruthInspectorModel({
  sources: convoyBinding.sources,
  now,
});
assert.strictEqual(convoyModel.freshnessLabel, 'Stale');
assert.strictEqual(convoyModel.confidenceLabel, 'High');
assert.strictEqual(convoyBinding.ref.authorityKind, 'device');

const routeBinding = buildRouteCatalogSourceTruthBinding({
  routeId: 'route-preview',
  title: 'Preview Route',
  region: null,
  forestName: null,
  distanceMeters: null,
  estimatedDurationSeconds: null,
  difficulty: null,
  popularityScore: null,
  communityRating: null,
  sourceType: 'preview',
  bbox: null,
  trailheadCoordinate: null,
  thumbnailUrl: null,
  thumbnailAssetKey: null,
  updatedAt: minutesAgo(10),
  tags: [],
});
assert.strictEqual(routeBinding.ref.origin, 'inferred');
assert.strictEqual(routeBinding.ref.confidence, 'unknown');
assert.strictEqual(routeBinding.ref.coverage, 'partial');
assert.strictEqual(routeBinding.ref.availability, 'degraded');
assert(routeBinding.ref.warningCodes.includes('route_legal_status_unverified'));

assert.strictEqual(formatSourceTruthAge(59_999), 'Less than 1 minute old');
assert.strictEqual(formatSourceTruthAge(60_000), '1 minute old');
assert.strictEqual(formatSourceTruthAge(60 * 60_000), '1 hour old');
assert.strictEqual(formatSourceTruthAge(null), 'Unknown');

console.log('Source Truth Inspector presentation-model checks passed.');
