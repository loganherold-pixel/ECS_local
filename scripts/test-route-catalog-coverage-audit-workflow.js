const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-coverage-audit.yml');
const auditScriptPath = path.join(root, 'scripts', 'route-catalog-coverage-audit.js');

assert(
  packageJson.includes('"test:route-catalog-coverage-audit-workflow"'),
  'package.json should expose the route catalog coverage audit workflow contract test',
);
assert(
  packageJson.includes('"route-catalog:coverage:ci"'),
  'package.json should expose a CI coverage audit command that fails on mismatched expected posture',
);
assert(fs.existsSync(workflowPath), 'Route catalog coverage audit GitHub workflow should exist');

const workflow = fs.readFileSync(workflowPath, 'utf8');
for (const required of [
  'name: Route Catalog Coverage Audit',
  'workflow_dispatch:',
  'probe_keys:',
  'workflow_run:',
  'Route Catalog USFS MVUM Sync',
  'Route Catalog Michigan ORV Sync',
  'Route Catalog Minnesota OHV Sync',
  'Route Catalog Oregon ODF OHV Sync',
  'Route Catalog BLM GTLF Sync',
  'Route Catalog USGS Trails Sync',
  'Route Catalog NPS Trails Sync',
  'schedule:',
  'ECS_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'Build audit probe selection',
  'ROUTE_CATALOG_AUDIT_ARGS',
  'node ./scripts/route-catalog-coverage-audit.js ${ROUTE_CATALOG_AUDIT_ARGS} --json --fail-on-mismatch',
  'Route Catalog Coverage Audit',
  'matchesExpectedPosture',
  'concurrency:',
]) {
  assert(workflow.includes(required), `Coverage audit workflow should include ${required}`);
}
for (const requiredMapping of [
  "'tahoe_national_forest',",
  "'mendocino_national_forest',",
  "'san_juan_national_forest',",
  "'coconino_national_forest',",
  "'manti_la_sal_national_forest',",
  "'sawtooth_national_forest',",
  "'deschutes_national_forest',",
  "'kaibab_national_forest',",
  "'prescott_national_forest',",
  "'gila_national_forest',",
  "'santa_fe_national_forest',",
  "'carson_national_forest',",
  "'rio_grande_national_forest',",
  "'gmug_national_forests',",
  "'humboldt_toiyabe_national_forest',",
  "'pike_san_isabel_national_forests',",
  "'inyo_national_forest',",
  "'plumas_national_forest',",
  "'lassen_national_forest',",
  "'shasta_trinity_national_forest',",
  "'umpqua_national_forest',",
  "'fremont_winema_national_forest',",
  "'idaho_panhandle_national_forests',",
  "'helena_lewis_clark_national_forest',",
  "'fishlake_national_forest',",
  "'black_hills_national_forest',",
  "'uinta_wasatch_cache_national_forest',",
  "'caribou_targhee_national_forest',",
  "'klamath_national_forest',",
  "'willamette_national_forest',",
  "'boise_national_forest',",
  "'lolo_national_forest',",
  "'salmon_challis_national_forest',",
  "'stanislaus_national_forest',",
  "'dixie_national_forest',",
  "'bitterroot_national_forest',",
  "'mt_hood_national_forest',",
  "'coronado_national_forest',",
  "'sierra_national_forest',",
  "'huron_manistee_national_forest',",
  "'ozark_st_francis_national_forest',",
  "'ottawa_national_forest',",
  "'hiawatha_national_forest',",
  "'chequamegon_nicolet_national_forest',",
  "'national_forests_in_florida',",
  "'ouachita_national_forest',",
  "'mark_twain_national_forest',",
  "'national_forests_in_mississippi',",
  "'kisatchie_national_forest',",
  "'george_washington_jefferson_national_forest',",
  "'francis_marion_sumter_national_forests',",
  "'national_forests_in_texas',",
  "'national_forests_in_north_carolina',",
  "'allegheny_national_forest',",
  "'cherokee_national_forest',",
  "'daniel_boone_national_forest',",
  "['michigan_dnr_orv_pilot']",
  "['minnesota_dnr_ohv_pilot']",
  "['oregon_odf_ohv_pilot']",
  "'blm_az_gtlf',",
  "'blm_ca_nv_pilot',",
  "'blm_co_gtlf',",
  "'blm_id_gtlf',",
  "'blm_mt_gtlf',",
  "'blm_nm_gtlf',",
  "'blm_ut_gtlf',",
  "'blm_wy_gtlf',",
  "['nps_public_trails_joshua_tree']",
  "['usgs_nps_sierra_context']",
]) {
  assert(workflow.includes(requiredMapping), `Coverage audit workflow should map source syncs to ${requiredMapping}`);
}
assert(
  !workflow.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN') &&
    !workflow.includes('SUPABASE_ACCESS_TOKEN') &&
    !workflow.includes('ECS_SERVICE_ROLE_KEY') &&
    !workflow.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'Coverage audit workflow should not require sync, deploy, or service-role secrets',
);

const auditScript = fs.readFileSync(auditScriptPath, 'utf8');
for (const required of [
  '--fail-on-mismatch',
  'mismatchedProbes',
  'matchesExpectedPosture',
  'process.exit(1)',
]) {
  assert(auditScript.includes(required), `Coverage audit script should include ${required}`);
}

console.log('Route catalog coverage audit workflow checks passed');
