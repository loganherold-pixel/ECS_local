-- Durable CAD event storage for Dispatch recovery/hazard assist events.
-- Events are team/session scoped and carry event-level authorized users because
-- the current ECS team membership store is local-first rather than cloud-backed.

create table if not exists public.dispatch_cad_events (
  id text primary key,
  team_id text not null,
  session_id text not null,
  channel_id text,
  category text,
  hazard_type text,
  severity text not null,
  status text,
  title text not null,
  message text not null,
  creator_user_id uuid,
  creator_identity jsonb not null default '{}'::jsonb,
  authorized_user_ids uuid[] not null default '{}'::uuid[],
  location jsonb not null,
  payload jsonb not null,
  dedupe_key text,
  sync_state text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists dispatch_cad_events_team_session_created_idx
  on public.dispatch_cad_events (team_id, session_id, created_at desc);

create index if not exists dispatch_cad_events_authorized_users_idx
  on public.dispatch_cad_events using gin (authorized_user_ids);

create unique index if not exists dispatch_cad_events_dedupe_key_idx
  on public.dispatch_cad_events (dedupe_key)
  where dedupe_key is not null;

alter table public.dispatch_cad_events enable row level security;

drop policy if exists "dispatch cad events select authorized users" on public.dispatch_cad_events;
create policy "dispatch cad events select authorized users"
  on public.dispatch_cad_events
  for select
  using (
    auth.uid() = creator_user_id
    or auth.uid() = any(authorized_user_ids)
  );

drop policy if exists "dispatch cad events insert authorized users" on public.dispatch_cad_events;
create policy "dispatch cad events insert authorized users"
  on public.dispatch_cad_events
  for insert
  with check (
    auth.uid() = creator_user_id
    or auth.uid() = any(authorized_user_ids)
  );

drop policy if exists "dispatch cad events update authorized users" on public.dispatch_cad_events;
create policy "dispatch cad events update authorized users"
  on public.dispatch_cad_events
  for update
  using (
    auth.uid() = creator_user_id
    or auth.uid() = any(authorized_user_ids)
  )
  with check (
    auth.uid() = creator_user_id
    or auth.uid() = any(authorized_user_ids)
  );
