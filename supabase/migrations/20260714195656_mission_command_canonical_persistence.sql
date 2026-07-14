-- Guarded canonical Mission Command persistence.
--
-- This additive schema extends the canonical Dispatch boundary created by
-- 20260713054719_dispatch_canonical_persistence.sql. Local persistence remains
-- authoritative and the mobile rollout remains default-off shadow-only.

alter table public.convoy_members
  add column mission_command_access text not null default 'inherit'
  check (mission_command_access in ('inherit', 'command', 'member', 'viewer'));

create table public.dispatch_mission_commands (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  client_operation_id text not null check (char_length(client_operation_id) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  recipient_member_ids uuid[] not null default '{}'::uuid[],
  creator_label text not null check (char_length(creator_label) between 1 and 160),
  command_type text not null check (command_type in (
    'check_in', 'rally', 'assist', 'hazard', 'resource', 'route',
    'recovery', 'general', 'emergency'
  )),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')),
  title text not null check (char_length(title) between 1 and 240),
  instructions text not null check (char_length(instructions) between 1 and 4000),
  target_kind text not null check (target_kind in ('member', 'role', 'vehicle', 'team', 'solo')),
  target_key text not null check (char_length(target_key) between 1 and 200),
  target_label text check (target_label is null or char_length(target_label) <= 160),
  assignment_kind text check (assignment_kind is null or assignment_kind in ('member', 'role', 'vehicle', 'team', 'solo')),
  assignment_key text check (assignment_key is null or char_length(assignment_key) between 1 and 200),
  assignment_member_id uuid references public.convoy_members(id) on delete restrict,
  assignment_status text check (assignment_status is null or assignment_status in (
    'unassigned', 'offered', 'accepted', 'in_progress', 'blocked', 'completed', 'declined'
  )),
  acknowledgment_mode text not null check (acknowledgment_mode in ('none', 'any', 'all', 'count')),
  acknowledgment_required_count integer check (acknowledgment_required_count is null or acknowledgment_required_count > 0),
  acknowledgment_role_id text check (acknowledgment_role_id is null or char_length(acknowledgment_role_id) <= 120),
  deadline_at timestamptz,
  linked_context jsonb not null default '{}'::jsonb check (jsonb_typeof(linked_context) = 'object'),
  source_truth jsonb not null default '[]'::jsonb check (jsonb_typeof(source_truth) = 'array'),
  operational_state text not null check (operational_state in (
    'proposed', 'ready', 'active', 'in_progress', 'blocked',
    'resolved', 'cancelled', 'expired'
  )),
  delivery_state text not null check (delivery_state in (
    'local', 'queued', 'sending', 'sent', 'delivered', 'failed', 'retrying', 'cancelled'
  )),
  acknowledgment_state text not null check (acknowledgment_state in (
    'not_required', 'pending', 'partial', 'complete', 'declined', 'expired'
  )),
  resolution jsonb not null default '{}'::jsonb check (jsonb_typeof(resolution) = 'object'),
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
  unique (expedition_id, idempotency_key),
  check (
    (acknowledgment_mode = 'count' and acknowledgment_required_count is not null)
    or (acknowledgment_mode <> 'count' and acknowledgment_required_count is null)
  ),
  check (
    (assignment_kind is null and assignment_key is null and assignment_status is null and assignment_member_id is null)
    or (assignment_kind is not null and assignment_key is not null and assignment_status is not null)
  )
);

create table public.dispatch_mission_command_targets (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  command_id uuid not null references public.dispatch_mission_commands(id) on delete restrict,
  command_client_id text not null check (char_length(command_client_id) between 1 and 200),
  client_id text not null check (char_length(client_id) between 1 and 220),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  client_operation_id text not null check (char_length(client_operation_id) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  target_kind text not null check (target_kind in ('member', 'role', 'vehicle', 'team', 'solo')),
  target_key text not null check (char_length(target_key) between 1 and 200),
  member_id uuid references public.convoy_members(id) on delete restrict,
  target_label text check (target_label is null or char_length(target_label) <= 160),
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key),
  check (
    (target_kind in ('member', 'team', 'solo') and member_id is not null)
    or (target_kind in ('role', 'vehicle') and member_id is null)
  )
);

create table public.dispatch_mission_command_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  command_id uuid not null references public.dispatch_mission_commands(id) on delete restrict,
  command_client_id text not null check (char_length(command_client_id) between 1 and 200),
  client_id text not null check (char_length(client_id) between 1 and 220),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  client_operation_id text not null check (char_length(client_operation_id) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  member_id uuid not null references public.convoy_members(id) on delete restrict,
  response text not null check (response in ('acknowledged', 'declined')),
  message text check (message is null or char_length(message) <= 2000),
  responded_at timestamptz not null,
  source_state text not null default 'local_first' check (source_state in ('local_first', 'realtime', 'server_reconciled')),
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
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

create table public.dispatch_mission_command_events (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  command_id uuid not null references public.dispatch_mission_commands(id) on delete restrict,
  command_client_id text not null check (char_length(command_client_id) between 1 and 200),
  client_id text not null check (char_length(client_id) between 1 and 220),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  client_operation_id text not null check (char_length(client_operation_id) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  actor_label text not null check (char_length(actor_label) between 1 and 160),
  event_type text not null check (event_type in (
    'created', 'staged', 'queued', 'sending', 'sent', 'delivered',
    'acknowledged', 'declined', 'assigned', 'follow_up_requested',
    'started', 'blocked', 'resolved', 'cancelled', 'expired',
    'replayed', 'retrying', 'failed'
  )),
  operational_state text not null check (operational_state in (
    'proposed', 'ready', 'active', 'in_progress', 'blocked',
    'resolved', 'cancelled', 'expired'
  )),
  delivery_state text not null check (delivery_state in (
    'local', 'queued', 'sending', 'sent', 'delivered', 'failed', 'retrying', 'cancelled'
  )),
  acknowledgment_state text not null check (acknowledgment_state in (
    'not_required', 'pending', 'partial', 'complete', 'declined', 'expired'
  )),
  summary text not null check (char_length(summary) between 1 and 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null,
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key)
);

create table public.dispatch_mission_playbook_instances (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  client_operation_id text not null check (char_length(client_operation_id) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  actor_label text not null check (char_length(actor_label) between 1 and 160),
  definition_id text not null check (char_length(definition_id) between 1 and 200),
  definition_version integer not null check (definition_version > 0),
  related_command_client_id text check (related_command_client_id is null or char_length(related_command_client_id) <= 200),
  related_incident_id text check (related_incident_id is null or char_length(related_incident_id) <= 200),
  playbook_state text not null check (playbook_state in ('draft', 'ready', 'active', 'paused', 'blocked', 'completed', 'cancelled')),
  current_step_id text check (current_step_id is null or char_length(current_step_id) <= 200),
  completed_step_ids text[] not null default '{}'::text[],
  source_truth jsonb not null default '[]'::jsonb check (jsonb_typeof(source_truth) = 'array'),
  input_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(input_snapshot) = 'object'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  last_known_connectivity text not null check (last_known_connectivity in ('online', 'offline', 'unknown')),
  source_state text not null default 'local_first' check (source_state in ('local_first', 'realtime', 'server_reconciled')),
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  deleted_at timestamptz,
  tombstone_reason text check (tombstone_reason is null or char_length(tombstone_reason) <= 240),
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key)
);

create table public.dispatch_mission_playbook_steps (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  playbook_instance_id uuid not null references public.dispatch_mission_playbook_instances(id) on delete restrict,
  playbook_client_id text not null check (char_length(playbook_client_id) between 1 and 200),
  client_id text not null check (char_length(client_id) between 1 and 220),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  client_operation_id text not null check (char_length(client_operation_id) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  step_id text not null check (char_length(step_id) between 1 and 200),
  step_type text not null check (step_type in (
    'review_context', 'request_input', 'create_command_proposal', 'assign_role',
    'request_acknowledgment', 'open_context', 'start_deadline',
    'record_decision', 'confirm_action', 'resolve'
  )),
  step_state text not null check (step_state in ('pending', 'current', 'completed', 'skipped', 'blocked')),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  reason_code text check (reason_code is null or char_length(reason_code) <= 160),
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key),
  unique (expedition_id, playbook_client_id, step_id)
);

create table public.dispatch_mission_playbook_events (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  playbook_instance_id uuid not null references public.dispatch_mission_playbook_instances(id) on delete restrict,
  playbook_client_id text not null check (char_length(playbook_client_id) between 1 and 200),
  client_id text not null check (char_length(client_id) between 1 and 220),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  client_operation_id text not null check (char_length(client_operation_id) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  actor_label text not null check (char_length(actor_label) between 1 and 160),
  event_type text not null check (event_type in (
    'created', 'ready', 'started', 'paused', 'resumed', 'blocked',
    'input_recorded', 'context_reviewed', 'command_proposed', 'command_confirmed',
    'command_created', 'role_assigned', 'acknowledgment_requested',
    'context_opened', 'deadline_started', 'decision_recorded',
    'action_confirmed', 'step_completed', 'step_skipped',
    'completed', 'cancelled', 'migrated'
  )),
  playbook_state text not null check (playbook_state in ('draft', 'ready', 'active', 'paused', 'blocked', 'completed', 'cancelled')),
  step_id text check (step_id is null or char_length(step_id) <= 200),
  summary text not null check (char_length(summary) between 1 and 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null,
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key)
);

create table public.dispatch_mission_deadlines (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  command_id uuid references public.dispatch_mission_commands(id) on delete restrict,
  command_client_id text check (command_client_id is null or char_length(command_client_id) <= 200),
  playbook_instance_id uuid references public.dispatch_mission_playbook_instances(id) on delete restrict,
  playbook_client_id text check (playbook_client_id is null or char_length(playbook_client_id) <= 200),
  step_id text check (step_id is null or char_length(step_id) <= 200),
  client_id text not null check (char_length(client_id) between 1 and 220),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  client_operation_id text not null check (char_length(client_operation_id) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  deadline_source text not null check (deadline_source in (
    'command_deadline', 'acknowledgment_deadline', 'scheduled_check_in',
    'no_response_review', 'rally_deadline', 'camp_diversion_cutoff',
    'safe_arrival_deadline', 'sunset_deadline', 'weather_recheck',
    'offline_retry', 'expedition_milestone', 'incident_review',
    'vehicle_status_review', 'custom'
  )),
  title text not null check (char_length(title) between 1 and 240),
  reason text not null check (char_length(reason) between 1 and 1000),
  due_at timestamptz,
  warning_window_ms bigint not null check (warning_window_ms >= 0),
  critical_window_ms bigint not null check (critical_window_ms >= 0),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')),
  completion_state text not null check (completion_state in ('active', 'completed', 'cancelled')),
  linked_context jsonb not null default '{}'::jsonb check (jsonb_typeof(linked_context) = 'object'),
  source_truth jsonb not null default '[]'::jsonb check (jsonb_typeof(source_truth) = 'array'),
  completed_at timestamptz,
  cancelled_at timestamptz,
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key),
  check (
    (command_id is not null and command_client_id is not null and playbook_instance_id is null and playbook_client_id is null)
    or (playbook_instance_id is not null and playbook_client_id is not null and command_id is null and command_client_id is null)
  )
);

create table public.dispatch_mission_incident_links (
  id uuid primary key default gen_random_uuid(),
  expedition_id text not null check (char_length(expedition_id) between 1 and 160),
  convoy_id uuid not null references public.convoys(id) on delete restrict,
  command_id uuid references public.dispatch_mission_commands(id) on delete restrict,
  command_client_id text check (command_client_id is null or char_length(command_client_id) <= 200),
  playbook_instance_id uuid references public.dispatch_mission_playbook_instances(id) on delete restrict,
  playbook_client_id text check (playbook_client_id is null or char_length(playbook_client_id) <= 200),
  client_id text not null check (char_length(client_id) between 1 and 220),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 240),
  client_operation_id text not null check (char_length(client_operation_id) between 1 and 240),
  actor_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  actor_member_id uuid not null references public.convoy_members(id) on delete restrict,
  incident_id text not null check (char_length(incident_id) between 1 and 200),
  link_kind text not null check (link_kind in ('command', 'playbook', 'escalation', 'recovery')),
  source_truth jsonb not null default '[]'::jsonb check (jsonb_typeof(source_truth) = 'array'),
  state_version bigint not null default 1 check (state_version > 0),
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  observed_at timestamptz not null,
  server_revision bigint not null,
  server_observed_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  unique (expedition_id, client_id),
  unique (expedition_id, idempotency_key),
  check (
    (command_id is not null and command_client_id is not null and playbook_instance_id is null and playbook_client_id is null)
    or (playbook_instance_id is not null and playbook_client_id is not null and command_id is null and command_client_id is null)
  )
);

create index dispatch_mission_commands_active_idx
  on public.dispatch_mission_commands (expedition_id, operational_state, updated_at desc)
  where deleted_at is null;
create index dispatch_mission_commands_convoy_revision_idx
  on public.dispatch_mission_commands (convoy_id, server_revision desc);
create index dispatch_mission_commands_deadline_idx
  on public.dispatch_mission_commands (expedition_id, deadline_at)
  where deleted_at is null and deadline_at is not null;
create index dispatch_mission_commands_recipients_idx
  on public.dispatch_mission_commands using gin (recipient_member_ids);
create index dispatch_mission_targets_command_idx
  on public.dispatch_mission_command_targets (command_id, server_revision);
create index dispatch_mission_targets_member_idx
  on public.dispatch_mission_command_targets (expedition_id, member_id)
  where member_id is not null;
create index dispatch_mission_ack_command_time_idx
  on public.dispatch_mission_command_acknowledgments (command_id, responded_at desc);
create index dispatch_mission_ack_member_time_idx
  on public.dispatch_mission_command_acknowledgments (expedition_id, member_id, responded_at desc);
create index dispatch_mission_events_command_time_idx
  on public.dispatch_mission_command_events (command_id, occurred_at desc);
create index dispatch_mission_playbooks_active_idx
  on public.dispatch_mission_playbook_instances (expedition_id, playbook_state, updated_at desc)
  where deleted_at is null;
create index dispatch_mission_playbooks_convoy_revision_idx
  on public.dispatch_mission_playbook_instances (convoy_id, server_revision desc);
create index dispatch_mission_steps_instance_idx
  on public.dispatch_mission_playbook_steps (playbook_instance_id, server_revision);
create index dispatch_mission_playbook_events_time_idx
  on public.dispatch_mission_playbook_events (playbook_instance_id, occurred_at desc);
create index dispatch_mission_deadlines_due_idx
  on public.dispatch_mission_deadlines (expedition_id, completion_state, due_at)
  where completion_state = 'active';
create index dispatch_mission_incident_links_incident_idx
  on public.dispatch_mission_incident_links (expedition_id, incident_id);

alter table public.dispatch_operation_receipts
  add column client_operation_id text
  check (client_operation_id is null or char_length(client_operation_id) between 1 and 240);
create index dispatch_operation_receipts_client_operation_idx
  on public.dispatch_operation_receipts (expedition_id, client_operation_id)
  where client_operation_id is not null;

alter table public.dispatch_restricted_locations
  drop constraint if exists dispatch_restricted_locations_source_kind_check;
alter table public.dispatch_restricted_locations
  add constraint dispatch_restricted_locations_source_kind_check
  check (source_kind in ('ping', 'assist_request', 'mission_command'));

alter table public.dispatch_operation_receipts
  drop constraint if exists dispatch_operation_receipts_entity_kind_check;
alter table public.dispatch_operation_receipts
  add constraint dispatch_operation_receipts_entity_kind_check
  check (entity_kind in (
    'ping', 'queue_item', 'assignment', 'assist_request', 'acknowledgment',
    'timeline_event', 'restricted_location', 'mission_command',
    'mission_command_target', 'mission_command_acknowledgment',
    'mission_command_event', 'mission_playbook_instance',
    'mission_playbook_step', 'mission_playbook_event', 'mission_deadline',
    'mission_incident_link'
  ));

alter table public.dispatch_mission_commands
  add constraint dispatch_mission_commands_redacted_check check (
    not private.dispatch_json_has_restricted_key(linked_context)
    and not private.dispatch_json_has_restricted_key(source_truth)
    and not private.dispatch_json_has_restricted_key(resolution)
    and not private.dispatch_json_has_restricted_key(payload)
  );
alter table public.dispatch_mission_command_acknowledgments
  add constraint dispatch_mission_ack_redacted_check
  check (not private.dispatch_json_has_restricted_key(payload));
alter table public.dispatch_mission_command_events
  add constraint dispatch_mission_events_redacted_check
  check (not private.dispatch_json_has_restricted_key(metadata));
alter table public.dispatch_mission_playbook_instances
  add constraint dispatch_mission_playbooks_redacted_check check (
    not private.dispatch_json_has_restricted_key(source_truth)
    and not private.dispatch_json_has_restricted_key(input_snapshot)
    and not private.dispatch_json_has_restricted_key(payload)
  );
alter table public.dispatch_mission_playbook_steps
  add constraint dispatch_mission_steps_redacted_check
  check (not private.dispatch_json_has_restricted_key(result));
alter table public.dispatch_mission_playbook_events
  add constraint dispatch_mission_playbook_events_redacted_check
  check (not private.dispatch_json_has_restricted_key(metadata));
alter table public.dispatch_mission_deadlines
  add constraint dispatch_mission_deadlines_redacted_check check (
    not private.dispatch_json_has_restricted_key(linked_context)
    and not private.dispatch_json_has_restricted_key(source_truth)
  );
alter table public.dispatch_mission_incident_links
  add constraint dispatch_mission_incident_links_redacted_check
  check (not private.dispatch_json_has_restricted_key(source_truth));

create or replace function private.dispatch_mission_access_level(
  target_expedition_id text,
  target_convoy_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when member_record.mission_command_access <> 'inherit'
      then member_record.mission_command_access
    when member_record.role in ('lead', 'sweep', 'support') then 'command'
    else 'member'
  end
  from public.convoy_members member_record
  join public.convoys convoy_record on convoy_record.id = member_record.convoy_id
  where member_record.convoy_id = target_convoy_id
    and convoy_record.expedition_id = target_expedition_id
    and member_record.user_id = (select auth.uid())
    and member_record.revoked_at is null
  limit 1;
$$;

create or replace function private.dispatch_mission_has_command_role(
  target_expedition_id text,
  target_convoy_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    private.dispatch_mission_access_level(target_expedition_id, target_convoy_id) = 'command',
    false
  );
$$;

create or replace function private.dispatch_mission_can_participate(
  target_expedition_id text,
  target_convoy_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    private.dispatch_mission_access_level(target_expedition_id, target_convoy_id)
      in ('command', 'member'),
    false
  );
$$;

revoke execute on function private.dispatch_mission_access_level(text, uuid) from public, anon;
revoke execute on function private.dispatch_mission_has_command_role(text, uuid) from public, anon;
revoke execute on function private.dispatch_mission_can_participate(text, uuid) from public, anon;
grant execute on function private.dispatch_mission_access_level(text, uuid) to authenticated, service_role;
grant execute on function private.dispatch_mission_has_command_role(text, uuid) to authenticated, service_role;
grant execute on function private.dispatch_mission_can_participate(text, uuid) to authenticated, service_role;

create or replace function private.dispatch_mission_can_issue(
  target_expedition_id text,
  target_convoy_id uuid,
  target_command_type text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.dispatch_has_expedition_access(target_expedition_id, target_convoy_id)
    and (
      private.dispatch_mission_has_command_role(target_expedition_id, target_convoy_id)
      or (
        private.dispatch_mission_can_participate(target_expedition_id, target_convoy_id)
        and target_command_type in ('check_in', 'assist')
      )
    );
$$;

create or replace function private.dispatch_mission_can_write_command(
  target_command_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.dispatch_mission_commands command_record
    where command_record.id = target_command_id
      and private.dispatch_has_expedition_access(
        command_record.expedition_id,
        command_record.convoy_id
      )
      and (
        private.dispatch_mission_has_command_role(
          command_record.expedition_id,
          command_record.convoy_id
        )
        or (
          private.dispatch_mission_can_participate(
            command_record.expedition_id,
            command_record.convoy_id
          )
          and
          command_record.actor_user_id = (select auth.uid())
          and command_record.command_type in ('check_in', 'assist')
        )
      )
  );
$$;

create or replace function private.dispatch_mission_can_acknowledge(
  target_command_id uuid,
  target_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.dispatch_mission_commands command_record
    join public.convoy_members member_record
      on member_record.id = target_member_id
      and member_record.convoy_id = command_record.convoy_id
    where command_record.id = target_command_id
      and command_record.acknowledgment_mode <> 'none'
      and target_member_id = any(command_record.recipient_member_ids)
      and member_record.user_id = (select auth.uid())
      and member_record.revoked_at is null
  );
$$;

revoke execute on function private.dispatch_mission_can_issue(text, uuid, text) from public, anon;
revoke execute on function private.dispatch_mission_can_write_command(uuid) from public, anon;
revoke execute on function private.dispatch_mission_can_acknowledge(uuid, uuid) from public, anon;
grant execute on function private.dispatch_mission_can_issue(text, uuid, text) to authenticated, service_role;
grant execute on function private.dispatch_mission_can_write_command(uuid) to authenticated, service_role;
grant execute on function private.dispatch_mission_can_acknowledge(uuid, uuid) to authenticated, service_role;

create or replace function private.dispatch_mission_transition_allowed(
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
        when 'operational' then case current_state
          when 'proposed' then array['ready', 'cancelled', 'expired']::text[]
          when 'ready' then array['active', 'cancelled', 'expired']::text[]
          when 'active' then array['in_progress', 'blocked', 'resolved', 'cancelled', 'expired']::text[]
          when 'in_progress' then array['blocked', 'resolved', 'cancelled', 'expired']::text[]
          when 'blocked' then array['active', 'in_progress', 'resolved', 'cancelled', 'expired']::text[]
          else '{}'::text[]
        end
        when 'delivery' then case current_state
          when 'local' then array['queued', 'sending', 'cancelled']::text[]
          when 'queued' then array['sending', 'failed', 'retrying', 'cancelled']::text[]
          when 'sending' then array['queued', 'sent', 'delivered', 'failed', 'retrying', 'cancelled']::text[]
          when 'sent' then array['delivered', 'failed', 'retrying', 'cancelled']::text[]
          when 'failed' then array['queued', 'retrying', 'cancelled']::text[]
          when 'retrying' then array['queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled']::text[]
          else '{}'::text[]
        end
        when 'acknowledgment' then case current_state
          when 'pending' then array['partial', 'complete', 'declined', 'expired']::text[]
          when 'partial' then array['complete', 'declined', 'expired']::text[]
          when 'declined' then array['partial', 'complete', 'expired']::text[]
          when 'expired' then array['partial', 'complete', 'declined']::text[]
          else '{}'::text[]
        end
        when 'playbook' then case current_state
          when 'draft' then array['ready', 'cancelled']::text[]
          when 'ready' then array['active', 'blocked', 'cancelled']::text[]
          when 'active' then array['paused', 'blocked', 'completed', 'cancelled']::text[]
          when 'paused' then array['active', 'blocked', 'cancelled']::text[]
          when 'blocked' then array['active', 'paused', 'cancelled']::text[]
          else '{}'::text[]
        end
        when 'deadline' then case current_state
          when 'active' then array['completed', 'cancelled']::text[]
          else '{}'::text[]
        end
        else '{}'::text[]
      end
    );
$$;

revoke execute on function private.dispatch_mission_transition_allowed(text, text, text)
from public, anon, authenticated;

create or replace function private.dispatch_mission_validate_scope_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  record_json jsonb := to_jsonb(new);
  target_ids uuid[] := '{}'::uuid[];
  target_member_id uuid;
  target_command_id uuid;
  target_playbook_id uuid;
begin
  new.client_operation_id := coalesce(
    nullif(btrim(new.client_operation_id), ''),
    new.idempotency_key
  );

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
    raise exception using errcode = '23514', message = 'dispatch_mission_scope_mismatch';
  end if;

  if not exists (
    select 1
    from public.convoy_members m
    where m.id = new.actor_member_id
      and m.convoy_id = new.convoy_id
      and m.user_id = new.actor_user_id
      and m.revoked_at is null
  ) then
    raise exception using errcode = '23514', message = 'dispatch_mission_actor_membership_mismatch';
  end if;

  if record_json ? 'recipient_member_ids' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into target_ids
      from jsonb_array_elements_text(record_json -> 'recipient_member_ids') as values_list(value);
  end if;

  if cardinality(target_ids) > 0 and not private.dispatch_recipients_are_members(
    new.expedition_id,
    new.convoy_id,
    target_ids
  ) then
    raise exception using errcode = '23514', message = 'dispatch_mission_recipient_membership_mismatch';
  end if;

  target_member_id := coalesce(
    nullif(record_json ->> 'member_id', '')::uuid,
    nullif(record_json ->> 'assignment_member_id', '')::uuid
  );
  if target_member_id is not null and not exists (
    select 1
    from public.convoy_members m
    where m.id = target_member_id
      and m.convoy_id = new.convoy_id
      and m.revoked_at is null
  ) then
    raise exception using errcode = '23514', message = 'dispatch_mission_target_membership_mismatch';
  end if;

  target_command_id := nullif(record_json ->> 'command_id', '')::uuid;
  if target_command_id is not null and not exists (
    select 1
    from public.dispatch_mission_commands command_record
    where command_record.id = target_command_id
      and command_record.client_id = record_json ->> 'command_client_id'
      and command_record.expedition_id = new.expedition_id
      and command_record.convoy_id = new.convoy_id
  ) then
    raise exception using errcode = '23503', message = 'dispatch_mission_command_reference_missing';
  end if;

  target_playbook_id := nullif(record_json ->> 'playbook_instance_id', '')::uuid;
  if target_playbook_id is not null and not exists (
    select 1
    from public.dispatch_mission_playbook_instances playbook_record
    where playbook_record.id = target_playbook_id
      and playbook_record.client_id = record_json ->> 'playbook_client_id'
      and playbook_record.expedition_id = new.expedition_id
      and playbook_record.convoy_id = new.convoy_id
  ) then
    raise exception using errcode = '23503', message = 'dispatch_mission_playbook_reference_missing';
  end if;

  if record_json ? 'related_command_client_id'
    and nullif(record_json ->> 'related_command_client_id', '') is not null
    and not exists (
      select 1
      from public.dispatch_mission_commands command_record
      where command_record.client_id = record_json ->> 'related_command_client_id'
        and command_record.expedition_id = new.expedition_id
        and command_record.convoy_id = new.convoy_id
    ) then
    raise exception using errcode = '23503', message = 'dispatch_mission_related_command_missing';
  end if;

  return new;
end;
$$;

create or replace function private.dispatch_mission_prepare_mutable_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  next_json jsonb := to_jsonb(new);
  previous_json jsonb;
begin
  if tg_op = 'INSERT' then
    if new.client_updated_at < new.client_created_at then
      raise exception using errcode = '23514', message = 'dispatch_mission_client_timestamp_order_invalid';
    end if;
    new.updated_at := now();
    return new;
  end if;

  previous_json := to_jsonb(old);
  if new.id is distinct from old.id
    or new.expedition_id is distinct from old.expedition_id
    or new.convoy_id is distinct from old.convoy_id
    or new.client_id is distinct from old.client_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.actor_user_id is distinct from old.actor_user_id
    or new.actor_member_id is distinct from old.actor_member_id
    or new.client_created_at is distinct from old.client_created_at
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'dispatch_mission_immutable_identity_changed';
  end if;

  if previous_json ? 'deleted_at'
    and previous_json ->> 'deleted_at' is not null
    and next_json ->> 'deleted_at' is null then
    raise exception using errcode = '23514', message = 'dispatch_mission_tombstone_is_terminal';
  end if;

  if new.client_updated_at < new.client_created_at then
    raise exception using errcode = '23514', message = 'dispatch_mission_client_timestamp_order_invalid';
  end if;

  if tg_table_name = 'dispatch_mission_commands' then
    if not private.dispatch_mission_transition_allowed(
      'operational', old.operational_state, new.operational_state
    ) then
      raise exception using errcode = '23514', message = 'dispatch_mission_operational_transition_invalid';
    end if;
    if not private.dispatch_mission_transition_allowed(
      'delivery', old.delivery_state, new.delivery_state
    ) then
      raise exception using errcode = '23514', message = 'dispatch_mission_delivery_transition_invalid';
    end if;
    if not private.dispatch_mission_transition_allowed(
      'acknowledgment', old.acknowledgment_state, new.acknowledgment_state
    ) then
      raise exception using errcode = '23514', message = 'dispatch_mission_acknowledgment_transition_invalid';
    end if;
  elsif tg_table_name = 'dispatch_mission_playbook_instances'
    and not private.dispatch_mission_transition_allowed(
      'playbook', old.playbook_state, new.playbook_state
    ) then
    raise exception using errcode = '23514', message = 'dispatch_mission_playbook_transition_invalid';
  elsif tg_table_name = 'dispatch_mission_deadlines'
    and not private.dispatch_mission_transition_allowed(
      'deadline', old.completion_state, new.completion_state
    ) then
    raise exception using errcode = '23514', message = 'dispatch_mission_deadline_transition_invalid';
  end if;

  if new.state_version < old.state_version then
    raise exception using errcode = '40001', message = 'dispatch_mission_stale_state_version';
  end if;
  if new.state_version = old.state_version then
    next_json := to_jsonb(new) - array[
      'client_operation_id', 'server_revision', 'server_observed_at', 'created_at', 'updated_at'
    ];
    previous_json := to_jsonb(old) - array[
      'client_operation_id', 'server_revision', 'server_observed_at', 'created_at', 'updated_at'
    ];
    if next_json = previous_json then return old; end if;
    raise exception using errcode = '40001', message = 'dispatch_mission_state_version_conflict';
  end if;

  new.server_revision := nextval('public.dispatch_server_revision_seq');
  new.server_observed_at := clock_timestamp();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.dispatch_mission_record_operation_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  entity_kind_value text;
begin
  entity_kind_value := case tg_table_name
    when 'dispatch_mission_commands' then 'mission_command'
    when 'dispatch_mission_command_targets' then 'mission_command_target'
    when 'dispatch_mission_command_acknowledgments' then 'mission_command_acknowledgment'
    when 'dispatch_mission_command_events' then 'mission_command_event'
    when 'dispatch_mission_playbook_instances' then 'mission_playbook_instance'
    when 'dispatch_mission_playbook_steps' then 'mission_playbook_step'
    when 'dispatch_mission_playbook_events' then 'mission_playbook_event'
    when 'dispatch_mission_deadlines' then 'mission_deadline'
    when 'dispatch_mission_incident_links' then 'mission_incident_link'
    else null
  end;
  if entity_kind_value is null then
    raise exception using errcode = '23514', message = 'dispatch_mission_receipt_entity_kind_unknown';
  end if;

  insert into public.dispatch_operation_receipts (
    expedition_id, convoy_id, entity_kind, entity_id, entity_client_id,
    client_operation_id, idempotency_key, actor_user_id, actor_member_id,
    state_version, outcome
  ) values (
    new.expedition_id, new.convoy_id, entity_kind_value, new.id, new.client_id,
    new.client_operation_id, new.idempotency_key, new.actor_user_id, new.actor_member_id,
    greatest(1, new.state_version), 'applied'
  )
  on conflict (expedition_id, entity_kind, idempotency_key, state_version) do nothing;
  return new;
end;
$$;

create or replace function private.dispatch_validate_mission_restricted_location()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.source_kind = 'mission_command' and not exists (
    select 1
    from public.dispatch_mission_commands command_record
    where command_record.id = new.source_record_id
      and command_record.client_id = new.source_client_id
      and command_record.expedition_id = new.expedition_id
      and command_record.convoy_id = new.convoy_id
  ) then
    raise exception using errcode = '23503', message = 'dispatch_mission_location_source_missing';
  end if;
  return new;
end;
$$;

revoke execute on function private.dispatch_mission_validate_scope_record() from public, anon, authenticated;
revoke execute on function private.dispatch_mission_prepare_mutable_record() from public, anon, authenticated;
revoke execute on function private.dispatch_mission_record_operation_receipt() from public, anon, authenticated;
revoke execute on function private.dispatch_validate_mission_restricted_location() from public, anon, authenticated;

create trigger dispatch_mission_10_validate_command
before insert or update on public.dispatch_mission_commands
for each row execute function private.dispatch_mission_validate_scope_record();
create trigger dispatch_mission_20_prepare_command
before insert or update on public.dispatch_mission_commands
for each row execute function private.dispatch_mission_prepare_mutable_record();
create trigger dispatch_mission_10_validate_target
before insert on public.dispatch_mission_command_targets
for each row execute function private.dispatch_mission_validate_scope_record();
create trigger dispatch_mission_10_validate_acknowledgment
before insert on public.dispatch_mission_command_acknowledgments
for each row execute function private.dispatch_mission_validate_scope_record();
create trigger dispatch_mission_10_validate_command_event
before insert on public.dispatch_mission_command_events
for each row execute function private.dispatch_mission_validate_scope_record();
create trigger dispatch_mission_10_validate_playbook
before insert or update on public.dispatch_mission_playbook_instances
for each row execute function private.dispatch_mission_validate_scope_record();
create trigger dispatch_mission_20_prepare_playbook
before insert or update on public.dispatch_mission_playbook_instances
for each row execute function private.dispatch_mission_prepare_mutable_record();
create trigger dispatch_mission_10_validate_step
before insert or update on public.dispatch_mission_playbook_steps
for each row execute function private.dispatch_mission_validate_scope_record();
create trigger dispatch_mission_20_prepare_step
before insert or update on public.dispatch_mission_playbook_steps
for each row execute function private.dispatch_mission_prepare_mutable_record();
create trigger dispatch_mission_10_validate_playbook_event
before insert on public.dispatch_mission_playbook_events
for each row execute function private.dispatch_mission_validate_scope_record();
create trigger dispatch_mission_10_validate_deadline
before insert or update on public.dispatch_mission_deadlines
for each row execute function private.dispatch_mission_validate_scope_record();
create trigger dispatch_mission_20_prepare_deadline
before insert or update on public.dispatch_mission_deadlines
for each row execute function private.dispatch_mission_prepare_mutable_record();
create trigger dispatch_mission_10_validate_incident_link
before insert on public.dispatch_mission_incident_links
for each row execute function private.dispatch_mission_validate_scope_record();
create trigger dispatch_15_validate_mission_location_source
before insert on public.dispatch_restricted_locations
for each row execute function private.dispatch_validate_mission_restricted_location();

create trigger dispatch_mission_90_receipt_command
after insert or update on public.dispatch_mission_commands
for each row execute function private.dispatch_mission_record_operation_receipt();
create trigger dispatch_mission_90_receipt_target
after insert on public.dispatch_mission_command_targets
for each row execute function private.dispatch_mission_record_operation_receipt();
create trigger dispatch_mission_90_receipt_ack
after insert on public.dispatch_mission_command_acknowledgments
for each row execute function private.dispatch_mission_record_operation_receipt();
create trigger dispatch_mission_90_receipt_command_event
after insert on public.dispatch_mission_command_events
for each row execute function private.dispatch_mission_record_operation_receipt();
create trigger dispatch_mission_90_receipt_playbook
after insert or update on public.dispatch_mission_playbook_instances
for each row execute function private.dispatch_mission_record_operation_receipt();
create trigger dispatch_mission_90_receipt_step
after insert or update on public.dispatch_mission_playbook_steps
for each row execute function private.dispatch_mission_record_operation_receipt();
create trigger dispatch_mission_90_receipt_playbook_event
after insert on public.dispatch_mission_playbook_events
for each row execute function private.dispatch_mission_record_operation_receipt();
create trigger dispatch_mission_90_receipt_deadline
after insert or update on public.dispatch_mission_deadlines
for each row execute function private.dispatch_mission_record_operation_receipt();
create trigger dispatch_mission_90_receipt_incident_link
after insert on public.dispatch_mission_incident_links
for each row execute function private.dispatch_mission_record_operation_receipt();

create trigger dispatch_mission_immutable_target
before update or delete on public.dispatch_mission_command_targets
for each row execute function private.dispatch_reject_history_mutation();
create trigger dispatch_mission_immutable_acknowledgment
before update or delete on public.dispatch_mission_command_acknowledgments
for each row execute function private.dispatch_reject_history_mutation();
create trigger dispatch_mission_immutable_command_event
before update or delete on public.dispatch_mission_command_events
for each row execute function private.dispatch_reject_history_mutation();
create trigger dispatch_mission_immutable_playbook_event
before update or delete on public.dispatch_mission_playbook_events
for each row execute function private.dispatch_reject_history_mutation();
create trigger dispatch_mission_immutable_incident_link
before update or delete on public.dispatch_mission_incident_links
for each row execute function private.dispatch_reject_history_mutation();

alter table public.dispatch_mission_commands enable row level security;
alter table public.dispatch_mission_command_targets enable row level security;
alter table public.dispatch_mission_command_acknowledgments enable row level security;
alter table public.dispatch_mission_command_events enable row level security;
alter table public.dispatch_mission_playbook_instances enable row level security;
alter table public.dispatch_mission_playbook_steps enable row level security;
alter table public.dispatch_mission_playbook_events enable row level security;
alter table public.dispatch_mission_deadlines enable row level security;
alter table public.dispatch_mission_incident_links enable row level security;

create policy dispatch_mission_commands_select_member
on public.dispatch_mission_commands for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_mission_commands_insert_authorized
on public.dispatch_mission_commands for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_can_issue(expedition_id, convoy_id, command_type)
  and private.dispatch_recipients_are_members(expedition_id, convoy_id, recipient_member_ids)
  and (
    private.dispatch_mission_has_command_role(expedition_id, convoy_id)
    or (
      assignment_kind is null
      and assignment_key is null
      and assignment_member_id is null
      and assignment_status is null
    )
  )
);
create policy dispatch_mission_commands_update_authorized
on public.dispatch_mission_commands for update to authenticated
using (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and (
    private.dispatch_mission_has_command_role(expedition_id, convoy_id)
    or (
      private.dispatch_mission_can_participate(expedition_id, convoy_id)
      and actor_user_id = (select auth.uid())
      and command_type in ('check_in', 'assist')
    )
  )
)
with check (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and (
    private.dispatch_mission_has_command_role(expedition_id, convoy_id)
    or (
      private.dispatch_mission_can_participate(expedition_id, convoy_id)
      and actor_user_id = (select auth.uid())
      and command_type in ('check_in', 'assist')
      and assignment_kind is null
      and assignment_key is null
      and assignment_member_id is null
      and assignment_status is null
    )
  )
  and private.dispatch_recipients_are_members(expedition_id, convoy_id, recipient_member_ids)
);

create policy dispatch_mission_targets_select_member
on public.dispatch_mission_command_targets for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_mission_targets_insert_authorized
on public.dispatch_mission_command_targets for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_can_write_command(command_id)
);

create policy dispatch_mission_ack_select_member
on public.dispatch_mission_command_acknowledgments for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_mission_ack_insert_own
on public.dispatch_mission_command_acknowledgments for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and member_id = actor_member_id
  and private.dispatch_mission_can_participate(expedition_id, convoy_id)
  and private.dispatch_mission_can_acknowledge(command_id, member_id)
  and (
    (
      private.dispatch_has_expedition_access(expedition_id, convoy_id)
      and private.dispatch_is_own_member(expedition_id, convoy_id, member_id)
    )
    or private.dispatch_can_append_late_ack(
      expedition_id,
      convoy_id,
      member_id,
      responded_at
    )
  )
);

create policy dispatch_mission_events_select_member
on public.dispatch_mission_command_events for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_mission_events_insert_authorized
on public.dispatch_mission_command_events for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_can_participate(expedition_id, convoy_id)
  and (
    (
      private.dispatch_has_expedition_access(expedition_id, convoy_id)
      and (
        (
          event_type not in ('acknowledged', 'declined')
          and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
        )
        or (
          event_type in ('acknowledged', 'declined')
          and private.dispatch_mission_can_acknowledge(command_id, actor_member_id)
        )
      )
    )
    or (
      event_type in ('acknowledged', 'declined')
      and private.dispatch_mission_can_acknowledge(command_id, actor_member_id)
      and private.dispatch_can_append_late_ack(
        expedition_id,
        convoy_id,
        actor_member_id,
        occurred_at
      )
    )
  )
);

create policy dispatch_mission_playbooks_select_member
on public.dispatch_mission_playbook_instances for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_mission_playbooks_insert_command
on public.dispatch_mission_playbook_instances for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
);
create policy dispatch_mission_playbooks_update_command
on public.dispatch_mission_playbook_instances for update to authenticated
using (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
)
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
);

