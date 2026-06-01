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
  'kaibab_national_forest',
  'prescott_national_forest',
  'gila_national_forest',
  'santa_fe_national_forest',
  'carson_national_forest',
  'rio_grande_national_forest',
  'gmug_national_forests',
  'humboldt_toiyabe_national_forest',
  'pike_san_isabel_national_forests',
  'inyo_national_forest',
  'plumas_national_forest',
  'lassen_national_forest',
  'shasta_trinity_national_forest',
  'umpqua_national_forest',
  'fremont_winema_national_forest',
  'idaho_panhandle_national_forests',
  'helena_lewis_clark_national_forest',
  'fishlake_national_forest',
  'black_hills_national_forest',
  'uinta_wasatch_cache_national_forest',
  'caribou_targhee_national_forest',
  'klamath_national_forest',
  'willamette_national_forest',
  'boise_national_forest',
  'lolo_national_forest',
  'salmon_challis_national_forest',
  'stanislaus_national_forest',
  'dixie_national_forest',
  'bitterroot_national_forest',
  'mt_hood_national_forest',
  'coronado_national_forest',
  'sierra_national_forest',
  'michigan_dnr_orv_pilot',
  'minnesota_dnr_ohv_pilot',
  'oregon_odf_ohv_pilot',
  'blm_az_gtlf',
  'blm_ca_nv_pilot',
  'blm_co_gtlf',
  'blm_id_gtlf',
  'blm_mt_gtlf',
  'blm_nm_gtlf',
  'blm_ut_gtlf',
  'blm_wy_gtlf',
  'nps_public_trails_joshua_tree',
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

const michiganProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'michigan_dnr_orv_pilot');
const minnesotaProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'minnesota_dnr_ohv_pilot');
const oregonProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'oregon_odf_ohv_pilot');
const npsProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_joshua_tree');
assert.strictEqual(michiganProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(minnesotaProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(oregonProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsProbe.expectedPosture, 'verified_public_recommendations');

const curationProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'blm_wy_gtlf');
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

const supplementalOverlapSummary = summarizeSearchResponse(sierraProbe, {
  count: 10,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 10, curationCandidateCount: 0, anySourceBackedCandidateCount: 483 },
  records: [{ public_id: 'verified-sierra-1', name: 'Verified Sierra Route', confidence_score: 92 }],
});
assert.strictEqual(
  supplementalOverlapSummary.observedPosture,
  'verified_public_recommendations',
  'Supplemental context probes should still report verified public routes when official MVUM coverage overlaps.',
);
assert.strictEqual(
  supplementalOverlapSummary.matchesExpectedPosture,
  true,
  'Supplemental context probes should pass when source-backed context exists even if verified public recommendations also exist nearby.',
);

const supplementalWithoutContextSummary = summarizeSearchResponse(sierraProbe, {
  count: 10,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 10, curationCandidateCount: 0, anySourceBackedCandidateCount: 0 },
  records: [{ public_id: 'verified-only-1', name: 'Verified Route Only', confidence_score: 92 }],
});
assert.strictEqual(
  supplementalWithoutContextSummary.matchesExpectedPosture,
  false,
  'Supplemental context probes should not pass on verified public routes alone when no source-backed context is present.',
);

const promotedOverlapSummary = summarizeSearchResponse(oregonProbe, {
  count: 4,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 4, curationCandidateCount: 43, anySourceBackedCandidateCount: 47 },
  records: [{ public_id: 'verified-willamette-1', name: 'Verified Willamette Route', confidence_score: 92 }],
});
assert.strictEqual(
  promotedOverlapSummary.observedPosture,
  'verified_public_recommendations',
  'Promoted state probes should report verified public routes when official recommendations are nearby.',
);
assert.strictEqual(
  promotedOverlapSummary.matchesExpectedPosture,
  true,
  'Promoted state probes should pass when verified public recommendations exist.',
);

const promotedWithoutCurationCandidatesSummary = summarizeSearchResponse(oregonProbe, {
  count: 4,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 4, curationCandidateCount: 0, anySourceBackedCandidateCount: 4 },
  records: [{ public_id: 'verified-only-2', name: 'Verified Route Only', confidence_score: 92 }],
});
assert.strictEqual(
  promotedWithoutCurationCandidatesSummary.matchesExpectedPosture,
  true,
  'Promoted state probes should pass on nearby verified routes even when no curation-only candidates remain.',
);

const blmProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'blm_ca_nv_pilot');
assert.strictEqual(
  blmProbe.expectedPosture,
  'verified_public_recommendations',
  'BLM CA/NV pilot should audit public aggregate recommendations after sync',
);

const blmWyProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'blm_wy_gtlf');
assert.strictEqual(
  blmWyProbe.expectedPosture,
  'source_backed_curation_only',
  'BLM Wyoming should audit as source-backed curation until deterministic aggregate recommendations exist.',
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
