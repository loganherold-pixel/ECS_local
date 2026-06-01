create table if not exists public.ecs_issue_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  event_type text not null,
  severity text not null,
  issue_title text not null,
  issue_signature text not null,
  normalized_signature text not null,
  ecs_area text not null default 'unknown',
  message text,
  source_kind text not null default 'runtime',
  hashed_user_id text,
  hashed_session_id text,
  app_version text,
  platform text,
  environment text,
  runtime_context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.ecs_issue_events
  add column if not exists occurred_at timestamptz not null default now();
alter table public.ecs_issue_events
  add column if not exists received_at timestamptz not null default now();
alter table public.ecs_issue_events
  add column if not exists event_type text not null default 'non_fatal';
alter table public.ecs_issue_events
  add column if not exists severity text not null default 'medium';
alter table public.ecs_issue_events
  add column if not exists issue_title text not null default 'Unnamed ECS issue';
alter table public.ecs_issue_events
  add column if not exists issue_signature text not null default 'unknown';
alter table public.ecs_issue_events
  add column if not exists normalized_signature text not null default 'unknown';
alter table public.ecs_issue_events
  add column if not exists ecs_area text not null default 'unknown';
alter table public.ecs_issue_events
  add column if not exists message text;
alter table public.ecs_issue_events
  add column if not exists source_kind text not null default 'runtime';
alter table public.ecs_issue_events
  add column if not exists hashed_user_id text;
alter table public.ecs_issue_events
  add column if not exists hashed_session_id text;
alter table public.ecs_issue_events
  add column if not exists app_version text;
alter table public.ecs_issue_events
  add column if not exists platform text;
alter table public.ecs_issue_events
  add column if not exists environment text;
alter table public.ecs_issue_events
  add column if not exists runtime_context jsonb not null default '{}'::jsonb;
alter table public.ecs_issue_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ecs_issue_events_event_type_check'
  ) then
    alter table public.ecs_issue_events
      add constraint ecs_issue_events_event_type_check
      check (
        event_type in (
          'fatal',
          'non_fatal',
          'degraded_state',
          'recoverable_failure',
          'layout_failure',
          'data_integrity_failure',
          'field_report'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ecs_issue_events_severity_check'
  ) then
    alter table public.ecs_issue_events
      add constraint ecs_issue_events_severity_check
      check (severity in ('critical', 'high', 'medium', 'low'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ecs_issue_events_source_kind_check'
  ) then
    alter table public.ecs_issue_events
      add constraint ecs_issue_events_source_kind_check
      check (source_kind in ('runtime', 'field_report'));
  end if;
end $$;

create index if not exists idx_ecs_issue_events_signature
  on public.ecs_issue_events(normalized_signature);
create index if not exists idx_ecs_issue_events_received_at
  on public.ecs_issue_events(received_at desc);
create index if not exists idx_ecs_issue_events_severity
  on public.ecs_issue_events(severity);
create index if not exists idx_ecs_issue_events_app_version
  on public.ecs_issue_events(app_version);
create index if not exists idx_ecs_issue_events_area
  on public.ecs_issue_events(ecs_area);
create index if not exists idx_ecs_issue_events_source_kind
  on public.ecs_issue_events(source_kind);