create policy dispatch_mission_steps_select_member
on public.dispatch_mission_playbook_steps for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_mission_steps_insert_command
on public.dispatch_mission_playbook_steps for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
);
create policy dispatch_mission_steps_update_command
on public.dispatch_mission_playbook_steps for update to authenticated
using (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
)
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
);

create policy dispatch_mission_playbook_events_select_member
on public.dispatch_mission_playbook_events for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_mission_playbook_events_insert_command
on public.dispatch_mission_playbook_events for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
);

create policy dispatch_mission_deadlines_select_member
on public.dispatch_mission_deadlines for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_mission_deadlines_insert_command
on public.dispatch_mission_deadlines for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
);
create policy dispatch_mission_deadlines_update_command
on public.dispatch_mission_deadlines for update to authenticated
using (
  private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
)
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
);

create policy dispatch_mission_incident_links_select_member
on public.dispatch_mission_incident_links for select to authenticated
using (private.dispatch_can_read_expedition(expedition_id, convoy_id));
create policy dispatch_mission_incident_links_insert_command
on public.dispatch_mission_incident_links for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and private.dispatch_has_expedition_access(expedition_id, convoy_id)
  and private.dispatch_is_own_member(expedition_id, convoy_id, actor_member_id)
  and private.dispatch_mission_has_command_role(expedition_id, convoy_id)
);

