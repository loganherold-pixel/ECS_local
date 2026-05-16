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
  detectLegalClosureConflicts,
} = loadTypeScriptModule('lib/ecs5LegalClosureConflictDetection.ts');

const now = new Date('2026-04-29T18:00:00.000Z');
const route = [
  { lat: 38.8, lon: -121.25 },
  { lat: 38.9, lon: -121.12 },
];
const line = { type: 'LineString', coordinates: [[-121.3, 38.75], [-121.1, 38.95]] };
const area = { type: 'Polygon', coordinates: [[[-121.35, 38.72], [-121.08, 38.72], [-121.08, 38.98], [-121.35, 38.98], [-121.35, 38.72]]] };

const mvumOpen = {
  id: 'mvum-open',
  sourceObservationId: 'obs-mvum-open',
  agency: 'USFS MVUM',
  jurisdiction: 'Tahoe NF',
  geometry: line,
  allowedVehicleClasses: ['high_clearance', 'motorcycle'],
  seasonalRules: [],
  legalStatus: 'open',
  effectiveStartAt: null,
  effectiveEndAt: null,
  confidenceScore: 88,
  evidence: [{ id: 'mvum-open', sourceObservationId: 'obs-mvum-open', label: 'USFS MVUM open' }],
};
const activeClosure = {
  id: 'closure-1',
  sourceObservationId: 'obs-closure-1',
  agency: 'USFS Forest Order',
  jurisdiction: 'Tahoe NF',
  geometry: area,
  closureType: 'forest_order',
  affectedModes: ['motor_vehicle'],
  effectiveStartAt: '2026-04-29T00:00:00.000Z',
  effectiveEndAt: '2026-05-10T00:00:00.000Z',
  status: 'active',
  reason: 'Storm damage',
  evidenceUrl: 'https://agency.example/closure',
  confidenceScore: 94,
};

let result = detectLegalClosureConflicts({
  routeId: 'route-official-closure',
  routeGeometry: route,
  tripDateTime: '2026-04-30T12:00:00.000Z',
  vehicleProfile: { vehicleClass: 'high_clearance' },
  legalAccessRecords: [mvumOpen],
  closureRecords: [activeClosure],
  now,
});
assert.strictEqual(result.segmentResults[0].closureStatus, 'active_closure');
assert.strictEqual(result.segmentResults[0].recommendedAction, 'do_not_travel');
assert.ok(result.blockingIssues.some((item) => item.type === 'official_closure_vs_static_open'));
assert.ok(result.blockingIssues.some((item) => item.type === 'closure_geometry_intersection'));
assert.ok(result.confidenceSummary.evidenceObservationIds.includes('obs-closure-1'));

result = detectLegalClosureConflicts({
  routeId: 'route-vehicle-mismatch',
  routeGeometry: route,
  tripDateTime: '2026-06-01T12:00:00.000Z',
  vehicleProfile: { vehicleClass: 'full_size_truck' },
  legalAccessRecords: [mvumOpen],
  now,
});
assert.strictEqual(result.segmentResults[0].legalStatus, 'restricted');
assert.ok(result.blockingIssues.some((item) => item.type === 'vehicle_class_mismatch'));

const seasonal = {
  ...mvumOpen,
  id: 'mvum-season',
  sourceObservationId: 'obs-mvum-season',
  seasonalRules: [{ start: '12-01', end: '05-15', status: 'seasonally_closed', label: 'winter closure' }],
};
result = detectLegalClosureConflicts({
  routeId: 'route-seasonal',
  routeGeometry: route,
  tripDateTime: '2026-04-30T12:00:00.000Z',
  vehicleProfile: { vehicleClass: 'high_clearance' },
  legalAccessRecords: [seasonal],
  now,
});
assert.strictEqual(result.segmentResults[0].legalStatus, 'seasonally_closed');
assert.ok(result.blockingIssues.some((item) => item.type === 'season_mismatch'));

const blm = {
  ...mvumOpen,
  id: 'blm-plad',
  sourceObservationId: 'obs-blm',
  agency: 'BLM PLAD',
  jurisdiction: 'BLM CA',
  allowedVehicleClasses: ['high_clearance'],
  evidence: [{ id: 'blm-note', sourceObservationId: 'obs-blm', label: 'Access line notes adjacent non-BLM private land' }],
};
result = detectLegalClosureConflicts({
  routeId: 'route-blm',
  routeGeometry: route,
  tripDateTime: '2026-06-01T12:00:00.000Z',
  vehicleProfile: { vehicleClass: 'high_clearance' },
  legalAccessRecords: [blm],
  now,
});
assert.ok(result.warnings.some((item) => item.type === 'route_crosses_private_or_unknown_access'));

result = detectLegalClosureConflicts({
  routeId: 'route-nps',
  routeGeometry: route,
  tripDateTime: '2026-06-01T12:00:00.000Z',
  legalAccessRecords: [{ ...mvumOpen, agency: 'NPS', jurisdiction: 'YOSE' }],
  closureRecords: [{
    ...activeClosure,
    id: 'nps-alert',
    sourceObservationId: 'obs-nps-alert',
    agency: 'NPS Alert',
    jurisdiction: 'YOSE',
    closureType: 'nps_alert_closure',
  }],
  now,
});
assert.ok(result.blockingIssues.some((item) => item.type === 'closure_geometry_intersection'));

