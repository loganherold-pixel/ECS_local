-- Manual rollback for 20260714195656_mission_command_canonical_persistence.sql.
--
-- Activate both Dispatch canonical kill switches before running this rollback.
-- Local Mission Command persistence remains authoritative and is not deleted.

begin;

do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array[
      'dispatch_mission_commands',
      'dispatch_mission_command_targets',
      'dispatch_mission_command_acknowledgments',
      'dispatch_mission_command_events',
      'dispatch_mission_playbook_instances',
      'dispatch_mission_playbook_steps',
      'dispatch_mission_playbook_events',
      'dispatch_mission_deadlines',
      'dispatch_mission_incident_links'
    ]
    loop
      if exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      ) then
        execute format('alter publication supabase_realtime drop table public.%I', target_table);
      end if;
    end loop;
  end if;
end;
$$;

drop function if exists public.cleanup_dispatch_mission_records(integer);

drop trigger if exists dispatch_15_validate_mission_location_source
  on public.dispatch_restricted_locations;
drop policy if exists dispatch_mission_location_insert_non_viewer
  on public.dispatch_restricted_locations;

delete from public.dispatch_restricted_locations
where source_kind = 'mission_command';

delete from public.dispatch_operation_receipts
where entity_kind in (
  'mission_command', 'mission_command_target', 'mission_command_acknowledgment',
  'mission_command_event', 'mission_playbook_instance', 'mission_playbook_step',
  'mission_playbook_event', 'mission_deadline', 'mission_incident_link'
);

drop table if exists public.dispatch_mission_incident_links;
drop table if exists public.dispatch_mission_deadlines;
drop table if exists public.dispatch_mission_playbook_events;
drop table if exists public.dispatch_mission_playbook_steps;
drop table if exists public.dispatch_mission_command_events;
drop table if exists public.dispatch_mission_command_acknowledgments;
drop table if exists public.dispatch_mission_command_targets;
drop table if exists public.dispatch_mission_playbook_instances;
drop table if exists public.dispatch_mission_commands;

drop function if exists private.dispatch_validate_mission_restricted_location();
drop function if exists private.dispatch_mission_record_operation_receipt();
drop function if exists private.dispatch_mission_prepare_mutable_record();
drop function if exists private.dispatch_mission_validate_scope_record();
drop function if exists private.dispatch_mission_transition_allowed(text, text, text);
drop function if exists private.dispatch_mission_can_acknowledge(uuid, uuid);
drop function if exists private.dispatch_mission_can_write_command(uuid);
drop function if exists private.dispatch_mission_can_issue(text, uuid, text);
drop function if exists private.dispatch_mission_can_participate(text, uuid);
drop function if exists private.dispatch_mission_has_command_role(text, uuid);
drop function if exists private.dispatch_mission_access_level(text, uuid);

drop index if exists public.dispatch_operation_receipts_client_operation_idx;
alter table public.dispatch_operation_receipts
  drop column if exists client_operation_id;

alter table public.convoy_members
  drop column if exists mission_command_access;

alter table public.dispatch_restricted_locations
  drop constraint if exists dispatch_restricted_locations_source_kind_check;
alter table public.dispatch_restricted_locations
  add constraint dispatch_restricted_locations_source_kind_check
  check (source_kind in ('ping', 'assist_request'));

alter table public.dispatch_operation_receipts
  drop constraint if exists dispatch_operation_receipts_entity_kind_check;
alter table public.dispatch_operation_receipts
  add constraint dispatch_operation_receipts_entity_kind_check
  check (entity_kind in (
    'ping', 'queue_item', 'assignment', 'assist_request', 'acknowledgment',
    'timeline_event', 'restricted_location'
  ));

notify pgrst, 'reload schema';

commit;