create policy dispatch_mission_location_insert_non_viewer
on public.dispatch_restricted_locations as restrictive for insert to authenticated
with check (
  source_kind <> 'mission_command'
  or private.dispatch_mission_can_participate(expedition_id, convoy_id)
);

revoke all on public.dispatch_mission_commands from anon;
revoke all on public.dispatch_mission_command_targets from anon;
revoke all on public.dispatch_mission_command_acknowledgments from anon;
revoke all on public.dispatch_mission_command_events from anon;
revoke all on public.dispatch_mission_playbook_instances from anon;
revoke all on public.dispatch_mission_playbook_steps from anon;
revoke all on public.dispatch_mission_playbook_events from anon;
revoke all on public.dispatch_mission_deadlines from anon;
revoke all on public.dispatch_mission_incident_links from anon;

grant select, insert, update on public.dispatch_mission_commands to authenticated;
grant select, insert on public.dispatch_mission_command_targets to authenticated;
grant select, insert on public.dispatch_mission_command_acknowledgments to authenticated;
grant select, insert on public.dispatch_mission_command_events to authenticated;
grant select, insert, update on public.dispatch_mission_playbook_instances to authenticated;
grant select, insert, update on public.dispatch_mission_playbook_steps to authenticated;
grant select, insert on public.dispatch_mission_playbook_events to authenticated;
grant select, insert, update on public.dispatch_mission_deadlines to authenticated;
grant select, insert on public.dispatch_mission_incident_links to authenticated;

