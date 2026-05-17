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
  calculateECS5SourceConfidence,
  sourceConfidenceLabel,
} = loadTypeScriptModule('lib/ecs5SourceConfidence.ts');
const {
  buildUnifiedECS5RouteIntelligence,
} = loadTypeScriptModule('lib/ecs5RouteIntelligence.ts');

const now = new Date('2026-04-29T18:00:00.000Z');
const routeLine = { type: 'LineString', coordinates: [[-121.2, 38.8], [-121.1, 38.9]] };
const routeArea = { type: 'Polygon', coordinates: [[[-121.3, 38.7], [-121.0, 38.7], [-121.0, 39.0], [-121.3, 39.0], [-121.3, 38.7]]] };

assert.strictEqual(sourceConfidenceLabel(100), 'high');
assert.strictEqual(sourceConfidenceLabel(80), 'high');
assert.strictEqual(sourceConfidenceLabel(79), 'medium');
assert.strictEqual(sourceConfidenceLabel(50), 'medium');
assert.strictEqual(sourceConfidenceLabel(49), 'low');
assert.strictEqual(sourceConfidenceLabel(1), 'low');
assert.strictEqual(sourceConfidenceLabel(0), 'unknown');
assert.strictEqual(sourceConfidenceLabel(undefined), 'unknown');

let confidence = calculateECS5SourceConfidence({
  decisionType: 'closure',
  now,
  sources: [{
    id: 'official-closure',
    providerId: 'manual_agency_ingestion',
    sourceName: 'Forest order',
    sourceType: 'manual_admin',
    recordType: 'closure',
    status: 'closed by forest order',
    observedAt: '2026-04-29T17:00:00.000Z',
    expiresAt: '2026-05-10T00:00:00.000Z',
    geometry: routeLine,
    evidenceUrl: 'https://www.fs.usda.gov/alerts/example',
    manualReviewed: true,
    manualReviewAllowed: true,
  }, {
    id: 'community-open',
    providerId: 'community',
    sourceName: 'Community report',
    sourceType: 'community_report',
    recordType: 'community_condition',
    status: 'open yesterday',
    observedAt: '2026-04-29T16:00:00.000Z',
    agrees: false,
    conflictsWith: ['official-closure'],
  }],
});
assert.ok(confidence.score >= 50, 'Official closure with evidence should stay usable despite conflict.');
assert.ok(confidence.conflictPenalty > 0, 'Community open vs official closed should lower confidence.');
assert.ok(confidence.topReasons.some((reason) => reason.includes('Conflicting evidence')));
assert.ok(confidence.evidenceObservationIds.includes('official-closure'));

const noConflict = calculateECS5SourceConfidence({
  decisionType: 'closure',
  now,
  sources: [{
    id: 'official-closure',
    providerId: 'nps',
    sourceName: 'NPS alert',
    recordType: 'closure',
    status: 'closure',
    observedAt: '2026-04-29T17:00:00.000Z',
    expiresAt: '2026-05-10T00:00:00.000Z',
    geometry: routeArea,
    evidenceUrl: 'https://www.nps.gov/alerts',
  }],
});
assert.strictEqual(noConflict.label, 'high');
assert.ok(noConflict.sourceAuthorityScore >= 90);
assert.ok(noConflict.score > confidence.score, 'Conflict penalty should reduce score.');

let output = buildUnifiedECS5RouteIntelligence({
  routeId: 'closure-route',
  legalAccess: [{
    id: 'mvum-open',
    providerId: 'usfs_mvum',
    kind: 'legal_access',
    label: 'MVUM baseline',
    status: 'open',
    official: true,
    observedAt: '2026-04-29T12:00:00.000Z',
  }],
  closures: [{
    id: 'closure-order',
    providerId: 'manual_agency_ingestion',
    kind: 'closure',
    label: 'Forest closure order',
    status: 'closed',
    official: true,
    observedAt: '2026-04-29T17:00:00.000Z',
  }],
  communityReports: [{
    id: 'community-open',
    providerId: 'community',
    kind: 'community_report',
    label: 'Community passability report',
    status: 'open and passable',
    official: false,
    observedAt: '2026-04-29T16:00:00.000Z',
  }],
}, now);
assert.strictEqual(output.closureStatus, 'active_closure');
assert.strictEqual(output.legalStatus, 'closed');
assert.ok(output.decisionConfidence.closure.score > 0);
assert.ok(output.decisionConfidence.closure.sourceNames.includes('Forest closure order'));

output = buildUnifiedECS5RouteIntelligence({
  routeId: 'community-blocked',
  legalAccess: [{
    id: 'mvum-open',
    providerId: 'usfs_mvum',
    kind: 'legal_access',
    label: 'MVUM baseline',
    status: 'open',
    official: true,
  }],
  closures: [{
    id: 'no-closure',
    providerId: 'manual_agency_ingestion',
    kind: 'closure',
    label: 'No known closure',
    status: 'none',
    official: true,
  }],
  communityReports: [{
    id: 'community-blocked',
    providerId: 'community',
    kind: 'community_report',
    label: 'Community blockage',
    status: 'blocked by washout',
    severity: 'warning',
    official: false,
  }],
}, now);
assert.strictEqual(output.legalStatus, 'legal_open', 'Community blockage must not create legal closure.');
assert.strictEqual(output.safetyRisk, 'caution');
assert.ok(output.decisionConfidence.passability.score > output.decisionConfidence.closure.score || output.decisionConfidence.passability.score > 0);

