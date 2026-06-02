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
  isRetryableAuditError,
  summarizeAuditProbeError,
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
  'huron_manistee_national_forest',
  'ozark_st_francis_national_forest',
  'ottawa_national_forest',
  'hiawatha_national_forest',
  'chequamegon_nicolet_national_forest',
  'national_forests_in_florida',
  'ouachita_national_forest',
  'mark_twain_national_forest',
  'national_forests_in_mississippi',
  'kisatchie_national_forest',
  'george_washington_jefferson_national_forest',
  'francis_marion_sumter_national_forests',
  'national_forests_in_texas',
  'national_forests_in_north_carolina',
  'allegheny_national_forest',
  'cherokee_national_forest',
  'daniel_boone_national_forest',
  'rogue_river_siskiyou_national_forests',
  'medicine_bow_routt_national_forest',
  'kootenai_national_forest',
  'gifford_pinchot_national_forest',
  'arapaho_roosevelt_national_forests',
  'umatilla_national_forest',
  'ochoco_national_forest',
  'cibola_national_forest',
  'eldorado_national_forest',
  'nez_perce_clearwater_national_forest',
  'payette_national_forest',
  'superior_national_forest',
  'chippewa_national_forest',
  'sequoia_national_forest',
  'ashley_national_forest',
  'bridger_teton_national_forest',
  'siuslaw_national_forest',
  'lincoln_national_forest',
  'white_river_national_forest',
  'mt_baker_snoqualmie_national_forest',
  'flathead_national_forest',
  'olympic_national_forest',
  'custer_national_forest',
  'bighorn_national_forest',
  'colville_national_forest',
  'chattahoochee_oconee_national_forests',
  'nebraska_national_forest',
  'shoshone_national_forest',
  'san_bernardino_national_forest',
  'los_padres_national_forest',
  'dakota_prairie_grasslands',
  'monongahela_national_forest',
  'land_between_the_lakes_nra',
  'shawnee_national_forest',
  'cleveland_national_forest',
  'green_mountain_finger_lakes_national_forests',
  'lake_tahoe_basin_management_unit',
  'wayne_national_forest',
  'white_mountain_national_forest',
  'wallowa_whitman_national_forest',
  'hoosier_national_forest',
  'columbia_river_gorge_national_scenic_area',
  'okanogan_wenatchee_national_forest',
  'six_rivers_national_forest',
  'tonto_national_forest',
  'michigan_dnr_orv_pilot',
  'minnesota_dnr_ohv_pilot',
  'oregon_odf_ohv_pilot',
  'colorado_cpw_designated_trails_pilot',
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
const coloradoCpwProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_designated_trails_pilot');
const npsProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_joshua_tree');
assert.strictEqual(michiganProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(minnesotaProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(oregonProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoCpwProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoCpwProbe.requiresSourceMatch, true, 'Colorado CPW audit should require CPW-sourced public routes');
assert.strictEqual(npsProbe.expectedPosture, 'verified_public_recommendations');

const coloradoCpwPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['colorado_cpw_designated_trails_pilot'] })[0];
assert.strictEqual(
  coloradoCpwPlanProbe.requestBody.sourceAdapter,
  'colorado_cpw_designated_trails',
  'Colorado CPW audit should ask search for CPW-sourced public routes',
);
assert.strictEqual(coloradoCpwPlanProbe.requestBody.limit, 25, 'Colorado CPW audit should use a bounded source-filtered result window');

const coloradoCpwOverlappedBlmSummary = summarizeSearchResponse(coloradoCpwProbe, {
  count: 10,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 10, curationCandidateCount: 0, anySourceBackedCandidateCount: 10 },
  records: [
    {
      public_id: 'blm-co-overlap-1',
      name: 'Nearby BLM Colorado Route',
      confidence_score: 84,
      source_records: [{ provider_id: 'blm_gtlf' }],
    },
  ],
});
assert.strictEqual(coloradoCpwOverlappedBlmSummary.observedPosture, 'no_verified_routes_expected');
assert.strictEqual(
  coloradoCpwOverlappedBlmSummary.matchesExpectedPosture,
  false,
  'Colorado CPW should not pass from overlapping BLM verified routes alone.',
);
assert.strictEqual(coloradoCpwOverlappedBlmSummary.sourceMatchedPublicRecommendationCount, 0);

const coloradoCpwSourceMatchedSummary = summarizeSearchResponse(coloradoCpwProbe, {
  count: 4,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 4, curationCandidateCount: 0, anySourceBackedCandidateCount: 4 },
  records: [
    {
      public_id: 'colorado-cpw-designated-trail-bull-mountain-road-feature-83',
      name: 'Colorado CPW Designated Trail Bull Mountain Road',
      confidence_score: 83,
      source_records: [{ provider_id: 'colorado_cpw_designated_trails' }],
    },
  ],
});
assert.strictEqual(coloradoCpwSourceMatchedSummary.observedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoCpwSourceMatchedSummary.matchesExpectedPosture, true);
assert.strictEqual(coloradoCpwSourceMatchedSummary.sourceMatchedPublicRecommendationCount, 1);

const blmWyProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'blm_wy_gtlf');
const blmWyPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['blm_wy_gtlf'] })[0];
assert.strictEqual(
  blmWyProbe.expectedPosture,
  'verified_public_recommendations',
  'BLM Wyoming should audit public aggregate recommendations after sync',
);
assert.strictEqual(blmWyProbe.requiresSourceMatch, true, 'BLM Wyoming audit should require BLM-sourced public routes');
assert.strictEqual(blmWyPlanProbe.requestBody.sourceAdapter, 'blm_gtlf', 'BLM Wyoming audit should ask search for BLM-sourced public routes');
assert.strictEqual(blmWyPlanProbe.requestBody.limit, 50, 'BLM Wyoming audit should use a bounded source-filtered result window');

const blmWyOverlappedUsfsSummary = summarizeSearchResponse(blmWyProbe, {
  count: 10,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 225, curationCandidateCount: 250, anySourceBackedCandidateCount: 475 },
  records: [
    {
      public_id: 'usfs-overlap-1',
      name: 'Nearby USFS Route',
      confidence_score: 92,
      source_records: [{ provider_id: 'usfs_mvum_bighorn_nf' }],
    },
  ],
});
assert.strictEqual(blmWyOverlappedUsfsSummary.observedPosture, 'source_backed_curation_only');
assert.strictEqual(
  blmWyOverlappedUsfsSummary.matchesExpectedPosture,
  false,
  'BLM Wyoming should not pass from overlapping USFS verified routes alone.',
);
assert.strictEqual(blmWyOverlappedUsfsSummary.sourceMatchedPublicRecommendationCount, 0);

const blmWySourceMatchedSummary = summarizeSearchResponse(blmWyProbe, {
  count: 10,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 225, curationCandidateCount: 250, anySourceBackedCandidateCount: 475 },
  records: [
    {
      public_id: 'blm-gtlf-wy-road-segment-77001',
      name: 'BLM Road GTLF Segment',
      confidence_score: 84,
      source_records: [{ provider_id: 'blm_gtlf' }],
    },
  ],
});
assert.strictEqual(blmWySourceMatchedSummary.observedPosture, 'verified_public_recommendations');
assert.strictEqual(blmWySourceMatchedSummary.matchesExpectedPosture, true);
assert.strictEqual(blmWySourceMatchedSummary.sourceMatchedPublicRecommendationCount, 1);

const blmWyCurationOnlySummary = summarizeSearchResponse(blmWyProbe, {
  count: 0,
  coverageState: { state: 'lower_confidence_nearby', title: 'Source-backed routes in curation' },
  meta: { radiusMatchedCount: 0, curationCandidateCount: 7, anySourceBackedCandidateCount: 7 },
  records: [],
});
assert.strictEqual(blmWyCurationOnlySummary.observedPosture, 'source_backed_curation_only');
assert.strictEqual(
  blmWyCurationOnlySummary.matchesExpectedPosture,
  false,
  'BLM Wyoming should no longer pass the audit as curation-only.',
);

const mismatchSummary = summarizeSearchResponse(blmWyProbe, {
  count: 0,
  coverageState: { state: 'no_verified_routes', title: 'No verified routes yet in this area' },
  meta: { radiusMatchedCount: 0, curationCandidateCount: 0, anySourceBackedCandidateCount: 0 },
  records: [],
});
assert.strictEqual(mismatchSummary.observedPosture, 'no_verified_routes_expected');
assert.strictEqual(mismatchSummary.matchesExpectedPosture, false);

const auditFailureSummary = summarizeAuditProbeError(
  ROUTE_CATALOG_COVERAGE_PROBES[0],
  new Error('route-catalog-search timeout'),
);
assert.strictEqual(
  auditFailureSummary.observedPosture,
  'audit_error',
  'Coverage audit should record live endpoint failures as structured audit errors',
);
assert.strictEqual(auditFailureSummary.coverageState, 'audit_error');
assert.strictEqual(auditFailureSummary.matchesExpectedPosture, false);
assert.strictEqual(auditFailureSummary.error, 'route-catalog-search timeout');
assert.strictEqual(auditFailureSummary.sampleRoutes.length, 0);
assert.strictEqual(
  isRetryableAuditError(new Error('Verified route catalog is temporarily unavailable.')),
  true,
  'Coverage audit should retry transient route-catalog-search availability failures',
);
assert.strictEqual(
  isRetryableAuditError(new Error('Missing ECS_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL')),
  false,
  'Coverage audit should not retry local configuration failures',
);

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
  'summarizeAuditProbeError',
  'isRetryableAuditError',
  'ROUTE_CATALOG_AUDIT_RETRY_ATTEMPTS',
  'auditErrors',
]) {
  assert(auditSource.includes(required), `Coverage audit script should include ${required}`);
}

console.log('Route catalog coverage audit checks passed');
