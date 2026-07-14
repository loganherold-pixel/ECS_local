begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

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
  when insufficient_privilege then return -1;
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
  when others then return -1;
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
  when others then return sqlstate;
end;
$$;

select has_table('public', 'dispatch_pings', 'canonical Dispatch pings table exists');
select has_table('public', 'dispatch_queue_items', 'canonical Dispatch queue table exists');
select has_table('public', 'dispatch_assignments', 'canonical Dispatch assignments table exists');
select has_table('public', 'dispatch_assist_requests', 'canonical Dispatch assist table exists');
select has_table('public', 'dispatch_acknowledgments', 'canonical Dispatch acknowledgments table exists');
select has_table('public', 'dispatch_timeline_events', 'canonical Dispatch timeline table exists');
select has_table('public', 'dispatch_restricted_locations', 'restricted Dispatch locations table exists');
select has_table('public', 'dispatch_operation_receipts', 'Dispatch idempotency receipts table exists');

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.dispatch_pings'::regclass,
      'public.dispatch_queue_items'::regclass,
      'public.dispatch_assignments'::regclass,
      'public.dispatch_assist_requests'::regclass,
      'public.dispatch_acknowledgments'::regclass,
      'public.dispatch_timeline_events'::regclass,
      'public.dispatch_restricted_locations'::regclass,
      'public.dispatch_operation_receipts'::regclass
    )
      and relrowsecurity
  ),
  8,
  'all canonical Dispatch tables have RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.dispatch_operation_receipts', 'INSERT'),
  'clients cannot forge server operation receipts'
);
select ok(
  not has_function_privilege('authenticated', 'public.cleanup_dispatch_canonical_records(integer, integer)', 'EXECUTE'),
  'clients cannot execute Dispatch retention cleanup'
);
select ok(
  not has_sequence_privilege('authenticated', 'public.dispatch_server_revision_seq', 'USAGE'),
  'clients cannot allocate canonical server revisions directly'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dispatch-lead@example.test', 'unused', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dispatch-member@example.test', 'unused', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dispatch-outsider@example.test', 'unused', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.convoys (
  id, name, leader_user_id, status, expedition_id, starts_at, expires_at
)
values (
  '21000000-0000-4000-8000-000000000001',
  'Canonical Dispatch RLS',
  '11000000-0000-4000-8000-000000000001',
  'active',
  'dispatch-expedition-rls',
  now(),
  now() + interval '1 day'
);

insert into public.convoy_members (
  id, convoy_id, user_id, vehicle_id, callsign, role, revoked_at
)
values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'lead-rig', 'LEAD', 'lead', null),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'member-rig', 'TWO', 'member', null);

set local role anon;
select pg_temp.ecs_clear_auth_context();

select ok(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_pings where expedition_id = 'dispatch-expedition-rls'$$) in (-1, 0),
  'anon cannot read canonical Dispatch rows'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_pings (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, ping_type, priority, operational_state, delivery_state, message, client_created_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'anon-ping', 'anon-ping-key', '11000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000001', 'general', 'normal', 'open', 'local', 'Denied', now(), now(), now())$$),
  '00000',
  'anon cannot insert canonical Dispatch rows'
);

reset role;
select pg_temp.ecs_clear_auth_context();
set local role authenticated;
select pg_temp.ecs_set_auth_context('11000000-0000-4000-8000-000000000001');

