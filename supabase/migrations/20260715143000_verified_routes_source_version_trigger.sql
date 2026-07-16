-- Keep verified route source versions authoritative for Explore detail caching
-- and deterministic catalog ordering. Provider sync upserts do not all supply
-- updated_at explicitly, so the database must advance it on every update.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists verified_routes_set_updated_at on public.verified_routes;
create trigger verified_routes_set_updated_at
before update on public.verified_routes
for each row
execute function public.set_updated_at();

comment on trigger verified_routes_set_updated_at on public.verified_routes is
  'Advances the route source version used by Explore catalog ordering and detail-cache keys.';
