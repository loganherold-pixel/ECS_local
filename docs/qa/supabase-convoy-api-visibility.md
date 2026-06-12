# Supabase Convoy API Visibility

Status: backend/API visibility blocker isolation for Convoy two-device QA.

Raw backend credentials, invite codes, auth tokens, and user ids must not be recorded in this file.

## Current Blocker

Device A can create a convoy and generate a member invite, but Device B join is blocked by the app-visible message:

`Convoy tracking tables or helpers are not visible through the Supabase API yet. The migration may be applied, but the API schema cache still needs a reload.`

This points to the join-specific dependency rather than general Convoy UI availability. The create/invite can work while join is blocked because invite redemption calls the atomic helper `public.claim_convoy_invite(uuid)` through the `convoy-membership` Edge Function.

## Backend Object Inventory

Required REST-visible tables:

- `public.convoys`
- `public.convoy_invites`
- `public.convoy_members`
- `public.convoy_member_locations`

Required RPC/helper:

- `public.claim_convoy_invite(uuid)` - service-role-only atomic invite claim helper used by Device B join.

Required optional identity fields:

- `public.convoy_members.display_name`
- `public.convoy_members.expedition_badge_title`

Required Realtime surface:

- `public.convoy_member_locations` in `supabase_realtime`
- `public.convoy_member_locations` replica identity full

## Cause Classification

Most likely cause for the observed Device B join blocker:

- migrations are applied far enough for `convoys`, `convoy_members`, and `convoy_invites` create/invite flows to work, but PostgREST cannot resolve `public.claim_convoy_invite(uuid)` yet; or
- migration `022_convoy_team_tracking.sql` is missing/partial on the target backend; or
- PostgREST schema cache has not reloaded after the migration/function was applied.

This is not evidence of a product/UI regression and does not require changing Convoy status computation, badge behavior, telemetry trust, or live location semantics.

## 2026-06-12 Live Visibility Result

Target backend: `ppullxxprgyeoakzqnxi`

Strict RPC check with a shell-provided service-role key showed:

- `public.convoys` visible through PostgREST
- `public.convoy_invites` visible through PostgREST
- `public.convoy_members` visible through PostgREST
- `public.convoy_member_locations` visible through PostgREST
- `public.claim_convoy_invite(uuid)` failed with `PGRST202`

Observed RPC error:

`Could not find the function public.claim_convoy_invite(target_invite_id) in the schema cache`

Repair path:

- Apply `supabase/migrations/036_convoy_invite_claim_helper_api_visibility.sql` to the target backend.
- The migration recreates only `public.claim_convoy_invite(uuid)`, restores service-role-only execute grants, and sends `NOTIFY pgrst, 'reload schema';`.
- Rerun `npm run check:supabase-convoy-api-visibility:rpc` before Device B join QA.

## Safe API Visibility Check

Run the non-mutating checker before rerunning two-device Convoy privacy QA:

```bash
npm run check:supabase-convoy-api-visibility
```

That command loads public Supabase URL/anon values from the shell or `.env`, checks REST visibility for the four Convoy tables, and skips the service-role RPC probe if no service-role key is present.

To verify the exact join-specific dependency, provide a service-role key only through the shell environment and require the RPC probe:

```bash
npm run check:supabase-convoy-api-visibility:rpc
```

The RPC probe calls `public.claim_convoy_invite(uuid)` with `00000000-0000-4000-8000-000000000000`. That UUID should not match any real invite, so the check verifies PostgREST function visibility without claiming a real invite or mutating Convoy membership.

Do not put service-role keys in React Native code, git-tracked docs, screenshots, or logs.

## SQL Operator Checks

Run these in trusted Supabase SQL tooling when backend access is available:

```sql
select
  to_regclass('public.convoys') as convoys,
  to_regclass('public.convoy_invites') as convoy_invites,
  to_regclass('public.convoy_members') as convoy_members,
  to_regclass('public.convoy_member_locations') as convoy_member_locations;

select oid::regprocedure
from pg_proc
where proname = 'claim_convoy_invite'
  and pronamespace = 'public'::regnamespace;

select
  has_function_privilege('service_role', 'public.claim_convoy_invite(uuid)', 'execute') as service_role_can_claim_invite,
  not has_function_privilege('authenticated', 'public.claim_convoy_invite(uuid)', 'execute') as authenticated_cannot_claim_invite,
  not has_function_privilege('anon', 'public.claim_convoy_invite(uuid)', 'execute') as anon_cannot_claim_invite;

select
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'convoy_member_locations'
  ) as convoy_locations_realtime_enabled,
  (select relreplident = 'f' from pg_class where oid = to_regclass('public.convoy_member_locations')) as convoy_locations_replica_identity_full;
```

If the SQL catalog checks pass but the REST/RPC visibility check fails, reload PostgREST:

```sql
NOTIFY pgrst, 'reload schema';
```

If that does not clear the issue, restart the Supabase API or redeploy the `convoy-membership` Edge Function after confirming the migrations are present.

## Rerun Gate

Do not rerun true two-device live Convoy privacy QA until:

- `npm run check:supabase-convoy-api-visibility:rpc` passes against the intended QA backend.
- `supabase/functions/convoy-membership` is deployed.
- `CONVOY_INVITE_HASH_PEPPER` is configured server-side.
- Device A and Device B still pass identity/setup preflight with distinct QA users.
- Clean Convoy baseline is confirmed on both devices.
