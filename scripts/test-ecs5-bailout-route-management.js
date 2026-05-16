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
  evaluateBailoutRoutes,
} = loadTypeScriptModule('lib/ecs5BailoutRouteManagement.ts');

const now = new Date('2026-04-29T18:00:00.000Z');
const line = { type: 'LineString', coordinates: [[-121.2, 38.8], [-121.1, 38.9]] };

function evidence(id, providerId, overrides = {}) {
  return {
    id,
    providerId,
    sourceName: providerId,
    sourceType: providerId === 'community' ? 'community_report' : 'official_api',
    recordType: overrides.recordType ?? 'agency_notice',
    observedAt: overrides.observedAt ?? '2026-04-29T17:00:00.000Z',
    expiresAt: overrides.expiresAt ?? '2026-05-01T00:00:00.000Z',
    geometry: line,
    evidenceUrl: `https://example.test/${id}`,
    official: providerId !== 'community',
    ...overrides,
  };
}

function openRoute(overrides = {}) {
  return {
    id: overrides.id ?? 'open-exit',
    expeditionId: 'exp-1',
    primaryRouteId: 'primary-1',
    name: overrides.name ?? 'North Ridge Exit',
    type: overrides.type ?? 'alternate_exit',
    geometry: line,
    startSegmentId: 'seg-1',
    destinationLabel: overrides.destinationLabel ?? 'Pavement',
    estimatedDistance: overrides.estimatedDistance ?? 12,
    estimatedDuration: overrides.estimatedDuration ?? 45,
    technicalDifficulty: overrides.technicalDifficulty ?? 'moderate',
    minVehicleCapability: overrides.minVehicleCapability ?? 'high_clearance',
    driverSkillRecommendation: overrides.driverSkillRecommendation ?? 'intermediate',
    fuelRequirementEstimate: overrides.fuelRequirementEstimate ?? 18,
    daylightRequirementEstimate: overrides.daylightRequirementEstimate ?? 1.5,
    passabilityStatus: overrides.passabilityStatus ?? 'likely_passable',
    legalStatus: overrides.legalStatus ?? 'open',
    closureStatus: overrides.closureStatus ?? 'open',
    fireRiskStatus: overrides.fireRiskStatus ?? 'low',
    smokeAqiRiskStatus: overrides.smokeAqiRiskStatus ?? 'low',
    weatherRiskStatus: overrides.weatherRiskStatus ?? 'low',
    confidenceScore: overrides.confidenceScore ?? 86,
    evidenceIds: overrides.evidenceIds ?? ['mvum-open'],
    expiresAt: overrides.expiresAt ?? '2026-05-01T00:00:00.000Z',
    offlineAvailable: overrides.offlineAvailable ?? true,
    ...overrides,
  };
}

let decision = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [
    openRoute({ id: 'good-exit', estimatedDistance: 10, confidenceScore: 86 }),
    openRoute({ id: 'longer-exit', estimatedDistance: 40, confidenceScore: 86 }),
  ],
  evidence: [evidence('mvum-open', 'usfs_mvum', { recordType: 'legal_access' })],
  vehicleProfile: {
    capability: 'four_by_four',
    driverSkill: 'experienced',
    fuelReserveDistance: 80,
    daylightHoursRemaining: 5,
  },
  now,
});
assert.strictEqual(decision.recommendation, 'use_bailout');
assert.strictEqual(decision.selectedBailoutRouteId, 'good-exit');
assert.strictEqual(decision.rankedCandidates[0].selectable, true);
assert.strictEqual(decision.rankedCandidates[0].legalStatus, 'open');

decision = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [openRoute({
    id: 'closed-exit',
    legalStatus: 'open',
    closureStatus: 'active_closure',
    evidenceIds: ['closure-order'],
  })],
  evidence: [
    evidence('closure-order', 'manual_agency_ingestion', {
      recordType: 'closure',
      status: 'closed by forest order',
      manualReviewed: true,
      manualReviewAllowed: true,
    }),
  ],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
assert.strictEqual(decision.recommendation, 'no_verified_bailout');
assert.ok(decision.blockers.some((item) => /Active official closure/.test(item)));
assert.ok(decision.rankedCandidates[0].triggers.some((trigger) => trigger.triggerType === 'official_closure'));

decision = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [openRoute({ id: 'unknown-legal', legalStatus: 'unknown', evidenceIds: ['unknown-agency'] })],
  evidence: [evidence('unknown-agency', 'manual_agency_ingestion', { recordType: 'legal_access', status: 'unknown' })],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
assert.strictEqual(decision.recommendation, 'manual_review_required');
assert.strictEqual(decision.selectedBailoutRouteId, null);
assert.ok(decision.unknowns.some((item) => /Legal access is unknown/.test(item)));
assert.ok(decision.rankedCandidates[0].verifyWithManagingAgencyReminder);

decision = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [openRoute({ id: 'fire-perimeter-exit', fireRiskStatus: 'critical', evidenceIds: ['wfigs-perimeter'] })],
  evidence: [evidence('wfigs-perimeter', 'nifc_wfigs', { subjectType: 'fire_perimeter', knownLimitations: ['perimeter_not_legal_closure_by_itself'] })],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
assert.strictEqual(decision.recommendation, 'no_verified_bailout');
assert.ok(decision.blockers.some((item) => /Fire perimeter/.test(item)));
assert.ok(decision.rankedCandidates[0].triggers.some((trigger) => trigger.triggerType === 'wildfire_perimeter'));

