-- Private group sharing for campsite recommendations.
-- Group shares never publish to the ECS Community Campsites layer.

create extension if not exists pgcrypto;

create table if not exists public.camp_site_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  visibility text not null default 'private_group',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.camp_site_group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.camp_site_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.camp_site_group_shares (
  id uuid primary key default gen_random_uuid(),
  camp_site_report_id uuid references public.camp_site_reports(id) on delete cascade,
  camp_site_id uuid references public.camp_sites(id) on delete cascade,
  group_id uuid not null references public.camp_site_groups(id) on delete cascade,
  shared_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint camp_site_group_shares_one_target_check check (
    (camp_site_report_id is not null and camp_site_id is null)
    or (camp_site_report_id is null and camp_site_id is not null)
  )
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'camp_site_groups_visibility_check') then
    alter table public.camp_site_groups
      add constraint camp_site_groups_visibility_check check (visibility in ('private_group'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_group_memberships_role_check') then
    alter table public.camp_site_group_memberships
      add constraint camp_site_group_memberships_role_check check (role in ('owner', 'admin', 'member'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_group_memberships_status_check') then
    alter table public.camp_site_group_memberships
      add constraint camp_site_group_memberships_status_check check (status in ('active', 'invited', 'removed'));
  end if;
end $$;

create unique index if not exists idx_camp_site_group_memberships_group_user
  on public.camp_site_group_memberships(group_id, user_id);
create index if not exists idx_camp_site_group_memberships_user
  on public.camp_site_group_memberships(user_id);
create index if not exists idx_camp_site_group_memberships_group
  on public.camp_site_group_memberships(group_id);
create index if not exists idx_camp_site_group_shares_group
  on public.camp_site_group_shares(group_id);
create index if not exists idx_camp_site_group_shares_report
  on public.camp_site_group_shares(camp_site_report_id);
create index if not exists idx_camp_site_group_shares_site
  on public.camp_site_group_shares(camp_site_id);

drop trigger if exists camp_site_groups_set_updated_at on public.camp_site_groups;
create trigger camp_site_groups_set_updated_at
before update on public.camp_site_groups
for each row
execute function public.set_updated_at();

drop trigger if exists camp_site_group_memberships_set_updated_at on public.camp_site_group_memberships;
create trigger camp_site_group_memberships_set_updated_at
before update on public.camp_site_group_memberships
for each row
execute function public.set_updated_at();

alter table public.camp_site_groups enable row level security;
alter table public.camp_site_group_memberships enable row level security;
alter table public.camp_site_group_shares enable row level security;

create or replace function public.is_camp_site_group_member(group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.camp_site_group_memberships
    where camp_site_group_memberships.group_id = is_camp_site_group_member.group_id
      and camp_site_group_memberships.user_id = auth.uid()
      and camp_site_group_memberships.status = 'active'
  );
$$;

create or replace function public.is_camp_site_group_admin(group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.camp_site_group_memberships
    where camp_site_group_memberships.group_id = is_camp_site_group_admin.group_id
      and camp_site_group_memberships.user_id = auth.uid()
      and camp_site_group_memberships.status = 'active'
      and camp_site_group_memberships.role in ('owner', 'admin')
  );
$$;

drop policy if exists camp_site_groups_select_member on public.camp_site_groups;
create policy camp_site_groups_select_member
on public.camp_site_groups
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_camp_site_group_member(id)
  or public.is_ecs_super_admin()
);

drop policy if exists camp_site_groups_insert_owner on public.camp_site_groups;
create policy camp_site_groups_insert_owner
on public.camp_site_groups
for insert
to authenticated
with check (owner_user_id = auth.uid() or public.is_ecs_super_admin());

drop policy if exists camp_site_groups_update_admin on public.camp_site_groups;
create policy camp_site_groups_update_admin
on public.camp_site_groups
for update
to authenticated
using (public.is_camp_site_group_admin(id) or public.is_ecs_super_admin())
with check (public.is_camp_site_group_admin(id) or public.is_ecs_super_admin());

drop policy if exists camp_site_group_memberships_select_member on public.camp_site_group_memberships;
create policy camp_site_group_memberships_select_member
on public.camp_site_group_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_camp_site_group_member(group_id)
  or public.is_ecs_super_admin()
);

drop policy if exists camp_site_group_memberships_insert_admin on public.camp_site_group_memberships;
create policy camp_site_group_memberships_insert_admin
on public.camp_site_group_memberships
for insert
to authenticated
with check (public.is_camp_site_group_admin(group_id) or public.is_ecs_super_admin());

drop policy if exists camp_site_group_memberships_update_admin on public.camp_site_group_memberships;
create policy camp_site_group_memberships_update_admin
on public.camp_site_group_memberships
for update
to authenticated
using (public.is_camp_site_group_admin(group_id) or public.is_ecs_super_admin())
with check (public.is_camp_site_group_admin(group_id) or public.is_ecs_super_admin());

drop policy if exists camp_site_group_shares_select_member on public.camp_site_group_shares;
create policy camp_site_group_shares_select_member
on public.camp_site_group_shares
for select
to authenticated
using (public.is_camp_site_group_member(group_id) or public.is_ecs_super_admin());

drop policy if exists camp_site_group_shares_insert_member on public.camp_site_group_shares;
create policy camp_site_group_shares_insert_member
on public.camp_site_group_shares
for insert
to authenticated
with check (
  shared_by_user_id = auth.uid()
  and public.is_camp_site_group_member(group_id)
);

drop policy if exists camp_site_group_shares_delete_admin on public.camp_site_group_shares;
create policy camp_site_group_shares_delete_admin
on public.camp_site_group_shares
for delete
to authenticated
using (public.is_camp_site_group_admin(group_id) or public.is_ecs_super_admin());

drop policy if exists camp_site_reports_select_group_shared on public.camp_site_reports;
create policy camp_site_reports_select_group_shared
on public.camp_site_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.camp_site_group_shares
    where camp_site_group_shares.camp_site_report_id = camp_site_reports.id
      and public.is_camp_site_group_member(camp_site_group_shares.group_id)
  )
);

drop policy if exists camp_site_photos_select_group_shared on public.camp_site_photos;
create policy camp_site_photos_select_group_shared
on public.camp_site_photos
for select
to authenticated
using (
  moderation_status = 'group_visible'
  and exists (
    select 1
    from public.camp_site_group_shares
    where camp_site_group_shares.camp_site_report_id = camp_site_photos.camp_site_report_id
      and public.is_camp_site_group_member(camp_site_group_shares.group_id)
  )
);
