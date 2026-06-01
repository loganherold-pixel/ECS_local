-- ECS staging RLS catalog check.
-- Run after staging migrations to verify key private tables have RLS enabled.
-- This file is read-only and does not require service-role application secrets.

with expected_tables(table_name) as (
  values
    ('convoys'),
    ('convoy_invites'),
    ('convoy_members'),
    ('convoy_member_locations'),
    ('trips'),
    ('waypoints'),
    ('load_items'),
    ('load_map_slots'),
    ('fuel_water_logs'),
    ('risk_scores'),
    ('vehicles'),
    ('loadouts'),
    ('loadout_items'),
    ('expedition_sessions'),
    ('expedition_timeline_events'),
    ('expedition_timeline'),
    ('dispatch_cad_events')
),
catalog_status as (
  select
    expected_tables.table_name,
    pg_class.oid is not null as table_exists,
    coalesce(pg_class.relrowsecurity, false) as rls_enabled
  from expected_tables
  left join pg_class
    on pg_class.oid = to_regclass('public.' || expected_tables.table_name)
)
select *
from catalog_status
order by table_name;

select
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'convoy_member_locations'
  ) as convoy_locations_realtime_enabled,
  (select relreplident = 'f' from pg_class where oid = to_regclass('public.convoy_member_locations')) as convoy_locations_replica_identity_full,
  not has_function_privilege('authenticated', 'public.cleanup_old_convoy_member_locations(integer)', 'execute') as cleanup_denied_to_authenticated,
  not has_function_privilege('authenticated', 'public.claim_convoy_invite(uuid)', 'execute') as invite_claim_denied_to_authenticated;

do $$
declare
  failures text;
begin
  with expected_tables(table_name) as (
    values
      ('convoys'),
      ('convoy_invites'),
      ('convoy_members'),
      ('convoy_member_locations'),
      ('trips'),
      ('waypoints'),
      ('load_items'),
      ('load_map_slots'),
      ('fuel_water_logs'),
      ('risk_scores'),
      ('vehicles'),
      ('loadouts'),
      ('loadout_items'),
      ('expedition_sessions'),
      ('expedition_timeline_events'),
      ('expedition_timeline'),
      ('dispatch_cad_events')
  ),
  catalog_status as (
    select
      expected_tables.table_name,
      pg_class.oid is not null as table_exists,
      coalesce(pg_class.relrowsecurity, false) as rls_enabled
    from expected_tables
    left join pg_class
      on pg_class.oid = to_regclass('public.' || expected_tables.table_name)
  )
  select string_agg(
    case
      when not table_exists then table_name || ' missing'
      when not rls_enabled then table_name || ' RLS disabled'
    end,
    ', '
    order by table_name
  )
  into failures
  from catalog_status
  where not table_exists or not rls_enabled;

  if failures is not null then
    raise exception 'ECS RLS catalog smoke check failed: %', failures;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'convoy_member_locations'
  ) then
    raise exception 'ECS RLS catalog smoke check failed: convoy_member_locations is not in supabase_realtime publication';
  end if;

  if (select relreplident <> 'f' from pg_class where oid = to_regclass('public.convoy_member_locations')) then
    raise exception 'ECS RLS catalog smoke check failed: convoy_member_locations replica identity is not full';
  end if;

  if has_function_privilege('authenticated', 'public.cleanup_old_convoy_member_locations(integer)', 'execute') then
    raise exception 'ECS RLS catalog smoke check failed: authenticated can execute retention cleanup';
  end if;

  if has_function_privilege('authenticated', 'public.claim_convoy_invite(uuid)', 'execute') then
    raise exception 'ECS RLS catalog smoke check failed: authenticated can execute atomic invite claim helper';
  end if;
end $$;
