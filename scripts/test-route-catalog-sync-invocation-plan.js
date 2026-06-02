const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

const {
  ROUTE_CATALOG_SYNC_INVENTORY,
  buildRouteCatalogSyncInvocationPlan,
} = require(path.join(root, 'scripts', 'route-catalog-sync-inventory.js'));

assert(
  packageJson.includes('"route-catalog:sync:dry-run"'),
  'package.json should expose a route catalog sync dry-run command',
);
assert(
  packageJson.includes('"route-catalog:sync:invoke"'),
  'package.json should expose an explicit route catalog sync invocation command',
);
assert(
  packageJson.includes('"test:route-catalog-sync-invocation-plan"'),
  'package.json should expose the route catalog sync invocation-plan test',
);

const runnerPath = path.join(root, 'scripts', 'route-catalog-sync-invoke.js');
assert(fs.existsSync(runnerPath), 'Route catalog sync invocation runner should exist');

const runnerSource = fs.readFileSync(runnerPath, 'utf8');
for (const required of [
  'ECS_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'ECS_ROUTE_CATALOG_SYNC_TOKEN',
  'resolveSyncSupabaseUrl',
  'x-ecs-sync-token',
  '--dry-run',
  '--adapter',
  '--all-direct',
  'redactSecret',
]) {
  assert(runnerSource.includes(required), `Sync invocation runner should include ${required}`);
}
assert(!runnerSource.includes('console.log(process.env.ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'Runner must not print sync tokens');

const plan = buildRouteCatalogSyncInvocationPlan();
assert.strictEqual(
  plan.length,
  ROUTE_CATALOG_SYNC_INVENTORY.length,
  'Invocation plan should include every route catalog sync inventory entry',
);

const byKey = new Map(plan.map((entry) => [entry.key, entry]));

for (const entry of plan) {
  assert(entry.key && entry.providerId && entry.functionName, 'Plan entries should preserve inventory identity');
  assert(entry.workflowPath && entry.functionPath, `${entry.key} should keep workflow/function paths available for operators`);
  assert(
    entry.invocationMode === 'direct_edge_function' || entry.invocationMode === 'workflow_preprocess_required',
    `${entry.key} should declare how it can be invoked safely`,
  );
  assert(
    entry.publicRecommendationPolicy === 'aggregate_recommendable_with_closure_gate' ||
      entry.publicRecommendationPolicy === 'curation_only_zero_public_recommendations' ||
      entry.publicRecommendationPolicy === 'official_source_recommendable_with_condition_warnings',
    `${entry.key} should declare recommendation policy in the invocation plan`,
  );
  assert(
    Number.isInteger(entry.expectedMaxPublicRecommendationCount) && entry.expectedMaxPublicRecommendationCount >= 0,
    `${entry.key} should declare expected public recommendation upper bound`,
  );
  assert(
    entry.safetyNotes.some((note) => note.includes('sync token')) &&
      entry.safetyNotes.some((note) => note.includes('service-role')) &&
      entry.safetyNotes.some((note) => note.includes('bounded')),
    `${entry.key} should carry operator-facing safety notes`,
  );

  if (entry.publicRecommendationPolicy === 'curation_only_zero_public_recommendations') {
    assert.strictEqual(
      entry.expectedMaxPublicRecommendationCount,
      0,
      `${entry.key} curation-only sync must not produce public recommendations`,
    );
  }

  if (entry.invocationMode === 'direct_edge_function') {
    assert(entry.defaultPayload && typeof entry.defaultPayload === 'object', `${entry.key} direct sync should have a default payload`);
  } else {
    assert.strictEqual(entry.defaultPayload, null, `${entry.key} workflow-preprocess sync should not pretend to have a direct payload`);
    assert(entry.preprocessReason, `${entry.key} workflow-preprocess sync should explain why direct invocation is blocked`);
  }
}

assert.deepStrictEqual(byKey.get('usfs_mvum').defaultPayload.forests, [
  'tahoe-national-forest',
  'mendocino-national-forest',
  'san-juan-national-forest',
  'coconino-national-forest',
  'manti-la-sal-national-forest',
  'sawtooth-national-forest',
  'deschutes-national-forest',
  'kaibab-national-forest',
  'prescott-national-forest',
  'gila-national-forest',
  'santa-fe-national-forest',
  'carson-national-forest',
  'rio-grande-national-forest',
  'grand-mesa-uncompahgre-gunnison-national-forests',
  'humboldt-toiyabe-national-forest',
  'pike-san-isabel-national-forests',
  'inyo-national-forest',
  'plumas-national-forest',
  'lassen-national-forest',
  'shasta-trinity-national-forest',
  'umpqua-national-forest',
  'fremont-winema-national-forest',
  'idaho-panhandle-national-forests',
  'helena-lewis-and-clark-national-forest',
  'fishlake-national-forest',
  'black-hills-national-forest',
  'uinta-wasatch-cache-national-forest',
  'caribou-targhee-national-forest',
  'klamath-national-forest',
  'willamette-national-forest',
  'boise-national-forest',
  'lolo-national-forest',
  'salmon-challis-national-forest',
  'stanislaus-national-forest',
  'dixie-national-forest',
  'bitterroot-national-forest',
  'mt-hood-national-forest',
  'coronado-national-forest',
  'sierra-national-forest',
  'huron-manistee-national-forest',
  'ozark-st-francis-national-forest',
  'ottawa-national-forest',
  'hiawatha-national-forest',
  'chequamegon-nicolet-national-forest',
  'national-forests-in-florida',
  'ouachita-national-forest',
  'mark-twain-national-forest',
  'national-forests-in-mississippi',
  'kisatchie-national-forest',
  'george-washington-jefferson-national-forest',
  'francis-marion-sumter-national-forests',
  'national-forests-in-texas',
  'national-forests-in-north-carolina',
  'allegheny-national-forest',
  'cherokee-national-forest',
  'daniel-boone-national-forest',
  'rogue-river-siskiyou-national-forests',
  'medicine-bow-routt-national-forest',
  'kootenai-national-forest',
  'gifford-pinchot-national-forest',
  'arapaho-roosevelt-national-forests',
  'umatilla-national-forest',
  'ochoco-national-forest',
  'cibola-national-forest',
  'eldorado-national-forest',
  'nez-perce-clearwater-national-forest',
  'payette-national-forest',
  'superior-national-forest',
  'chippewa-national-forest',
  'sequoia-national-forest',
  'ashley-national-forest',
  'bridger-teton-national-forest',
  'siuslaw-national-forest',
  'lincoln-national-forest',
  'white-river-national-forest',
  'mt-baker-snoqualmie-national-forest',
  'flathead-national-forest',
  'olympic-national-forest',
  'custer-national-forest',
  'bighorn-national-forest',
  'colville-national-forest',
  'chattahoochee-oconee-national-forests',
  'nebraska-national-forest',
  'shoshone-national-forest',
  'san-bernardino-national-forest',
  'los-padres-national-forest',
  'dakota-prairie-grasslands',
  'monongahela-national-forest',
  'land-between-the-lakes-national-recreation-area',
  'shawnee-national-forest',
  'cleveland-national-forest',
  'green-mountain-finger-lakes-national-forests',
  'lake-tahoe-basin-management-unit',
  'wayne-national-forest',
  'white-mountain-national-forest',
  'wallowa-whitman-national-forest',
  'hoosier-national-forest',
  'columbia-river-gorge-national-scenic-area',
  'okanogan-wenatchee-national-forest',
  'six-rivers-national-forest',
  'tonto-national-forest',
]);
assert.strictEqual(
  byKey.get('usfs_mvum').defaultPayload.maxAllowableOffset,
  0.000025,
  'USFS MVUM sync should default to bounded ArcGIS geometry simplification for dense trail sources',
);
assert.strictEqual(
  byKey.get('usfs_mvum').defaultPayload.deepPagination,
  false,
  'USFS MVUM sync should keep cautious pagination as the default operator payload',
);
assert.strictEqual(
  byKey.get('usfs_mvum').deepBackfillPayload.deepPagination,
  true,
  'USFS MVUM sync should expose an explicit deep-pagination backfill payload',
);
assert.strictEqual(
  byKey.get('usfs_mvum').deepBackfillPayload.limitPerForestLayer,
  2500,
  'USFS MVUM deep backfill payload should raise the bounded per-forest/layer cap enough to cover current official source tails',
);
assert.deepStrictEqual(byKey.get('blm_gtlf').defaultPayload.states, ['AZ', 'CA', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY']);
assert.deepStrictEqual(byKey.get('blm_gtlf').defaultPayload.layers, [0, 1, 2, 3]);
assert.strictEqual(
  byKey.get('blm_gtlf').publicRecommendationPolicy,
  'aggregate_recommendable_with_closure_gate',
  'BLM GTLF should expose a bounded aggregate public-recommendation pilot instead of curation-only source segments',
);
assert(
  byKey.get('blm_gtlf').expectedMaxPublicRecommendationCount > 0,
  'BLM GTLF aggregate pilot should allow bounded public recommendation telemetry',
);
assert.deepStrictEqual(byKey.get('michigan_dnr_orv_gpx').defaultPayload.sourceKeys, [
  'alcona_orv_trail',
  'atlanta_route',
  'evart_motorcycle_trail',
]);
const michiganStatewideBackfillPayload = byKey.get('michigan_dnr_orv_gpx').deepBackfillPayload;
assert(
  michiganStatewideBackfillPayload,
  'Michigan DNR ORV should expose an explicit statewide backfill payload',
);
assert.deepStrictEqual(michiganStatewideBackfillPayload.sourceKeys, [
  'alcona_orv_trail',
  'atlanta_route',
  'evart_motorcycle_trail',
  'statewide_orv_trail_gpx',
]);
assert.strictEqual(
  michiganStatewideBackfillPayload.syncScope,
  'statewide',
  'Michigan DNR ORV should expose an explicit statewide backfill payload instead of making the large GPX default',
);
assert.strictEqual(
  byKey.get('michigan_dnr_orv_gpx').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'Michigan DNR ORV should now allow bounded official-source public recommendations with current-condition warnings',
);
assert.strictEqual(
  byKey.get('minnesota_dnr_ohv_trails').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'Minnesota DNR OHV should now allow bounded official-source public recommendations with current-condition warnings',
);
const minnesotaStatewideBackfillPayload = byKey.get('minnesota_dnr_ohv_trails').deepBackfillPayload;
assert(
  minnesotaStatewideBackfillPayload,
  'Minnesota DNR OHV should expose an explicit statewide GeoPackage backfill payload',
);
assert.strictEqual(
  minnesotaStatewideBackfillPayload.syncScope,
  'statewide',
  'Minnesota DNR OHV statewide backfill payload should be explicit instead of changing the default workflow-preprocess run',
);
assert.strictEqual(
  minnesotaStatewideBackfillPayload.maxFeatures,
  1000,
  'Minnesota DNR OHV statewide backfill should remain bounded by the Edge Function max feature cap',
);
assert.strictEqual(
  byKey.get('oregon_odf_ohv_gpx').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'Oregon ODF OHV should now allow bounded official-source public recommendations with current-condition warnings',
);
assert.strictEqual(
  byKey.get('colorado_cpw_designated_trails').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'Colorado CPW Designated Trails should allow bounded official-source public recommendations with current-condition warnings',
);
assert.strictEqual(
  byKey.get('colorado_cpw_designated_trails').defaultPayload.maxFeatures,
  150,
  'Colorado CPW default sync should stay bounded for the first official state-source pass',
);
assert.strictEqual(
  byKey.get('colorado_cpw_designated_trails').deepBackfillPayload.maxFeatures,
  500,
  'Colorado CPW backfill should expose a larger but still bounded FeatureServer pull',
);
assert.strictEqual(
  byKey.get('nps_public_trails').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'NPS public trails should now allow bounded official-source public recommendations with park-unit/current-alert warnings',
);
assert.strictEqual(
  byKey.get('usgs_digital_trails').publicRecommendationPolicy,
  'curation_only_zero_public_recommendations',
  'USGS Digital Trails should remain supplemental geometry and produce zero public recommendations without authoritative access corroboration',
);
assert.strictEqual(byKey.get('minnesota_dnr_ohv_trails').invocationMode, 'workflow_preprocess_required');
assert(
  byKey.get('minnesota_dnr_ohv_trails').preprocessReason.includes('GeoPackage'),
  'Minnesota sync should explain that the durable workflow converts the GeoPackage before invocation',
);

console.log('Route catalog sync invocation plan checks passed');
