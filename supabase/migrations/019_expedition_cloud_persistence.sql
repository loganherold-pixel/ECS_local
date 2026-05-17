create extension if not exists pgcrypto;

create table if not exists public.expedition_sessions (
  id text primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id text,
  vehicle_name text not null,
  state text not null,
  start_time timestamptz not null,
  end_time timestamptz,
  duration_seconds integer,
  distance_meters double precision,
  fuel_delta double precision,
  water_delta double precision,
  peak_remoteness double precision,
  home_latitude double precision,
  home_longitude double precision,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expedition_timeline_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.expedition_sessions(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.expedition_timeline (
  id text primary key,
  expedition_id text not null,
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  timestamp timestamptz not null,
  event_type text not null,
  title text not null,
  description text,
  latitude double precision,
  longitude double precision,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists expedition_sessions_user_start_idx
  on public.expedition_sessions (user_id, start_time desc);

create index if not exists expedition_sessions_state_idx
  on public.expedition_sessions (state);

create index if not exists expedition_timeline_events_session_occurred_idx
  on public.expedition_timeline_events (session_id, occurred_at desc);

create index if not exists expedition_timeline_expedition_timestamp_idx
  on public.expedition_timeline (expedition_id, timestamp desc);

create index if not exists expedition_timeline_user_timestamp_idx
  on public.expedition_timeline (user_id, timestamp desc);

create index if not exists expedition_timeline_event_type_idx
  on public.expedition_timeline (event_type);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists expedition_sessions_set_updated_at on public.expedition_sessions;
create trigger expedition_sessions_set_updated_at
before update on public.expedition_sessions
for each row
execute function public.set_updated_at();

alter table public.expedition_sessions enable row level security;
alter table public.expedition_timeline_events enable row level security;
alter table public.expedition_timeline enable row level security;

drop policy if exists expedition_sessions_select_own on public.expedition_sessions;
create policy expedition_sessions_select_own
on public.expedition_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists expedition_sessions_insert_own on public.expedition_sessions;
create policy expedition_sessions_insert_own
on public.expedition_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists expedition_sessions_update_own on public.expedition_sessions;
create policy expedition_sessions_update_own
on public.expedition_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists expedition_timeline_events_select_own_session on public.expedition_timeline_events;
create policy expedition_timeline_events_select_own_session
on public.expedition_timeline_events
for select
to authenticated
using (
  exists (
    select 1
    from public.expedition_sessions s
    where s.id = session_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists expedition_timeline_events_insert_own_session on public.expedition_timeline_events;
create policy expedition_timeline_events_insert_own_session
on public.expedition_timeline_events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.expedition_sessions s
    where s.id = session_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists expedition_timeline_select_own_expedition on public.expedition_timeline;
create policy expedition_timeline_select_own_expedition
on public.expedition_timeline
for select
to authenticated
using (
  exists (
    select 1
    from public.expedition_sessions s
    where s.id = expedition_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists expedition_timeline_insert_own_expedition on public.expedition_timeline;
create policy expedition_timeline_insert_own_expedition
on public.expedition_timeline
for insert
to authenticated
with check (
  exists (
    select 1
    from public.expedition_sessions s
    where s.id = expedition_id
      and s.user_id = auth.uid()
  )
);
