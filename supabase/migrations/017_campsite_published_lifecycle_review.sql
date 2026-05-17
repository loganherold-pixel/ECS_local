alter table public.camp_sites drop constraint if exists camp_sites_status_check;
alter table public.camp_sites
  add constraint camp_sites_status_check
  check (status in ('approved', 'hidden', 'archived', 'hidden_pending_review', 'closed', 'sensitive_removed'));

create table if not exists public.camp_site_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  camp_site_id uuid not null references public.camp_sites(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'camp_site_lifecycle_events_type_check'
  ) then
    alter table public.camp_site_lifecycle_events
      add constraint camp_site_lifecycle_events_type_check
      check (
        event_type in (
          'serious_flag_review_started',
          'flag_threshold_review_started',
          'published_review_vote',
          'published_review_resolved'
        )
      );
  end if;
end $$;

create index if not exists idx_camp_sites_published_review_status
  on public.camp_sites(status, flag_count desc)
  where visibility = 'community';
create index if not exists idx_camp_site_lifecycle_events_site_created
  on public.camp_site_lifecycle_events(camp_site_id, created_at desc);

alter table public.camp_site_lifecycle_events enable row level security;

drop policy if exists camp_site_lifecycle_events_select_moderators on public.camp_site_lifecycle_events;
create policy camp_site_lifecycle_events_select_moderators
on public.camp_site_lifecycle_events
for select
to authenticated
using (public.is_ecs_super_admin() or public.is_camp_site_trusted_reviewer());

drop policy if exists camp_site_lifecycle_events_insert_moderators on public.camp_site_lifecycle_events;
create policy camp_site_lifecycle_events_insert_moderators
on public.camp_site_lifecycle_events
for insert
to authenticated
with check (
  public.is_ecs_super_admin()
  or public.is_camp_site_trusted_reviewer()
  or actor_user_id = auth.uid()
);
