const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '020_established_campgrounds_provider_layer.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const availabilityFreshnessMigration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '021_campground_availability_checked_at.sql'),
  'utf8',
);

for (const required of [
  'create extension if not exists postgis',
  'create table if not exists public.campground_provider_configs',
  'create table if not exists public.campgrounds',
  'create table if not exists public.campground_source_records',
  'create table if not exists public.campground_availability',
  'create table if not exists public.campground_sync_runs',
  'geog geography(Point, 4326) generated always as',
  'st_setsrid(st_makepoint(longitude, latitude), 4326)::geography',
]) {
  assert.ok(migration.includes(required), `Migration must include: ${required}`);
}

for (const table of [
  'campground_provider_configs',
  'campgrounds',
  'campground_source_records',
  'campground_availability',
  'campground_sync_runs',
]) {
  assert.ok(
    migration.includes(`alter table public.${table} enable row level security`),
    `${table} must enable RLS.`,
  );
}

for (const requiredColumn of [
  'provider_id text unique not null',
  'secret_ref text',
  'name text not null',
  'latitude double precision not null',
  'longitude double precision not null',
  "facility_type text not null default 'campground'",
  "status text not null default 'unknown'",
  "availability_status text not null default 'unknown'",
  'source_confidence numeric not null default 0',
  'raw_json jsonb',
  'payload_hash text',
  'available_site_count integer',
  'reservable boolean',
  'first_come_first_served boolean',
  'records_upserted integer not null default 0',
]) {
  assert.ok(migration.includes(requiredColumn), `Migration must define column: ${requiredColumn}`);
}

for (const indexName of [
  'idx_campground_provider_configs_enabled_priority',
  'idx_campgrounds_geog',
  'idx_campgrounds_latitude_longitude',
  'idx_campgrounds_status_availability',
  'idx_campgrounds_primary_provider',
  'idx_campground_source_records_campground_provider',
  'idx_campground_source_records_payload_hash',
  'idx_campground_availability_campground_date',
  'idx_campground_availability_provider_status',
  'idx_campground_sync_runs_provider_started',
]) {
  assert.ok(migration.includes(indexName), `${indexName} index must be present.`);
}

assert.ok(
  migration.includes('create or replace function public.search_established_campgrounds_bbox'),
  'Migration must create search_established_campgrounds_bbox.',
);
assert.ok(
  availabilityFreshnessMigration.includes('last_availability_checked_at') &&
    availabilityFreshnessMigration.includes('idx_campgrounds_last_availability_checked_at'),
  'Availability freshness migration must add last_availability_checked_at and its index.',
);
assert.ok(
  migration.includes('security definer') &&
    migration.includes('grant execute on function public.search_established_campgrounds_bbox'),
  'Search function must expose a safe executable helper for map bbox reads.',
);
assert.ok(
  migration.includes("c.status <> 'removed'") &&
    migration.includes('c.longitude between least(min_lng, max_lng)') &&
    migration.includes('c.latitude between least(min_lat, max_lat)'),
  'Search function must filter by bbox and hide removed records.',
);

for (const triggerName of [
  'campground_provider_configs_set_updated_at',
  'campgrounds_set_updated_at',
]) {
  assert.ok(migration.includes(triggerName), `${triggerName} trigger must be present.`);
}

for (const policy of [
  'campground_provider_configs_select_admin',
  'campground_provider_configs_admin_write',
  'campgrounds_select_public',
  'campgrounds_admin_write',
  'campground_source_records_select_admin',
  'campground_source_records_admin_write',
  'campground_availability_select_public',
  'campground_availability_admin_write',
  'campground_sync_runs_select_admin',
  'campground_sync_runs_admin_write',
]) {
  assert.ok(migration.includes(policy), `${policy} policy must be present.`);
}

assert.ok(
  !migration.includes('create policy campground_provider_configs_select_public'),
  'Provider config rows include secret_ref metadata and must not be publicly selectable.',
);
assert.ok(
  migration.includes('campground_provider_configs_select_admin') &&
    migration.includes('using (public.is_ecs_super_admin())'),
  'Provider config reads must be restricted to ECS super admins.',
);

for (const provider of [
  'ridb',
  'nps',
  'campflare',
  'active',
  'reserveamerica',
  'aspira',
  'osm',
]) {
  assert.ok(migration.includes(`('${provider}'`), `${provider} provider config must be seeded.`);
}

for (const secretRef of [
  'RIDB_API_KEY',
  'NPS_API_KEY',
  'CAMPFLARE_API_KEY',
  'ACTIVE_API_KEY',
  'ACTIVE_API_SECRET',
  'RESERVEAMERICA_API_KEY',
  'ASPIRA_API_KEY',
  'OSM_USER_AGENT',
  'OSM_ATTRIBUTION',
]) {
  assert.ok(migration.includes(secretRef), `${secretRef} secret_ref name must be present.`);
}

for (const forbidden of [
  'sk_',
  'eyJ',
  'Bearer ',
  'service_role=',
  'apikey=',
]) {
  assert.ok(!migration.includes(forbidden), `Migration must not include sensitive token marker: ${forbidden}`);
}

console.log('Established campgrounds database foundation checks passed.');
