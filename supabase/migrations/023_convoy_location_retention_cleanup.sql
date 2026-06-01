-- Convoy location retention cleanup.
-- Deployment schedulers can call:
--   select public.cleanup_old_convoy_member_locations(30);
-- Mobile clients must not run retention cleanup.

create or replace function public.cleanup_old_convoy_member_locations(retention_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
  bounded_retention_days integer := greatest(0, least(coalesce(retention_days, 30), 365));
begin
  delete from public.convoy_member_locations locations
  using public.convoys convoys
  where convoys.id = locations.convoy_id
    and convoys.status in ('completed', 'cancelled')
    and coalesce(locations.updated_at, locations.captured_at) < now() - make_interval(days => bounded_retention_days);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.cleanup_old_convoy_member_locations(integer)
is 'Deletes old completed/cancelled convoy location rows after a bounded retention window. Intended for trusted deployment schedulers/service-role jobs.';

revoke execute on function public.cleanup_old_convoy_member_locations(integer) from public, anon, authenticated;
grant execute on function public.cleanup_old_convoy_member_locations(integer) to service_role;
