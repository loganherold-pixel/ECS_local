begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

-- ECS RLS harness notes:
-- - Test setup runs as the migration owner so fixtures can be inserted without
--   weakening production policies.
-- - Assertions switch to anon/authenticated roles and set Supabase JWT claims
--   so auth.uid() resolves like it does through PostgREST.
-- - All rows and helper functions are rolled back at the end of this file.
-- - Table assumptions come from supabase/migrations/022_convoy_team_tracking.sql.

create or replace function pg_temp.ecs_set_auth_context(
  target_user_id uuid,
  target_jwt_role text default 'authenticated'
)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', target_user_id::text, true);
  perform set_config('request.jwt.claim.role', target_jwt_role, true);
end;
$$;

create or replace function pg_temp.ecs_clear_auth_context()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;

create or replace function pg_temp.ecs_visible_count(statement text)
returns integer
language plpgsql
as $$
declare
  result_count integer;
begin
  execute statement into result_count;
  return result_count;
exception
  when insufficient_privilege then
    return -1;
end;
$$;

create or replace function pg_temp.ecs_row_count(statement text)
returns integer
language plpgsql
as $$
declare
  affected_count integer;
begin
  execute statement;
  get diagnostics affected_count = row_count;
  return affected_count;
exception
  when insufficient_privilege then
    return -1;
  when check_violation then
    return -1;
end;
$$;

create or replace function pg_temp.ecs_sqlstate(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return '00000';
exception
  when others then
    return sqlstate;
end;
$$;

select has_table('public', 'convoys', 'convoys table exists');
select has_table('public', 'convoy_invites', 'convoy_invites table exists');
select has_table('public', 'convoy_members', 'convoy_members table exists');
select has_table('public', 'convoy_member_locations', 'convoy_member_locations table exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.convoys'::regclass),
  true,
  'convoys has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.convoy_invites'::regclass),
  true,
  'convoy_invites has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.convoy_members'::regclass),
  true,
  'convoy_members has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.convoy_member_locations'::regclass),
  true,
  'convoy_member_locations has RLS enabled'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'convoy_invites'
      and indexname = 'convoy_invites_code_hash_idx'
  ),
  'convoy invite code hashes are unique'
);
select is(
  (select relreplident::text from pg_class where oid = 'public.convoy_member_locations'::regclass),
  'f',
  'convoy_member_locations sends full rows for realtime deletes'
);
select ok(
  not has_function_privilege('authenticated', 'public.cleanup_old_convoy_member_locations(integer)', 'execute'),
  'authenticated role cannot execute convoy retention cleanup'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ecs-rls-leader@example.test',
    'test-password-not-used',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ecs-rls-member@example.test',
    'test-password-not-used',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ecs-rls-nonmember@example.test',
    'test-password-not-used',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ecs-rls-revoked@example.test',
    'test-password-not-used',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.convoys (
  id,
  name,
  leader_user_id,
  status,
  starts_at,
  expires_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'RLS Test Convoy',
    '10000000-0000-4000-8000-000000000001',
    'active',
    now(),
    now() + interval '1 day'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Completed RLS Test Convoy',
    '10000000-0000-4000-8000-000000000001',
    'completed',
    now() - interval '45 days',
    now() - interval '40 days'
  );

insert into public.convoy_members (
  id,
  convoy_id,
  user_id,
  vehicle_id,
  callsign,
  role,
  revoked_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'veh-lead',
    'LEAD',
    'lead',
    null
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'veh-member',
    'V2',
    'member',
    null
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004',
    'veh-revoked',
    'OLD',
    'member',
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'veh-completed',
    'DONE',
    'member',
    null
  );

insert into public.convoy_member_locations (
  id,
  convoy_id,
  member_id,
  latitude,
  longitude,
  accuracy_meters,
  heading_degrees,
  speed_mps,
  movement_status,
  captured_at,
  updated_at
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    38.78076,
    -121.20758,
    7.5,
    91,
    4.4,
    'moving',
    now(),
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003',
    38.78070,
    -121.20750,
    7.5,
    91,
    4.4,
    'stopped',
    now() - interval '40 days',
    now() - interval '40 days'
  );

set local role anon;
select pg_temp.ecs_clear_auth_context();

select ok(
  pg_temp.ecs_visible_count(
    $$select count(*) from public.convoys where id = '20000000-0000-4000-8000-000000000001'$$
  ) in (-1, 0),
  'anon cannot read private convoy rows'
);

select isnt(
  pg_temp.ecs_sqlstate(
    $$insert into public.convoys (id, name, leader_user_id) values ('20000000-0000-4000-8000-000000000099', 'Anon Convoy', '10000000-0000-4000-8000-000000000003')$$
  ),
  '00000',
  'anon cannot insert convoy rows'
);

reset role;
select pg_temp.ecs_clear_auth_context();

set local role authenticated;
select pg_temp.ecs_set_auth_context('10000000-0000-4000-8000-000000000001');

select is(
  pg_temp.ecs_visible_count(
    $$select count(*) from public.convoys where id = '20000000-0000-4000-8000-000000000001'$$
  ),
  1,
  'leader can read their convoy'
);

select is(
  pg_temp.ecs_row_count(
    $$update public.convoys set name = 'RLS Test Convoy Updated' where id = '20000000-0000-4000-8000-000000000001'$$
  ),
  1,
  'leader can update their convoy'
);

select is(
  pg_temp.ecs_row_count(
    $$insert into public.convoy_invites (id, convoy_id, code_hash, role, max_uses, expires_at, created_by) values ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'sha256:test-hash-only', 'member', 2, now() + interval '1 hour', '10000000-0000-4000-8000-000000000001')$$
  ),
  1,
  'leader can create convoy invite for their convoy'
);

