-- Community review wall support for campsite recommendations.
-- Community submissions remain non-public until trusted review and/or moderator approval.

create extension if not exists pgcrypto;

alter table public.camp_site_reports
  add column if not exists review_state text not null default 'private_saved',
  add column if not exists triage_score double precision,
  add column if not exists triage_summary jsonb,
  add column if not exists community_review_started_at timestamptz,
  add column if not exists community_review_completed_at timestamptz,
  add column if not exists moderator_review_started_at timestamptz,
  add column if not exists moderator_review_completed_at timestamptz;

update public.camp_site_reports
set review_state = case
  when moderation_status = 'private_saved' then 'private_saved'
  when moderation_status = 'pending' and visibility_requested = 'community' then 'submitted'
  when moderation_status = 'needs_info' then 'needs_submitter_info'
  when moderation_status = 'approved' then 'approved'
  when moderation_status = 'rejected' then 'rejected'
  when moderation_status = 'merged' then 'merged'
  else review_state
end
where review_state = 'private_saved';

create table if not exists public.camp_site_review_votes (
  id uuid primary key default gen_random_uuid(),
  camp_site_report_id uuid not null references public.camp_site_reports(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null,
  confidence text not null default 'medium',
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.camp_site_review_events (
  id uuid primary key default gen_random_uuid(),
  camp_site_report_id uuid not null references public.camp_site_reports(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.camp_site_reviewer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_status text not null default 'none',
  review_region jsonb,
  review_count integer not null default 0,
  helpful_review_count integer not null default 0,
  rejected_review_count integer not null default 0,
  reputation_score double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'camp_site_reports_review_state_check') then
    alter table public.camp_site_reports
      add constraint camp_site_reports_review_state_check
      check (review_state in (
        'private_saved',
        'submitted',
        'auto_triage_failed',
        'needs_submitter_info',
        'community_review',
        'community_approved',
        'community_rejected',
        'moderator_review',
        'approved',
        'rejected',
        'merged',
        'hidden',
        'archived'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_reports_triage_score_check') then
    alter table public.camp_site_reports
      add constraint camp_site_reports_triage_score_check
      check (triage_score is null or (triage_score >= 0 and triage_score <= 100));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_review_votes_vote_check') then
    alter table public.camp_site_review_votes
      add constraint camp_site_review_votes_vote_check
      check (vote in (
        'approve',
        'reject',
        'needs_info',
        'duplicate',
        'sensitive',
        'private_land',
        'closed_to_camping',
        'bad_coordinates'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_review_votes_confidence_check') then
    alter table public.camp_site_review_votes
      add constraint camp_site_review_votes_confidence_check
      check (confidence in ('low', 'medium', 'high'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_review_votes_notes_length_check') then
    alter table public.camp_site_review_votes
      add constraint camp_site_review_votes_notes_length_check
      check (reviewer_notes is null or length(reviewer_notes) <= 2000);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_review_events_event_type_check') then
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
        'published'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_reviewer_profiles_status_check') then
    alter table public.camp_site_reviewer_profiles
      add constraint camp_site_reviewer_profiles_status_check
      check (reviewer_status in ('none', 'candidate', 'trusted', 'suspended'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_reviewer_profiles_counts_check') then
    alter table public.camp_site_reviewer_profiles
      add constraint camp_site_reviewer_profiles_counts_check
      check (
        review_count >= 0
        and helpful_review_count >= 0
        and rejected_review_count >= 0
        and reputation_score >= 0
      );
  end if;
end $$;

create index if not exists idx_camp_site_reports_review_state
  on public.camp_site_reports(review_state);
create index if not exists idx_camp_site_review_votes_report_id
  on public.camp_site_review_votes(camp_site_report_id);
create index if not exists idx_camp_site_review_votes_reviewer_user_id
  on public.camp_site_review_votes(reviewer_user_id);
create unique index if not exists idx_camp_site_review_votes_report_reviewer
  on public.camp_site_review_votes(camp_site_report_id, reviewer_user_id);
create index if not exists idx_camp_site_review_events_report_id
  on public.camp_site_review_events(camp_site_report_id);
create unique index if not exists idx_camp_site_reviewer_profiles_user_id
  on public.camp_site_reviewer_profiles(user_id);

drop trigger if exists camp_site_review_votes_set_updated_at on public.camp_site_review_votes;
create trigger camp_site_review_votes_set_updated_at
before update on public.camp_site_review_votes
for each row
execute function public.set_updated_at();

drop trigger if exists camp_site_reviewer_profiles_set_updated_at on public.camp_site_reviewer_profiles;
create trigger camp_site_reviewer_profiles_set_updated_at
before update on public.camp_site_reviewer_profiles
for each row
execute function public.set_updated_at();

create or replace function public.is_camp_site_trusted_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.camp_site_reviewer_profiles
    where user_id = auth.uid()
      and reviewer_status = 'trusted'
  );
$$;

alter table public.camp_site_review_votes enable row level security;
alter table public.camp_site_review_events enable row level security;
alter table public.camp_site_reviewer_profiles enable row level security;

drop policy if exists camp_site_reports_select_community_review on public.camp_site_reports;
create policy camp_site_reports_select_community_review
on public.camp_site_reports
for select
to authenticated
using (
  review_state in ('community_review', 'needs_submitter_info', 'community_approved', 'community_rejected')
  and (public.is_camp_site_trusted_reviewer() or public.is_ecs_super_admin())
);

drop policy if exists camp_site_review_votes_select_reviewer_admin on public.camp_site_review_votes;
create policy camp_site_review_votes_select_reviewer_admin
on public.camp_site_review_votes
for select
to authenticated
using (auth.uid() = reviewer_user_id or public.is_camp_site_trusted_reviewer() or public.is_ecs_super_admin());

drop policy if exists camp_site_review_votes_insert_trusted on public.camp_site_review_votes;
create policy camp_site_review_votes_insert_trusted
on public.camp_site_review_votes
for insert
to authenticated
with check (
  auth.uid() = reviewer_user_id
  and (public.is_camp_site_trusted_reviewer() or public.is_ecs_super_admin())
);

drop policy if exists camp_site_review_votes_update_own on public.camp_site_review_votes;
create policy camp_site_review_votes_update_own
on public.camp_site_review_votes
for update
to authenticated
using (
  auth.uid() = reviewer_user_id
  and (public.is_camp_site_trusted_reviewer() or public.is_ecs_super_admin())
)
with check (
  auth.uid() = reviewer_user_id
  and (public.is_camp_site_trusted_reviewer() or public.is_ecs_super_admin())
);

drop policy if exists camp_site_review_events_select_related on public.camp_site_review_events;
create policy camp_site_review_events_select_related
on public.camp_site_review_events
for select
to authenticated
using (
  public.is_camp_site_trusted_reviewer()
  or public.is_ecs_super_admin()
  or exists (
    select 1
    from public.camp_site_reports
    where camp_site_reports.id = camp_site_review_events.camp_site_report_id
      and camp_site_reports.submitted_by_user_id = auth.uid()
  )
);

drop policy if exists camp_site_review_events_insert_system_or_reviewer on public.camp_site_review_events;
create policy camp_site_review_events_insert_system_or_reviewer
on public.camp_site_review_events
for insert
to authenticated
with check (
  (actor_user_id is null and public.is_ecs_super_admin())
  or (
    actor_user_id = auth.uid()
    and (
      public.is_camp_site_trusted_reviewer()
      or public.is_ecs_super_admin()
      or exists (
        select 1
        from public.camp_site_reports
        where camp_site_reports.id = camp_site_review_events.camp_site_report_id
          and camp_site_reports.submitted_by_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists camp_site_reviewer_profiles_select_own_admin on public.camp_site_reviewer_profiles;
create policy camp_site_reviewer_profiles_select_own_admin
on public.camp_site_reviewer_profiles
for select
to authenticated
using (auth.uid() = user_id or public.is_ecs_super_admin());

drop policy if exists camp_site_reviewer_profiles_insert_candidate on public.camp_site_reviewer_profiles;
create policy camp_site_reviewer_profiles_insert_candidate
on public.camp_site_reviewer_profiles
for insert
to authenticated
with check (
  auth.uid() = user_id
  and reviewer_status in ('none', 'candidate')
);

drop policy if exists camp_site_reviewer_profiles_update_admin on public.camp_site_reviewer_profiles;
create policy camp_site_reviewer_profiles_update_admin
on public.camp_site_reviewer_profiles
for update
to authenticated
using (public.is_ecs_super_admin())
with check (public.is_ecs_super_admin());
