-- Explicit user-selected campsite candidates from GPX route/track geometry.
-- Route and track points remain private import geometry until the user creates a candidate.

alter table public.gpx_import_candidates
  add column if not exists source_route_name text,
  add column if not exists source_track_name text,
  add column if not exists source_segment_index integer;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'gpx_import_candidates_candidate_type_check') then
    alter table public.gpx_import_candidates
      drop constraint gpx_import_candidates_candidate_type_check;
  end if;

  alter table public.gpx_import_candidates
    add constraint gpx_import_candidates_candidate_type_check
    check (candidate_type in ('waypoint', 'route_selected_point', 'track_selected_point'));

  if not exists (select 1 from pg_constraint where conname = 'gpx_import_candidates_source_segment_index_check') then
    alter table public.gpx_import_candidates
      add constraint gpx_import_candidates_source_segment_index_check
      check (source_segment_index is null or source_segment_index >= 0);
  end if;

  if exists (select 1 from pg_constraint where conname = 'camp_site_reports_source_type_check') then
    alter table public.camp_site_reports
      drop constraint camp_site_reports_source_type_check;
  end if;

  alter table public.camp_site_reports
    add constraint camp_site_reports_source_type_check
    check (source_type in ('current_location', 'pin_drop', 'gpx_waypoint', 'gpx_route', 'gpx_track_selected_point', 'manual'));
end $$;
