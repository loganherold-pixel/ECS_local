-- Guarded canonical Dispatch persistence.
--
-- This schema is additive and does not change the local-first runtime by
-- itself. Mobile access is scoped through an active convoy whose
-- convoys.expedition_id matches the requested expedition. Merely knowing an
-- expedition or convoy identifier never grants access.

create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create sequence if not exists public.dispatch_server_revision_seq;

create index if not exists convoys_expedition_id_idx
  on public.convoys (expedition_id)
  where expedition_id is not null;

create or replace function private.dispatch_has_expedition_access(
  target_expedition_id text,
  target_convoy_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.convoys c
      join public.convoy_members m on m.convoy_id = c.id
      where c.id = target_convoy_id
        and c.expedition_id = target_expedition_id
        and c.status in ('planned', 'active', 'paused')
        and m.user_id = (select auth.uid())
        and m.revoked_at is null
    );
$$;

create or replace function private.dispatch_has_command_role(
  target_expedition_id text,
  target_convoy_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.convoys c
      join public.convoy_members m on m.convoy_id = c.id
      where c.id = target_convoy_id
        and c.expedition_id = target_expedition_id
        and c.status in ('planned', 'active', 'paused')
        and m.user_id = (select auth.uid())
        and m.revoked_at is null
        and (
          c.leader_user_id = (select auth.uid())
          or m.role in ('lead', 'sweep', 'support')
        )
    );
$$;

create or replace function private.dispatch_is_own_member(
  target_expedition_id text,
  target_convoy_id uuid,
  target_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.convoys c
      join public.convoy_members m on m.convoy_id = c.id
      where c.id = target_convoy_id
        and c.expedition_id = target_expedition_id
        and c.status in ('planned', 'active', 'paused')
        and m.id = target_member_id
        and m.user_id = (select auth.uid())
        and m.revoked_at is null
    );
$$;