decision = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [
    openRoute({ id: 'firms-nearby', fireRiskStatus: 'warning', evidenceIds: ['firms-active'] }),
    openRoute({ id: 'clean-exit', estimatedDistance: 20, evidenceIds: ['mvum-open'] }),
  ],
  evidence: [
    evidence('firms-active', 'nasa_firms', { subjectType: 'active_fire', knownLimitations: ['satellite_detection_not_ground_confirmation'] }),
    evidence('mvum-open', 'usfs_mvum', { recordType: 'legal_access' }),
  ],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
assert.strictEqual(decision.rankedCandidates[0].route.id, 'clean-exit');
assert.ok(decision.rankedCandidates.find((candidate) => candidate.route.id === 'firms-nearby').warnings.some((item) => /Active fire nearby/.test(item)));

decision = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [openRoute({ id: 'smoke-exit', smokeAqiRiskStatus: 'severe', evidenceIds: ['airnow-hazardous'] })],
  evidence: [evidence('airnow-hazardous', 'airnow', { subjectType: 'smoke_aqi', status: 'Hazardous', knownLimitations: ['preliminary_air_quality_data'] })],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
assert.ok(decision.warnings.some((item) => /Hazardous smoke/.test(item)));
assert.ok(decision.rankedCandidates[0].triggers.some((trigger) => trigger.triggerType === 'high_aqi_smoke'));

decision = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [openRoute({ id: 'weather-exit', weatherRiskStatus: 'critical', evidenceIds: ['nws-warning'] })],
  evidence: [evidence('nws-warning', 'nws', { subjectType: 'weather_alert', status: 'Severe Thunderstorm Warning' })],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
assert.ok(decision.warnings.some((item) => /Severe weather/.test(item)));
assert.ok(decision.rankedCandidates[0].triggers.some((trigger) => trigger.triggerType === 'severe_weather_alert'));

decision = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [
    openRoute({ id: 'community-blocked', passabilityStatus: 'likely_impassable', evidenceIds: ['community-blocked'] }),
    openRoute({ id: 'passable-option', estimatedDistance: 24, evidenceIds: ['mvum-open'] }),
  ],
  evidence: [
    evidence('community-blocked', 'community', { sourceType: 'community_report', status: 'blocked by washout', official: false }),
    evidence('mvum-open', 'usfs_mvum', { recordType: 'legal_access' }),
  ],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
assert.strictEqual(decision.rankedCandidates[0].route.id, 'passable-option');
assert.ok(decision.rankedCandidates.find((candidate) => candidate.route.id === 'community-blocked').warnings.some((item) => /likely impassable/.test(item)));

decision = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [openRoute({
    id: 'community-open-official-closed',
    closureStatus: 'active_closure',
    evidenceIds: ['closure-order', 'community-open'],
  })],
  evidence: [
    evidence('closure-order', 'manual_agency_ingestion', { recordType: 'closure', status: 'closed', manualReviewed: true }),
    evidence('community-open', 'community', {
      sourceType: 'community_report',
      status: 'open and passable',
      official: false,
      agrees: false,
      conflictsWith: ['closure-order'],
    }),
  ],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
assert.strictEqual(decision.recommendation, 'no_verified_bailout');
assert.ok(decision.rankedCandidates[0].confidenceLabel !== 'unknown');
assert.ok(decision.blockers.some((item) => /Active official closure/.test(item)));

decision = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [
    openRoute({ id: 'closed-1', closureStatus: 'active_closure', evidenceIds: ['closure-order'] }),
    openRoute({ id: 'private-1', legalStatus: 'private', evidenceIds: ['private-land'] }),
  ],
  evidence: [
    evidence('closure-order', 'manual_agency_ingestion', { recordType: 'closure', status: 'closed', manualReviewed: true }),
    evidence('private-land', 'manual_agency_ingestion', { recordType: 'legal_access', status: 'private', manualReviewed: true }),
  ],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
assert.strictEqual(decision.recommendation, 'no_verified_bailout');
assert.strictEqual(decision.selectedBailoutRouteId, null);

const fresh = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [openRoute({ id: 'fresh', evidenceIds: ['mvum-open'] })],
  evidence: [evidence('mvum-open', 'usfs_mvum', { recordType: 'legal_access' })],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
const stale = evaluateBailoutRoutes({
  primaryRouteId: 'primary-1',
  bailoutRoutes: [openRoute({
    id: 'stale',
    expiresAt: '2026-04-20T00:00:00.000Z',
    evidenceIds: ['stale-mvum'],
  })],
  evidence: [evidence('stale-mvum', 'usfs_mvum', {
    recordType: 'legal_access',
    observedAt: '2026-04-20T00:00:00.000Z',
    expiresAt: '2026-04-21T00:00:00.000Z',
    stale: true,
  })],
  vehicleProfile: { capability: 'four_by_four', driverSkill: 'experienced', fuelReserveDistance: 80, daylightHoursRemaining: 5 },
  now,
});
assert.ok(stale.rankedCandidates[0].route.riskScore > fresh.rankedCandidates[0].route.riskScore);
assert.ok(stale.rankedCandidates[0].route.confidenceScore < fresh.rankedCandidates[0].route.confidenceScore);
assert.ok(stale.rankedCandidates[0].staleOfflineWarning);

console.log('ECS 5.0 bailout route management tests passed.');