select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_pings (id, expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, recipient_member_ids, ping_type, priority, operational_state, delivery_state, message, requires_acknowledgment, linked_context, client_created_at, client_updated_at, observed_at, server_revision, server_observed_at, created_at) values ('41000000-0000-4000-8000-000000000001', 'dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'ping-1', 'ping-key-1', '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', array['31000000-0000-4000-8000-000000000002']::uuid[], 'check_in', 'high', 'awaiting_acknowledgment', 'queued', 'Check in', true, '{"type":"manual"}', now(), now(), now(), 999999, '2000-01-01', '2000-01-01')$$),
  1,
  'lead can create an expedition-scoped ping'
);
select isnt(
  (select server_revision from public.dispatch_pings where client_id = 'ping-1'),
  999999::bigint,
  'server revision overrides a client-supplied value'
);
select ok(
  (select server_observed_at > '2020-01-01'::timestamptz from public.dispatch_pings where client_id = 'ping-1'),
  'server observed time overrides a client-supplied value'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_operation_receipts where entity_client_id = 'ping-1'$$),
  1,
  'server trigger creates an idempotency receipt'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_pings (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, ping_type, priority, operational_state, delivery_state, message, client_created_at, client_updated_at, observed_at, payload) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'ping-coordinate-leak', 'ping-coordinate-leak-key', '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'general', 'normal', 'open', 'local', 'Denied leak', now(), now(), now(), '{"latitude":38.5}')$$),
  '00000',
  'ordinary Dispatch payloads reject coordinate fields'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_pings (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, ping_type, priority, operational_state, delivery_state, message, client_created_at, client_updated_at, observed_at, payload) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'ping-secret-leak', 'ping-secret-leak-key', '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'general', 'normal', 'open', 'local', 'Denied secret', now(), now(), now(), '{"providerToken":"not-a-real-secret"}')$$),
  '00000',
  'ordinary Dispatch payloads reject provider secrets'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_acknowledgments (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, ping_client_id, member_id, status, acknowledged_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'ack-missing-ping', 'ack-missing-ping-key', '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'missing-ping', '31000000-0000-4000-8000-000000000001', 'acknowledged', now(), now(), now())$$),
  '00000',
  'acknowledgments cannot reference a missing scoped ping'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_queue_items (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, recipient_member_ids, title, detail, status, priority, delivery_state, linked_context, client_created_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'queue-1', 'queue-key-1', '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', array['31000000-0000-4000-8000-000000000002']::uuid[], 'Check member', 'Await response', 'assigned', 'high', 'queued', '{"type":"member"}', now(), now(), now())$$),
  1,
  'lead can create a queue item'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_assignments (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, queue_item_client_id, assignee_member_id, status, delivery_state, assigned_at, client_created_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'assignment-1', 'assignment-key-1', '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'queue-1', '31000000-0000-4000-8000-000000000002', 'offered', 'queued', now(), now(), now(), now())$$),
  1,
  'command role can create an assignment'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_timeline_events (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, member_ids, event_type, title, detail, priority, linked_context, occurred_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'timeline-1', 'timeline-key-1', '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', array['31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000002']::uuid[], 'ping_created', 'Ping created', 'Audit event', 'high', '{"type":"manual"}', now(), now())$$),
  1,
  'lead can append a timeline event'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_restricted_locations (id, expedition_id, convoy_id, source_kind, source_client_id, source_record_id, actor_user_id, actor_member_id, authorized_member_ids, latitude, longitude, observed_at) values ('51000000-0000-4000-8000-000000000001', 'dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'ping', 'ping-1', '41000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', array['31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000002']::uuid[], 38.5, -121.5, now())$$),
  1,
  'restricted coordinates are stored separately with an authorization list'
);
select is(
  pg_temp.ecs_sqlstate($$update public.dispatch_pings set message = 'Same version conflict' where client_id = 'ping-1'$$),
  '40001',
  'same-version mutation is rejected as a conflict'
);
select is(
  pg_temp.ecs_row_count($$update public.dispatch_pings set message = 'Version two', state_version = 2, client_updated_at = now() where client_id = 'ping-1'$$),
  1,
  'higher-version mutation is accepted'
);
select isnt(
  pg_temp.ecs_sqlstate($$update public.dispatch_pings set operational_state = 'draft', state_version = 3, client_updated_at = now() where client_id = 'ping-1'$$),
  '00000',
  'database rejects an invalid ping lifecycle transition'
);
select isnt(
  pg_temp.ecs_sqlstate($$update public.dispatch_timeline_events set detail = 'Forbidden rewrite' where client_id = 'timeline-1'$$),
  '00000',
  'timeline history is append-only'
);

reset role;
select pg_temp.ecs_clear_auth_context();
set local role authenticated;
select pg_temp.ecs_set_auth_context('11000000-0000-4000-8000-000000000002');

