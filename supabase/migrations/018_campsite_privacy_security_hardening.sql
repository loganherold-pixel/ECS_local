create table if not exists public.camp_site_group_audit_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.camp_site_groups(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'camp_site_group_audit_events_type_check'
  ) then
    alter table public.camp_site_group_audit_events
      add constraint camp_site_group_audit_events_type_check
      check (event_type in ('share_removed'));
  end if;
end $$;

create index if not exists idx_camp_site_flags_site_user
  on public.camp_site_flags(camp_site_id, user_id);
create index if not exists idx_camp_site_group_audit_events_group_created
  on public.camp_site_group_audit_events(group_id, created_at desc);

alter table public.camp_site_group_audit_events enable row level security;

drop policy if exists camp_site_group_audit_events_select_admin on public.camp_site_group_audit_events;
create policy camp_site_group_audit_events_select_admin
on public.camp_site_group_audit_events
for select
to authenticated
using (
  public.is_ecs_super_admin()
  or public.is_camp_site_group_admin(group_id)
);

drop policy if exists camp_site_group_audit_events_insert_admin on public.camp_site_group_audit_events;
create policy camp_site_group_audit_events_insert_admin
on public.camp_site_group_audit_events
for insert
to authenticated
with check (
  public.is_ecs_super_admin()
  or public.is_camp_site_group_admin(group_id)
);
