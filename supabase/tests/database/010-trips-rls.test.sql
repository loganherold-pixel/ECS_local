begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- Legacy ECS core trip/waypoint RLS coverage.
-- Table assumptions come from migrations 001_ecs_core_schema.sql and
-- 024_legacy_core_rls.sql. Test data is rolled back.

create or replace function pg_temp.ecs_set_auth_context(target_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', target_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
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
  when insufficient_privilege or check_violation or foreign_key_violation then
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

select has_table('public', 'trips', 'trips table exists');
select has_table('public', 'waypoints', 'waypoints table exists');
select is((select relrowsecurity from pg_class where oid = 'public.trips'::regclass), true, 'trips has RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.waypoints'::regclass), true, 'waypoints has RLS enabled');

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
    '11000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ecs-rls-trip-owner@example.test',
    'test-password-not-used',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '11000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ecs-rls-trip-nonowner@example.test',
    'test-password-not-used',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

set local role anon;
select pg_temp.ecs_clear_auth_context();

select ok(
  pg_temp.ecs_visible_count($$select count(*) from public.trips$$) in (-1, 0),
  'anon cannot read private trip rows'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.trips (id, user_id, title) values ('21000000-0000-4000-8000-000000000099', '11000000-0000-4000-8000-000000000001', 'Anon Trip')$$),
  '00000',
  'anon cannot insert private trip rows'
);

reset role;
select pg_temp.ecs_clear_auth_context();

set local role authenticated;
select pg_temp.ecs_set_auth_context('11000000-0000-4000-8000-000000000001');

select is(
  pg_temp.ecs_row_count($$insert into public.trips (id, user_id, title, status, origin, destination) values ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Owner Trip', 'draft', 'Home', 'Trailhead')$$),
  1,
  'owner can insert own trip'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.trips where id = '21000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can read own trip'
);
select is(
  pg_temp.ecs_row_count($$update public.trips set status = 'planned' where id = '21000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can update own trip'
);
select is(
  pg_temp.ecs_row_count($$insert into public.waypoints (id, trip_id, user_id, title, latitude, longitude, sequence) values ('22000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Trailhead', 38.78, -121.20, 1)$$),
  1,
  'owner can insert waypoint for own trip'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.waypoints where trip_id = '21000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can read own trip waypoint'
);

reset role;
select pg_temp.ecs_clear_auth_context();

set local role authenticated;
select pg_temp.ecs_set_auth_context('11000000-0000-4000-8000-000000000002');

select is(
  pg_temp.ecs_visible_count($$select count(*) from public.trips where id = '21000000-0000-4000-8000-000000000001'$$),
  0,
  'authenticated non-owner cannot read owner trip'
);
select is(
  pg_temp.ecs_row_count($$update public.trips set status = 'stolen' where id = '21000000-0000-4000-8000-000000000001'$$),
  0,
  'authenticated non-owner cannot update owner trip'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.waypoints where trip_id = '21000000-0000-4000-8000-000000000001'$$),
  0,
  'authenticated non-owner cannot read owner waypoint'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.waypoints (id, trip_id, user_id, title) values ('22000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'Bad Waypoint')$$),
  '00000',
  'authenticated non-owner cannot insert waypoint into owner trip'
);

reset role;
select pg_temp.ecs_clear_auth_context();

set local role authenticated;
select pg_temp.ecs_set_auth_context('11000000-0000-4000-8000-000000000001');

select is(
  pg_temp.ecs_row_count($$delete from public.waypoints where id = '22000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can delete own waypoint'
);
select is(
  pg_temp.ecs_row_count($$delete from public.trips where id = '21000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can delete own trip'
);

reset role;
select pg_temp.ecs_clear_auth_context();

select * from finish();

rollback;
