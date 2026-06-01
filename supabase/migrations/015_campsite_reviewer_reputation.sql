-- Reviewer reputation and anti-abuse support for campsite Community Review.

create extension if not exists pgcrypto;

alter table public.camp_site_review_events
  drop constraint if exists camp_site_review_events_event_type_check;

alter table public.camp_site_review_events
  add constraint camp_site_review_events_event_type_check
  check (event_type in (
    'submitted',
    'community_review',
    'triage_passed',
    'triage_failed',
    'vote_added',
    'vote_changed',
    'needs_info_requested',
    'community_approved',
    'community_rejected',
    'moderator_review',
    'moderator_approved',
    'moderator_rejected',
    'merged',
    'hidden',
    'published',
    'submitter_updated',
    'needs_info_responded',
    'withdrawn',
    'review_abuse_flagged',
    'reputation_updated'
  ));

create table if not exists public.camp_site_reviewer_audit_events (
  id uuid primary key default gen_random_uuid(),
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'camp_site_reviewer_audit_events_type_check') then
    alter table public.camp_site_reviewer_audit_events
      add constraint camp_site_reviewer_audit_events_type_check
      check (event_type in ('reviewer_promoted', 'reviewer_suspended', 'reviewer_status_changed'));
  end if;
end $$;

create index if not exists idx_camp_site_reviewer_audit_events_reviewer
  on public.camp_site_reviewer_audit_events(reviewer_user_id, created_at desc);
create index if not exists idx_camp_site_reviewer_profiles_status_score
  on public.camp_site_reviewer_profiles(reviewer_status, reputation_score desc);
create index if not exists idx_camp_site_review_votes_reviewer_updated
  on public.camp_site_review_votes(reviewer_user_id, updated_at desc);

alter table public.camp_site_reviewer_audit_events enable row level security;

drop policy if exists camp_site_reviewer_audit_events_select_admin on public.camp_site_reviewer_audit_events;
create policy camp_site_reviewer_audit_events_select_admin
on public.camp_site_reviewer_audit_events
for select
to authenticated
using (public.is_ecs_super_admin());

drop policy if exists camp_site_reviewer_audit_events_insert_admin on public.camp_site_reviewer_audit_events;
create policy camp_site_reviewer_audit_events_insert_admin
on public.camp_site_reviewer_audit_events
for insert
to authenticated
with check (public.is_ecs_super_admin());

drop policy if exists camp_site_reviewer_profiles_select_admin_all on public.camp_site_reviewer_profiles;
create policy camp_site_reviewer_profiles_select_admin_all
on public.camp_site_reviewer_profiles
for select
to authenticated
using (public.is_ecs_super_admin());
