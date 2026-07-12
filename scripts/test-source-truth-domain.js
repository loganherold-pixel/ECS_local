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
  SOURCE_TRUTH_FRESHNESS_POLICIES,
  assessEcsSummarySourceTruth,
  assessSourceTruth,
  evaluateSourceTruthRef,
  listFreshnessPolicies,
  mapSourceTruthFreshnessToEcsFreshness,
  sanitizeSourceTruthRef,
} = loadTypeScriptModule('lib/sourceTruth.ts');
const { ecsBus } = loadTypeScriptModule('lib/ecsBus.ts');

const now = Date.parse('2026-07-12T19:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
const minutesAgo = (minutes) => iso(now - minutes * 60_000);
const daysAgo = (days) => iso(now - days * 24 * 60 * 60_000);

function source(overrides = {}) {
  return {
    id: overrides.id ?? 'test-source',
    origin: overrides.origin ?? 'live',
    authority: overrides.authority ?? null,
    provider: overrides.provider ?? null,
    observedAt: Object.prototype.hasOwnProperty.call(overrides, 'observedAt')
      ? overrides.observedAt
      : minutesAgo(1),
    fetchedAt: overrides.fetchedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    confidence: overrides.confidence ?? 'medium',
    coverage: overrides.coverage ?? 'complete',
    availability: overrides.availability ?? 'usable',
    conflict: overrides.conflict ?? false,
    warningCodes: overrides.warningCodes ?? [],
  };
}

[
  'default',
  'convoy_member_location',
  'weather_observation',
  'weather_forecast',
  'vehicle_profile',
  'vehicle_telemetry',
  'route_legal_access_evidence',
  'condition_closure_advisory',
  'offline_map_route_package',
  'camp_provider_availability',
  'manual_user_state',
].forEach((key) => {
  assert.ok(SOURCE_TRUTH_FRESHNESS_POLICIES[key], `policy ${key} should be registered`);
});
assert.ok(listFreshnessPolicies().length >= 11, 'policy registry should enumerate domain policies');

const defaultPolicy = SOURCE_TRUTH_FRESHNESS_POLICIES.default;
assert.strictEqual(
  evaluateSourceTruthRef(source({ observedAt: iso(now - defaultPolicy.liveMs) }), {
    policyKey: 'default',
    now,
  }).freshness,
  'live',
  'exact live boundary should remain live',
);
assert.strictEqual(
  evaluateSourceTruthRef(source({ observedAt: iso(now - defaultPolicy.liveMs - 1) }), {
    policyKey: 'default',
    now,
  }).freshness,
  'recent',
  'first millisecond after live boundary should be recent',
);
assert.strictEqual(
  evaluateSourceTruthRef(source({ observedAt: iso(now - defaultPolicy.recentMs) }), {
    policyKey: 'default',
    now,
  }).freshness,
  'recent',
  'exact recent boundary should remain recent',
);
assert.strictEqual(
  evaluateSourceTruthRef(source({ observedAt: iso(now - defaultPolicy.staleMs) }), {
    policyKey: 'default',
    now,
  }).freshness,
  'stale',
  'exact stale boundary should remain stale',
);
assert.strictEqual(
  evaluateSourceTruthRef(source({ observedAt: iso(now - defaultPolicy.staleMs - 1) }), {
    policyKey: 'default',
    now,
  }).freshness,
  'unavailable',
  'default policy should preserve old unavailable-after-stale behavior',
);

const overrideExpired = evaluateSourceTruthRef(source({ observedAt: iso(now - 25_000) }), {
  policyKey: 'default',
  now,
  policyOverride: {
    liveMs: 5_000,
    recentMs: 10_000,
    staleMs: 20_000,
    expiredMs: 30_000,
  },
});
assert.strictEqual(overrideExpired.freshness, 'expired', 'policy override should support explicit expired band');
assert.strictEqual(overrideExpired.availability, 'unavailable', 'default expired availability remains conservative');

const invalidTimestamp = evaluateSourceTruthRef(source({ observedAt: 'not-a-date' }), {
  policyKey: 'weather_observation',
  now,
});
assert.strictEqual(invalidTimestamp.freshness, 'unavailable');
assert.ok(invalidTimestamp.warningCodes.includes('invalid_observed_at'));
assert.ok(invalidTimestamp.warningCodes.includes('invalid_timestamp'));

const missingTimestamp = evaluateSourceTruthRef(source({ observedAt: null, fetchedAt: null }), {
  policyKey: 'weather_observation',
  now,
});
assert.strictEqual(missingTimestamp.freshness, 'unavailable');
assert.ok(missingTimestamp.warningCodes.includes('missing_timestamp'));

const futureTimestamp = evaluateSourceTruthRef(source({ observedAt: iso(now + 15 * 60_000) }), {
  policyKey: 'vehicle_telemetry',
  now,
});
assert.strictEqual(futureTimestamp.freshness, 'unavailable');
assert.ok(futureTimestamp.warningCodes.includes('future_timestamp'));

const liveOrigin = evaluateSourceTruthRef(source({ origin: 'live', observedAt: minutesAgo(1) }), {
  policyKey: 'weather_observation',
  now,
});
const cachedOrigin = evaluateSourceTruthRef(source({ origin: 'cached', observedAt: minutesAgo(1) }), {
  policyKey: 'weather_observation',
  now,
});
assert.strictEqual(liveOrigin.freshness, 'live');
assert.strictEqual(cachedOrigin.freshness, 'live');
assert.strictEqual(cachedOrigin.ref.origin, 'cached', 'cached data must retain cached origin when recently read');
assert.ok(cachedOrigin.warningCodes.includes('origin_cached'));

const manualRecent = evaluateSourceTruthRef(source({
  id: 'manual-fuel-range',
  origin: 'manual',
  observedAt: minutesAgo(3),
  confidence: 'medium',
}), {
  policyKey: 'manual_user_state',
  now,
});
assert.strictEqual(manualRecent.freshness, 'live');
assert.strictEqual(manualRecent.ref.origin, 'manual', 'manual edit freshness must not become live origin');
assert.ok(manualRecent.warningCodes.includes('origin_manual'));

const expiredWeatherCache = evaluateSourceTruthRef(source({
  id: 'weather-last-good-cache',
  origin: 'cached',
  fetchedAt: minutesAgo(20),
  observedAt: null,
  expiresAt: minutesAgo(1),
  confidence: 'medium',
  availability: 'usable',
}), {
  policyKey: 'weather_observation',
  now,
});
assert.strictEqual(expiredWeatherCache.freshness, 'expired');
assert.strictEqual(expiredWeatherCache.availability, 'degraded', 'expired last-good cache should degrade, not vanish');
assert.ok(expiredWeatherCache.warningCodes.includes('expired_source'));

const staleConvoy = evaluateSourceTruthRef(source({
  id: 'convoy-member-tail',
  origin: 'live',
  observedAt: minutesAgo(12),
  confidence: 'medium',
}), {
  policyKey: 'convoy_member_location',
  now,
});
assert.strictEqual(staleConvoy.freshness, 'stale');
assert.strictEqual(staleConvoy.availability, 'degraded');

const verifiedVehicle = evaluateSourceTruthRef(source({
  id: 'vehicle-profile-verified',
  origin: 'manual',
  authority: 'verified_scale_ticket',
  observedAt: daysAgo(180),
  confidence: 'high',
  coverage: 'complete',
}), {
  policyKey: 'vehicle_profile',
  now,
});
assert.strictEqual(verifiedVehicle.freshness, 'recent', 'verified vehicle profiles should age on a long-lived policy');
assert.strictEqual(verifiedVehicle.confidence, 'high');
assert.strictEqual(verifiedVehicle.availability, 'usable');

const offlinePackage = evaluateSourceTruthRef(source({
  id: 'offline-route-package',
  origin: 'cached',
  fetchedAt: daysAgo(20),
  observedAt: null,
  expiresAt: iso(now + 5 * 24 * 60 * 60_000),
  confidence: 'high',
  coverage: 'complete',
}), {
  policyKey: 'offline_map_route_package',
  now,
});
assert.strictEqual(offlinePackage.freshness, 'recent');
assert.strictEqual(offlinePackage.availability, 'usable');
assert.strictEqual(offlinePackage.coverage, 'complete');

const conflict = assessSourceTruth([
  source({
    id: 'official-closure',
    origin: 'live',
    authority: 'agency_order',
    confidence: 'high',
    conflict: true,
    warningCodes: ['agency_conflict'],
  }),
  source({
    id: 'community-open',
    origin: 'cached',
    confidence: 'low',
    conflict: true,
  }),
], {
  policyKey: 'route_legal_access_evidence',
  now,
});
assert.strictEqual(conflict.conflict, true);
assert.strictEqual(conflict.confidence, 'low');
assert.ok(conflict.warningCodes.includes('conflict_detected'));
assert.ok(conflict.warningCodes.includes('agency_conflict'));

const redacted = sanitizeSourceTruthRef(source({
  id: 'source-with-token',
  provider: 'RIDB_API_KEY=super-secret',
  authority: 'Bearer abcdefghijklmnopqrstuvwxyz',
  warningCodes: ['token=super-secret'],
}));
assert.strictEqual(redacted.provider, '[redacted]');
assert.strictEqual(redacted.authority, '[redacted]');
assert.ok(!redacted.warningCodes.join(' ').includes('super-secret'));

const legacyAssessment = assessEcsSummarySourceTruth({
  updated_at: minutesAgo(1),
  freshness: 'stale',
  available: true,
}, {
  id: 'legacy-summary',
  policyKey: 'default',
  now,
});
assert.strictEqual(legacyAssessment.sources[0].ref.origin, 'inferred');
assert.ok(legacyAssessment.warningCodes.includes('legacy_freshness_stale'));

ecsBus.reset();
const originalDateNow = Date.now;
Date.now = () => now;
try {
  ecsBus.publishImmediate('route', 'source_truth_test', {
    updated_at: minutesAgo(60),
    freshness: 'stale',
    available: true,
    sourceTruthPolicyKey: 'weather_observation',
    sourceTruth: [source({
      id: 'route-weather-cache',
      origin: 'cached',
      provider: 'NWS',
      observedAt: minutesAgo(20),
      confidence: 'medium',
      coverage: 'partial',
    })],
    has_active_route: true,
    route_name: 'Policy Route',
    distance_mi: 42,
    elevation_gain_ft: 1200,
    waypoint_count: 4,
  });

  assert.strictEqual(
    ecsBus.getChannelFreshness('route'),
    'live',
    'legacy bus freshness should still use publish recency for unmigrated consumers',
  );
  assert.strictEqual(
    ecsBus.getChannelFreshnessWithPolicy('route', { now }),
    'recent',
    'opt-in policy freshness should use source truth timestamps',
  );
  const busAssessment = ecsBus.getChannelSourceTruth('route', { now });
  assert.strictEqual(busAssessment.sources[0].ref.origin, 'cached');
  assert.strictEqual(busAssessment.coverage, 'partial');
  assert.strictEqual(mapSourceTruthFreshnessToEcsFreshness(busAssessment.freshness), 'recent');
  assert.strictEqual(ecsBus.getSummary('route').route_name, 'Policy Route');
} finally {
  Date.now = originalDateNow;
  ecsBus.reset();
}

console.log('Source truth domain policy tests passed.');
