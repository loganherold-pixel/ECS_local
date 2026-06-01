const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '022_convoy_team_tracking.sql');
const docsPath = path.join(root, 'docs', 'dispatch', 'CONVOY_TRACKING_RLS.md');
const migration = fs.readFileSync(migrationPath, 'utf8');
const docs = fs.readFileSync(docsPath, 'utf8');

for (const table of ['convoys', 'convoy_invites', 'convoy_members', 'convoy_member_locations']) {
  assert(
    migration.includes(`create table if not exists public.${table}`),
    `Missing table creation for ${table}.`,
  );
  assert(
    migration.includes(`alter table public.${table} enable row level security`),
    `Missing RLS enablement for ${table}.`,
  );
}

for (const token of [
  'leader_user_id uuid not null references auth.users(id)',
  "status text not null default 'active' check (status in ('planned', 'active', 'paused', 'completed', 'cancelled'))",
  'code_hash text not null',
  "role text not null default 'member' check (role in ('lead', 'sweep', 'member', 'support'))",
  'unique (convoy_id, user_id)',
  'unique (member_id)',
  "movement_status text not null default 'unknown' check (movement_status in ('moving', 'stopped', 'delayed', 'offline', 'needs_assistance', 'unknown'))",
]) {
  assert(migration.includes(token), `Missing schema token: ${token}`);
}

for (const fnName of [
  'public.is_convoy_leader',
  'public.is_active_convoy_member',
  'public.is_own_active_convoy_member',
]) {
  assert(migration.includes(`create or replace function ${fnName}`), `Missing helper function ${fnName}.`);
  const fnStart = migration.indexOf(`create or replace function ${fnName}`);
  const fnBody = migration.slice(fnStart, migration.indexOf('alter table public.convoys enable row level security'));
  assert(fnBody.includes('security definer'), `${fnName} should be security definer to avoid RLS recursion.`);
  assert(fnBody.includes('revoked_at is null') || fnName === 'public.is_convoy_leader', `${fnName} should exclude revoked members.`);
}

for (const policy of [
  'convoys_select_leader_or_active_member',
  'convoys_insert_leader',
  'convoys_update_leader',
  'convoy_invites_select_leader',
  'convoy_invites_insert_leader',
  'convoy_invites_update_leader',
  'convoy_members_select_active_convoy',
  'convoy_members_insert_leader',
  'convoy_members_update_leader',
  'convoy_member_locations_select_active_members',
  'convoy_member_locations_insert_own',
  'convoy_member_locations_update_own',
]) {
  assert(migration.includes(`create policy ${policy}`), `Missing RLS policy ${policy}.`);
}

for (const index of [
  'convoys_leader_user_id_idx',
  'convoys_updated_at_idx',
  'convoy_invites_convoy_id_idx',
  'convoy_invites_created_by_idx',
  'convoy_invites_code_hash_idx',
  'convoy_members_convoy_id_idx',
  'convoy_members_user_id_idx',
  'convoy_member_locations_convoy_id_idx',
  'convoy_member_locations_member_id_idx',
  'convoy_member_locations_updated_at_idx',
]) {
  assert(migration.includes(index), `Missing index ${index}.`);
}

assert(
  migration.includes('alter publication supabase_realtime add table public.convoy_member_locations'),
  'Migration should add convoy_member_locations to Supabase Realtime when the publication exists.',
);
assert(
  migration.includes('alter table public.convoy_member_locations replica identity full'),
  'Migration should enable full replica identity so Realtime delete payloads include member_id.',
);
assert(
  migration.includes('create or replace function public.claim_convoy_invite') &&
    migration.includes('set used_count = convoy_invites.used_count + 1') &&
    migration.includes('grant execute on function public.claim_convoy_invite(uuid) to service_role'),
  'Migration should provide a service-role-only atomic invite claim helper.',
);
assert(!migration.match(/\bcode\b text/i), 'Migration must not store raw invite codes.');

for (const docToken of [
  'Raw invite codes are never stored',
  'Only `convoy_invites.code_hash` is persisted',
  'server-side pepper',
  'Supabase Edge Function',
  'User C cannot read the convoy, members, or locations',
  'revoked_at',
]) {
  assert(docs.includes(docToken), `RLS documentation missing: ${docToken}`);
}

console.log('Convoy team tracking schema checks passed.');