reset role;
select pg_temp.ecs_clear_auth_context();

set local role authenticated;
select pg_temp.ecs_set_auth_context('10000000-0000-4000-8000-000000000002');

select is(
  pg_temp.ecs_visible_count(
    $$select count(*) from public.convoys where id = '20000000-0000-4000-8000-000000000001'$$
  ),
  1,
  'active convoy member can read their convoy'
);

select is(
  pg_temp.ecs_visible_count(
    $$select count(*) from public.convoy_members where convoy_id = '20000000-0000-4000-8000-000000000001' and user_id = '10000000-0000-4000-8000-000000000002'$$
  ),
  1,
  'active convoy member can read their own roster row'
);

select is(
  pg_temp.ecs_visible_count(
    $$select count(*) from public.convoy_invites where convoy_id = '20000000-0000-4000-8000-000000000001'$$
  ),
  0,
  'active member cannot read leader invite hashes'
);

select is(
  pg_temp.ecs_row_count(
    $$insert into public.convoy_member_locations (id, convoy_id, member_id, latitude, longitude, accuracy_meters, heading_degrees, speed_mps, movement_status, captured_at) values ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 38.781, -121.208, 9, 95, 3.1, 'moving', now())$$
  ),
  1,
  'active member can publish their own live location'
);

select is(
  pg_temp.ecs_row_count(
    $$update public.convoy_member_locations set movement_status = 'needs_assistance' where member_id = '30000000-0000-4000-8000-000000000001'$$
  ),
  0,
  'active member cannot overwrite another member location'
);

select is(
  pg_temp.ecs_visible_count(
    $$select count(*) from public.convoy_member_locations where convoy_id = '20000000-0000-4000-8000-000000000001'$$
  ),
  2,
  'active member can read active convoy member locations'
);

select is(
  pg_temp.ecs_visible_count(
    $$select count(*) from public.convoys where id = '20000000-0000-4000-8000-000000000002'$$
  ),
  0,
  'member cannot read a completed convoy through active-member policy'
);

select isnt(
  pg_temp.ecs_sqlstate(
    $$insert into public.convoy_member_locations (id, convoy_id, member_id, latitude, longitude, movement_status, captured_at) values ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 38.783, -121.210, 'stopped', now())$$
  ),
  '00000',
  'member cannot publish live location into completed convoy'
);

select isnt(
  pg_temp.ecs_sqlstate(
    $$select public.cleanup_old_convoy_member_locations(30)$$
  ),
  '00000',
  'authenticated member cannot execute retention cleanup'
);

select isnt(
  pg_temp.ecs_sqlstate(
    $$select * from public.claim_convoy_invite('50000000-0000-4000-8000-000000000001')$$
  ),
  '00000',
  'authenticated member cannot execute atomic invite claim helper directly'
);

reset role;
select pg_temp.ecs_clear_auth_context();

set local role authenticated;
select pg_temp.ecs_set_auth_context('10000000-0000-4000-8000-000000000003');

select is(
  pg_temp.ecs_visible_count(
    $$select count(*) from public.convoys where id = '20000000-0000-4000-8000-000000000001'$$
  ),
  0,
  'authenticated non-member cannot read convoy'
);

select ok(
  pg_temp.ecs_row_count(
    $$update public.convoys set name = 'Forbidden Nonmember Update' where id = '20000000-0000-4000-8000-000000000001'$$
  ) in (-1, 0),
  'authenticated non-member cannot update convoy'
);

select is(
  pg_temp.ecs_visible_count(
    $$select count(*) from public.convoy_member_locations where convoy_id = '20000000-0000-4000-8000-000000000001'$$
  ),
  0,
  'authenticated non-member cannot read convoy locations'
);

reset role;
select pg_temp.ecs_clear_auth_context();

set local role authenticated;
select pg_temp.ecs_set_auth_context('10000000-0000-4000-8000-000000000004');

select is(
  pg_temp.ecs_visible_count(
    $$select count(*) from public.convoys where id = '20000000-0000-4000-8000-000000000001'$$
  ),
  0,
  'revoked member cannot read convoy'
);

select isnt(
  pg_temp.ecs_sqlstate(
    $$insert into public.convoy_member_locations (id, convoy_id, member_id, latitude, longitude, movement_status, captured_at) values ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 38.782, -121.209, 'stopped', now())$$
  ),
  '00000',
  'revoked member cannot publish live location'
);

reset role;
select pg_temp.ecs_clear_auth_context();

select is(
  public.cleanup_old_convoy_member_locations(30),
  1,
  'trusted cleanup deletes old completed convoy locations'
);

select is(
  (select count(*)::integer from public.convoy_member_locations where id = '40000000-0000-4000-8000-000000000003'),
  0,
  'trusted cleanup removes only the old completed convoy location row'
);

select * from finish();

rollback;
