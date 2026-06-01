-- Restricted route catalog source metadata.
-- These rows are intentionally disabled. They document sources ECS must not
-- ingest, sync, rehost, or recommend until written permission/licensing exists.

insert into public.route_sources (
  provider_id,
  name,
  source_type,
  authority,
  source_uri,
  attribution,
  license,
  refresh_frequency,
  status
) values
  (
    'bdr_partner_restricted',
    'Backcountry Discovery Routes Partner Restricted',
    'partner_restricted',
    'partner_restricted',
    'https://ridebdr.com/download-tracks/',
    'Backcountry Discovery Routes',
    'restricted partner terms',
    'license required before publishing',
    'disabled'
  ),
  (
    'california_state_parks_roads_trails_restricted',
    'California State Parks Roads and Trails Restricted',
    'partner_restricted',
    'partner_restricted',
    'https://www.parks.ca.gov/?page_id=29682',
    'California State Parks',
    'commercial use requires advance approval',
    'license required before ingestion',
    'disabled'
  )
on conflict (provider_id) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  authority = excluded.authority,
  source_uri = excluded.source_uri,
  attribution = excluded.attribution,
  license = excluded.license,
  refresh_frequency = excluded.refresh_frequency,
  status = excluded.status,
  updated_at = now();
