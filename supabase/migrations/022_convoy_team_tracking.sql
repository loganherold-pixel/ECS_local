-- Authenticated convoy/team tracking for leader-issued convoy credentials.
-- Invite secrets are never stored raw; only code_hash is persisted.

create extension if not exists pgcrypto;

create table if not exists public.convoys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  leader_user_id uuid not null references auth.users(id),
  status text not null default 'active' check (status in ('planned', 'active', 'paused', 'completed', 'cancelled')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.convoy_invites (
  id uuid primary key default gen_random_uuid(),
  convoy_id uuid not null references public.convoys(id) on delete cascade,
  code_hash text not null,
  role text not null default 'member' check (role in ('lead', 'sweep', 'member', 'support')),
  max_uses integer not null default 1,
  used_count integer not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now(),
  check (max_uses > 0),
  check (used_count >= 0),
  check (used_count <= max_uses)
);

create table if not exists public.convoy_members (
  id uuid primary key default gen_random_uuid(),
  convoy_id uuid not null references public.convoys(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  vehicle_id text,
  callsign text not null,
  role text not null default 'member' check (role in ('lead', 'sweep', 'member', 'support')),
  joined_at timestamptz default now(),
  revoked_at timestamptz,
  unique (convoy_id, user_id)
);

create table if not exists public.convoy_member_locations (
  id uuid primary key default gen_random_uuid(),
  convoy_id uuid not null references public.convoys(id) on delete cascade,
  member_id uuid not null references public.convoy_members(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  heading_degrees double precision check (heading_degrees is null or (heading_degrees >= 0 and heading_degrees < 360)),
  speed_mps double precision check (speed_mps is null or speed_mps >= 0),
  battery_percent integer check (battery_percent is null or battery_percent between 0 and 100),
  movement_status text not null default 'unknown' check (movement_status in ('moving', 'stopped', 'delayed', 'offline', 'needs_assistance', 'unknown')),
  captured_at timestamptz not null,
  updated_at timestamptz default now(),
  unique (member_id)
);

create index if not exists convoys_leader_user_id_idx
  on public.convoys (leader_user_id);
create index if not exists convoys_status_idx
  on public.convoys (status);
create index if not exists convoys_updated_at_idx
  on public.convoys (updated_at desc);

create index if not exists convoy_invites_convoy_id_idx
  on public.convoy_invites (convoy_id);
create index if not exists convoy_invites_created_by_idx
  on public.convoy_invites (created_by);
create index if not exists convoy_invites_expires_at_idx
  on public.convoy_invites (expires_at);
create unique index if not exists convoy_invites_code_hash_idx
  on public.convoy_invites (code_hash);

create index if not exists convoy_members_convoy_id_idx
  on public.convoy_members (convoy_id);
create index if not exists convoy_members_user_id_idx
  on public.convoy_members (user_id);
create index if not exists convoy_members_revoked_at_idx
  on public.convoy_members (revoked_at);

create index if not exists convoy_member_locations_convoy_id_idx
  on public.convoy_member_locations (convoy_id);
create index if not exists convoy_member_locations_member_id_idx
  on public.convoy_member_locations (member_id);
create index if not exists convoy_member_locations_updated_at_idx
  on public.convoy_member_locations (updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists convoys_set_updated_at on public.convoys;
create trigger convoys_set_updated_at
before update on public.convoys
for each row
execute function public.set_updated_at();

drop trigger if exists convoy_member_locations_set_updated_at on public.convoy_member_locations;
create trigger convoy_member_locations_set_updated_at
before update on public.convoy_member_locations
for each row
execute function public.set_updated_at();

create or replace function public.is_convoy_leader(target_convoy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.convoys
    where convoys.id = target_convoy_id
      and convoys.leader_user_id = auth.uid()
  );
$$;

create or replace function public.is_active_convoy_member(target_convoy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.convoy_members
    join public.convoys on convoys.id = convoy_members.convoy_id
    where convoy_members.convoy_id = target_convoy_id
      and convoy_members.user_id = auth.uid()
      and convoy_members.revoked_at is null
      and convoys.status in ('planned', 'active', 'paused')
  );
$$;

create or replace function public.is_own_active_convoy_member(target_member_id uuid, target_convoy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.convoy_members
    join public.convoys on convoys.id = convoy_members.convoy_id
    where convoy_members.id = target_member_id
      and convoy_members.convoy_id = target_convoy_id
      and convoy_members.user_id = auth.uid()
      and convoy_members.revoked_at is null
      and convoys.status in ('planned', 'active', 'paused')
  );
$$;

create or replace function public.claim_convoy_invite(target_invite_id uuid)
returns table(id uuid, used_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.convoy_invites
  set used_count = convoy_invites.used_count + 1
  where convoy_invites.id = target_invite_id
    and convoy_invites.revoked_at is null
    and convoy_invites.expires_at > now()
    and convoy_invites.used_count < convoy_invites.max_uses
  returning convoy_invites.id, convoy_invites.used_count;
end;
$$;

revoke execute on function public.is_convoy_leader(uuid) from public, anon;
revoke execute on function public.is_active_convoy_member(uuid) from public, anon;
revoke execute on function public.is_own_active_convoy_member(uuid, uuid) from public, anon;
revoke execute on function public.claim_convoy_invite(uuid) from public, anon, authenticated;
grant execute on function public.is_convoy_leader(uuid) to authenticated, service_role;
grant execute on function public.is_active_convoy_member(uuid) to authenticated, service_role;
grant execute on function public.is_own_active_convoy_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.claim_convoy_invite(uuid) to service_role;

alter table public.convoys enable row level security;
alter table public.convoy_invites enable row level security;
alter table public.convoy_members enable row level security;
alter table public.convoy_member_locations enable row level security;

alter table public.convoy_member_locations replica identity full;

drop policy if exists convoys_select_leader_or_active_member on public.convoys;
create policy convoys_select_leader_or_active_member
on public.convoys
for select
to authenticated
using (
  leader_user_id = auth.uid()
  or public.is_active_convoy_member(id)
);

drop policy if exists convoys_insert_leader on public.convoys;
create policy convoys_insert_leader
on public.convoys
for insert
to authenticated
with check (leader_user_id = auth.uid());

drop policy if exists convoys_update_leader on public.convoys;
create policy convoys_update_leader
on public.convoys
for update
to authenticated
using (leader_user_id = auth.uid())
with check (leader_user_id = auth.uid());

drop policy if exists convoy_invites_select_leader on public.convoy_invites;
create policy convoy_invites_select_leader
on public.convoy_invites
for select
to authenticated
using (public.is_convoy_leader(convoy_id));

drop policy if exists convoy_invites_insert_leader on public.convoy_invites;
create policy convoy_invites_insert_leader
on public.convoy_invites
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_convoy_leader(convoy_id)
);

drop policy if exists convoy_invites_update_leader on public.convoy_invites;
create policy convoy_invites_update_leader
on public.convoy_invites
for update
to authenticated
using (public.is_convoy_leader(convoy_id))
with check (public.is_convoy_leader(convoy_id));

drop policy if exists convoy_members_select_active_convoy on public.convoy_members;
create policy convoy_members_select_active_convoy
on public.convoy_members
for select
to authenticated
using (
  public.is_convoy_leader(convoy_id)
  or public.is_active_convoy_member(convoy_id)
);

drop policy if exists convoy_members_insert_leader on public.convoy_members;
create policy convoy_members_insert_leader
on public.convoy_members
for insert
to authenticated
with check (public.is_convoy_leader(convoy_id));

drop policy if exists convoy_members_update_leader on public.convoy_members;
create policy convoy_members_update_leader
on public.convoy_members
for update
to authenticated
using (public.is_convoy_leader(convoy_id))
with check (public.is_convoy_leader(convoy_id));

drop policy if exists convoy_member_locations_select_active_members on public.convoy_member_locations;
create policy convoy_member_locations_select_active_members
on public.convoy_member_locations
for select
to authenticated
using (
  public.is_active_convoy_member(convoy_id)
  and exists (
    select 1
    from public.convoy_members
    where convoy_members.id = convoy_member_locations.member_id
      and convoy_members.convoy_id = convoy_member_locations.convoy_id
      and convoy_members.revoked_at is null
  )
);

drop policy if exists convoy_member_locations_insert_own on public.convoy_member_locations;
create policy convoy_member_locations_insert_own
on public.convoy_member_locations
for insert
to authenticated
with check (public.is_own_active_convoy_member(member_id, convoy_id));

drop policy if exists convoy_member_locations_update_own on public.convoy_member_locations;
create policy convoy_member_locations_update_own
on public.convoy_member_locations
for update
to authenticated
using (public.is_own_active_convoy_member(member_id, convoy_id))
with check (public.is_own_active_convoy_member(member_id, convoy_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.convoy_member_locations;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;
