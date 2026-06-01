-- Advisory land-use/sensitive-area review for campsite submissions.
-- This stores review signals for moderators and triage without exposing
-- sensitive polygon names or blocked pending locations publicly.

create extension if not exists pgcrypto;

create table if not exists public.land_use_review_results (
  id uuid primary key default gen_random_uuid(),
  camp_site_report_id uuid not null references public.camp_site_reports(id) on delete cascade,
  status text not null default 'unknown',
  matched_layers jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  blocking_reasons jsonb not null default '[]'::jsonb,
  provider_version text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'land_use_review_results_status_check') then
    alter table public.land_use_review_results
      add constraint land_use_review_results_status_check
      check (status in ('not_checked', 'passed', 'warning', 'blocked', 'unknown'));
  end if;
end $$;

create index if not exists idx_land_use_review_results_report_id
  on public.land_use_review_results(camp_site_report_id);
create index if not exists idx_land_use_review_results_status
  on public.land_use_review_results(status);
create index if not exists idx_land_use_review_results_created_at
  on public.land_use_review_results(created_at desc);

alter table public.land_use_review_results enable row level security;

drop policy if exists land_use_review_results_select_moderators on public.land_use_review_results;
create policy land_use_review_results_select_moderators
on public.land_use_review_results
for select
to authenticated
using (public.is_ecs_super_admin());

drop policy if exists land_use_review_results_insert_moderators on public.land_use_review_results;
create policy land_use_review_results_insert_moderators
on public.land_use_review_results
for insert
to authenticated
with check (public.is_ecs_super_admin());

drop policy if exists land_use_review_results_update_moderators on public.land_use_review_results;
create policy land_use_review_results_update_moderators
on public.land_use_review_results
for update
to authenticated
using (public.is_ecs_super_admin())
with check (public.is_ecs_super_admin());
