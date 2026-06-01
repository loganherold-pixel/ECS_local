create table if not exists public.camp_site_review_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  audience text not null,
  type text not null,
  camp_site_report_id uuid references public.camp_site_reports(id) on delete cascade,
  camp_site_id uuid references public.camp_sites(id) on delete cascade,
  title text not null,
  body text not null,
  link_target text not null,
  link_params jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'camp_site_review_notifications_audience_check'
  ) then
    alter table public.camp_site_review_notifications
      add constraint camp_site_review_notifications_audience_check
      check (audience in ('submitter', 'trusted_reviewer', 'moderator'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'camp_site_review_notifications_type_check'
  ) then
    alter table public.camp_site_review_notifications
      add constraint camp_site_review_notifications_type_check
      check (
        type in (
          'community_submission_received',
          'community_review_started',
          'needs_info_requested',
          'approved_published',
          'rejected',
          'merged',
          'withdrawn',
          'new_review_ready',
          'moderator_review_required',
          'blocked_triage',
          'sensitive_vote_escalation',
          'high_flag_count'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'camp_site_review_notifications_link_target_check'
  ) then
    alter table public.camp_site_review_notifications
      add constraint camp_site_review_notifications_link_target_check
      check (
        link_target in (
          'my_campsite_submission',
          'community_campsite_review',
          'campsite_reviewer_management',
          'community_campsite_detail'
        )
      );
  end if;
end $$;

create index if not exists idx_camp_site_review_notifications_recipient_created
  on public.camp_site_review_notifications(recipient_user_id, created_at desc);
create index if not exists idx_camp_site_review_notifications_report
  on public.camp_site_review_notifications(camp_site_report_id);
create index if not exists idx_camp_site_review_notifications_site
  on public.camp_site_review_notifications(camp_site_id);
create index if not exists idx_camp_site_review_notifications_type
  on public.camp_site_review_notifications(type, created_at desc);

alter table public.camp_site_review_notifications enable row level security;

drop policy if exists camp_site_review_notifications_select_own on public.camp_site_review_notifications;
create policy camp_site_review_notifications_select_own
on public.camp_site_review_notifications
for select
to authenticated
using (
  recipient_user_id = auth.uid()
  or public.is_ecs_super_admin()
);

drop policy if exists camp_site_review_notifications_insert_authorized on public.camp_site_review_notifications;
create policy camp_site_review_notifications_insert_authorized
on public.camp_site_review_notifications
for insert
to authenticated
with check (
  recipient_user_id = auth.uid()
  or public.is_ecs_super_admin()
  or public.is_camp_site_trusted_reviewer()
);

drop policy if exists camp_site_review_notifications_update_read_own on public.camp_site_review_notifications;
create policy camp_site_review_notifications_update_read_own
on public.camp_site_review_notifications
for update
to authenticated
using (recipient_user_id = auth.uid() or public.is_ecs_super_admin())
with check (recipient_user_id = auth.uid() or public.is_ecs_super_admin());