grant all on public.dispatch_mission_commands to service_role;
grant all on public.dispatch_mission_command_targets to service_role;
grant all on public.dispatch_mission_command_acknowledgments to service_role;
grant all on public.dispatch_mission_command_events to service_role;
grant all on public.dispatch_mission_playbook_instances to service_role;
grant all on public.dispatch_mission_playbook_steps to service_role;
grant all on public.dispatch_mission_playbook_events to service_role;
grant all on public.dispatch_mission_deadlines to service_role;
grant all on public.dispatch_mission_incident_links to service_role;

revoke delete on public.dispatch_mission_commands from authenticated;
revoke update, delete on public.dispatch_mission_command_targets from authenticated;
revoke update, delete on public.dispatch_mission_command_acknowledgments from authenticated;
revoke update, delete on public.dispatch_mission_command_events from authenticated;
revoke delete on public.dispatch_mission_playbook_instances from authenticated;
revoke delete on public.dispatch_mission_playbook_steps from authenticated;
revoke update, delete on public.dispatch_mission_playbook_events from authenticated;
revoke delete on public.dispatch_mission_deadlines from authenticated;
revoke update, delete on public.dispatch_mission_incident_links from authenticated;

alter table public.dispatch_mission_commands replica identity full;
alter table public.dispatch_mission_command_targets replica identity full;
alter table public.dispatch_mission_command_acknowledgments replica identity full;
alter table public.dispatch_mission_command_events replica identity full;
alter table public.dispatch_mission_playbook_instances replica identity full;
alter table public.dispatch_mission_playbook_steps replica identity full;
alter table public.dispatch_mission_playbook_events replica identity full;
alter table public.dispatch_mission_deadlines replica identity full;
alter table public.dispatch_mission_incident_links replica identity full;

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
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end;
$$;