result = detectLegalClosureConflicts({
  routeId: 'route-dot',
  routeGeometry: route,
  tripDateTime: '2026-06-01T12:00:00.000Z',
  legalAccessRecords: [mvumOpen],
  dotRoadConditions: [{
    id: 'dot-closure',
    sourceObservationId: 'obs-dot',
    providerId: 'state_dot_511',
    type: 'road_condition',
    status: 'closed due to slide',
    geometry: area,
    evidenceUrl: 'https://511.example/event',
  }],
  now,
});
assert.ok(result.blockingIssues.some((item) => item.type === 'closure_geometry_intersection'));
assert.strictEqual(result.segmentResults[0].recommendedAction, 'reroute');

result = detectLegalClosureConflicts({
  routeId: 'route-community-blocked',
  routeGeometry: route,
  tripDateTime: '2026-06-01T12:00:00.000Z',
  legalAccessRecords: [mvumOpen],
  communityReports: [{
    id: 'community-blocked',
    sourceObservationId: 'obs-community-blocked',
    providerId: 'community',
    type: 'community_report',
    status: 'blocked by washout',
    geometry: area,
  }],
  now,
});
assert.strictEqual(result.segmentResults[0].legalStatus, 'open');
assert.strictEqual(result.segmentResults[0].passabilityStatus, 'impassable');
assert.ok(result.warnings.some((item) => item.type === 'community_closed_vs_official_open'));
assert.ok(result.warnings.some((item) => item.type === 'legal_open_but_condition_impassable'));

result = detectLegalClosureConflicts({
  routeId: 'route-community-open-official-closed',
  routeGeometry: route,
  tripDateTime: '2026-06-01T12:00:00.000Z',
  legalAccessRecords: [mvumOpen],
  closureRecords: [activeClosure],
  communityReports: [{
    id: 'community-open',
    sourceObservationId: 'obs-community-open',
    providerId: 'community',
    type: 'community_report',
    status: 'open and passable yesterday',
    geometry: area,
  }],
  now,
});
assert.strictEqual(result.segmentResults[0].closureStatus, 'active_closure');
assert.ok(result.warnings.some((item) => item.type === 'community_open_vs_official_closed'));

const expiredClosure = {
  ...activeClosure,
  id: 'expired-closure',
  sourceObservationId: 'obs-expired',
  status: 'expired',
  effectiveEndAt: '2026-04-20T00:00:00.000Z',
};
result = detectLegalClosureConflicts({
  routeId: 'route-expired',
  routeGeometry: route,
  tripDateTime: '2026-06-01T12:00:00.000Z',
  legalAccessRecords: [mvumOpen],
  closureRecords: [expiredClosure],
  now,
});
assert.strictEqual(result.segmentResults[0].closureStatus, 'expired');
assert.strictEqual(result.blockingIssues.length, 0);
assert.ok(result.conflicts.some((item) => item.type === 'expired_or_stale_closure'));

result = detectLegalClosureConflicts({
  routeId: 'route-unknown-jurisdiction',
  routeGeometry: route,
  tripDateTime: '2026-06-01T12:00:00.000Z',
  legalAccessRecords: [{ ...mvumOpen, id: 'unknown-jurisdiction', jurisdiction: 'unknown' }],
  now,
});
assert.ok(result.warnings.some((item) => item.type === 'unknown_jurisdiction'));
assert.ok(result.segmentResults[0].confidence.dataQualityPenalty >= 0);

result = detectLegalClosureConflicts({
  routeId: 'route-fire-aqi-weather',
  routeGeometry: route,
  tripDateTime: '2026-06-01T12:00:00.000Z',
  legalAccessRecords: [mvumOpen],
  weatherFireSmokeContext: [{
    id: 'fire-perimeter',
    sourceObservationId: 'obs-fire-perimeter',
    providerId: 'nifc_wfigs',
    type: 'fire_perimeter',
    status: 'active perimeter',
    geometry: area,
  }, {
    id: 'airnow-hazardous',
    sourceObservationId: 'obs-airnow',
    providerId: 'airnow',
    type: 'smoke_aqi',
    status: 'Hazardous',
    severity: 'severe',
    geometry: area,
  }, {
    id: 'weather-alert',
    sourceObservationId: 'obs-weather',
    providerId: 'nws',
    type: 'weather_alert',
    status: 'High Wind Warning',
    geometry: area,
  }],
  now,
});
assert.strictEqual(result.segmentResults[0].legalStatus, 'open');
assert.strictEqual(result.segmentResults[0].safetyRiskStatus, 'critical');
assert.ok(result.blockingIssues.some((item) => item.type === 'fire_perimeter_intersects_route'));
assert.ok(result.blockingIssues.some((item) => item.type === 'smoke_aqi_health_risk'));
assert.ok(result.warnings.some((item) => item.type === 'weather_alert_intersects_route'));

result = detectLegalClosureConflicts({
  routeId: 'route-no-legal',
  routeGeometry: route,
  tripDateTime: '2026-06-01T12:00:00.000Z',
  legalAccessRecords: [],
  now,
});
assert.strictEqual(result.segmentResults[0].legalStatus, 'unknown');
assert.ok(result.unknowns.length > 0);
assert.strictEqual(result.segmentResults[0].recommendedAction, 'verify_with_managing_agency');

const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5LegalClosureConflictDetection.ts'), 'utf8');
assert.ok(source.includes('Static legal data can define baseline access') || source.includes('Static legal access remains baseline data'));
assert.ok(!source.includes('fetch('), 'Conflict detection should stay pure/offline.');

console.log('ECS 5.0 legal and closure conflict tests passed.');
