begin;

create extension if not exists pgtap with schema extensions;

select plan(60);

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

select has_table('public', 'dispatch_mission_commands', 'Mission Command aggregate table exists');
select has_table('public', 'dispatch_mission_command_targets', 'Mission Command targets table exists');
select has_table('public', 'dispatch_mission_command_acknowledgments', 'Mission Command acknowledgments table exists');
select has_table('public', 'dispatch_mission_command_events', 'Mission Command event table exists');
select has_table('public', 'dispatch_mission_playbook_instances', 'Mission playbook aggregate table exists');
select has_table('public', 'dispatch_mission_playbook_steps', 'Mission playbook step table exists');
select has_table('public', 'dispatch_mission_playbook_events', 'Mission playbook event table exists');
select has_table('public', 'dispatch_mission_deadlines', 'Mission deadline table exists');
select has_table('public', 'dispatch_mission_incident_links', 'Mission incident-link table exists');
select has_column('public', 'convoy_members', 'mission_command_access', 'convoy membership owns Mission access');
select has_column('public', 'dispatch_mission_commands', 'client_operation_id', 'Mission records retain client operation identity');
select has_column('public', 'dispatch_operation_receipts', 'client_operation_id', 'Mission receipts retain client operation identity');
select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.dispatch_mission_commands'::regclass,
      'public.dispatch_mission_command_targets'::regclass,
      'public.dispatch_mission_command_acknowledgments'::regclass,
      'public.dispatch_mission_command_events'::regclass,
      'public.dispatch_mission_playbook_instances'::regclass,
      'public.dispatch_mission_playbook_steps'::regclass,
      'public.dispatch_mission_playbook_events'::regclass,
      'public.dispatch_mission_deadlines'::regclass,
      'public.dispatch_mission_incident_links'::regclass
    )
      and relrowsecurity
  ),
  9,
  'all Mission canonical tables have RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.dispatch_operation_receipts', 'INSERT'),
  'clients cannot forge Mission operation receipts'
);
select ok(
  not has_function_privilege('authenticated', 'public.cleanup_dispatch_mission_records(integer)', 'EXECUTE'),
  'clients cannot execute Mission retention cleanup'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('13000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mission-lead@example.test', 'unused', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('13000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mission-member@example.test', 'unused', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('13000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mission-viewer@example.test', 'unused', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('13000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mission-outsider@example.test', 'unused', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.convoys (
  id, name, leader_user_id, status, expedition_id, starts_at, expires_at
)
values (
  '23000000-0000-4000-8000-000000000001',
  'Mission Command RLS',
  '13000000-0000-4000-8000-000000000001',
  'active',
  'mission-expedition-rls',
  now(),
  now() + interval '1 day'
);

insert into public.convoy_members (
  id, convoy_id, user_id, vehicle_id, callsign, role, mission_command_access, revoked_at
)
values
  ('33000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'lead-rig', 'LEAD', 'lead', 'inherit', null),
  ('33000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002', 'member-rig', 'TWO', 'member', 'member', null),
  ('33000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000003', null, 'VIEW', 'member', 'viewer', null);

set local role anon;
select pg_temp.ecs_clear_auth_context();

select ok(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_mission_commands where expedition_id = 'mission-expedition-rls'$$) in (-1, 0),
  'anonymous users cannot read Mission commands'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_commands (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, creator_label, command_type, priority, title, instructions, target_kind, target_key, acknowledgment_mode, operational_state, delivery_state, acknowledgment_state, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'anon-command', 'anon-command-key', '13000000-0000-4000-8000-000000000004', '33000000-0000-4000-8000-000000000001', 'Denied', 'general', 'normal', 'Denied', 'Denied', 'team', 'team', 'none', 'ready', 'local', 'not_required', now(), now(), now())$$),
  '00000',
  'anonymous users cannot insert Mission commands'
);

reset role;
select pg_temp.ecs_clear_auth_context();
set local role authenticated;
select pg_temp.ecs_set_auth_context('13000000-0000-4000-8000-000000000001');

select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_commands (id, expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, recipient_member_ids, creator_label, command_type, priority, title, instructions, target_kind, target_key, target_label, assignment_kind, assignment_key, assignment_member_id, assignment_status, acknowledgment_mode, deadline_at, linked_context, source_truth, operational_state, delivery_state, acknowledgment_state, client_created_at, client_updated_at, observed_at, state_version, server_revision) values ('43000000-0000-4000-8000-000000000001', 'mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-command-key-1', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', array['33000000-0000-4000-8000-000000000002']::uuid[], 'LEAD', 'route', 'high', 'Review route blockage', 'Hold and acknowledge.', 'team', 'team', 'Affected team', 'member', '33000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', 'accepted', 'all', now() + interval '1 hour', '{"type":"route","id":"route-1"}', '[{"origin":"manual"}]', 'active', 'queued', 'pending', now(), now(), now(), 1, 999999)$$),
  1,
  'command-role member can create an assigned Mission command'
);
select isnt(
  (select server_revision from public.dispatch_mission_commands where client_id = 'mission-command-1'),
  999999::bigint,
  'server revision overrides the client value'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_operation_receipts where entity_kind = 'mission_command' and entity_client_id = 'mission-command-1'$$),
  1,
  'server trigger records a Mission idempotency receipt'
);
select is(
  (select client_operation_id from public.dispatch_mission_commands where client_id = 'mission-command-1'),
  'mission-command-key-1',
  'missing client operation identity falls back deterministically to the idempotency key'
);
select is(
  (select client_operation_id from public.dispatch_operation_receipts where entity_kind = 'mission_command' and entity_client_id = 'mission-command-1'),
  'mission-command-key-1',
  'the server receipt binds the same client operation identity'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_command_acknowledgments (expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, member_id, response, responded_at, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-forged-lead-ack', 'mission-forged-lead-ack-key', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'acknowledged', now(), now(), now(), now())$$),
  '00000',
  'a command lead cannot acknowledge a command they were not targeted to receive'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_command_events (expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, actor_label, event_type, operational_state, delivery_state, acknowledgment_state, summary, occurred_at, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-forged-lead-ack-event', 'mission-forged-lead-ack-event-key', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'LEAD', 'acknowledged', 'active', 'queued', 'pending', 'Denied forged acknowledgment.', now(), now(), now(), now())$$),
  '00000',
  'acknowledgment events require the actor to be a targeted recipient'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_commands (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, creator_label, command_type, priority, title, instructions, target_kind, target_key, acknowledgment_mode, operational_state, delivery_state, acknowledgment_state, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'mission-command-duplicate', 'mission-command-key-1', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'LEAD', 'general', 'normal', 'Duplicate', 'Duplicate', 'team', 'team', 'none', 'ready', 'local', 'not_required', now(), now(), now())$$),
  '00000',
  'duplicate idempotency keys cannot create another command'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_commands (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, creator_label, command_type, priority, title, instructions, target_kind, target_key, acknowledgment_mode, linked_context, operational_state, delivery_state, acknowledgment_state, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'mission-coordinate-leak', 'mission-coordinate-leak-key', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'LEAD', 'general', 'normal', 'Denied coordinates', 'Denied', 'team', 'team', 'none', '{"latitude":38.5,"longitude":-121.5}', 'ready', 'local', 'not_required', now(), now(), now())$$),
  '00000',
  'ordinary Mission content rejects exact coordinates'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_commands (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, creator_label, command_type, priority, title, instructions, target_kind, target_key, acknowledgment_mode, operational_state, delivery_state, acknowledgment_state, client_created_at, client_updated_at, observed_at) values ('wrong-expedition', '23000000-0000-4000-8000-000000000001', 'mission-wrong-scope', 'mission-wrong-scope-key', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'LEAD', 'general', 'normal', 'Wrong scope', 'Wrong scope', 'team', 'team', 'none', 'ready', 'local', 'not_required', now(), now(), now())$$),
  '00000',
  'convoy IDs cannot be used with another expedition scope'
);
select is(
  pg_temp.ecs_row_count($$update public.dispatch_mission_commands set operational_state = 'in_progress', delivery_state = 'sending', state_version = 2, client_updated_at = now() where client_id = 'mission-command-1'$$),
  1,
  'valid independent command state transitions are accepted'
);
select isnt(
  pg_temp.ecs_sqlstate($$update public.dispatch_mission_commands set title = 'Stale write', state_version = 1, client_updated_at = now() where client_id = 'mission-command-1'$$),
  '00000',
  'stale command versions are rejected'
);
select isnt(
  pg_temp.ecs_sqlstate($$update public.dispatch_mission_commands set operational_state = 'ready', state_version = 3, client_updated_at = now() where client_id = 'mission-command-1'$$),
  '00000',
  'invalid operational rewinds are rejected'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_command_events (id, expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, actor_label, event_type, operational_state, delivery_state, acknowledgment_state, summary, occurred_at, client_created_at, client_updated_at, observed_at) values ('44000000-0000-4000-8000-000000000001', 'mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-event-1', 'mission-event-key-1', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'LEAD', 'started', 'in_progress', 'sending', 'pending', 'Command started.', now(), now(), now(), now())$$),
  1,
  'command role can append a Mission event'
);
select isnt(
  pg_temp.ecs_sqlstate($$update public.dispatch_mission_command_events set summary = 'Mutated history' where client_id = 'mission-event-1'$$),
  '00000',
  'Mission event history is append-only'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_command_events (id, expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, actor_label, event_type, operational_state, delivery_state, acknowledgment_state, summary, occurred_at, client_created_at, client_updated_at, observed_at) values ('44000000-0000-4000-8000-000000000002', 'mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-event-old-observation', 'mission-event-key-old-observation', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'LEAD', 'staged', 'active', 'queued', 'pending', 'Older observed event arrived later.', now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours')$$),
  1,
  'out-of-order observed events are preserved append-only'
);
select ok(
  (select server_revision from public.dispatch_mission_command_events where client_id = 'mission-event-old-observation')
    > (select server_revision from public.dispatch_mission_command_events where client_id = 'mission-event-1'),
  'server revision provides stable receipt ordering independent of observed time'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_command_events (expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, actor_label, event_type, operational_state, delivery_state, acknowledgment_state, summary, occurred_at, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-event-duplicate', 'mission-event-key-1', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'LEAD', 'staged', 'active', 'queued', 'pending', 'Duplicate event.', now(), now(), now(), now())$$),
  '00000',
  'duplicate event operations remain idempotent'
);

select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_playbook_instances (id, expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, actor_label, definition_id, definition_version, playbook_state, completed_step_ids, source_truth, input_snapshot, payload, last_known_connectivity, client_created_at, client_updated_at, observed_at) values ('53000000-0000-4000-8000-000000000001', 'mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'mission-playbook-1', 'mission-playbook-key-1', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'LEAD', 'route_blockage', 1, 'active', array[]::text[], '[{"origin":"manual"}]', '{}', '{}', 'online', now(), now(), now())$$),
  1,
  'command role can create a deterministic playbook instance'
);
select lives_ok(
  $$insert into public.dispatch_mission_playbook_steps (expedition_id, convoy_id, playbook_instance_id, playbook_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, step_id, step_type, step_state, result, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'mission-playbook-1', 'mission-step-1', 'mission-step-key-1', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'review-context', 'review_context', 'completed', '{}', now(), now(), now())$$,
  'command role can persist a playbook step result'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_playbook_events (expedition_id, convoy_id, playbook_instance_id, playbook_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, actor_label, event_type, playbook_state, step_id, summary, metadata, occurred_at, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'mission-playbook-1', 'mission-playbook-event-1', 'mission-playbook-event-key-1', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'LEAD', 'context_reviewed', 'active', 'review-context', 'Context reviewed.', '{}', now(), now(), now(), now())$$),
  1,
  'command role can append a playbook event'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_deadlines (expedition_id, convoy_id, playbook_instance_id, playbook_client_id, step_id, client_id, idempotency_key, actor_user_id, actor_member_id, deadline_source, title, reason, due_at, warning_window_ms, critical_window_ms, priority, completion_state, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'mission-playbook-1', 'review-context', 'mission-deadline-1', 'mission-deadline-key-1', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'no_response_review', 'Review status', 'Operator review is due.', now() + interval '30 minutes', 900000, 120000, 'high', 'active', now(), now(), now())$$),
  1,
  'command role can persist a Mission deadline'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_incident_links (expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, incident_id, link_kind, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-incident-link-1', 'mission-incident-link-key-1', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'incident-existing-1', 'command', now(), now(), now())$$),
  1,
  'Mission links reuse an existing incident identity'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_restricted_locations (expedition_id, convoy_id, source_kind, source_client_id, source_record_id, actor_user_id, actor_member_id, authorized_member_ids, latitude, longitude, accuracy_meters, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'mission_command', 'mission-command-1', '43000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', array['33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000002']::uuid[], 38.5, -121.5, 10, now())$$),
  1,
  'exact Mission location is stored only in the restricted location table'
);

reset role;
select pg_temp.ecs_clear_auth_context();
set local role authenticated;
select pg_temp.ecs_set_auth_context('13000000-0000-4000-8000-000000000002');

select is(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_mission_commands where client_id = 'mission-command-1'$$),
  1,
  'active expedition member can read Mission commands'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_restricted_locations where source_client_id = 'mission-command-1'$$),
  1,
  'explicitly authorized member can read the restricted Mission location'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_command_acknowledgments (expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, member_id, response, responded_at, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-ack-member-1', 'mission-ack-member-key-1', '13000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', 'acknowledged', now(), now(), now(), now())$$),
  1,
  'member can append only their own acknowledgment'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_operation_receipts where entity_kind = 'mission_command_acknowledgment' and entity_client_id = 'mission-ack-member-1'$$),
  1,
  'member acknowledgment creates an idempotency receipt'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_command_acknowledgments (expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, member_id, response, responded_at, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-ack-forged', 'mission-ack-forged-key', '13000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000001', 'acknowledged', now(), now(), now(), now())$$),
  '00000',
  'member cannot acknowledge for another identity'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_commands (id, expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, recipient_member_ids, creator_label, command_type, priority, title, instructions, target_kind, target_key, acknowledgment_mode, operational_state, delivery_state, acknowledgment_state, client_created_at, client_updated_at, observed_at) values ('43000000-0000-4000-8000-000000000002', 'mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'mission-member-checkin', 'mission-member-checkin-key', '13000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', array['33000000-0000-4000-8000-000000000002']::uuid[], 'TWO', 'check_in', 'normal', 'Personal check-in', 'Record status.', 'member', '33000000-0000-4000-8000-000000000002', 'none', 'ready', 'queued', 'not_required', now(), now(), now())$$),
  1,
  'participating member can create their own unassigned check-in'
);
select isnt(
  pg_temp.ecs_sqlstate($$update public.dispatch_mission_commands set assignment_kind = 'member', assignment_key = '33000000-0000-4000-8000-000000000001', assignment_member_id = '33000000-0000-4000-8000-000000000001', assignment_status = 'accepted', state_version = 2, client_updated_at = now() where client_id = 'mission-member-checkin'$$),
  '00000',
  'ordinary member cannot assign their self-created command'
);
select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_command_events (expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, actor_label, event_type, operational_state, delivery_state, acknowledgment_state, summary, occurred_at, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-member-ack-event', 'mission-member-ack-event-key', '13000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', 'TWO', 'acknowledged', 'in_progress', 'sending', 'partial', 'Member acknowledged.', now(), now(), now(), now())$$),
  1,
  'member can append an acknowledgment event without command privileges'
);

reset role;
select pg_temp.ecs_clear_auth_context();
set local role authenticated;
select pg_temp.ecs_set_auth_context('13000000-0000-4000-8000-000000000003');

select is(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_mission_commands where client_id = 'mission-command-1'$$),
  1,
  'Mission viewer can read expedition commands'
);
select is(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_restricted_locations where source_client_id = 'mission-command-1'$$),
  0,
  'Mission viewer cannot read a restricted location without authorization'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_commands (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, creator_label, command_type, priority, title, instructions, target_kind, target_key, acknowledgment_mode, operational_state, delivery_state, acknowledgment_state, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'mission-viewer-command', 'mission-viewer-command-key', '13000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000003', 'VIEW', 'check_in', 'normal', 'Denied viewer command', 'Denied', 'member', '33000000-0000-4000-8000-000000000003', 'none', 'ready', 'local', 'not_required', now(), now(), now())$$),
  '00000',
  'Mission viewer cannot create commands'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_command_acknowledgments (expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, member_id, response, responded_at, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-viewer-ack', 'mission-viewer-ack-key', '13000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000003', 'acknowledged', now(), now(), now(), now())$$),
  '00000',
  'Mission viewer cannot acknowledge commands'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_command_events (expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, actor_label, event_type, operational_state, delivery_state, acknowledgment_state, summary, occurred_at, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-viewer-event', 'mission-viewer-event-key', '13000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000003', 'VIEW', 'acknowledged', 'in_progress', 'sending', 'partial', 'Denied viewer event.', now(), now(), now(), now())$$),
  '00000',
  'Mission viewer cannot append events'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_restricted_locations (expedition_id, convoy_id, source_kind, source_client_id, source_record_id, actor_user_id, actor_member_id, authorized_member_ids, latitude, longitude, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'mission_command', 'mission-command-1', '43000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000003', array['33000000-0000-4000-8000-000000000003']::uuid[], 38.6, -121.6, now())$$),
  '00000',
  'Mission viewer cannot create restricted location records'
);

