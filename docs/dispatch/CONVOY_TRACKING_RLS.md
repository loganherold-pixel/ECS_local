# Convoy Tracking RLS Notes

Migration `022_convoy_team_tracking.sql` adds authenticated Convoy Command persistence for convoy records, leader-issued invites, active members, and one live location row per member.

## Deployment / Schema Cache

The mobile app creates convoys through the `public.convoys` and `public.convoy_members` tables. If the app shows a message like `Could not find the table public.convoys in the schema cache`, the connected Supabase project has not applied the convoy tracking migration, or PostgREST has not reloaded its schema after the migration.

Required backend steps for the field-test project:

1. Apply `supabase/migrations/022_convoy_team_tracking.sql` to the target Supabase database.
2. Apply `supabase/migrations/023_convoy_location_retention_cleanup.sql` for retention cleanup.
3. Apply `supabase/migrations/024_legacy_core_rls.sql` so legacy trip/resource tables stay owner-scoped in the same release.
4. Deploy `supabase/functions/convoy-membership`.
5. Set Edge Function secret `CONVOY_INVITE_HASH_PEPPER`. The function also accepts `ECS_SUPABASE_URL` and `ECS_SERVICE_ROLE_KEY` when provided, but falls back to Supabase's built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` runtime variables.
6. Refresh the PostgREST schema cache after migration, for example with `NOTIFY pgrst, 'reload schema';` from SQL editor or by restarting the Supabase API.
7. Run `supabase/smoke/rls_catalog_check.sql` in staging SQL tooling, then run `scripts/supabase-rls-smoke.sh` with the staging anon key.

The app should never query `public.convois`; that spelling is invalid. The runtime table name is `public.convoys`.

## Security Model

- Raw invite codes are never stored. Only `convoy_invites.code_hash` is persisted.
- Invite redemption increments `used_count` through the service-role-only `claim_convoy_invite` helper so max-use checks stay atomic under concurrent joins.
- Convoy leaders can create/update their own convoy and create/revoke invites.
- Active convoy members can read the convoy, active member roster, and active member locations for the same convoy.
- Revoked members are excluded from helper functions and cannot read or update convoy location data.
- Location rows can only be inserted or updated by the authenticated user who owns the active `convoy_members` row.
- Non-members cannot read `convoy_member_locations`.

## Invite Hashing Assumption

Invite code creation and redemption should happen through a trusted app service or Supabase Edge Function:

1. Generate a random high-entropy invite code server-side.
2. Hash the code with a server-side pepper or approved password-hash/KDF strategy.
3. Store only `code_hash` in `convoy_invites`.
4. Return the raw code to the leader once.
5. On redemption, hash the submitted code the same way, validate expiry/revocation/use count, then insert `convoy_members` using service-role authority.

Client code should not receive all invite hashes and should not compare invite codes locally.

ECS now routes invite creation and redemption through the `convoy-membership` Edge Function. Configure this Supabase secret before deploying it:

- `CONVOY_INVITE_HASH_PEPPER`

The function can use optional project-specific overrides `ECS_SUPABASE_URL` and `ECS_SERVICE_ROLE_KEY`, but normal Supabase deployments provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically.

The Edge Function generates human-enterable invite codes, stores only an HMAC-SHA-256 hash in `convoy_invites.code_hash`, returns the raw code only once to the leader, and validates join attempts server-side before inserting or reactivating `convoy_members`.

## Realtime

The migration attempts to add `public.convoy_member_locations` to the `supabase_realtime` publication when that publication exists. If the target Supabase project manages Postgres Changes through the dashboard instead, enable Realtime for:

- schema: `public`
- table: `convoy_member_locations`

Subscribe from the app with the authenticated user's Supabase session so RLS limits location payloads to active convoy members.

`convoy_member_locations` uses full replica identity so Realtime delete events include `member_id`; this lets the app remove markers when a member leaves or a convoy ends.

## Manual RLS Checks

Use at least three authenticated users:

- User A: convoy leader
- User B: active member
- User C: non-member

Recommended checks:

1. User A can insert a `convoys` row with `leader_user_id = auth.uid()`.
2. User A can insert/update a `convoy_invites` row for that convoy and set `revoked_at`.
3. User B cannot read `convoy_invites`.
4. After trusted invite redemption inserts User B into `convoy_members`, User B can read the convoy and active members.
5. User C cannot read the convoy, members, or locations.
6. User B can insert/update one location row for User B's own `member_id`.
7. User B cannot insert/update a location row for User A or another member.
8. After User A sets User B `revoked_at`, User B can no longer read convoy data or update location data.
9. A completed/cancelled convoy no longer counts as active for member-location read/write helper checks.
