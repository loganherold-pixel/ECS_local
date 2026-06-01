const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

assert(
  packageJson.includes('"route-catalog:coverage:dry-run"'),
  'package.json should expose a dry-run coverage audit command',
);
assert(
  packageJson.includes('"route-catalog:coverage:audit"'),
  'package.json should expose a live coverage audit command',
);
assert(
  packageJson.includes('"route-catalog:coverage:audit": "node ./scripts/route-catalog-coverage-audit.js --all"'),
  'live coverage audit npm command should audit all probes by default for PowerShell-friendly operation',
);
assert(
  packageJson.includes('"test:route-catalog-coverage-audit"'),
  'package.json should expose the route catalog coverage audit test',
);

const auditPath = path.join(root, 'scripts', 'route-catalog-coverage-audit.js');
assert(fs.existsSync(auditPath), 'Route catalog coverage audit script should exist');

const {
  ROUTE_CATALOG_COVERAGE_PROBES,
  buildRouteCatalogCoverageAuditPlan,
  summarizeSearchResponse,
} = require(auditPath);

const requiredProbeKeys = [
  'tahoe_national_forest',
  'mendocino_national_forest',
  'san_juan_national_forest',
  'coconino_national_forest',
  'manti_la_sal_national_forest',
  'sawtooth_national_forest',
  'deschutes_national_forest',
  'michigan_dnr_orv_pilot',
  'minnesota_dnr_ohv_pilot',
  'oregon_odf_ohv_pilot',
  'blm_ca_nv_pilot',
  'usgs_nps_sierra_context',
  'conus_empty_control',
];

assert.deepStrictEqual(
  ROUTE_CATALOG_COVERAGE_PROBES.map((probe) => probe.key),
  requiredProbeKeys,
  'Coverage audit should probe verified pilots, curation pilots, supplemental context, and an empty-control area',
);

const plan = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['tahoe_national_forest', 'michigan_dnr_orv_pilot'] });
assert.strictEqual(plan.length, 2, 'Coverage audit plan should filter by requested probe key');

for (const probe of plan) {
  assert(probe.label && probe.sourceAdapter && probe.expectedPosture, `${probe.key} should describe source/posture context`);
  assert(Number.isFinite(probe.latitude), `${probe.key} should have latitude`);
  assert(Number.isFinite(probe.longitude), `${probe.key} should have longitude`);
  assert(Number.isFinite(probe.radiusMiles) && probe.radiusMiles > 0, `${probe.key} should have a positive radius`);
  assert.strictEqual(probe.requestBody.latitude, probe.latitude);
  assert.strictEqual(probe.requestBody.longitude, probe.longitude);
  assert.strictEqual(probe.requestBody.radiusMiles, probe.radiusMiles);
  assert.strictEqual(probe.requestBody.includePreviewGeometry, false);
  assert.strictEqual(probe.requestBody.includeGeometry, false);
  assert.strictEqual(probe.requestBody.limit, 10);
}

const sierraProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'usgs_nps_sierra_context');
assert(sierraProbe.radiusMiles <= 75, 'Supplemental Sierra context probe should not overlap Tahoe verified MVUM coverage');

const verifiedSummary = summarizeSearchResponse(ROUTE_CATALOG_COVERAGE_PROBES[0], {
  count: 3,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 12, curationCandidateCount: 0, anySourceBackedCandidateCount: 12 },
  records: [{ public_id: 'verified-1', name: 'Verified Route', confidence_score: 92 }],
});
assert.strictEqual(verifiedSummary.observedPosture, 'verified_public_recommendations');
assert.strictEqual(verifiedSummary.matchesExpectedPosture, true);

const curationProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'michigan_dnr_orv_pilot');
const curationSummary = summarizeSearchResponse(curationProbe, {
  count: 0,
  coverageState: { state: 'lower_confidence_nearby', title: 'Source-backed routes in curation' },
  meta: { radiusMatchedCount: 0, curationCandidateCount: 7, anySourceBackedCandidateCount: 7 },
  records: [],
});
assert.strictEqual(curationSummary.observedPosture, 'source_backed_curation_only');
assert.strictEqual(curationSummary.matchesExpectedPosture, true);

const mismatchSummary = summarizeSearchResponse(curationProbe, {
  count: 0,
  coverageState: { state: 'no_verified_routes', title: 'No verified routes yet in this area' },
  meta: { radiusMatchedCount: 0, curationCandidateCount: 0, anySourceBackedCandidateCount: 0 },
  records: [],
});
assert.strictEqual(mismatchSummary.observedPosture, 'no_verified_routes_expected');
assert.strictEqual(mismatchSummary.matchesExpectedPosture, false);

const blmProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'blm_ca_nv_pilot');
assert.strictEqual(
  blmProbe.expectedPosture,
  'verified_public_recommendations',
  'BLM CA/NV pilot should audit public aggregate recommendations after sync',
);

const auditSource = fs.readFileSync(auditPath, 'utf8');
for (const required of [
  'ECS_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  '/functions/v1/route-catalog-search',
  'coverageState',
  'radiusMatchedCount',
  'curationCandidateCount',
  'anySourceBackedCandidateCount',
  '--dry-run',
  '--probe',
  '--all',
]) {
  assert(auditSource.includes(required), `Coverage audit script should include ${required}`);
}

console.log('Route catalog coverage audit checks passed');
