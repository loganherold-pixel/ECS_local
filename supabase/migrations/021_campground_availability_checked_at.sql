-- Canonical established campground availability freshness marker.
-- Availability rows remain the detailed source of truth; this timestamp lets
-- map/API surfaces know when canonical availability_status was last refreshed.

alter table public.campgrounds
  add column if not exists last_availability_checked_at timestamptz;

create index if not exists idx_campgrounds_last_availability_checked_at
  on public.campgrounds(last_availability_checked_at desc)
  where last_availability_checked_at is not null;
