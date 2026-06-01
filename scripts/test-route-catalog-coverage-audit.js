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
  packageJson.includes('"test:route-catalog-coverage-audit"'),
  'package.json should expose the route catalog coverage audit test',
);

const auditPath = path.join(root, 'scripts', 'route-catalog-coverage-audit.js');
assert(fs.existsSync(auditPath), 'Route catalog coverage audit script should exist');

const {
  ROUTE_CATALOG_COVERAGE_PROBES,
  buildRouteCatalogCoverageAuditPlan,
} = require(auditPath);

const requiredProbeKeys = [
  'tahoe_national_forest',
  'mendocino_national_forest',
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
