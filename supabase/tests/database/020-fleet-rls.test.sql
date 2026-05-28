begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- ECS fleet/loadout RLS coverage.
-- Table assumptions come from supabase/migrations/004_ecs_fleet_schema.sql.

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

select has_table('public', 'vehicles', 'vehicles table exists');
select has_table('public', 'loadouts', 'loadouts table exists');
select has_table('public', 'loadout_items', 'loadout_items table exists');
select is((select relrowsecurity from pg_class where oid = 'public.vehicles'::regclass), true, 'vehicles has RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.loadouts'::regclass), true, 'loadouts has RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.loadout_items'::regclass), true, 'loadout_items has RLS enabled');

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
    '12000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ecs-rls-fleet-owner@example.test',
    'test-password-not-used',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '12000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ecs-rls-fleet-nonowner@example.test',
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
  pg_temp.ecs_visible_count($$select count(*) from public.vehicles$$) in (-1, 0),
  'anon cannot read private vehicle rows'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.vehicles (id, owner_user_id, name, type) values ('23000000-0000-4000-8000-000000000099', '12000000-0000-4000-8000-000000000001', 'Anon Rig', 'vehicle')$$),
  '00000',
  'anon cannot insert vehicle rows'
);

reset role;
select pg_temp.ecs_clear_auth_context();

set local role authenticated;
select pg_temp.ecs_set_auth_context('12000000-0000-4000-8000-000000000001');

select is(
  pg_temp.ecs_row_count($$insert into public.vehicles (id, owner_user_id, name, type, make, model, year) values ('23000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'Owner Rig', 'vehicle', 'Ford', 'Bronco', 2021)$$),
  1,
  'owner can insert own vehicle'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.vehicles where id = '23000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can read own vehicle'
);
select is(
  pg_temp.ecs_row_count($$update public.vehicles set notes = 'RLS owner update' where id = '23000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can update own vehicle'
);
select is(
  pg_temp.ecs_row_count($$insert into public.loadouts (id, owner_user_id, vehicle_id, name, mode) values ('24000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Trail Loadout', 'trip')$$),
  1,
  'owner can insert loadout for own vehicle'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.loadouts where id = '24000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can read own loadout'
);
select is(
  pg_temp.ecs_row_count($$insert into public.loadout_items (id, loadout_id, owner_user_id, name, category, quantity) values ('25000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'Recovery strap', 'recovery', 1)$$),
  1,
  'owner can insert item into own loadout'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.loadout_items where id = '25000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can read own loadout item'
);

reset role;
select pg_temp.ecs_clear_auth_context();

set local role authenticated;
select pg_temp.ecs_set_auth_context('12000000-0000-4000-8000-000000000002');

select is(
  pg_temp.ecs_visible_count($$select count(*) from public.vehicles where id = '23000000-0000-4000-8000-000000000001'$$),
  0,
  'authenticated non-owner cannot read owner vehicle'
);
select is(
  pg_temp.ecs_row_count($$update public.vehicles set notes = 'Forbidden' where id = '23000000-0000-4000-8000-000000000001'$$),
  0,
  'authenticated non-owner cannot update owner vehicle'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.loadouts where id = '24000000-0000-4000-8000-000000000001'$$),
  0,
  'authenticated non-owner cannot read owner loadout'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.loadouts (id, owner_user_id, vehicle_id, name, mode) values ('24000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000001', 'Bad Loadout', 'trip')$$),
  '00000',
  'authenticated non-owner cannot attach loadout to owner vehicle'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.loadout_items where id = '25000000-0000-4000-8000-000000000001'$$),
  0,
  'authenticated non-owner cannot read owner loadout item'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.loadout_items (id, loadout_id, owner_user_id, name) values ('25000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', 'Bad Item')$$),
  '00000',
  'authenticated non-owner cannot insert item into owner loadout'
);

reset role;
select pg_temp.ecs_clear_auth_context();

set local role authenticated;
select pg_temp.ecs_set_auth_context('12000000-0000-4000-8000-000000000001');

select is(
  pg_temp.ecs_row_count($$delete from public.loadout_items where id = '25000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can delete own loadout item'
);
select is(
  pg_temp.ecs_row_count($$delete from public.loadouts where id = '24000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can delete own loadout'
);
select is(
  pg_temp.ecs_row_count($$delete from public.vehicles where id = '23000000-0000-4000-8000-000000000001'$$),
  1,
  'owner can delete own vehicle'
);

reset role;
select pg_temp.ecs_clear_auth_context();

select * from finish();

rollback;