create or replace function public.cleanup_dispatch_mission_records(
  retention_days integer default 365
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  cutoff timestamptz;
  affected bigint;
  total bigint := 0;
begin
  if retention_days < 30 then
    raise exception using errcode = '22023', message = 'dispatch_mission_retention_below_minimum';
  end if;
  cutoff := now() - make_interval(days => retention_days);
  perform set_config('ecs.dispatch_retention_cleanup', 'on', true);

  delete from public.dispatch_operation_receipts receipt
  where receipt.entity_kind like 'mission_%'
    and receipt.created_at < cutoff;
  get diagnostics affected = row_count;
  total := total + affected;

  delete from public.dispatch_restricted_locations location_record
  where location_record.source_kind = 'mission_command'
    and location_record.created_at < cutoff;
  get diagnostics affected = row_count;
  total := total + affected;

  delete from public.dispatch_mission_command_acknowledgments acknowledgment
  using public.dispatch_mission_commands command_record
  where acknowledgment.command_id = command_record.id
    and command_record.operational_state in ('resolved', 'cancelled', 'expired')
    and command_record.updated_at < cutoff;
  get diagnostics affected = row_count;
  total := total + affected;

  delete from public.dispatch_mission_command_events event_record
  using public.dispatch_mission_commands command_record
  where event_record.command_id = command_record.id
    and command_record.operational_state in ('resolved', 'cancelled', 'expired')
    and command_record.updated_at < cutoff;
  get diagnostics affected = row_count;
  total := total + affected;

  delete from public.dispatch_mission_command_targets target_record
  using public.dispatch_mission_commands command_record
  where target_record.command_id = command_record.id
    and command_record.operational_state in ('resolved', 'cancelled', 'expired')
    and command_record.updated_at < cutoff;
  get diagnostics affected = row_count;
  total := total + affected;

  delete from public.dispatch_mission_playbook_events event_record
  using public.dispatch_mission_playbook_instances playbook_record
  where event_record.playbook_instance_id = playbook_record.id
    and playbook_record.playbook_state in ('completed', 'cancelled')
    and playbook_record.updated_at < cutoff;
  get diagnostics affected = row_count;
  total := total + affected;

  delete from public.dispatch_mission_playbook_steps step_record
  using public.dispatch_mission_playbook_instances playbook_record
  where step_record.playbook_instance_id = playbook_record.id
    and playbook_record.playbook_state in ('completed', 'cancelled')
    and playbook_record.updated_at < cutoff;
  get diagnostics affected = row_count;
  total := total + affected;

  delete from public.dispatch_mission_deadlines deadline_record
  where (
    deadline_record.command_id in (
      select command_record.id
      from public.dispatch_mission_commands command_record
      where command_record.operational_state in ('resolved', 'cancelled', 'expired')
        and command_record.updated_at < cutoff
    )
    or deadline_record.playbook_instance_id in (
      select playbook_record.id
      from public.dispatch_mission_playbook_instances playbook_record
      where playbook_record.playbook_state in ('completed', 'cancelled')
        and playbook_record.updated_at < cutoff
    )
  );
  get diagnostics affected = row_count;
  total := total + affected;

  delete from public.dispatch_mission_incident_links link_record
  where (
    link_record.command_id in (
      select command_record.id
      from public.dispatch_mission_commands command_record
      where command_record.operational_state in ('resolved', 'cancelled', 'expired')
        and command_record.updated_at < cutoff
    )
    or link_record.playbook_instance_id in (
      select playbook_record.id
      from public.dispatch_mission_playbook_instances playbook_record
      where playbook_record.playbook_state in ('completed', 'cancelled')
        and playbook_record.updated_at < cutoff
    )
  );
  get diagnostics affected = row_count;
  total := total + affected;

  delete from public.dispatch_mission_playbook_instances
  where playbook_state in ('completed', 'cancelled')
    and updated_at < cutoff;
  get diagnostics affected = row_count;
  total := total + affected;

  delete from public.dispatch_mission_commands
  where operational_state in ('resolved', 'cancelled', 'expired')
    and updated_at < cutoff;
  get diagnostics affected = row_count;
  total := total + affected;

  return total;
end;
$$;

comment on function public.cleanup_dispatch_mission_records(integer)
is 'Service-role-only bounded cleanup for terminal Mission Command records. Local retention and release evidence remain separate.';
revoke execute on function public.cleanup_dispatch_mission_records(integer) from public, anon, authenticated;
grant execute on function public.cleanup_dispatch_mission_records(integer) to service_role;

comment on table public.dispatch_mission_commands
is 'Canonical Mission Command aggregates. Local persistence remains authoritative during the default-off shadow rollout.';
comment on table public.dispatch_mission_command_acknowledgments
is 'Append-only, own-member Mission Command responses, including bounded valid late acknowledgments.';
comment on table public.dispatch_mission_command_events
is 'Append-only Mission Command audit events. No exact coordinates or raw provider payloads are permitted.';
comment on table public.dispatch_mission_playbook_instances
is 'Canonical deterministic Operational Playbook snapshots. AI cannot mutate these records.';

notify pgrst, 'reload schema';
