const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const typesPath = path.join(root, 'lib', 'campsites', 'campsiteRecommendationTypes.ts');
const dbPath = path.join(root, 'lib', 'db.ts');
const migrationPath = path.join(root, 'supabase', 'migrations', '006_campsite_recommendations.sql');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const campsiteTypes = require(typesPath);
const typeSource = fs.readFileSync(typesPath, 'utf8');
const dbSource = fs.readFileSync(dbPath, 'utf8');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');

for (const tableName of [
  'camp_sites',
  'camp_site_reports',
  'camp_site_flags',
  'camp_site_photos',
]) {
  assert.match(
    migrationSource,
    new RegExp(`create table if not exists public\\.${tableName}`),
    `${tableName} table must be created by the campsite recommendation migration.`,
  );
  assert.match(
    dbSource,
    new RegExp(`${tableName}!: Table`),
    `${tableName} must be available as a local IndexedDB collection.`,
  );
}

for (const enumValue of [
  'approved',
  'hidden',
  'archived',
  'community',
  'group',
  'private',
  'established_dispersed',
  'developed',
  'paid',
  'trailhead',
  'unknown',
  'easy_2wd',
  'awd',
  'high_clearance',
  'four_by_four',
  'technical',
  'current_location',
  'pin_drop',
  'gpx_waypoint',
  'gpx_route',
  'manual',
  'draft',
  'private_saved',
  'pending',
  'rejected',
  'needs_info',
  'merged',
  'private_land',
  'closed_to_camping',
  'sensitive_area',
  'duplicate',
  'unsafe',
  'trash_or_damage',
  'bad_coordinates',
  'other',
]) {
  assert.ok(typeSource.includes(`'${enumValue}'`), `Type module must include ${enumValue}.`);
  assert.ok(migrationSource.includes(`'${enumValue}'`), `Migration constraints must include ${enumValue}.`);
}

for (const requiredColumn of [
  'canonical_name text',
  'latitude double precision not null',
  'longitude double precision not null',
  "vehicle_fit jsonb not null default '[]'::jsonb",
  "amenities jsonb not null default '{}'::jsonb",
  "conditions jsonb not null default '{}'::jsonb",
  'trust_score double precision not null default 0',
  'legal_confidence text not null default',
  'confirmation_count integer not null default 0',
  'flag_count integer not null default 0',
  'submitted_by_user_id uuid not null references auth.users',
  'user_stayed_here boolean not null default false',
  'verified_in_person boolean not null default false',
  'stewardship_acknowledged boolean not null default false',
  'sensitive_area_acknowledged boolean not null default false',
  'client_submission_id text',
  'storage_url text not null',
  'thumbnail_url text',
  'exif_stripped boolean not null default false',
]) {
  assert.ok(
    migrationSource.includes(requiredColumn),
    `Migration must define required column/default: ${requiredColumn}`,
  );
}

for (const indexName of [
  'idx_camp_sites_latitude_longitude',
  'idx_camp_sites_status_visibility',
  'idx_camp_site_reports_submitted_by_user_id',
  'idx_camp_site_reports_moderation_status',
  'idx_camp_site_reports_client_submission_id_user',
  'idx_camp_site_flags_camp_site_id',
]) {
  assert.ok(migrationSource.includes(indexName), `${indexName} index must be present.`);
}

assert.match(
  migrationSource,
  /alter table public\.camp_sites enable row level security/,
  'camp_sites must enable RLS.',
);
assert.match(
  migrationSource,
  /visibility = 'community' and status = 'approved'/,
  'Community camp_sites should only be visible when approved.',
);
assert.match(
  migrationSource,
  /create or replace function public\.is_ecs_super_admin/,
  'Migration should expose the existing ECS super-admin pattern for moderation policies.',
);
assert.match(
  migrationSource,
  /public\.is_ecs_super_admin\(\)/,
  'Campsite moderation policies should allow ECS super-admin access.',
);
assert.match(
  migrationSource,
  /auth\.uid\(\) = submitted_by_user_id/,
  'Reports must be scoped to the submitting user.',
);
assert.match(
  migrationSource,
  /auth\.uid\(\) = user_id/,
  'Flags/photos must be scoped to the submitting user.',
);
assert.match(
  dbSource,
  /this\.version\(3\)\.stores/,
  'IndexedDB schema version must be bumped for campsite collections.',
);
assert.match(
  dbSource,
  /this\.version\(4\)\.stores/,
  'IndexedDB schema version must be bumped for campsite idempotency.',
);

const validSite = campsiteTypes.validateCampSiteRecord({
  id: 'camp-1',
  canonical_name: null,
  latitude: 38.78,
  longitude: -121.2,
  status: 'approved',
  visibility: 'community',
  site_type: 'established_dispersed',
  access_difficulty: 'high_clearance',
  vehicle_fit: ['truck', 'suv'],
  trailer_friendly: null,
  max_rig_length_ft: null,
  max_group_size: null,
  amenities: {},
  conditions: {},
  trust_score: 0,
  legal_confidence: 'unknown',
  last_confirmed_at: null,
  confirmation_count: 0,
  flag_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
assert.strictEqual(validSite.ok, true, 'A complete campsite record should validate.');

const invalidSite = campsiteTypes.validateCampSiteRecord({
  id: 'camp-2',
  latitude: 120,
  longitude: -240,
  status: 'visible',
  visibility: 'community',
  site_type: 'unknown',
  access_difficulty: 'easy_2wd',
  vehicle_fit: [],
  trust_score: 0,
  legal_confidence: 'unknown',
});
assert.strictEqual(invalidSite.ok, false, 'Invalid coordinates and enum values must fail validation.');
assert.ok(
  invalidSite.errors.some((error) => error.includes('latitude')) &&
    invalidSite.errors.some((error) => error.includes('longitude')) &&
    invalidSite.errors.some((error) => error.includes('status')),
  'Validation errors should name invalid coordinates/status.',
);

const validReport = campsiteTypes.validateCampSiteReportRecord({
  id: 'report-1',
  camp_site_id: null,
  submitted_by_user_id: 'user-1',
  latitude: 38.78,
  longitude: -121.2,
  source_type: 'pin_drop',
  location_accuracy_m: null,
  user_stayed_here: true,
  verified_in_person: true,
  visited_at: null,
  site_type: 'developed',
  access_difficulty: 'awd',
  vehicle_fit: ['van'],
  amenities: {},
  conditions: {},
  notes: null,
  visibility_requested: 'private',
  moderation_status: 'private_saved',
  stewardship_acknowledged: true,
  sensitive_area_acknowledged: true,
  client_submission_id: 'client-submit-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
assert.strictEqual(validReport.ok, true, 'A complete campsite report should validate.');

console.log('Campsite recommendation persistence checks passed.');
