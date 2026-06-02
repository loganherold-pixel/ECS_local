-- Route catalog large-catalog query hardening.
-- The national MVUM expansion makes broad catalog reads expensive. Keep public
-- search and reporting paths on indexed, bounded lookups.

create index if not exists verified_routes_public_recommendation_bbox_idx
  on public.verified_routes (
    center_latitude,
    center_longitude,
    confidence_score desc,
    updated_at desc
  )
  where review_status = 'approved'
    and recommendation_status = 'recommendable';

create index if not exists verified_routes_curation_bbox_idx
  on public.verified_routes (
    center_latitude,
    center_longitude,
    confidence_score desc,
    updated_at desc
  )
  where review_status = 'approved'
    and recommendation_status <> 'recommendable';

create index if not exists verified_routes_summary_id_idx
  on public.verified_routes (id);

create index if not exists verified_route_sources_route_lookup_idx
  on public.verified_route_sources (
    verified_route_id,
    source_role,
    route_source_id
  );
