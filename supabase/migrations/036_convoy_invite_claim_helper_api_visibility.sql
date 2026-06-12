-- Repair Convoy invite redemption API visibility for backends where the base
-- convoy migration was already applied before PostgREST could see the helper.
-- This is intentionally narrow: it recreates only the atomic invite claim
-- helper used by the convoy-membership Edge Function join path.

do $$
begin
  if to_regclass('public.convoy_invites') is null then
    raise exception 'public.convoy_invites is missing; apply 022_convoy_team_tracking.sql before this repair migration';
  end if;
end $$;

create or replace function public.claim_convoy_invite(target_invite_id uuid)
returns table(id uuid, used_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.convoy_invites
  set used_count = convoy_invites.used_count + 1
  where convoy_invites.id = target_invite_id
    and convoy_invites.revoked_at is null
    and convoy_invites.expires_at > now()
    and convoy_invites.used_count < convoy_invites.max_uses
  returning convoy_invites.id, convoy_invites.used_count;
end;
$$;

comment on function public.claim_convoy_invite(uuid)
is 'Atomically claims one active convoy invite use. Called only by the convoy-membership Edge Function using service-role authority.';

revoke execute on function public.claim_convoy_invite(uuid) from public, anon, authenticated;
grant execute on function public.claim_convoy_invite(uuid) to service_role;

notify pgrst, 'reload schema';