confidence = calculateECS5SourceConfidence({
  decisionType: 'closure',
  now,
  sources: [{
    id: 'stale-official',
    providerId: 'state_dot_511',
    sourceName: 'State DOT closure',
    recordType: 'closure',
    status: 'closed',
    observedAt: '2026-04-20T00:00:00.000Z',
    ttlSeconds: 3600,
    geometry: routeLine,
    evidenceUrl: 'https://511.example/closure',
  }],
});
assert.ok(confidence.sourceAuthorityScore >= 85, 'Stale official data retains authority component.');
assert.ok(confidence.freshnessScore < 45, 'Stale official data loses freshness.');
assert.ok(confidence.staleWarning);

const airNow = calculateECS5SourceConfidence({
  decisionType: 'smoke_aqi',
  now,
  sources: [{
    id: 'airnow-1',
    providerId: 'airnow',
    sourceName: 'AirNow',
    subjectType: 'smoke_aqi',
    observedAt: '2026-04-29T17:00:00.000Z',
    geometry: { type: 'Point', coordinates: [-121.2, 38.8] },
    knownLimitations: ['preliminary_air_quality_data', 'not_regulatory_data'],
  }],
});
assert.ok(airNow.limitationNotes.includes('preliminary_air_quality_data'));
assert.ok(airNow.knownLimitationPenalty > 0);

const firms = calculateECS5SourceConfidence({
  decisionType: 'active_fire',
  now,
  sources: [{
    id: 'firms-1',
    providerId: 'nasa_firms',
    sourceName: 'NASA FIRMS',
    subjectType: 'active_fire',
    observedAt: '2026-04-29T17:30:00.000Z',
    geometry: { type: 'Point', coordinates: [-121.22, 38.81] },
    knownLimitations: ['satellite_detection_not_ground_confirmation', 'false_positives_possible'],
  }],
});
assert.ok(firms.limitationNotes.includes('false_positives_possible'));
assert.ok(firms.sourceAuthorityScore >= 85);

const mvum = calculateECS5SourceConfidence({
  decisionType: 'passability',
  now,
  sources: [{
    id: 'mvum-route',
    providerId: 'usfs_mvum',
    sourceName: 'USFS MVUM',
    recordType: 'legal_access',
    observedAt: '2026-04-29T12:00:00.000Z',
    geometry: routeLine,
    knownLimitations: ['legal_designation_not_passability', 'route_condition_not_guaranteed'],
  }],
});
assert.ok(mvum.sourceAuthorityScore <= 35, 'MVUM should have low passability authority.');
assert.ok(mvum.limitationNotes.includes('legal_designation_not_passability'));

const manualReviewed = calculateECS5SourceConfidence({
  decisionType: 'closure',
  now,
  sources: [{
    id: 'manual-reviewed',
    providerId: 'manual_agency_ingestion',
    sourceName: 'Manual sourced closure',
    recordType: 'closure',
    evidenceUrl: 'https://agency.example/order.pdf',
    observedAt: '2026-04-29T17:00:00.000Z',
    manualReviewed: true,
    manualReviewAllowed: true,
  }],
});
const manualNotAllowed = calculateECS5SourceConfidence({
  decisionType: 'closure',
  now,
  sources: [{
    id: 'manual-not-allowed',
    providerId: 'manual_agency_ingestion',
    sourceName: 'Manual note',
    recordType: 'closure',
    evidenceUrl: 'https://agency.example/order.pdf',
    observedAt: '2026-04-29T17:00:00.000Z',
    manualReviewed: true,
    manualReviewAllowed: false,
  }],
});
assert.ok(manualReviewed.manualReviewBoost > 0);
assert.strictEqual(manualNotAllowed.manualReviewBoost, 0);
assert.ok(manualReviewed.score > manualNotAllowed.score);

const cached = calculateECS5SourceConfidence({
  decisionType: 'weather',
  now,
  sources: [{
    id: 'cached-weather',
    providerId: 'nws',
    sourceName: 'NWS cached alert',
    subjectType: 'weather_alert',
    observedAt: '2026-04-29T12:00:00.000Z',
    cached: true,
    stale: true,
    geometry: routeArea,
  }],
});
assert.ok(cached.staleDataPenalty > 0);
assert.ok(cached.freshnessScore < 45);

const unknown = calculateECS5SourceConfidence({
  decisionType: 'unknown',
  now,
  sources: [{
    id: 'unknown-source',
    providerId: 'mystery',
    sourceName: 'Unknown source',
    observedAt: null,
    jurisdictionKnown: false,
  }],
});
assert.strictEqual(unknown.label, 'low');
assert.ok(unknown.dataQualityPenalty > 0);

const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5SourceConfidence.ts'), 'utf8');
assert.ok(source.includes('High-authority source for this decision type.'));
assert.ok(!source.includes('fetch('), 'Confidence layer should stay pure/offline.');

console.log('ECS 5.0 source confidence tests passed.');