create or replace function private.dispatch_recipients_are_members(
  target_expedition_id text,
  target_convoy_id uuid,
  target_member_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(cardinality(target_member_ids), 0) = (
    select count(distinct m.id)::integer
    from public.convoys c
    join public.convoy_members m on m.convoy_id = c.id
    where c.id = target_convoy_id
      and c.expedition_id = target_expedition_id
      and c.status in ('planned', 'active', 'paused')
      and m.revoked_at is null
      and m.id = any(coalesce(target_member_ids, '{}'::uuid[]))
  );
$$;

create or replace function private.dispatch_can_append_late_ack(
  target_expedition_id text,
  target_convoy_id uuid,
  target_member_id uuid,
  target_acknowledged_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and target_acknowledged_at is not null
    and exists (
      select 1
      from public.convoys c
      join public.convoy_members m on m.convoy_id = c.id
      where c.id = target_convoy_id
        and c.expedition_id = target_expedition_id
        and c.status in ('completed', 'cancelled')
        and c.updated_at >= now() - interval '7 days'
        and target_acknowledged_at <= c.updated_at
        and m.id = target_member_id
        and m.user_id = (select auth.uid())
        and m.revoked_at is null
    );
$$;

revoke execute on function private.dispatch_has_expedition_access(text, uuid) from public, anon;
revoke execute on function private.dispatch_has_command_role(text, uuid) from public, anon;
revoke execute on function private.dispatch_is_own_member(text, uuid, uuid) from public, anon;
revoke execute on function private.dispatch_recipients_are_members(text, uuid, uuid[]) from public, anon;
revoke execute on function private.dispatch_can_append_late_ack(text, uuid, uuid, timestamptz) from public, anon;
grant execute on function private.dispatch_has_expedition_access(text, uuid) to authenticated, service_role;
grant execute on function private.dispatch_has_command_role(text, uuid) to authenticated, service_role;
grant execute on function private.dispatch_is_own_member(text, uuid, uuid) to authenticated, service_role;
grant execute on function private.dispatch_recipients_are_members(text, uuid, uuid[]) to authenticated, service_role;
grant execute on function private.dispatch_can_append_late_ack(text, uuid, uuid, timestamptz) to authenticated, service_role;

create or replace function public.resolve_dispatch_actor_membership(
  target_expedition_id text,
  target_convoy_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  callsign text,
  role text,
  revoked_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.id, m.user_id, m.callsign, m.role, m.revoked_at
  from public.convoys c
  join public.convoy_members m on m.convoy_id = c.id
  where (select auth.uid()) is not null
    and c.id = target_convoy_id
    and c.expedition_id = target_expedition_id
    and c.status in ('planned', 'active', 'paused', 'completed', 'cancelled')
    and m.user_id = (select auth.uid())
    and m.revoked_at is null
  limit 1;
$$;

revoke execute on function public.resolve_dispatch_actor_membership(text, uuid) from public, anon;
grant execute on function public.resolve_dispatch_actor_membership(text, uuid) to authenticated, service_role;
comment on function public.resolve_dispatch_actor_membership(text, uuid)
is 'Returns only the signed-in user membership for an exactly scoped Dispatch convoy. Supports bounded late acknowledgment replay without exposing the roster.';

create table if not exists public.dispatch_pings (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  recipient_member_ids uuid[] not null default '{}'::uuid[],
  ping_type text not null check (ping_type in ('check_in', 'rally', 'assist', 'route', 'resource', 'hazard', 'emergency', 'general')),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')),
  operational_state text not null check (operational_state in ('draft', 'open', 'awaiting_acknowledgment', 'acknowledged', 'declined', 'escalated', 'resolved', 'cancelled')),
  delivery_state text not null check (delivery_state in ('draft', 'local', 'queued', 'sending', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled')),
  message text not null check (char_length(message) <= 2000),
  requires_acknowledgment boolean not null default false,
  response_due_at timestamptz,
  linked_context jsonb not null default '{}'::jsonb check (jsonb_typeof(linked_context) = 'object'),
  source_state text not null default 'local_first' check (source_state in ('local_first', 'realtime', 'server_reconciled')),
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  deleted_at timestamptz,
  tombstone_reason text check (tombstone_reason is null or char_length(tombstone_reason) <= 240),
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key)
);

create table if not exists public.dispatch_queue_items (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  recipient_member_ids uuid[] not null default '{}'::uuid[],
  title text not null check (char_length(title) <= 240),
  detail text not null check (char_length(detail) <= 4000),
  status text not null check (status in ('new', 'pending_response', 'assigned', 'in_progress', 'blocked', 'escalated', 'needs_review', 'resolved', 'cancelled')),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')),
  delivery_state text not null check (delivery_state in ('draft', 'local', 'queued', 'sending', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled')),
  linked_context jsonb not null default '{}'::jsonb check (jsonb_typeof(linked_context) = 'object'),
  due_at timestamptz,
  source_ping_client_id text,
  source_state text not null default 'local_first' check (source_state in ('local_first', 'realtime', 'server_reconciled')),
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  deleted_at timestamptz,
  tombstone_reason text check (tombstone_reason is null or char_length(tombstone_reason) <= 240),
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key)
);

create table if not exists public.dispatch_assignments (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  queue_item_client_id text not null,
  assignee_member_id uuid not null references public.convoy_members(id) on delete restrict,
  status text not null check (status in ('unassigned', 'offered', 'accepted', 'in_progress', 'blocked', 'completed', 'declined')),
  delivery_state text not null check (delivery_state in ('draft', 'local', 'queued', 'sending', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled')),
  assigned_at timestamptz not null,
  accepted_at timestamptz,
  completed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  source_state text not null default 'local_first' check (source_state in ('local_first', 'realtime', 'server_reconciled')),
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  deleted_at timestamptz,
  tombstone_reason text check (tombstone_reason is null or char_length(tombstone_reason) <= 240),
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key)
);

create table if not exists public.dispatch_assist_requests (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  recipient_member_ids uuid[] not null default '{}'::uuid[],
  assist_type text not null check (assist_type in ('vehicle', 'medical', 'navigation', 'fuel', 'water', 'mechanical', 'comms', 'recovery', 'general_support')),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null check (status in ('new', 'pending_response', 'assigned', 'in_progress', 'blocked', 'escalated', 'needs_review', 'resolved', 'cancelled')),
  delivery_state text not null check (delivery_state in ('draft', 'local', 'queued', 'sending', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled')),
  message text not null check (char_length(message) <= 2000),
  require_acknowledgment boolean not null default true,
  linked_context jsonb not null default '{}'::jsonb check (jsonb_typeof(linked_context) = 'object'),
  source_ping_client_id text,
  queue_item_client_id text,
  source_state text not null default 'local_first' check (source_state in ('local_first', 'realtime', 'server_reconciled')),
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  deleted_at timestamptz,
  tombstone_reason text check (tombstone_reason is null or char_length(tombstone_reason) <= 240),
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key)
);

create table if not exists public.dispatch_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  ping_client_id text not null,
  queue_item_client_id text,
  member_id uuid not null references public.convoy_members(id) on delete restrict,
  status text not null check (status in ('acknowledged', 'accepted', 'declined')),
  message text check (message is null or char_length(message) <= 2000),
  acknowledged_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key),
  check (member_id = actor_member_id)
);

create table if not exists public.dispatch_timeline_events (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  member_ids uuid[] not null default '{}'::uuid[],
  event_type text not null check (event_type in ('ping', 'ping_created', 'ping_acknowledged', 'ping_declined', 'queue', 'queue_escalated', 'queue_resolved', 'assignment', 'assignment_created', 'assignment_accepted', 'status', 'member_stale', 'sync', 'log', 'resource_check_requested', 'hazard_broadcast_sent', 'assist_request_created', 'sync_conflict')),
  title text not null check (char_length(title) <= 240),
  detail text not null check (char_length(detail) <= 4000),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')),
  actor_label text check (actor_label is null or char_length(actor_label) <= 160),
  target_label text check (target_label is null or char_length(target_label) <= 160),
  linked_context jsonb not null default '{}'::jsonb check (jsonb_typeof(linked_context) = 'object'),
  queue_item_client_id text,
  ping_client_id text,
  occurred_at timestamptz not null,
  observed_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key)
);

create table if not exists public.dispatch_restricted_locations (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  source_kind text not null check (source_kind in ('ping', 'assist_request')),
  source_client_id text not null check (char_length(source_client_id) between 1 and 200),
  source_record_id uuid not null,
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  authorized_member_ids uuid[] not null default '{}'::uuid[],
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  observed_at timestamptz not null,
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  unique (expedition_id, source_kind, source_client_id)
);

create table if not exists public.dispatch_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null,
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  entity_kind text not null check (entity_kind in ('ping', 'queue_item', 'assignment', 'assist_request', 'acknowledgment', 'timeline_event', 'restricted_location')),
  entity_id uuid not null,
  entity_client_id text not null,
  idempotency_key text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  state_version bigint not null default 1 check (state_version > 0),
  outcome text not null default 'applied' check (outcome in ('applied', 'duplicate', 'conflict', 'rejected')),
  server_revision bigint not null default nextval('public.dispatch_server_revision_seq'),
  observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  unique (expedition_id, entity_kind, idempotency_key, state_version)
);

create index if not exists dispatch_pings_active_status_idx
  on public.dispatch_pings (expedition_id, operational_state, updated_at desc)
  where deleted_at is null;
create index if not exists dispatch_pings_convoy_revision_idx
  on public.dispatch_pings (convoy_id, server_revision desc);
create index if not exists dispatch_pings_actor_updated_idx
  on public.dispatch_pings (actor_user_id, updated_at desc);
create index if not exists dispatch_pings_recipient_members_idx
  on public.dispatch_pings using gin (recipient_member_ids);

create index if not exists dispatch_queue_active_status_idx
  on public.dispatch_queue_items (expedition_id, status, updated_at desc)
  where deleted_at is null;
create index if not exists dispatch_queue_convoy_revision_idx
  on public.dispatch_queue_items (convoy_id, server_revision desc);
create index if not exists dispatch_queue_actor_updated_idx
  on public.dispatch_queue_items (actor_user_id, updated_at desc);
create index if not exists dispatch_queue_recipient_members_idx
  on public.dispatch_queue_items using gin (recipient_member_ids);

create index if not exists dispatch_assignments_active_status_idx
  on public.dispatch_assignments (expedition_id, status, updated_at desc)
  where deleted_at is null;
create index if not exists dispatch_assignments_assignee_status_idx
  on public.dispatch_assignments (expedition_id, assignee_member_id, status)
  where deleted_at is null;
create index if not exists dispatch_assignments_convoy_revision_idx
  on public.dispatch_assignments (convoy_id, server_revision desc);

create index if not exists dispatch_assist_active_status_idx
  on public.dispatch_assist_requests (expedition_id, status, updated_at desc)
  where deleted_at is null;
create index if not exists dispatch_assist_convoy_revision_idx
  on public.dispatch_assist_requests (convoy_id, server_revision desc);
create index if not exists dispatch_assist_recipient_members_idx
  on public.dispatch_assist_requests using gin (recipient_member_ids);

create index if not exists dispatch_ack_member_time_idx
  on public.dispatch_acknowledgments (expedition_id, member_id, acknowledged_at desc);
create index if not exists dispatch_ack_convoy_revision_idx
  on public.dispatch_acknowledgments (convoy_id, server_revision desc);

create index if not exists dispatch_timeline_expedition_time_idx
  on public.dispatch_timeline_events (expedition_id, occurred_at desc);
create index if not exists dispatch_timeline_convoy_revision_idx
  on public.dispatch_timeline_events (convoy_id, server_revision desc);
create index if not exists dispatch_timeline_member_ids_idx
  on public.dispatch_timeline_events using gin (member_ids);

create index if not exists dispatch_restricted_location_source_idx
  on public.dispatch_restricted_locations (expedition_id, source_kind, source_client_id);
create index if not exists dispatch_restricted_location_authorized_idx
  on public.dispatch_restricted_locations using gin (authorized_member_ids);
create index if not exists dispatch_restricted_location_observed_idx
  on public.dispatch_restricted_locations (convoy_id, observed_at desc);

create index if not exists dispatch_receipts_expedition_revision_idx
  on public.dispatch_operation_receipts (expedition_id, server_revision desc);
create index if not exists dispatch_receipts_actor_time_idx
  on public.dispatch_operation_receipts (actor_user_id, created_at desc);

create or replace function private.dispatch_json_has_restricted_key(input_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  pair record;
  element jsonb;
  normalized_key text;
begin
  if input_value is null then
    return false;
  end if;

  if jsonb_typeof(input_value) = 'object' then
    for pair in select key, value from jsonb_each(input_value)
    loop
      normalized_key := lower(regexp_replace(
        replace(pair.key, '-', '_'),
        '([a-z0-9])([A-Z])',
        '\1_\2',
        'g'
      ));
      if normalized_key in (
        'lat',
        'latitude',
        'lng',
        'lon',
        'longitude',
        'coordinate',
        'coordinates',
        'gps',
        'gps_position',
        'location',
        'position',
        'access_token',
        'refresh_token',
        'provider_token',
        'authorization',
        'service_role',
        'service_role_key',
        'api_key',
        'client_secret',
        'password',
        'secret',
        'raw_payload'
      ) or normalized_key ~ '(^|_)(token|secret|password|authorization)($|_)'
        or normalized_key ~ '(^|_)(api|service_role|provider|access|refresh|client)_(key|token|secret)($|_)' then
        return true;
      end if;
      if private.dispatch_json_has_restricted_key(pair.value) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(input_value) = 'array' then
    for element in select item from jsonb_array_elements(input_value) as items(item)
    loop
      if private.dispatch_json_has_restricted_key(element) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$$;

revoke execute on function private.dispatch_json_has_restricted_key(jsonb) from public, anon;
grant execute on function private.dispatch_json_has_restricted_key(jsonb) to authenticated, service_role;

alter table public.dispatch_pings
  add constraint dispatch_pings_payload_redacted_check
  check (
    not private.dispatch_json_has_restricted_key(payload)
    and not private.dispatch_json_has_restricted_key(linked_context)
  );
alter table public.dispatch_queue_items
  add constraint dispatch_queue_payload_redacted_check
  check (
    not private.dispatch_json_has_restricted_key(payload)
    and not private.dispatch_json_has_restricted_key(linked_context)
  );
alter table public.dispatch_assignments
  add constraint dispatch_assignments_payload_redacted_check
  check (not private.dispatch_json_has_restricted_key(payload));
alter table public.dispatch_assist_requests
  add constraint dispatch_assist_payload_redacted_check
  check (
    not private.dispatch_json_has_restricted_key(payload)
    and not private.dispatch_json_has_restricted_key(linked_context)
  );
alter table public.dispatch_acknowledgments
  add constraint dispatch_ack_payload_redacted_check
  check (not private.dispatch_json_has_restricted_key(payload));
alter table public.dispatch_timeline_events
  add constraint dispatch_timeline_payload_redacted_check
  check (
    not private.dispatch_json_has_restricted_key(payload)
    and not private.dispatch_json_has_restricted_key(linked_context)
  );

create or replace function private.dispatch_validate_scope_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  record_json jsonb := to_jsonb(new);
  target_ids uuid[] := '{}'::uuid[];
  target_member_id uuid;
  target_ping_client_id text;
  target_queue_client_id text;
begin
  if tg_op = 'INSERT' then
    new.server_revision := nextval('public.dispatch_server_revision_seq');
    new.server_observed_at := clock_timestamp();
    new.created_at := now();
  end if;

  if not exists (
    select 1
    from public.convoys c
    where c.id = new.convoy_id
      and c.expedition_id = new.expedition_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'dispatch_expedition_convoy_scope_mismatch';
  end if;

  if not exists (
    select 1
    from public.convoy_members m
    where m.id = new.actor_member_id
      and m.convoy_id = new.convoy_id
      and m.user_id = new.actor_user_id
      and m.revoked_at is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'dispatch_actor_membership_mismatch';
  end if;

  if record_json ? 'recipient_member_ids' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into target_ids
      from jsonb_array_elements_text(record_json -> 'recipient_member_ids') as values(value);
  elsif record_json ? 'member_ids' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into target_ids
      from jsonb_array_elements_text(record_json -> 'member_ids') as values(value);
  elsif record_json ? 'authorized_member_ids' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into target_ids
      from jsonb_array_elements_text(record_json -> 'authorized_member_ids') as values(value);
  end if;

  if cardinality(target_ids) > 0 and not private.dispatch_recipients_are_members(
    new.expedition_id,
    new.convoy_id,
    target_ids
  ) then
    raise exception using
      errcode = '23514',
      message = 'dispatch_recipient_membership_mismatch';
  end if;

  if record_json ? 'assignee_member_id' then
    target_member_id := (record_json ->> 'assignee_member_id')::uuid;
  elsif record_json ? 'member_id' then
    target_member_id := (record_json ->> 'member_id')::uuid;
  else
    target_member_id := null;
  end if;

  if target_member_id is not null and not exists (
    select 1
    from public.convoy_members m
    where m.id = target_member_id
      and m.convoy_id = new.convoy_id
      and m.revoked_at is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'dispatch_target_membership_mismatch';
  end if;

  target_ping_client_id := coalesce(
    nullif(record_json ->> 'ping_client_id', ''),
    nullif(record_json ->> 'source_ping_client_id', '')
  );
  if target_ping_client_id is not null and not exists (
    select 1
    from public.dispatch_pings p
    where p.expedition_id = new.expedition_id
      and p.convoy_id = new.convoy_id
      and p.client_id = target_ping_client_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'dispatch_ping_reference_missing';
  end if;

  target_queue_client_id := nullif(record_json ->> 'queue_item_client_id', '');
  if target_queue_client_id is not null and not exists (
    select 1
    from public.dispatch_queue_items q
    where q.expedition_id = new.expedition_id
      and q.convoy_id = new.convoy_id
      and q.client_id = target_queue_client_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'dispatch_queue_reference_missing';
  end if;

  if tg_table_name = 'dispatch_restricted_locations' then
    if not (new.actor_member_id = any(new.authorized_member_ids)) then
      raise exception using
        errcode = '23514',
        message = 'dispatch_location_actor_not_authorized';
    end if;

    if new.source_kind = 'ping' and not exists (
      select 1 from public.dispatch_pings p
      where p.id = new.source_record_id
        and p.client_id = new.source_client_id
        and p.expedition_id = new.expedition_id
        and p.convoy_id = new.convoy_id
    ) then
      raise exception using errcode = '23503', message = 'dispatch_location_ping_source_missing';
    elsif new.source_kind = 'assist_request' and not exists (
      select 1 from public.dispatch_assist_requests a
      where a.id = new.source_record_id
        and a.client_id = new.source_client_id
        and a.expedition_id = new.expedition_id
        and a.convoy_id = new.convoy_id
    ) then
      raise exception using errcode = '23503', message = 'dispatch_location_assist_source_missing';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.dispatch_transition_allowed(
  transition_kind text,
  current_state text,
  next_state text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select current_state = next_state
    or next_state = any(
      case transition_kind
        -- Canonical writes are snapshots and may coalesce locally validated
        -- intermediate delivery states. These sets are the reachable closure
        -- of the runtime graph, while terminal outcomes remain terminal.
        when 'delivery' then case current_state
          when 'draft' then array['queued', 'sending', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled']::text[]
          when 'local' then array['queued', 'sending', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled']::text[]
          when 'queued' then array['sending', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled']::text[]
          when 'sending' then array['queued', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled']::text[]
          when 'sent' then array['queued', 'sending', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled']::text[]
          when 'delivered' then array['queued', 'sending', 'sent', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled']::text[]
          when 'seen' then array['queued', 'sending', 'sent', 'delivered', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled']::text[]
          when 'acknowledged' then array['recovered']::text[]
          when 'accepted' then array['recovered']::text[]
          when 'declined' then array['acknowledged', 'accepted', 'escalated', 'recovered', 'cancelled']::text[]
          when 'no_response' then array['queued', 'sending', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'escalated', 'recovered', 'failed', 'retrying', 'cancelled']::text[]
          when 'escalated' then array['acknowledged', 'accepted', 'declined', 'recovered', 'cancelled']::text[]
          when 'failed' then array['queued', 'sending', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'retrying', 'cancelled']::text[]
          when 'retrying' then array['queued', 'sending', 'sent', 'delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed', 'cancelled']::text[]
          else '{}'::text[]
        end
        when 'ping' then case current_state
          when 'draft' then array['open', 'awaiting_acknowledgment', 'cancelled']::text[]
          when 'open' then array['awaiting_acknowledgment', 'acknowledged', 'declined', 'escalated', 'resolved', 'cancelled']::text[]
          when 'awaiting_acknowledgment' then array['acknowledged', 'declined', 'escalated', 'resolved', 'cancelled']::text[]
          when 'acknowledged' then array['resolved']::text[]
          when 'declined' then array['escalated', 'resolved']::text[]
          when 'escalated' then array['acknowledged', 'declined', 'resolved', 'cancelled']::text[]
          else '{}'::text[]
        end
        when 'queue' then case current_state
          when 'new' then array['pending_response', 'assigned', 'in_progress', 'blocked', 'escalated', 'needs_review', 'resolved', 'cancelled']::text[]
          when 'pending_response' then array['assigned', 'in_progress', 'blocked', 'escalated', 'needs_review', 'resolved', 'cancelled']::text[]
          when 'assigned' then array['in_progress', 'blocked', 'escalated', 'needs_review', 'resolved', 'cancelled']::text[]
          when 'in_progress' then array['blocked', 'escalated', 'needs_review', 'resolved', 'cancelled']::text[]
          when 'blocked' then array['assigned', 'in_progress', 'escalated', 'needs_review', 'resolved', 'cancelled']::text[]
          when 'escalated' then array['assigned', 'in_progress', 'blocked', 'needs_review', 'resolved', 'cancelled']::text[]
          when 'needs_review' then array['assigned', 'in_progress', 'blocked', 'escalated', 'resolved', 'cancelled']::text[]
          else '{}'::text[]
        end
        when 'assignment' then case current_state
          when 'unassigned' then array['offered']::text[]
          when 'offered' then array['accepted', 'declined']::text[]
          when 'accepted' then array['in_progress', 'blocked', 'completed', 'declined']::text[]
          when 'in_progress' then array['blocked', 'completed']::text[]
          when 'blocked' then array['in_progress', 'completed', 'declined']::text[]
          else '{}'::text[]
        end
        else '{}'::text[]
      end
    );
$$;

revoke execute on function private.dispatch_transition_allowed(text, text, text)
from public, anon, authenticated;

create or replace function private.dispatch_prepare_mutable_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  next_json jsonb;
  previous_json jsonb;
begin
  if tg_op = 'INSERT' then
    if new.client_updated_at < new.client_created_at then
      raise exception using
        errcode = '23514',
        message = 'dispatch_client_timestamp_order_invalid';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE' then
    next_json := to_jsonb(new);
    previous_json := to_jsonb(old);

    if new.expedition_id is distinct from old.expedition_id
      or new.convoy_id is distinct from old.convoy_id
      or new.client_id is distinct from old.client_id
      or new.idempotency_key is distinct from old.idempotency_key
      or new.actor_user_id is distinct from old.actor_user_id
      or new.actor_member_id is distinct from old.actor_member_id
      or new.client_created_at is distinct from old.client_created_at
      or new.created_at is distinct from old.created_at then
      raise exception using
        errcode = '23514',
        message = 'dispatch_immutable_identity_changed';
    end if;

    if old.deleted_at is not null and new.deleted_at is null then
      raise exception using
        errcode = '23514',
        message = 'dispatch_tombstone_is_terminal';
    end if;

    if new.client_updated_at < new.client_created_at then
      raise exception using
        errcode = '23514',
        message = 'dispatch_client_timestamp_order_invalid';
    end if;

    if not private.dispatch_transition_allowed(
      'delivery',
      previous_json ->> 'delivery_state',
      next_json ->> 'delivery_state'
    ) then
      raise exception using
        errcode = '23514',
        message = 'dispatch_delivery_transition_invalid';
    end if;

    if tg_table_name = 'dispatch_pings'
      and not private.dispatch_transition_allowed(
        'ping',
        previous_json ->> 'operational_state',
        next_json ->> 'operational_state'
      ) then
      raise exception using
        errcode = '23514',
        message = 'dispatch_ping_transition_invalid';
    elsif tg_table_name in ('dispatch_queue_items', 'dispatch_assist_requests')
      and not private.dispatch_transition_allowed(
        'queue',
        previous_json ->> 'status',
        next_json ->> 'status'
      ) then
      raise exception using
        errcode = '23514',
        message = 'dispatch_queue_transition_invalid';
    elsif tg_table_name = 'dispatch_assignments'
      and not private.dispatch_transition_allowed(
        'assignment',
        previous_json ->> 'status',
        next_json ->> 'status'
      ) then
      raise exception using
        errcode = '23514',
        message = 'dispatch_assignment_transition_invalid';
    end if;

    if tg_table_name = 'dispatch_assignments'
      and (next_json ->> 'queue_item_client_id') is distinct from (previous_json ->> 'queue_item_client_id') then
      raise exception using
        errcode = '23514',
        message = 'dispatch_assignment_source_changed';
    end if;

    if new.state_version < old.state_version then
      raise exception using
        errcode = '40001',
        message = 'dispatch_stale_state_version';
    end if;

    if new.state_version = old.state_version then
      next_json := to_jsonb(new) - array[
        'server_revision', 'server_observed_at', 'created_at', 'updated_at'
      ];
      previous_json := to_jsonb(old) - array[
        'server_revision', 'server_observed_at', 'created_at', 'updated_at'
      ];
      if next_json = previous_json then
        return old;
      end if;
      raise exception using
        errcode = '40001',
        message = 'dispatch_state_version_conflict';
    end if;

    new.server_revision := nextval('public.dispatch_server_revision_seq');
    new.server_observed_at := clock_timestamp();
    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke execute on function private.dispatch_validate_scope_record() from public, anon, authenticated;
revoke execute on function private.dispatch_prepare_mutable_record() from public, anon, authenticated;

create trigger dispatch_10_validate_ping_scope
before insert or update on public.dispatch_pings
for each row execute function private.dispatch_validate_scope_record();
create trigger dispatch_20_prepare_ping
before insert or update on public.dispatch_pings
for each row execute function private.dispatch_prepare_mutable_record();

create trigger dispatch_10_validate_queue_scope
before insert or update on public.dispatch_queue_items
for each row execute function private.dispatch_validate_scope_record();
create trigger dispatch_20_prepare_queue
before insert or update on public.dispatch_queue_items
for each row execute function private.dispatch_prepare_mutable_record();

create trigger dispatch_10_validate_assignment_scope
before insert or update on public.dispatch_assignments
for each row execute function private.dispatch_validate_scope_record();
create trigger dispatch_20_prepare_assignment
before insert or update on public.dispatch_assignments
for each row execute function private.dispatch_prepare_mutable_record();

create trigger dispatch_10_validate_assist_scope
before insert or update on public.dispatch_assist_requests
for each row execute function private.dispatch_validate_scope_record();
create trigger dispatch_20_prepare_assist
before insert or update on public.dispatch_assist_requests
for each row execute function private.dispatch_prepare_mutable_record();

create trigger dispatch_10_validate_ack_scope
before insert on public.dispatch_acknowledgments
for each row execute function private.dispatch_validate_scope_record();
create trigger dispatch_10_validate_timeline_scope
before insert on public.dispatch_timeline_events
for each row execute function private.dispatch_validate_scope_record();
create trigger dispatch_10_validate_location_scope
before insert on public.dispatch_restricted_locations
for each row execute function private.dispatch_validate_scope_record();

create or replace function private.dispatch_can_read_expedition(
  target_expedition_id text,
  target_convoy_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.convoys c
      join public.convoy_members m on m.convoy_id = c.id
      where c.id = target_convoy_id
        and c.expedition_id = target_expedition_id
        and m.user_id = (select auth.uid())
        and m.revoked_at is null
    );
$$;

revoke execute on function private.dispatch_can_read_expedition(text, uuid) from public, anon;
grant execute on function private.dispatch_can_read_expedition(text, uuid) to authenticated, service_role;

create or replace function private.dispatch_record_operation_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  record_json jsonb := to_jsonb(new);
  entity_kind_value text;
  idempotency_value text;
  state_version_value bigint;
begin
  entity_kind_value := case tg_table_name
    when 'dispatch_pings' then 'ping'
    when 'dispatch_queue_items' then 'queue_item'
    when 'dispatch_assignments' then 'assignment'
    when 'dispatch_assist_requests' then 'assist_request'
    when 'dispatch_acknowledgments' then 'acknowledgment'
    when 'dispatch_timeline_events' then 'timeline_event'
    when 'dispatch_restricted_locations' then 'restricted_location'
    else null
  end;

  if entity_kind_value is null then
    raise exception using errcode = '23514', message = 'dispatch_receipt_entity_kind_unknown';
  end if;

  idempotency_value := coalesce(
    record_json ->> 'idempotency_key',
    concat('dispatch:restricted_location:', record_json ->> 'source_kind', ':', record_json ->> 'source_client_id')
  );
  state_version_value := greatest(1, coalesce((record_json ->> 'state_version')::bigint, 1));

  insert into public.dispatch_operation_receipts (
    expedition_id,
    convoy_id,
    entity_kind,
    entity_id,
    entity_client_id,
    idempotency_key,
    actor_user_id,
    actor_member_id,
    state_version,
    outcome
  ) values (
    new.expedition_id,
    new.convoy_id,
    entity_kind_value,
    new.id,
    coalesce(record_json ->> 'client_id', record_json ->> 'source_client_id'),
    idempotency_value,
    new.actor_user_id,
    new.actor_member_id,
    state_version_value,
    'applied'
  )
  on conflict (expedition_id, entity_kind, idempotency_key, state_version) do nothing;

  return new;
end;
$$;

create or replace function private.dispatch_reject_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('ecs.dispatch_retention_cleanup', true) = 'on' then
    return old;
  end if;

  raise exception using
    errcode = '55000',
    message = 'dispatch_append_only_history';
end;
$$;

revoke execute on function private.dispatch_record_operation_receipt() from public, anon, authenticated;
revoke execute on function private.dispatch_reject_history_mutation() from public, anon, authenticated;

create trigger dispatch_90_receipt_ping
after insert or update on public.dispatch_pings
for each row execute function private.dispatch_record_operation_receipt();
create trigger dispatch_90_receipt_queue
after insert or update on public.dispatch_queue_items
for each row execute function private.dispatch_record_operation_receipt();
create trigger dispatch_90_receipt_assignment
after insert or update on public.dispatch_assignments
for each row execute function private.dispatch_record_operation_receipt();
create trigger dispatch_90_receipt_assist
after insert or update on public.dispatch_assist_requests
for each row execute function private.dispatch_record_operation_receipt();
create trigger dispatch_90_receipt_ack
after insert on public.dispatch_acknowledgments
for each row execute function private.dispatch_record_operation_receipt();
create trigger dispatch_90_receipt_timeline
after insert on public.dispatch_timeline_events
for each row execute function private.dispatch_record_operation_receipt();
create trigger dispatch_90_receipt_location
after insert on public.dispatch_restricted_locations
for each row execute function private.dispatch_record_operation_receipt();

create trigger dispatch_immutable_ack_history
before update or delete on public.dispatch_acknowledgments
for each row execute function private.dispatch_reject_history_mutation();
create trigger dispatch_immutable_timeline_history
before update or delete on public.dispatch_timeline_events
for each row execute function private.dispatch_reject_history_mutation();
create trigger dispatch_immutable_location_history
before update or delete on public.dispatch_restricted_locations
for each row execute function private.dispatch_reject_history_mutation();
create trigger dispatch_immutable_operation_receipts
before update or delete on public.dispatch_operation_receipts
for each row execute function private.dispatch_reject_history_mutation();

alter table public.dispatch_pings enable row level security;
alter table public.dispatch_queue_items enable row level security;
alter table public.dispatch_assignments enable row level security;
alter table public.dispatch_assist_requests enable row level security;
alter table public.dispatch_acknowledgments enable row level security;
alter table public.dispatch_timeline_events enable row level security;
alter table public.dispatch_restricted_locations enable row level security;
alter table public.dispatch_operation_receipts enable row level security;

create policy dispatch_pings_select_member
on public.dispatch_pings for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_pings_insert_actor
on public.dispatch_pings for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_recipients_are_members(expedition_id, convoy_id, recipient_member_ids)
);
create policy dispatch_pings_update_actor_or_command
on public.dispatch_pings for update to authenticated
using (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and (actor_user_id = (select auth.uid()) or private.dispatch_has_command_role(expedition_id, convoy_id))
)
with check (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and (actor_user_id = (select auth.uid()) or private.dispatch_has_command_role(expedition_id, convoy_id))
  and private.dispatch_recipients_are_members(expedition_id, convoy_id, recipient_member_ids)
);

create policy dispatch_queue_select_member
on public.dispatch_queue_items for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_queue_insert_actor
on public.dispatch_queue_items for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_recipients_are_members(expedition_id, convoy_id, recipient_member_ids)
);
create policy dispatch_queue_update_actor_or_command
on public.dispatch_queue_items for update to authenticated
using (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and (actor_user_id = (select auth.uid()) or private.dispatch_has_command_role(expedition_id, convoy_id))
)
with check (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and (actor_user_id = (select auth.uid()) or private.dispatch_has_command_role(expedition_id, convoy_id))
  and private.dispatch_recipients_are_members(expedition_id, convoy_id, recipient_member_ids)
);

create policy dispatch_assignments_select_member
on public.dispatch_assignments for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_assignments_insert_command
on public.dispatch_assignments for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_command_role(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
);
create policy dispatch_assignments_update_command_or_assignee
on public.dispatch_assignments for update to authenticated
using (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and (
    private.dispatch_has_command_role(expedition_id, convoy_id)
    or private.dispatch_is_own_member(expedition_id, convoy_id, assignee_member_id)
  )
)
with check (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and (
    private.dispatch_has_command_role(expedition_id, convoy_id)
    or private.dispatch_is_own_member(expedition_id, convoy_id, assignee_member_id)
  )
);

create policy dispatch_assist_select_member
on public.dispatch_assist_requests for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_assist_insert_actor
on public.dispatch_assist_requests for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_recipients_are_members(expedition_id, convoy_id, recipient_member_ids)
);
create policy dispatch_assist_update_actor_or_command
on public.dispatch_assist_requests for update to authenticated
using (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and (actor_user_id = (select auth.uid()) or private.dispatch_has_command_role(expedition_id, convoy_id))
)
with check (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and (actor_user_id = (select auth.uid()) or private.dispatch_has_command_role(expedition_id, convoy_id))
  and private.dispatch_recipients_are_members(expedition_id, convoy_id, recipient_member_ids)
);

create policy dispatch_ack_select_member
on public.dispatch_acknowledgments for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_ack_insert_own
on public.dispatch_acknowledgments for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and member_id = actor_member_id
  and (
    (
      private.dispatch_has_expedition_access(expedition_id, convoy_id)
      and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
    )
    or private.dispatch_can_append_late_ack(
      expedition_id,
      convoy_id,
      actor_member_id,
      acknowledged_at
    )
  )
);

create policy dispatch_timeline_select_member
on public.dispatch_timeline_events for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_timeline_insert_actor
on public.dispatch_timeline_events for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_recipients_are_members(expedition_id, convoy_id, member_ids)
);

create policy dispatch_restricted_location_select_authorized
on public.dispatch_restricted_locations for select to authenticated
using (
  private.dispatch_can_read_expedition(expedition_id, convoy_id)
  and (
    private.dispatch_has_command_role(expedition_id, convoy_id)
    or private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
    or exists (
      select 1
      from unnest(authorized_member_ids) authorized_member_id
      where private.dispatch_is_own_member(expedition_id, convoy_id, authorized_member_id)
    )
  )
);
create policy dispatch_restricted_location_insert_actor
on public.dispatch_restricted_locations for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_recipients_are_members(expedition_id, convoy_id, authorized_member_ids)
  and actor_member_id = any(authorized_member_ids)
);

create policy dispatch_receipts_select_member
on public.dispatch_operation_receipts for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));

revoke all on public.dispatch_pings from anon;
revoke all on public.dispatch_queue_items from anon;
revoke all on public.dispatch_assignments from anon;
revoke all on public.dispatch_assist_requests from anon;
revoke all on public.dispatch_acknowledgments from anon;
revoke all on public.dispatch_timeline_events from anon;
revoke all on public.dispatch_restricted_locations from anon;
revoke all on public.dispatch_operation_receipts from anon;

grant select, insert, update on public.dispatch_pings to authenticated;
grant select, insert, update on public.dispatch_queue_items to authenticated;
grant select, insert, update on public.dispatch_assignments to authenticated;
grant select, insert, update on public.dispatch_assist_requests to authenticated;
grant select, insert on public.dispatch_acknowledgments to authenticated;
grant select, insert on public.dispatch_timeline_events to authenticated;
grant select, insert on public.dispatch_restricted_locations to authenticated;
grant select on public.dispatch_operation_receipts to authenticated;
revoke all on sequence public.dispatch_server_revision_seq from anon, authenticated;

grant all on public.dispatch_pings to service_role;
grant all on public.dispatch_queue_items to service_role;
grant all on public.dispatch_assignments to service_role;
grant all on public.dispatch_assist_requests to service_role;
grant all on public.dispatch_acknowledgments to service_role;
grant all on public.dispatch_timeline_events to service_role;
grant all on public.dispatch_restricted_locations to service_role;
grant all on public.dispatch_operation_receipts to service_role;
grant all on sequence public.dispatch_server_revision_seq to service_role;

revoke delete on public.dispatch_pings from authenticated;
revoke delete on public.dispatch_queue_items from authenticated;
revoke delete on public.dispatch_assignments from authenticated;
revoke delete on public.dispatch_assist_requests from authenticated;
revoke update, delete on public.dispatch_acknowledgments from authenticated;
revoke update, delete on public.dispatch_timeline_events from authenticated;
revoke update, delete on public.dispatch_restricted_locations from authenticated;
revoke insert, update, delete on public.dispatch_operation_receipts from authenticated;

create or replace function public.cleanup_dispatch_canonical_records(
  completed_retention_days integer default 90,
  receipt_retention_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  bounded_completed_days integer := greatest(7, least(coalesce(completed_retention_days, 90), 365));
  bounded_receipt_days integer := greatest(7, least(coalesce(receipt_retention_days, 30), 180));
  cutoff timestamptz;
  receipt_cutoff timestamptz;
  affected integer;
  result jsonb := '{}'::jsonb;
begin
  cutoff := now() - make_interval(days => bounded_completed_days);
  receipt_cutoff := now() - make_interval(days => bounded_receipt_days);
  perform set_config('ecs.dispatch_retention_cleanup', 'on', true);

  delete from public.dispatch_operation_receipts r
  using public.convoys c
  where c.id = r.convoy_id
    and c.status in ('completed', 'cancelled')
    and r.created_at < receipt_cutoff;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('operation_receipts', affected);

  delete from public.dispatch_restricted_locations l
  using public.convoys c
  where c.id = l.convoy_id
    and c.status in ('completed', 'cancelled')
    and l.created_at < cutoff;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('restricted_locations', affected);

  delete from public.dispatch_acknowledgments a
  using public.convoys c
  where c.id = a.convoy_id
    and c.status in ('completed', 'cancelled')
    and a.created_at < cutoff;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('acknowledgments', affected);

  delete from public.dispatch_timeline_events t
  using public.convoys c
  where c.id = t.convoy_id
    and c.status in ('completed', 'cancelled')
    and t.created_at < cutoff;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('timeline_events', affected);

  delete from public.dispatch_assignments d
  using public.convoys c
  where c.id = d.convoy_id
    and c.status in ('completed', 'cancelled')
    and d.updated_at < cutoff;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('assignments', affected);

  delete from public.dispatch_assist_requests d
  using public.convoys c
  where c.id = d.convoy_id
    and c.status in ('completed', 'cancelled')
    and d.updated_at < cutoff;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('assist_requests', affected);

  delete from public.dispatch_queue_items d
  using public.convoys c
  where c.id = d.convoy_id
    and c.status in ('completed', 'cancelled')
    and d.updated_at < cutoff;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('queue_items', affected);

  delete from public.dispatch_pings d
  using public.convoys c
  where c.id = d.convoy_id
    and c.status in ('completed', 'cancelled')
    and d.updated_at < cutoff;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('pings', affected);

  return result || jsonb_build_object(
    'completed_retention_days', bounded_completed_days,
    'receipt_retention_days', bounded_receipt_days
  );
end;
$$;

comment on function public.cleanup_dispatch_canonical_records(integer, integer)
is 'Service-role-only cleanup for completed/cancelled canonical Dispatch records. Active expedition records are never pruned.';

revoke execute on function public.cleanup_dispatch_canonical_records(integer, integer) from public, anon, authenticated;
grant execute on function public.cleanup_dispatch_canonical_records(integer, integer) to service_role;

alter table public.dispatch_pings replica identity full;
alter table public.dispatch_queue_items replica identity full;
alter table public.dispatch_assignments replica identity full;
alter table public.dispatch_assist_requests replica identity full;
alter table public.dispatch_acknowledgments replica identity full;
alter table public.dispatch_timeline_events replica identity full;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'dispatch_pings',
      'dispatch_queue_items',
      'dispatch_assignments',
      'dispatch_assist_requests',
      'dispatch_acknowledgments',
      'dispatch_timeline_events'
    ]
    loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      exception
        when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

comment on table public.dispatch_restricted_locations is
  'Exact coordinates isolated from ordinary Dispatch payloads. Access requires active membership plus actor, command, or explicit recipient authorization.';
comment on table public.dispatch_operation_receipts is
  'Server-generated append-only idempotency receipts. Clients can read scoped receipts but cannot create or modify them.';

notify pgrst, 'reload schema';