select is(pg_temp.ecs_visible_count($$select count(*) from public.dispatch_pings where client_id = 'ping-1'$$), 1, 'active member can read convoy pings');
select is(pg_temp.ecs_visible_count($$select count(*) from public.dispatch_restricted_locations where source_client_id = 'ping-1'$$), 1, 'authorized member can read restricted location');
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_acknowledgments (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, ping_client_id, member_id, status, acknowledged_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'ack-1', 'ack-key-1', '11000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'ping-1', '31000000-0000-4000-8000-000000000002', 'acknowledged', now(), now(), now())$$),
  1,
  'member can append their own acknowledgment'
);
select is(
  pg_temp.ecs_row_count($$update public.dispatch_assignments set status = 'accepted', delivery_state = 'accepted', accepted_at = now(), state_version = 2, client_updated_at = now() where client_id = 'assignment-1'$$),
  1,
  'assigned member can accept their assignment'
);
select is(
  pg_temp.ecs_row_count($$update public.dispatch_pings set message = 'Forbidden member edit', state_version = 3, client_updated_at = now() where client_id = 'ping-1'$$),
  0,
  'ordinary member cannot mutate another actor ping'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_assist_requests (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, recipient_member_ids, assist_type, priority, status, delivery_state, message, linked_context, client_created_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'assist-1', 'assist-key-1', '11000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', array['31000000-0000-4000-8000-000000000001']::uuid[], 'recovery', 'critical', 'new', 'queued', 'Need recovery', '{"type":"manual"}', now(), now(), now())$$),
  1,
  'member can create an assist request as themselves'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_assist_requests (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, assist_type, priority, status, delivery_state, message, client_created_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'assist-spoof', 'assist-spoof-key', '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'general_support', 'normal', 'new', 'local', 'Spoofed actor', now(), now(), now())$$),
  '00000',
  'member cannot spoof another actor identity'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_assist_requests (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, recipient_member_ids, assist_type, priority, status, delivery_state, message, client_created_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'assist-bad-target', 'assist-bad-target-key', '11000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', array['39000000-0000-4000-8000-000000000099']::uuid[], 'general_support', 'normal', 'new', 'local', 'Bad target', now(), now(), now())$$),
  '00000',
  'recipient IDs must belong to the scoped convoy'
);

reset role;
select pg_temp.ecs_clear_auth_context();
set local role authenticated;
select pg_temp.ecs_set_auth_context('11000000-0000-4000-8000-000000000003');

select is(pg_temp.ecs_visible_count($$select count(*) from public.dispatch_pings where expedition_id = 'dispatch-expedition-rls'$$), 0, 'nonmember cannot read guessed expedition records');
select is(pg_temp.ecs_visible_count($$select count(*) from public.dispatch_restricted_locations where expedition_id = 'dispatch-expedition-rls'$$), 0, 'nonmember cannot read restricted locations');
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_pings (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, ping_type, priority, operational_state, delivery_state, message, client_created_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'outsider-ping', 'outsider-ping-key', '11000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000001', 'general', 'normal', 'open', 'local', 'Denied', now(), now(), now())$$),
  '00000',
  'nonmember cannot write by guessing scope IDs'
);

reset role;
select pg_temp.ecs_clear_auth_context();
set local role authenticated;
select pg_temp.ecs_set_auth_context('11000000-0000-4000-8000-000000000001');

select is(
  pg_temp.ecs_row_count($$update public.dispatch_pings set deleted_at = now(), tombstone_reason = 'operator_cancelled', state_version = 3, client_updated_at = now() where client_id = 'ping-1'$$),
  1,
  'lead can create a versioned soft-delete tombstone'
);
select isnt(
  pg_temp.ecs_sqlstate($$update public.dispatch_pings set deleted_at = null, tombstone_reason = null, state_version = 4, client_updated_at = now() where client_id = 'ping-1'$$),
  '00000',
  'canonical tombstones cannot be resurrected by a later client version'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_operation_receipts (expedition_id, convoy_id, entity_kind, entity_id, entity_client_id, idempotency_key, actor_user_id, actor_member_id) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'ping', '41000000-0000-4000-8000-000000000001', 'forged', 'forged', '11000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001')$$),
  '00000',
  'authenticated lead still cannot forge operation receipts'
);

reset role;
select pg_temp.ecs_clear_auth_context();
update public.convoys set status = 'completed' where id = '21000000-0000-4000-8000-000000000001';

set local role authenticated;
select pg_temp.ecs_set_auth_context('11000000-0000-4000-8000-000000000002');
select is(pg_temp.ecs_visible_count($$select count(*) from public.dispatch_pings where client_id = 'ping-1'$$), 1, 'member retains read-only completed expedition history');
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.resolve_dispatch_actor_membership('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001')$$),
  1,
  'completed convoy member can resolve only their own identity for late replay'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_acknowledgments (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, ping_client_id, member_id, status, acknowledged_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'late-offline-ack', 'late-offline-ack-key', '11000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'ping-1', '31000000-0000-4000-8000-000000000002', 'acknowledged', now() - interval '1 minute', now(), now())$$),
  1,
  'bounded late acknowledgment observed before completion is preserved'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_acknowledgments (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, ping_client_id, member_id, status, acknowledged_at, client_updated_at, observed_at) values ('dispatch-expedition-rls', '21000000-0000-4000-8000-000000000001', 'post-completion-ack', 'post-completion-ack-key', '11000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'ping-1', '31000000-0000-4000-8000-000000000002', 'acknowledged', now() + interval '1 minute', now(), now())$$),
  '00000',
  'acknowledgments created after completion remain blocked'
);

reset role;
select pg_temp.ecs_clear_auth_context();

select * from finish();
rollback;
