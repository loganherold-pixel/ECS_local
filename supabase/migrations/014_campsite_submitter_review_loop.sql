-- Submitter-facing campsite review correction loop.
-- Adds a withdrawn state and submitter event types without changing the existing
-- community review or moderation flow.

alter table public.camp_site_reports
  drop constraint if exists camp_site_reports_review_state_check;

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
    'archived',
    'withdrawn'
  ));

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
    'withdrawn'
  ));

create index if not exists idx_camp_site_reports_submitter_review_state
on public.camp_site_reports(submitted_by_user_id, review_state);

drop policy if exists camp_site_reports_update_own_submitter_loop on public.camp_site_reports;
create policy camp_site_reports_update_own_submitter_loop
on public.camp_site_reports
for update
to authenticated
using (
  auth.uid() = submitted_by_user_id
  and coalesce(review_state, 'submitted') in (
    'private_saved',
    'submitted',
    'community_review',
    'moderator_review',
    'needs_submitter_info',
    'auto_triage_failed',
    'withdrawn'
  )
)
with check (auth.uid() = submitted_by_user_id);
