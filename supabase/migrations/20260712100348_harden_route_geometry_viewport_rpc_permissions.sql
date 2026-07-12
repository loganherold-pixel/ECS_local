-- Supabase projects can retain explicit Data API grants even after PUBLIC is
-- revoked. The mobile app reaches this RPC through the authenticated Edge
-- Function, so only service_role should execute it directly.

revoke all on function public.search_route_geometry_segments_for_viewport(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean,
  text
) from public, anon, authenticated;

grant execute on function public.search_route_geometry_segments_for_viewport(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean,
  text
) to service_role;
