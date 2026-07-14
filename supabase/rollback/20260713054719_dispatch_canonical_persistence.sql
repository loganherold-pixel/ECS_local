-- Manual rollback for 20260713054719_dispatch_canonical_persistence.sql.
--
-- Run only after the mobile kill switch is active and the canonical backend
-- mode is disabled. Export records first if any shadow or field-test data must
-- be retained. This intentionally leaves convoys.expedition_id in place because
-- that column is owned by migration 037_convoy_staleness_policy.sql.

begin;

do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array[
      'dispatch_pings',
      'dispatch_queue_items',
      'dispatch_assignments',
      'dispatch_assist_requests',
      'dispatch_acknowledgments',
      'dispatch_timeline_events'
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

drop function if exists public.cleanup_dispatch_canonical_records(integer, integer);
drop function if exists public.resolve_dispatch_actor_membership(text, uuid);

drop table if exists public.dispatch_operation_receipts;
drop table if exists public.dispatch_restricted_locations;
drop table if exists public.dispatch_acknowledgments;
drop table if exists public.dispatch_timeline_events;
drop table if exists public.dispatch_assignments;
drop table if exists public.dispatch_assist_requests;
drop table if exists public.dispatch_queue_items;
drop table if exists public.dispatch_pings;

drop function if exists private.dispatch_reject_history_mutation();
drop function if exists private.dispatch_record_operation_receipt();
drop function if exists private.dispatch_prepare_mutable_record();
drop function if exists private.dispatch_transition_allowed(text, text, text);
drop function if exists private.dispatch_validate_scope_record();
drop function if exists private.dispatch_json_has_restricted_key(jsonb);
drop function if exists private.dispatch_can_read_expedition(text, uuid);
drop function if exists private.dispatch_can_append_late_ack(text, uuid, uuid, timestamptz);
drop function if exists private.dispatch_recipients_are_members(text, uuid, uuid[]);
drop function if exists private.dispatch_is_own_member(text, uuid, uuid);
drop function if exists private.dispatch_has_command_role(text, uuid);
drop function if exists private.dispatch_has_expedition_access(text, uuid);

drop sequence if exists public.dispatch_server_revision_seq;
drop index if exists public.convoys_expedition_id_idx;

notify pgrst, 'reload schema';

commit;