reset role;
select pg_temp.ecs_clear_auth_context();
set local role authenticated;
select pg_temp.ecs_set_auth_context('13000000-0000-4000-8000-000000000004');

select is(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_mission_commands where expedition_id = 'mission-expedition-rls'$$),
  0,
  'an outsider cannot read records by guessing the expedition ID'
);
select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_commands (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, creator_label, command_type, priority, title, instructions, target_kind, target_key, acknowledgment_mode, operational_state, delivery_state, acknowledgment_state, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'mission-outsider-command', 'mission-outsider-command-key', '13000000-0000-4000-8000-000000000004', '33000000-0000-4000-8000-000000000001', 'OUT', 'general', 'normal', 'Denied outsider', 'Denied', 'team', 'team', 'none', 'ready', 'local', 'not_required', now(), now(), now())$$),
  '00000',
  'an outsider cannot write records using a guessed convoy ID'
);

reset role;
select pg_temp.ecs_clear_auth_context();
update public.convoys
set status = 'completed', updated_at = now()
where id = '23000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.ecs_set_auth_context('13000000-0000-4000-8000-000000000001');

select isnt(
  pg_temp.ecs_sqlstate($$insert into public.dispatch_mission_playbook_instances (expedition_id, convoy_id, client_id, idempotency_key, actor_user_id, actor_member_id, definition_id, definition_version, title, scenario, playbook_state, current_step_id, input_snapshot, source_truth, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', 'mission-playbook-after-completion', 'mission-playbook-after-completion-key', '13000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'route_blockage', 1, 'Denied after completion', 'route_blockage', 'ready', 'review', '{}', '[{"origin":"manual"}]', now(), now(), now())$$),
  '00000',
  'command-role members cannot create new Playbook work after convoy completion'
);

reset role;
select pg_temp.ecs_clear_auth_context();
set local role authenticated;
select pg_temp.ecs_set_auth_context('13000000-0000-4000-8000-000000000002');

select is(
  pg_temp.ecs_row_count($$insert into public.dispatch_mission_command_acknowledgments (expedition_id, convoy_id, command_id, command_client_id, client_id, idempotency_key, actor_user_id, actor_member_id, member_id, response, responded_at, client_created_at, client_updated_at, observed_at) values ('mission-expedition-rls', '23000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'mission-command-1', 'mission-late-ack-member', 'mission-late-ack-member-key', '13000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', 'acknowledged', now() - interval '1 minute', now(), now(), now())$$),
  1,
  'valid late acknowledgment survives expedition completion'
);

reset role;
select pg_temp.ecs_clear_auth_context();
update public.convoy_members
set revoked_at = now()
where id = '33000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.ecs_set_auth_context('13000000-0000-4000-8000-000000000002');

select is(
  pg_temp.ecs_visible_count($$select count(*) from public.dispatch_mission_commands where expedition_id = 'mission-expedition-rls'$$),
  0,
  'revoked member immediately loses Mission access'
);

select * from finish();
rollback;
